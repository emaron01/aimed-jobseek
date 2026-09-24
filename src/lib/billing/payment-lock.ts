/**
 * Payment-lock policy + evaluation.
 *
 * Trial end with a working card: Stripe auto-converts to active — we sync ACTIVE.
 * Card decline at trial conversion: Stripe → past_due; we mirror PAST_DUE.
 *
 * PAST_DUE has two phases:
 * - Grace (read-only): login + all views; every write refused (setup, research,
 *   generation, send, invites, mailbox connect, etc.). Billing + Stripe Customer
 *   Portal / Checkout stay open so they can fix the card.
 * - After grace (route lock): every (app) route redirects to /settings/billing.
 *
 * CANCELED and Stripe-mapped UNPAID (has subscription id) are route-locked immediately.
 *
 * Defense-in-depth: Server Actions that resolve the org via requireOrganization*
 * refuse writes whenever spend/writes are blocked (including PAST_DUE grace).
 * Explicit asserts remain on AI spend paths and mutating non-pay APIs.
 *
 * HARD EXEMPTION — a locked or grace org must still be able to pay us:
 * - Stripe Customer Portal / Checkout API paths
 * - /settings/billing (local billing state + resubscribe CTAs)
 * - /onboarding/eula (must accept terms before billing; otherwise billing↔eula loop)
 *
 * Never collect payment PII in-app.
 */
import type { BillingLockReason } from "@prisma/client";
import { BILLING_PLAN_COMPED } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma-client";

/** Page routes route-locked orgs may still open (under (app) / onboarding layouts). */
export const PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES = [
  "/settings/billing",
  "/onboarding/eula",
  "/support",
] as const;

/** Billing pay paths (APIs are outside (app) layout; listed for policy clarity). */
export const PAYMENT_LOCK_EXEMPT_PATH_PREFIXES = [
  "/settings/billing",
  "/onboarding/eula",
  "/support",
  "/api/billing/portal",
  "/api/billing/checkout",
  "/api/billing/credits-checkout",
  "/api/billing/end-trial",
] as const;

export type PaymentLockExemptCapability =
  | "OPEN_STRIPE_CUSTOMER_PORTAL"
  | "START_STRIPE_CHECKOUT"
  | "VIEW_BILLING_STATE";

/**
 * Read-only window after PAST_DUE before route lock (billing-only shell).
 * 14 days aligns with Stripe’s recommended Smart Retries horizon (~2 weeks);
 * grace is fully read-only so a longer window does not give free product use.
 */
export const PAYMENT_LOCK_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Next.js Server Action request header (see next/dist app-router-headers). */
export const NEXT_ACTION_HEADER = "next-action";

export class PaymentLockError extends Error {
  readonly code = "PAYMENT_LOCKED";
  readonly lockReason: string | null;

  constructor(message: string, lockReason: string | null = null) {
    super(message);
    this.name = "PaymentLockError";
    this.lockReason = lockReason;
  }
}

export type PaymentLockProfile = {
  planCode: string;
  billingStatus: string;
  stripeSubscriptionId?: string | null;
  lockReason?: string | null;
  gracePeriodEndsAt?: Date | null;
};

function isCompedOrFree(profile: PaymentLockProfile): boolean {
  return (
    profile.planCode === BILLING_PLAN_COMPED ||
    profile.planCode === "FREE" ||
    profile.billingStatus === "FREE"
  );
}

export function isPaymentLockPathExempt(pathname: string): boolean {
  return PAYMENT_LOCK_EXEMPT_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** True while PAST_DUE and before gracePeriodEndsAt (or grace not written yet). */
export function isPastDueInGrace(
  profile: PaymentLockProfile,
  now: Date = new Date(),
): boolean {
  if (profile.billingStatus !== "PAST_DUE") return false;
  if (!profile.gracePeriodEndsAt) return true;
  return now.getTime() < profile.gracePeriodEndsAt.getTime();
}

/**
 * Route lock: billing-only shell. PAST_DUE is route-locked only after grace ends.
 */
export function isPaymentLocked(
  profile: PaymentLockProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile || isCompedOrFree(profile)) return false;

  switch (profile.billingStatus) {
    case "ACTIVE":
    case "TRIALING":
    case "FREE":
      return false;
    case "CANCELED":
      return true;
    case "UNPAID":
      // Pre-checkout UNPAID (no sub id) → checkout gate, not this lock.
      // Stripe "unpaid" keeps a subscription id → lock immediately.
      return Boolean(profile.stripeSubscriptionId);
    case "PAST_DUE":
      return !isPastDueInGrace(profile, now);
    default:
      return false;
  }
}

/**
 * Write lock: no setup mutations, research, generation, send, or org invites.
 * True for all PAST_DUE (including grace), CANCELED, and Stripe-mapped UNPAID.
 */
export function isSpendBlocked(
  profile: PaymentLockProfile | null | undefined,
  _now: Date = new Date(),
): boolean {
  void _now;
  if (!profile || isCompedOrFree(profile)) return false;

  switch (profile.billingStatus) {
    case "ACTIVE":
    case "TRIALING":
    case "FREE":
      return false;
    case "CANCELED":
      return true;
    case "UNPAID":
      return Boolean(profile.stripeSubscriptionId);
    case "PAST_DUE":
      return true;
    default:
      return false;
  }
}

/** Alias — grace and lock both mean zero product writes. */
export const isWritesBlocked = isSpendBlocked;

export function paymentLockUserMessage(
  profile: PaymentLockProfile,
  now: Date = new Date(),
): string {
  switch (profile.billingStatus) {
    case "CANCELED":
      return "Your subscription is canceled. Open Billing to resubscribe before making changes or using research, email generation, or sending.";
    case "PAST_DUE":
      if (isPastDueInGrace(profile, now)) {
        return "Your payment is past due. You can view your workspace, but it is read-only until you update your card — no setup changes, research, email generation, or sending.";
      }
      return "Your payment is past due. Update billing to restore access to your workspace.";
    case "UNPAID":
      return "Your subscription payment failed. Open Billing to update payment and restore access.";
    default:
      return "Billing access is locked. Open Billing to restore workspace access.";
  }
}

/**
 * Lock fields to persist on Stripe sync (and cancel fallback).
 * Preserves an existing PAST_DUE grace end so webhooks do not reset the clock.
 */
export function nextPaymentLockFields(input: {
  previous: {
    billingStatus: string;
    lockReason: string | null;
    gracePeriodEndsAt: Date | null;
  } | null;
  billingStatus: string;
  now?: Date;
}): {
  lockReason: BillingLockReason | null;
  gracePeriodEndsAt: Date | null;
} {
  const now = input.now ?? new Date();

  if (
    input.billingStatus === "ACTIVE" ||
    input.billingStatus === "TRIALING" ||
    input.billingStatus === "FREE"
  ) {
    return { lockReason: null, gracePeriodEndsAt: null };
  }

  if (input.billingStatus === "CANCELED") {
    return { lockReason: "CANCELED", gracePeriodEndsAt: null };
  }

  if (input.billingStatus === "UNPAID") {
    // Stripe-mapped unpaid / incomplete — immediate lock (no grace).
    return { lockReason: "PAYMENT_FAILED", gracePeriodEndsAt: null };
  }

  if (input.billingStatus === "PAST_DUE") {
    if (
      input.previous?.billingStatus === "PAST_DUE" &&
      input.previous.gracePeriodEndsAt
    ) {
      return {
        lockReason: "PAYMENT_FAILED",
        gracePeriodEndsAt: input.previous.gracePeriodEndsAt,
      };
    }
    return {
      lockReason: "PAYMENT_FAILED",
      gracePeriodEndsAt: new Date(now.getTime() + PAYMENT_LOCK_GRACE_MS),
    };
  }

  return { lockReason: null, gracePeriodEndsAt: null };
}

type LockSelect = {
  planCode: string;
  billingStatus: string;
  stripeSubscriptionId: string | null;
  lockReason: BillingLockReason | null;
  gracePeriodEndsAt: Date | null;
};

/**
 * Backfill lockReason / grace for orgs synced before enforcement.
 */
async function healPaymentLockFields(
  organizationId: string,
  profile: LockSelect,
  now: Date = new Date(),
): Promise<LockSelect> {
  const next = nextPaymentLockFields({
    previous: {
      billingStatus: profile.billingStatus,
      lockReason: profile.lockReason,
      gracePeriodEndsAt: profile.gracePeriodEndsAt,
    },
    billingStatus: profile.billingStatus,
    now,
  });

  // Pre-checkout UNPAID must not get PAYMENT_FAILED written.
  if (
    profile.billingStatus === "UNPAID" &&
    !profile.stripeSubscriptionId
  ) {
    if (profile.lockReason == null && profile.gracePeriodEndsAt == null) {
      return profile;
    }
    return prisma.organizationBillingProfile.update({
      where: { organizationId },
      data: { lockReason: null, gracePeriodEndsAt: null },
      select: {
        planCode: true,
        billingStatus: true,
        stripeSubscriptionId: true,
        lockReason: true,
        gracePeriodEndsAt: true,
      },
    });
  }

  const needsWrite =
    profile.lockReason !== next.lockReason ||
    (profile.gracePeriodEndsAt?.getTime() ?? null) !==
      (next.gracePeriodEndsAt?.getTime() ?? null);

  if (!needsWrite) return profile;

  return prisma.organizationBillingProfile.update({
    where: { organizationId },
    data: {
      lockReason: next.lockReason,
      gracePeriodEndsAt: next.gracePeriodEndsAt,
    },
    select: {
      planCode: true,
      billingStatus: true,
      stripeSubscriptionId: true,
      lockReason: true,
      gracePeriodEndsAt: true,
    },
  });
}

/**
 * Throw when the org must not write (setup / research / generation / send / invites).
 * Same condition for PAST_DUE grace and full lock.
 */
export async function assertOrganizationNotPaymentLocked(
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const { spendBlocked, profile } = await getOrganizationPaymentLockState(
    organizationId,
    now,
  );
  if (!spendBlocked || !profile) return;

  throw new PaymentLockError(
    paymentLockUserMessage(profile, now),
    profile.lockReason ?? profile.billingStatus,
  );
}

/** @deprecated Prefer assertOrganizationNotPaymentLocked — same write lock. */
export const assertOrganizationWritesAllowed =
  assertOrganizationNotPaymentLocked;

/** Load + heal lock fields; used by route gate, asserts, and billing UI. */
export async function getOrganizationPaymentLockState(
  organizationId: string,
  now: Date = new Date(),
): Promise<{
  /** Billing-only shell (after PAST_DUE grace, or immediate for cancel/unpaid). */
  locked: boolean;
  /**
   * No product writes (setup included) and no research / generation / send.
   * Includes PAST_DUE grace.
   */
  spendBlocked: boolean;
  profile: LockSelect | null;
}> {
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
    select: {
      planCode: true,
      billingStatus: true,
      stripeSubscriptionId: true,
      lockReason: true,
      gracePeriodEndsAt: true,
    },
  });
  if (!profile) {
    return { locked: false, spendBlocked: false, profile: null };
  }

  const healed = await healPaymentLockFields(organizationId, profile, now);
  return {
    locked: isPaymentLocked(healed, now),
    spendBlocked: isSpendBlocked(healed, now),
    profile: healed,
  };
}
