/**
 * Company research entitlement copy and thresholds.
 * Safe for client + server — no DB imports.
 */

import {
  billingPlanLabel,
  formatBillingDate,
} from "@/lib/billing/billing-state";

/** Heads-up when this many (or fewer) new-company slots remain. Does not block. */
export const ACTIVE_RESEARCHED_COMPANY_WARN_REMAINING = 10;

/** Paid Standard company floor (catalog). Used in trial-exhaustion conversion copy. */
export const STANDARD_ACTIVE_COMPANY_LIMIT = 100;

export type ActiveResearchedCompanyUsageView = {
  used: number;
  limit: number;
  remaining: number;
  warning: boolean;
  exhausted: boolean;
};

/** Billing fields the research UI needs for trial-aware quota copy. */
export type ResearchBillingContext = {
  planCode: string;
  billingStatus: string;
  trialEndsAt: string | null;
  /** TRIALING + card on file — eligible for Stripe trial_end: 'now'. */
  canConvertTrialEarly: boolean;
};

export function toActiveResearchedCompanyUsageView(input: {
  used: number;
  limit: number;
}): ActiveResearchedCompanyUsageView {
  const used = Math.max(0, input.used);
  const limit = Math.max(0, input.limit);
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    warning:
      remaining > 0 && remaining <= ACTIVE_RESEARCHED_COMPANY_WARN_REMAINING,
    exhausted: remaining <= 0,
  };
}

export function formatResearchAllowanceSummary(
  usage: Pick<ActiveResearchedCompanyUsageView, "remaining" | "limit" | "used">,
): string {
  if (usage.limit <= 0) {
    return "No company research allowance on this account.";
  }
  if (usage.remaining <= 0) {
    return `Company research allowance used (${usage.used} of ${usage.limit}).`;
  }
  return `${usage.remaining} of ${usage.limit} company research slots remaining.`;
}

export function formatResearchAllowanceWarning(remaining: number): string {
  const slots =
    remaining === 1
      ? "1 company research slot left"
      : `${remaining} company research slots left`;
  return `You have ${slots} in your allowance. Continue to use the remaining slots, or add capacity before you run out.`;
}

export function formatResearchAllowanceExhausted(limit: number): string {
  return `You've used your company research allowance (${limit} companies). Add capacity in Billing to research new companies. Scoring and outreach drafts still work for companies you've already researched.`;
}

function parseTrialEndsAt(
  trialEndsAt?: Date | string | null,
): Date | null {
  if (trialEndsAt == null) return null;
  const ends =
    typeof trialEndsAt === "string" ? new Date(trialEndsAt) : trialEndsAt;
  return Number.isNaN(ends.getTime()) ? null : ends;
}

/**
 * Mid-trial hit of the 25-company cap — conversion copy, not a bare quota error.
 */
export function formatTrialResearchExhausted(input: {
  trialLimit: number;
  paidLimit?: number;
  trialEndsAt?: Date | string | null;
  planCode?: string | null;
}): string {
  const paid = input.paidLimit ?? STANDARD_ACTIVE_COMPANY_LIMIT;
  const planLabel = input.planCode?.trim()
    ? billingPlanLabel(input.planCode)
    : "paid plan";
  const ends = parseTrialEndsAt(input.trialEndsAt ?? null);
  const dateLabel = ends ? formatBillingDate(ends) : null;
  if (dateLabel) {
    return `You've used your trial research allowance of ${input.trialLimit} companies. Your plan converts to ${planLabel} on ${dateLabel}, which includes ${paid} companies.`;
  }
  return `You've used your trial research allowance of ${input.trialLimit} companies. Your plan converts to ${planLabel} at the end of the trial, which includes ${paid} companies.`;
}

export function formatResearchQuotaBlockedMessage(input: {
  used: number;
  limit: number;
  billingStatus?: string | null;
  trialEndsAt?: Date | string | null;
  planCode?: string | null;
}): string {
  if (input.billingStatus === "TRIALING") {
    return formatTrialResearchExhausted({
      trialLimit: input.limit,
      trialEndsAt: input.trialEndsAt,
      planCode: input.planCode,
    });
  }
  return formatResearchAllowanceExhausted(input.limit);
}

/**
 * Neutral run copy when companies were held for allowance (not a defect).
 */
export function formatResearchQuotaHeldSummary(input: {
  completedCount: number;
  totalCompanies: number;
  quotaBlockedCount: number;
}): string {
  return `Researched ${input.completedCount} of ${input.totalCompanies} companies. ${input.quotaBlockedCount} waiting on capacity.`;
}

export type ResearchQuotaCta = {
  label: string;
  href: string;
};

/** Secondary Billing link after hitting the company research cap. */
export function researchQuotaBlockedCta(input: {
  billingStatus?: string | null;
  planCode?: string | null;
}): ResearchQuotaCta {
  if (input.billingStatus === "TRIALING") {
    const planLabel = input.planCode?.trim()
      ? billingPlanLabel(input.planCode)
      : "plan";
    return {
      label: `View ${planLabel} conversion in Billing`,
      href: RESEARCH_BILLING_HREF,
    };
  }
  return {
    label: "Add capacity in Billing",
    href: RESEARCH_BILLING_HREF,
  };
}

export const RESEARCH_BILLING_HREF = "/settings/billing";
