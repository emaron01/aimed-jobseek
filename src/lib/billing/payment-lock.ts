/**
 * Payment / read-only policy (account lifecycle B3).
 *
 * Read-only: paid period ended without payment (`readOnlyStartedAt` set, or
 * legacy CANCELED for non-FREE/COMPED). Full page viewing; writes and paid AI
 * refused. No billing-only route redirect.
 *
 * Cancel-at-period-end: still ACTIVE/TRIALING with cancelAtPeriodEnd — full access.
 * Mid-period PAST_DUE: still entitled until the period ends (then read-only).
 * FREE / COMPED: never read-only.
 *
 * Defense-in-depth: Server Actions via requireOrganization* and the layout gate;
 * paid AI / workers via assertOrganizationMaySpend.
 */
import type { BillingLockReason } from "@prisma/client";
import { BILLING_PLAN_COMPED } from "@/lib/billing/plans";
import {
  ACCOUNT_READ_ONLY_ACTION_MESSAGE,
  OrganizationReadOnlyError,
} from "@/lib/billing/account-read-only";
import { prisma } from "@/lib/prisma-client";

/** Page routes that may mutate while read-only (billing, support, account). */
export const PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES = [
  "/settings/billing",
  "/onboarding/eula",
  "/support",
  "/settings/account",
] as const;

/** Billing pay paths + read-only exemptions (APIs outside (app) layout). */
export const PAYMENT_LOCK_EXEMPT_PATH_PREFIXES = [
  "/settings/billing",
  "/onboarding/eula",
  "/support",
  "/settings/account",
  "/api/billing/portal",
  "/api/billing/checkout",
  "/api/billing/credits-checkout",
  "/api/billing/end-trial",
  "/api/billing/seats",
  "/api/billing/referral-code",
] as const;

/**
 * @deprecated B3 replaces the 14-day PAST_DUE route-lock grace with period-end
 * read-only. Kept for reading legacy rows / tests that still reference the constant.
 */
export const PAYMENT_LOCK_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Next.js Server Action request header (see next/dist app-router-headers). */
export const NEXT_ACTION_HEADER = "next-action";

/**
 * @deprecated Prefer OrganizationReadOnlyError. Kept so older catch sites still
 * match when thrown; new asserts throw OrganizationReadOnlyError.
 */
export class PaymentLockError extends OrganizationReadOnlyError {
  readonly lockReason: string | null;

  constructor(
    message: string = ACCOUNT_READ_ONLY_ACTION_MESSAGE,
    lockReason: string | null = null,
  ) {
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
  readOnlyStartedAt?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
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

/**
 * True when the account is in the post-period read-only window.
 * FREE/COMPED never. Prefer readOnlyStartedAt; legacy CANCELED (non-free) also counts.
 */
export function isOrganizationReadOnly(
  profile: PaymentLockProfile | null | undefined,
): boolean {
  if (!profile || isCompedOrFree(profile)) return false;
  if (profile.readOnlyStartedAt) return true;
  // Legacy rows canceled before B3 (no backfill): treat as read-only.
  return profile.billingStatus === "CANCELED";
}

/**
 * @deprecated Mid-period PAST_DUE is no longer a separate grace view mode.
 * Always false — call sites should use isOrganizationReadOnly.
 */
export function isPastDueInGrace(
  _profile: PaymentLockProfile,
  _now: Date = new Date(),
): boolean {
  void _profile;
  void _now;
  return false;
}

/**
 * Route lock removed in B3 — seekers always keep view-all navigation.
 * Always false so layout never redirects to billing-only shell.
 */
export function isPaymentLocked(
  _profile: PaymentLockProfile | null | undefined,
  _now: Date = new Date(),
): boolean {
  void _profile;
  void _now;
  return false;
}

/**
 * Write / paid-spend lock: true only while read-only.
 * Mid-period PAST_DUE and cancel-at-period-end remain fully entitled.
 */
export function isSpendBlocked(
  profile: PaymentLockProfile | null | undefined,
  _now: Date = new Date(),
): boolean {
  void _now;
  return isOrganizationReadOnly(profile);
}

/** Alias — read-only means zero product writes. */
export const isWritesBlocked = isSpendBlocked;

export function paymentLockUserMessage(
  profile: PaymentLockProfile,
  _now: Date = new Date(),
): string {
  void _now;
  if (isOrganizationReadOnly(profile)) {
    return ACCOUNT_READ_ONLY_ACTION_MESSAGE;
  }
  return ACCOUNT_READ_ONLY_ACTION_MESSAGE;
}

/**
 * Lock fields to persist on Stripe sync.
 * B3: do not start a PAST_DUE route-lock grace; read-only uses readOnlyStartedAt.
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
  void input.now;

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

  if (input.billingStatus === "UNPAID" || input.billingStatus === "PAST_DUE") {
    // No route-lock grace; period-end / deleted subscription enters read-only separately.
    return { lockReason: "PAYMENT_FAILED", gracePeriodEndsAt: null };
  }

  return { lockReason: null, gracePeriodEndsAt: null };
}

type LockSelect = {
  planCode: string;
  billingStatus: string;
  stripeSubscriptionId: string | null;
  lockReason: BillingLockReason | null;
  gracePeriodEndsAt: Date | null;
  readOnlyStartedAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Throw when the org must not write (setup / research / generation / send / invites).
 */
export async function assertOrganizationNotPaymentLocked(
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const { spendBlocked } = await getOrganizationPaymentLockState(
    organizationId,
    now,
  );
  if (!spendBlocked) return;
  throw new OrganizationReadOnlyError();
}

/** @deprecated Prefer assertOrganizationNotPaymentLocked — same write lock. */
export const assertOrganizationWritesAllowed =
  assertOrganizationNotPaymentLocked;

/** Load lock / read-only state; used by route gate, asserts, and billing UI. */
export async function getOrganizationPaymentLockState(
  organizationId: string,
  now: Date = new Date(),
): Promise<{
  /** Always false after B3 (no billing-only shell). */
  locked: boolean;
  /** No product writes and no research / generation / send (read-only). */
  spendBlocked: boolean;
  /** Alias for spendBlocked — account is in the read-only window. */
  readOnly: boolean;
  profile: LockSelect | null;
}> {
  void now;
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
    select: {
      planCode: true,
      billingStatus: true,
      stripeSubscriptionId: true,
      lockReason: true,
      gracePeriodEndsAt: true,
      readOnlyStartedAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });
  if (!profile) {
    return {
      locked: false,
      spendBlocked: false,
      readOnly: false,
      profile: null,
    };
  }

  const readOnly = isOrganizationReadOnly(profile);
  return {
    locked: false,
    spendBlocked: readOnly,
    readOnly,
    profile,
  };
}
