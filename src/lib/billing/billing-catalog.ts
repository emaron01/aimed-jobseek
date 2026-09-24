/**
 * Platform product catalog (billing.catalog) — marketing copy + entitlement floors
 * for NEW Checkout / Stripe sync. Existing org policies are not rewritten by edits.
 *
 * Stripe Price IDs live only in billing.prices (/platform/billing) — never here.
 */
import {
  BILLING_PLAN_COMPED,
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_PREMIUM,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
  COMPANY_CREDIT_BLOCK,
  getPlanDefinition,
  type PlanEntitlements,
} from "@/lib/billing/plans";
import { DEFAULT_USAGE_POLICY_VALUES } from "@/lib/usage/defaults";
import { brand, vocab } from "@/lib/product-config";

export const PLATFORM_SETTING_BILLING_CATALOG = "billing.catalog";

export type CatalogEntitlementFloors = {
  /**
   * STANDARD: org-wide company research limit.
   * TEAM / ENTERPRISE: per-user companiesPerSeat (same number stored here for apply).
   */
  companyResearchLimit: number;
  dailyEmailLimit: number;
  monthlyEmailLimit: number | null;
  dailyAiGenerationLimit: number;
  researchFreshnessDays: number;
  /** Per-user company allowance. Null for STANDARD (org-level). */
  companiesPerSeat: number | null;
  seatMin: number | null;
  /** Null = no global hard max (ENTERPRISE). */
  seatMax: number | null;
};

export type CatalogCompanyCredits = {
  blockSize: number;
  /** Display-only note (e.g. "for $30 each"). Empty → subscribe page loads Stripe amount. */
  displayPriceNote: string;
  expiryMonths: number;
};

export type CatalogPlanEntry = {
  planCode: string;
  displayName: string;
  tagline: string;
  featureBullets: string[];
  trialNote: string;
  sellable: boolean;
  active: boolean;
  entitlementFloors: {
    trial: CatalogEntitlementFloors | null;
    paid: CatalogEntitlementFloors;
  };
  companyCredits: CatalogCompanyCredits | null;
};

export type BillingCatalogSettingValue = {
  plans: CatalogPlanEntry[];
};

export type ResolvedCatalogEntitlements = PlanEntitlements & {
  dailyAiGenerationLimit: number;
  companiesPerSeat: number | null;
  seatMin: number | null;
  seatMax: number | null;
};

function asNonNegInt(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

function asPositiveInt(raw: unknown): number | null {
  const n = asNonNegInt(raw);
  return n != null && n >= 1 ? n : null;
}

function asString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function asStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const t = item.trim();
    if (t) out.push(t);
  }
  return out;
}

function parseOptionalSeatInt(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || raw === "") return null;
  return asNonNegInt(raw);
}

function parseFloors(
  raw: unknown,
  defaults?: Partial<CatalogEntitlementFloors>,
): CatalogEntitlementFloors | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const companyResearchLimit = asNonNegInt(o.companyResearchLimit);
  const dailyEmailLimit = asNonNegInt(o.dailyEmailLimit);
  const dailyAiGenerationLimit = asNonNegInt(o.dailyAiGenerationLimit);
  const researchFreshnessDays = asPositiveInt(o.researchFreshnessDays);
  if (
    companyResearchLimit == null ||
    dailyEmailLimit == null ||
    dailyAiGenerationLimit == null ||
    researchFreshnessDays == null
  ) {
    return null;
  }
  let monthlyEmailLimit: number | null;
  if (o.monthlyEmailLimit == null || o.monthlyEmailLimit === "") {
    monthlyEmailLimit = null;
  } else {
    monthlyEmailLimit = asNonNegInt(o.monthlyEmailLimit);
    if (monthlyEmailLimit == null) return null;
  }

  const companiesPerSeatParsed = parseOptionalSeatInt(o.companiesPerSeat);
  const seatMinParsed = parseOptionalSeatInt(o.seatMin);
  const seatMaxParsed = parseOptionalSeatInt(o.seatMax);

  return {
    companyResearchLimit,
    dailyEmailLimit,
    monthlyEmailLimit,
    dailyAiGenerationLimit,
    researchFreshnessDays,
    companiesPerSeat:
      companiesPerSeatParsed === undefined
        ? (defaults?.companiesPerSeat ?? null)
        : companiesPerSeatParsed,
    seatMin:
      seatMinParsed === undefined
        ? (defaults?.seatMin ?? null)
        : seatMinParsed,
    seatMax:
      seatMaxParsed === undefined
        ? (defaults?.seatMax ?? null)
        : seatMaxParsed,
  };
}

function parseCompanyCredits(raw: unknown): CatalogCompanyCredits | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const blockSize = asPositiveInt(o.blockSize);
  const expiryMonths = asPositiveInt(o.expiryMonths);
  if (blockSize == null || expiryMonths == null) return null;
  const displayPriceNote =
    typeof o.displayPriceNote === "string" ? o.displayPriceNote.trim() : "";
  return {
    blockSize,
    displayPriceNote,
    expiryMonths,
  };
}

function seatDefaultsForPlan(planCode: string): Partial<CatalogEntitlementFloors> {
  const plan = getPlanDefinition(planCode);
  if (!plan) return { companiesPerSeat: null, seatMin: null, seatMax: null };
  return {
    companiesPerSeat: plan.seats.companiesPerSeat,
    seatMin: plan.seats.seatMin,
    seatMax: plan.seats.seatMax,
  };
}

function parsePlanEntry(raw: unknown): CatalogPlanEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const planCode = asString(o.planCode);
  const displayName = asString(o.displayName);
  if (!planCode || !displayName) return null;
  const tagline = typeof o.tagline === "string" ? o.tagline.trim() : "";
  const trialNote = typeof o.trialNote === "string" ? o.trialNote.trim() : "";
  const featureBullets = asStringArray(o.featureBullets) ?? [];
  const sellable = o.sellable === true;
  const active = o.active !== false;
  // stripePriceId intentionally ignored — prices live in billing.prices only.

  const floorsRaw = o.entitlementFloors;
  if (!floorsRaw || typeof floorsRaw !== "object" || Array.isArray(floorsRaw)) {
    return null;
  }
  const floorsObj = floorsRaw as Record<string, unknown>;
  const seatDefaults = seatDefaultsForPlan(planCode);
  const paid = parseFloors(floorsObj.paid, seatDefaults);
  if (!paid) return null;
  let trial: CatalogEntitlementFloors | null = null;
  if (floorsObj.trial != null) {
    trial = parseFloors(floorsObj.trial, seatDefaults);
    if (!trial) return null;
  }

  const companyCredits = parseCompanyCredits(o.companyCredits);

  return {
    planCode,
    displayName,
    tagline,
    featureBullets,
    trialNote,
    sellable,
    active,
    entitlementFloors: { trial, paid },
    companyCredits,
  };
}

/** Returns null when the payload is missing or invalid (caller falls back to code). */
export function parseBillingCatalogSetting(
  raw: unknown,
): BillingCatalogSettingValue | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const plansRaw = (raw as Record<string, unknown>).plans;
  if (!Array.isArray(plansRaw) || plansRaw.length === 0) return null;
  const plans: CatalogPlanEntry[] = [];
  for (const item of plansRaw) {
    const plan = parsePlanEntry(item);
    if (!plan) return null;
    plans.push(plan);
  }
  return { plans };
}

export function buildBillingCatalogSetting(
  value: BillingCatalogSettingValue,
): BillingCatalogSettingValue {
  const parsed = parseBillingCatalogSetting(value);
  if (!parsed) {
    throw new Error("Invalid billing catalog payload.");
  }
  return parsed;
}

function floorsFromPlan(
  e: PlanEntitlements,
  dailyAiGenerationLimit: number,
  seats: {
    companiesPerSeat: number | null;
    seatMin: number | null;
    seatMax: number | null;
  },
): CatalogEntitlementFloors {
  return {
    companyResearchLimit: e.activeResearchedCompanyLimit,
    dailyEmailLimit: e.dailyEmailSendWarningLimit,
    monthlyEmailLimit: e.monthlyEmailSendLimit,
    dailyAiGenerationLimit,
    researchFreshnessDays: e.researchFreshnessDays,
    companiesPerSeat: seats.companiesPerSeat,
    seatMin: seats.seatMin,
    seatMax: seats.seatMax,
  };
}

/**
 * Code-default catalog seeded from plans.ts + current subscribe copy.
 * Used when PlatformSetting is missing or invalid.
 */
export function defaultBillingCatalogSetting(): BillingCatalogSettingValue {
  const standard = getPlanDefinition(BILLING_PLAN_STANDARD)!;
  const team = getPlanDefinition(BILLING_PLAN_TEAM)!;
  const comped = getPlanDefinition(BILLING_PLAN_COMPED)!;
  const premium = getPlanDefinition(BILLING_PLAN_PREMIUM)!;
  const enterprise = getPlanDefinition(BILLING_PLAN_ENTERPRISE)!;
  const aiGen = DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit;

  return {
    plans: [
      {
        planCode: BILLING_PLAN_STANDARD,
        displayName: "Standard",
        tagline: `For individual ${vocab.seeker.plural}`,
        featureBullets: [
          "Research up to 100 companies on Standard",
          "Generate tailored outreach drafts for Hiring Team contacts",
          "Handoff to Outlook desktop, Outlook on the web, and Gmail",
          "Add Company Research Credits in blocks of 100",
        ],
        trialNote:
          "FREE TRIAL: research up to 25 companies during your trial (100 on a paid plan).",
        sellable: true,
        active: true,
        entitlementFloors: {
          trial: floorsFromPlan(standard.trialEntitlements!, aiGen, {
            companiesPerSeat: null,
            seatMin: 1,
            seatMax: 1,
          }),
          paid: floorsFromPlan(standard.entitlements, aiGen, {
            companiesPerSeat: null,
            seatMin: 1,
            seatMax: 1,
          }),
        },
        companyCredits: {
          blockSize: COMPANY_CREDIT_BLOCK.units,
          displayPriceNote: "",
          expiryMonths: COMPANY_CREDIT_BLOCK.expiryMonths,
        },
      },
      {
        planCode: BILLING_PLAN_TEAM,
        displayName: "Team",
        tagline: "For teams of 2-10",
        featureBullets: [
          "2–10 seats with self-serve seat adds",
          "150 researched companies per user",
          "Generate tailored outreach drafts for Hiring Team contacts",
          `Shared ${vocab.campaign.plural} across the team`,
          "Handoff to Outlook desktop, Outlook on the web, and Gmail",
        ],
        trialNote:
          "FREE TRIAL: each seat gets 150 company research slots. Add seats anytime up to 10.",
        sellable: true,
        active: true,
        entitlementFloors: {
          trial: floorsFromPlan(team.trialEntitlements!, 500, {
            companiesPerSeat: 150,
            seatMin: 2,
            seatMax: 10,
          }),
          paid: floorsFromPlan(team.entitlements, 500, {
            companiesPerSeat: 150,
            seatMin: 2,
            seatMax: 10,
          }),
        },
        companyCredits: {
          blockSize: COMPANY_CREDIT_BLOCK.units,
          displayPriceNote: "",
          expiryMonths: COMPANY_CREDIT_BLOCK.expiryMonths,
        },
      },
      {
        planCode: BILLING_PLAN_ENTERPRISE,
        displayName: "Enterprise",
        tagline: "For larger teams",
        featureBullets: [
          "Same per-user entitlements as Team",
          `Seat cap set by ${brand.appName} for your org`,
          `Shared ${vocab.campaign.plural} and admin activity views`,
          "Contact us to get started",
        ],
        trialNote: "",
        sellable: false,
        active: true,
        entitlementFloors: {
          trial: null,
          paid: floorsFromPlan(enterprise.entitlements, 500, {
            companiesPerSeat: 150,
            seatMin: 2,
            seatMax: null,
          }),
        },
        companyCredits: {
          blockSize: COMPANY_CREDIT_BLOCK.units,
          displayPriceNote: "",
          expiryMonths: COMPANY_CREDIT_BLOCK.expiryMonths,
        },
      },
      {
        planCode: BILLING_PLAN_COMPED,
        displayName: "Comped",
        tagline: "Platform-granted access",
        featureBullets: [],
        trialNote: "",
        sellable: false,
        active: true,
        entitlementFloors: {
          trial: null,
          paid: floorsFromPlan(comped.entitlements, aiGen, {
            companiesPerSeat: null,
            seatMin: 1,
            seatMax: null,
          }),
        },
        companyCredits: null,
      },
      {
        // Legacy inactive stub — display as Team; prefer BILLING_PLAN_TEAM.
        planCode: BILLING_PLAN_PREMIUM,
        displayName: "Team",
        tagline: "Legacy plan code (use Team)",
        featureBullets: [],
        trialNote: "",
        sellable: false,
        active: false,
        entitlementFloors: {
          trial: floorsFromPlan(premium.trialEntitlements!, 500, {
            companiesPerSeat: 150,
            seatMin: 2,
            seatMax: 10,
          }),
          paid: floorsFromPlan(premium.entitlements, 500, {
            companiesPerSeat: 150,
            seatMin: 2,
            seatMax: 10,
          }),
        },
        companyCredits: {
          blockSize: COMPANY_CREDIT_BLOCK.units,
          displayPriceNote: "",
          expiryMonths: COMPANY_CREDIT_BLOCK.expiryMonths,
        },
      },
    ],
  };
}

export function findCatalogPlan(
  catalog: BillingCatalogSettingValue,
  planCode: string,
): CatalogPlanEntry | null {
  const code = planCode === "FREE" ? BILLING_PLAN_COMPED : planCode;
  return catalog.plans.find((p) => p.planCode === code) ?? null;
}

export function catalogFloorsForStatus(input: {
  plan: CatalogPlanEntry;
  billingStatus: string;
}): CatalogEntitlementFloors {
  if (
    input.billingStatus === "TRIALING" &&
    input.plan.entitlementFloors.trial
  ) {
    return input.plan.entitlementFloors.trial;
  }
  return input.plan.entitlementFloors.paid;
}

export function catalogFloorsToResolved(
  floors: CatalogEntitlementFloors,
): ResolvedCatalogEntitlements {
  return {
    activeResearchedCompanyLimit: floors.companyResearchLimit,
    dailyEmailSendWarningLimit: floors.dailyEmailLimit,
    monthlyEmailSendLimit: floors.monthlyEmailLimit,
    researchFreshnessDays: floors.researchFreshnessDays,
    dailyAiGenerationLimit: floors.dailyAiGenerationLimit,
    companiesPerSeat: floors.companiesPerSeat,
    seatMin: floors.seatMin,
    seatMax: floors.seatMax,
  };
}

/**
 * Resolve entitlements for Stripe sync: catalog floors when present, else plans.ts.
 */
export function resolveCatalogEntitlementsForStatus(input: {
  catalog: BillingCatalogSettingValue | null;
  planCode: string;
  billingStatus: string;
}): ResolvedCatalogEntitlements | null {
  const fromCatalog =
    input.catalog != null
      ? findCatalogPlan(input.catalog, input.planCode)
      : null;
  if (fromCatalog?.active !== false && fromCatalog) {
    const floors = catalogFloorsForStatus({
      plan: fromCatalog,
      billingStatus: input.billingStatus,
    });
    return catalogFloorsToResolved(floors);
  }

  const plan = getPlanDefinition(input.planCode);
  if (!plan) return null;
  const base =
    input.billingStatus === "TRIALING" && plan.trialEntitlements
      ? plan.trialEntitlements
      : plan.entitlements;
  return {
    ...base,
    dailyAiGenerationLimit: plan.seats.dailyAiGenerationLimit,
    companiesPerSeat: plan.seats.companiesPerSeat,
    seatMin: plan.seats.seatMin,
    seatMax: plan.seats.seatMax,
  };
}
