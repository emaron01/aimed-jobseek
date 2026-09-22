/**
 * Billing plan configuration — component kinds mapped to Stripe Price/Product IDs
 * via platform console (billing.prices) with env fallback.
 * Dollar amounts live in Stripe; this module never hard-codes list prices.
 *
 * Paths:
 * - Self-serve → STANDARD or TEAM (UNPAID → Checkout → TRIALING → ACTIVE)
 * - ENTERPRISE → contact-sales / platform-provisioned (not self-serve Checkout)
 * - Platform COMPED → durable, no Stripe
 * - Legacy PREMIUM code remains for stored rows; display as Team
 */

export const BILLING_PLAN_COMPED = "COMPED" as const;
export const BILLING_PLAN_STANDARD = "STANDARD" as const;
/** Active multi-seat self-serve plan (2–10 seats). */
export const BILLING_PLAN_TEAM = "TEAM" as const;
/**
 * Legacy internal code. Prefer BILLING_PLAN_TEAM for new rows.
 * Display labels map PREMIUM → "Team".
 */
export const BILLING_PLAN_PREMIUM = "PREMIUM" as const;
export const BILLING_PLAN_ENTERPRISE = "ENTERPRISE" as const;

/** @deprecated Use BILLING_PLAN_COMPED — kept for reading legacy rows during migration. */
export const BILLING_PLAN_FREE = BILLING_PLAN_COMPED;

export type KnownBillingPlanCode =
  | typeof BILLING_PLAN_COMPED
  | typeof BILLING_PLAN_STANDARD
  | typeof BILLING_PLAN_TEAM
  | typeof BILLING_PLAN_PREMIUM
  | typeof BILLING_PLAN_ENTERPRISE;

export type PlanComponent =
  | {
      kind: "recurring_base";
      stripePriceIdEnv: string;
      stripeProductIdEnv: string;
    }
  | {
      kind: "company_credit_block";
      stripePriceIdEnv: string;
      units: number;
      expiryMonths: number;
    };

export type PlanEntitlements = {
  /**
   * STANDARD: org-wide company research limit.
   * TEAM / ENTERPRISE: per-user companiesPerSeat floor (also mirrored as companiesPerSeat).
   */
  activeResearchedCompanyLimit: number;
  dailyEmailSendWarningLimit: number;
  monthlyEmailSendLimit: number | null;
  researchFreshnessDays: number;
};

export type PlanSeatPolicy = {
  /** Companies researched per seat/user (TEAM/ENTERPRISE). Null = org-level (STANDARD). */
  companiesPerSeat: number | null;
  seatMin: number;
  /** Null = no global hard max (ENTERPRISE; per-org maxSeats). */
  seatMax: number | null;
  /** Per-user daily AI generation floor. */
  dailyAiGenerationLimit: number;
};

export type PlanDefinition = {
  planCode: KnownBillingPlanCode | string;
  sellable: boolean;
  requiresStripe: boolean;
  /** How payment is collected; product behavior must not infer this from a plan name. */
  billingCollection: "NONE" | "SELF_SERVE_STRIPE" | "INVOICED";
  /**
   * When non-null, Checkout attaches a Stripe trial. Length comes from
   * platform console billing.trial → BILLING_TRIAL_PERIOD_DAYS — not this number.
   * Catalog value is the documented default only.
   */
  trialDays: number | null;
  /** Applied while billingStatus === TRIALING (company volume only differs today). */
  trialEntitlements: PlanEntitlements | null;
  components: PlanComponent[];
  entitlements: PlanEntitlements;
  seats: PlanSeatPolicy;
};

function envId(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

const TEAM_SEAT_POLICY: PlanSeatPolicy = {
  companiesPerSeat: 150,
  seatMin: 2,
  seatMax: 10,
  dailyAiGenerationLimit: 500,
};

const ENTERPRISE_SEAT_POLICY: PlanSeatPolicy = {
  companiesPerSeat: 150,
  seatMin: 2,
  seatMax: null,
  dailyAiGenerationLimit: 500,
};

const STANDARD_SEAT_POLICY: PlanSeatPolicy = {
  companiesPerSeat: null,
  seatMin: 1,
  seatMax: 1,
  dailyAiGenerationLimit: 500,
};

export const BILLING_PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    planCode: BILLING_PLAN_COMPED,
    sellable: false,
    requiresStripe: false,
    billingCollection: "NONE",
    trialDays: null,
    trialEntitlements: null,
    components: [],
    entitlements: {
      // Defaults only — platform sets real limits at create/edit time.
      activeResearchedCompanyLimit: 50,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: null,
      researchFreshnessDays: 90,
    },
    seats: {
      companiesPerSeat: null,
      seatMin: 1,
      seatMax: null,
      dailyAiGenerationLimit: 500,
    },
  },
  {
    planCode: BILLING_PLAN_STANDARD,
    sellable: true,
    requiresStripe: true,
    billingCollection: "SELF_SERVE_STRIPE",
    trialDays: 7,
    trialEntitlements: {
      activeResearchedCompanyLimit: 25,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_STANDARD_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_STANDARD",
      },
    ],
    entitlements: {
      activeResearchedCompanyLimit: 100,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    seats: STANDARD_SEAT_POLICY,
  },
  {
    planCode: BILLING_PLAN_TEAM,
    sellable: true,
    requiresStripe: true,
    billingCollection: "SELF_SERVE_STRIPE",
    trialDays: 7,
    trialEntitlements: {
      activeResearchedCompanyLimit: 150,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_TEAM_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_TEAM",
      },
    ],
    entitlements: {
      activeResearchedCompanyLimit: 150,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    seats: TEAM_SEAT_POLICY,
  },
  {
    // Legacy stub — not sellable. Display as Team; prefer BILLING_PLAN_TEAM.
    planCode: BILLING_PLAN_PREMIUM,
    sellable: false,
    requiresStripe: true,
    billingCollection: "SELF_SERVE_STRIPE",
    trialDays: 7,
    trialEntitlements: {
      activeResearchedCompanyLimit: 150,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_PREMIUM_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_PREMIUM",
      },
    ],
    entitlements: {
      activeResearchedCompanyLimit: 150,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    seats: TEAM_SEAT_POLICY,
  },
  {
    planCode: BILLING_PLAN_ENTERPRISE,
    sellable: false,
    requiresStripe: false,
    billingCollection: "INVOICED",
    trialDays: null,
    trialEntitlements: null,
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_ENTERPRISE",
      },
    ],
    entitlements: {
      activeResearchedCompanyLimit: 150,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    seats: ENTERPRISE_SEAT_POLICY,
  },
] as const;

export const COMPANY_CREDIT_BLOCK: Extract<
  PlanComponent,
  { kind: "company_credit_block" }
> = {
  kind: "company_credit_block",
  stripePriceIdEnv: "STRIPE_PRICE_COMPANY_CREDITS_100",
  units: 100,
  expiryMonths: 12,
};

/** Normalize legacy PREMIUM → TEAM for entitlement / seat lookups. */
export function canonicalPlanCode(planCode: string): string {
  if (planCode === "FREE") return BILLING_PLAN_COMPED;
  if (planCode === BILLING_PLAN_PREMIUM) return BILLING_PLAN_TEAM;
  return planCode;
}

/** True when company research allowance is per-user (not org pool). */
export function planUsesPerUserCompanyAllowance(planCode: string): boolean {
  return (
    getPlanDefinition(canonicalPlanCode(planCode))?.seats.companiesPerSeat !=
    null
  );
}

/**
 * Referral program is available to paid and comped Standard workspaces.
 * Legacy COMPED/FREE plan codes represent comped Standard for this capability.
 */
export function planAllowsReferrals(planCode: string | null | undefined): boolean {
  if (!planCode?.trim()) return false;
  const code = canonicalPlanCode(planCode);
  return code === BILLING_PLAN_STANDARD || code === BILLING_PLAN_COMPED;
}

/** True when product limits and allowances are expressed per seat. */
export function planUsesSeatBilling(planCode: string): boolean {
  const seats = getPlanDefinition(canonicalPlanCode(planCode))?.seats;
  return seats != null && (seats.seatMax == null || seats.seatMax > 1);
}

/** True when the customer can change subscription seats through Stripe. */
export function planAllowsSelfServeSeatChanges(planCode: string): boolean {
  const plan = getPlanDefinition(canonicalPlanCode(planCode));
  return (
    plan?.billingCollection === "SELF_SERVE_STRIPE" &&
    planUsesSeatBilling(plan.planCode)
  );
}

/** True when billing is handled by invoice instead of Stripe Checkout. */
export function planUsesInvoicedBilling(planCode: string): boolean {
  return (
    getPlanDefinition(canonicalPlanCode(planCode))?.billingCollection ===
    "INVOICED"
  );
}

export function getPlanDefinition(planCode: string): PlanDefinition | null {
  const code = planCode === "FREE" ? BILLING_PLAN_COMPED : planCode;
  return (
    BILLING_PLAN_CATALOG.find((plan) => plan.planCode === code) ?? null
  );
}

/** Entitlements for the current Stripe lifecycle (trial overlay vs paid floor). */
export function resolveEntitlementsForStatus(input: {
  planCode: string;
  billingStatus: string;
}): PlanEntitlements | null {
  const plan = getPlanDefinition(input.planCode);
  if (!plan) return null;
  if (
    input.billingStatus === "TRIALING" &&
    plan.trialEntitlements
  ) {
    return plan.trialEntitlements;
  }
  return plan.entitlements;
}

/** Env-only lookup — prefer loadEffectiveBillingPrices() for Checkout. */
export function resolveStripePriceId(envName: string): string | null {
  return envId(envName);
}

/** Env-only lookup — prefer loadEffectiveBillingPrices() for Checkout. */
export function resolveStripeProductId(envName: string): string | null {
  return envId(envName);
}

/**
 * Env-only readiness check. Prefer effectivePricesAreCheckoutReady after
 * loadEffectiveBillingPrices() so the platform console is honored.
 */
export function planIsCheckoutReady(planCode: string): boolean {
  const plan = getPlanDefinition(planCode);
  if (!plan?.sellable || !plan.requiresStripe) return false;
  const base = plan.components.find((c) => c.kind === "recurring_base");
  if (!base || base.kind !== "recurring_base") return false;
  return Boolean(
    resolveStripePriceId(base.stripePriceIdEnv) &&
      resolveStripeProductId(base.stripeProductIdEnv),
  );
}

/** Env-only. Prefer effectiveCreditsAreCheckoutReady after load. */
export function companyCreditBlockIsCheckoutReady(): boolean {
  return Boolean(resolveStripePriceId(COMPANY_CREDIT_BLOCK.stripePriceIdEnv));
}

export function creditExpiryDate(
  grantedAt: Date,
  expiryMonths: number = COMPANY_CREDIT_BLOCK.expiryMonths,
): Date {
  const expires = new Date(grantedAt);
  expires.setUTCMonth(expires.getUTCMonth() + expiryMonths);
  return expires;
}
