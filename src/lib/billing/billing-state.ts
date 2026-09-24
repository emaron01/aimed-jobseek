/**
 * Billing state shape.
 *
 * planCode: COMPED | STANDARD | …
 * billingStatus: FREE (durable comp) | UNPAID | TRIALING | ACTIVE | PAST_DUE | CANCELED | UNPAID
 *
 * Self-serve never uses COMPED/FREE. Platform comps are COMPED + FREE forever until Checkout.
 */

import {
  BILLING_PLAN_COMPED,
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_PREMIUM,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
  planUsesInvoicedBilling,
  planUsesSeatBilling,
} from "@/lib/billing/plans";
import { formatSeatsUsedLabel } from "@/lib/org/seat-limits";
import { vocab } from "@/lib/product-config";

export {
  BILLING_PLAN_COMPED,
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_PREMIUM,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
};
/** @deprecated */
export { BILLING_PLAN_COMPED as BILLING_PLAN_FREE };

export type BillingPlanCode = typeof BILLING_PLAN_COMPED | (string & {});

/** Durable platform comps — no Stripe, no trial, no expiry. */
export const COMPED_BILLING_DEFAULTS = {
  planCode: BILLING_PLAN_COMPED,
  billingStatus: "FREE" as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePriceId: null,
  stripeProductId: null,
  currentPeriodEnd: null,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  lockReason: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
};

/** @deprecated Use COMPED_BILLING_DEFAULTS */
export const FREE_BILLING_DEFAULTS = COMPED_BILLING_DEFAULTS;

/** Self-serve / platform-billed before Checkout. */
export const SELF_SERVE_BILLING_DEFAULTS = {
  planCode: BILLING_PLAN_STANDARD,
  billingStatus: "UNPAID" as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePriceId: null,
  stripeProductId: null,
  currentPeriodEnd: null,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  lockReason: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
};

export function billingPlanLabel(planCode: string): string {
  switch (planCode) {
    case BILLING_PLAN_COMPED:
    case "FREE":
      return "Comped";
    case BILLING_PLAN_STANDARD:
      return "Standard";
    case BILLING_PLAN_TEAM:
    case BILLING_PLAN_PREMIUM:
      return "Team";
    case BILLING_PLAN_ENTERPRISE:
      return "Enterprise";
    default:
      return planCode;
  }
}

export function billingStatusLabel(status: string): string {
  switch (status) {
    case "FREE":
      return "Comped (no payment)";
    case "UNPAID":
      return "Awaiting checkout";
    case "TRIALING":
      return "Trialing";
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Past due";
    case "CANCELED":
      return "Canceled";
    default:
      return status;
  }
}

export function billingLockReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "TRIAL_ENDED":
      // Reserved; trial decline uses PAST_DUE + PAYMENT_FAILED — not a separate expiry path.
      return "Trial ended";
    case "PAYMENT_FAILED":
      return "Payment failed";
    case "CANCELED":
      return "Subscription canceled";
    default:
      return reason ?? "—";
  }
}

export function formatStripeMoney(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amountCents == null) return "—";
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${code}`;
  }
}

export function formatPriceInterval(interval: string | null | undefined): string {
  switch (interval) {
    case "month":
      return "month";
    case "year":
      return "year";
    case "week":
      return "week";
    case "day":
      return "day";
    default:
      return interval ?? "—";
  }
}

export function formatCustomerPayingAmount(input: {
  effectiveUnitAmountCents: number | null;
  listUnitAmountCents: number | null;
  currency: string | null;
  interval: string | null;
}): string {
  const amount =
    input.effectiveUnitAmountCents ?? input.listUnitAmountCents ?? null;
  if (amount == null) return "—";
  return `${formatStripeMoney(amount, input.currency)} / ${formatPriceInterval(input.interval)}`;
}

export function formatDiscountSummary(input: {
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  couponId: string | null;
}): string {
  const parts: string[] = [];
  if (input.percentOff != null && input.percentOff > 0) {
    parts.push(`${input.percentOff}% off`);
  }
  if (input.amountOffCents != null && input.amountOffCents > 0) {
    parts.push(`${formatStripeMoney(input.amountOffCents, input.currency)} off`);
  }
  if (parts.length === 0) return "None";
  const base = parts.join(" + ");
  return input.couponId ? `${base} (${input.couponId})` : base;
}

export function isOnCurrentCatalogPrice(
  stripePriceId: string | null | undefined,
  catalogPriceId: string | null | undefined,
): boolean | null {
  if (!stripePriceId || !catalogPriceId) return null;
  return stripePriceId === catalogPriceId;
}

/**
 * Billing / trial / dunning mail — never for durable comps.
 * Phase 8 templates must call this before send.
 */
export function shouldSendBillingTransactionalEmail(profile: {
  planCode: string;
  billingStatus: string;
  stripeCustomerId?: string | null;
}): boolean {
  if (
    profile.planCode === BILLING_PLAN_COMPED ||
    profile.planCode === "FREE"
  ) {
    return false;
  }
  if (profile.billingStatus === "FREE") {
    return false;
  }
  return true;
}

/** Self-serve (or platform-billed) org that still needs Checkout. */
export function requiresStripeCheckout(profile: {
  planCode: string;
  billingStatus: string;
  stripeSubscriptionId?: string | null;
}): boolean {
  if (planUsesInvoicedBilling(profile.planCode)) {
    return false;
  }
  if (
    profile.planCode === BILLING_PLAN_COMPED ||
    profile.planCode === "FREE" ||
    profile.billingStatus === "FREE"
  ) {
    return false;
  }
  if (profile.stripeSubscriptionId) {
    return false;
  }
  return profile.billingStatus === "UNPAID";
}

/** Customer-facing plan blurb from the org's stored entitlements (what they bought). */
export function billingPlanDescription(input: {
  planCode: string;
  billingStatus: string;
  activeResearchedCompanyLimit?: number | null;
  dailyEmailSendWarningLimit?: number | null;
  monthlyEmailSendLimit?: number | null;
  seatQuantity?: number | null;
  maxSeats?: number | null;
  usedSeats?: number | null;
  companiesPerSeat?: number | null;
}): string {
  const isTrial = input.billingStatus === "TRIALING";
  const isStandard =
    input.planCode === BILLING_PLAN_STANDARD ||
    input.planCode === "STANDARD";
  const isTeamOrEnt = planUsesSeatBilling(input.planCode);
  const companies = input.activeResearchedCompanyLimit;

  if (
    input.planCode === BILLING_PLAN_COMPED ||
    input.planCode === "FREE"
  ) {
    if (companies != null) {
      return `Comped access: research up to ${companies} companies. Outreach drafts open in your own mailbox.`;
    }
    return "Comped access with limits set by your account administrator. Outreach drafts open in your own mailbox.";
  }

  if (isTeamOrEnt) {
    const seatQuantity = input.seatQuantity ?? 1;
    const maxSeats = input.maxSeats ?? seatQuantity;
    const usedSeats = input.usedSeats ?? 0;
    const perUser = input.companiesPerSeat ?? companies ?? 150;
    const seatsBit = formatSeatsUsedLabel({ usedSeats, seatQuantity });
    const capBit =
      maxSeats !== seatQuantity ? ` (cap ${maxSeats})` : "";
    return `${seatsBit}${capBit}. ${perUser} companies per user. Outreach drafts open in each user's own mailbox.`;
  }

  if (isStandard && companies != null) {
    if (isTrial) {
      return `Trial: research up to ${companies} companies, full ${vocab.product.singular} access. Outreach drafts open in your own mailbox.`;
    }
    return `Research up to ${companies} companies. Full ${vocab.product.singular} access. Outreach drafts open in your own mailbox.`;
  }

  // Fallback when policy numbers are unavailable (legacy callers / tests).
  if (isStandard && isTrial) {
    return `Trial: research up to 25 companies, full ${vocab.product.singular} access. Outreach drafts open in your own mailbox. After trial: 100 companies researched.`;
  }
  if (isStandard) {
    return `Research up to 100 companies. Full ${vocab.product.singular} access. Outreach drafts open in your own mailbox.`;
  }
  return "Outreach drafts open in your own mailbox.";
}

export function formatBillingDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Whole calendar days remaining until `end` (UTC day boundary–friendly). */
export function daysRemainingUntil(
  end: Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!end) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatTrialEndsSummary(input: {
  trialEndsAt: Date | null | undefined;
  now?: Date;
}): string | null {
  if (!input.trialEndsAt) return null;
  const days = daysRemainingUntil(input.trialEndsAt, input.now);
  if (days == null) return null;
  const dateLabel = formatBillingDate(input.trialEndsAt);
  if (days <= 0) {
    return `Trial ended ${dateLabel}`;
  }
  if (days === 1) {
    return `Trial ends ${dateLabel} (1 day remaining)`;
  }
  return `Trial ends ${dateLabel} (${days} days remaining)`;
}
