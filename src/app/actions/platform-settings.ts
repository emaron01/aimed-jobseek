"use server";

import { revalidatePath } from "next/cache";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import {
  buildBillingPricesSetting,
  PLATFORM_SETTING_BILLING_PRICES,
} from "@/lib/billing/billing-prices";
import {
  buildBillingCatalogSetting,
  PLATFORM_SETTING_BILLING_CATALOG,
  type CatalogEntitlementFloors,
  type CatalogPlanEntry,
} from "@/lib/billing/billing-catalog";
import { validateBillingPricesAgainstStripe } from "@/lib/billing/validate-billing-prices";
import {
  buildBillingTrialSetting,
  MAX_TRIAL_PERIOD_DAYS,
  MIN_TRIAL_PERIOD_DAYS,
  PLATFORM_SETTING_BILLING_TRIAL,
} from "@/lib/billing/trial-period";
import {
  LIKELY_QUESTIONS_PER_PERSON_KEY,
  parseLikelyQuestionsPerPerson,
} from "@/lib/application-summary/likely-question-limit";
import {
  DEFAULT_HARPER_DRAFT_SETTINGS,
  HARPER_DRAFT_SETTINGS_KEY,
  parseHarperDraftSettings,
} from "@/lib/consultation/harper-draft-settings";
import {
  deletePlatformSetting,
  getBillingTrialPlatformSetting,
  upsertBillingCatalogSetting,
  upsertBillingPricesSetting,
  upsertBillingTrialSetting,
  upsertPlatformSetting,
} from "@/lib/platform/settings";
import { TenantError } from "@/lib/tenant/errors";

export type PlatformSettingsActionResult = {
  ok: boolean;
  message: string;
};

function toSafeError(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to save platform setting. Please try again.";
    }
    return error.message;
  }
  return "Unable to save platform setting. Please try again.";
}

function revalidateBillingConsole(): void {
  revalidatePath("/platform");
  revalidatePath("/platform/billing");
  revalidatePath("/platform/catalog");
  revalidatePath("/onboarding/subscribe");
  revalidatePath("/settings/billing");
}

export async function updateBillingTrialSettingAction(
  _prev: PlatformSettingsActionResult | null,
  formData: FormData,
): Promise<PlatformSettingsActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const intent = String(formData.get("intent") || "save").trim();

    if (intent === "clear") {
      await deletePlatformSetting({
        key: PLATFORM_SETTING_BILLING_TRIAL,
        actorUserId: user.id,
      });
      revalidateBillingConsole();
      return {
        ok: true,
        message:
          "Console trial setting cleared. Environment fallback is in effect.",
      };
    }

    function parsePlanToggle(
      enabledKey: string,
      daysKey: string,
      label: string,
    ): { ok: true; enabled: boolean; days: number } | { ok: false; message: string } {
      const enabledRaw = String(formData.get(enabledKey) || "").trim();
      const enabled =
        enabledRaw === "1" || enabledRaw.toLowerCase() === "on";
      const daysRaw = String(formData.get(daysKey) || "").trim();
      const days = Number.parseInt(daysRaw, 10);
      if (enabled) {
        if (
          !Number.isInteger(days) ||
          days < MIN_TRIAL_PERIOD_DAYS ||
          days > MAX_TRIAL_PERIOD_DAYS
        ) {
          return {
            ok: false,
            message: `When ${label} trial is on, days must be an integer from ${MIN_TRIAL_PERIOD_DAYS} to ${MAX_TRIAL_PERIOD_DAYS}.`,
          };
        }
      }
      return {
        ok: true,
        enabled,
        days: Number.isInteger(days) ? days : MIN_TRIAL_PERIOD_DAYS,
      };
    }

    const standard = parsePlanToggle("standardEnabled", "standardDays", "Standard");
    if (!standard.ok) return { ok: false, message: standard.message };
    const team = parsePlanToggle("teamEnabled", "teamDays", "Team");
    if (!team.ok) return { ok: false, message: team.message };

    const existing = await getBillingTrialPlatformSetting();
    const value = buildBillingTrialSetting({
      standard: { enabled: standard.enabled, days: standard.days },
      team: { enabled: team.enabled, days: team.days },
      existingByPlan: existing?.byPlan,
    });

    await upsertBillingTrialSetting({
      value,
      actorUserId: user.id,
    });
    revalidateBillingConsole();

    const parts: string[] = [];
    parts.push(
      standard.enabled
        ? `Standard: ${standard.days}-day trial`
        : "Standard: trial off",
    );
    parts.push(
      team.enabled ? `Team: ${team.days}-day trial` : "Team: trial off",
    );
    return {
      ok: true,
      message: `Saved — ${parts.join("; ")}. Applies to new Checkout only.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function updateBillingPricesSettingAction(
  _prev: PlatformSettingsActionResult | null,
  formData: FormData,
): Promise<PlatformSettingsActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const intent = String(formData.get("intent") || "save").trim();

    if (intent === "clear") {
      await deletePlatformSetting({
        key: PLATFORM_SETTING_BILLING_PRICES,
        actorUserId: user.id,
      });
      revalidateBillingConsole();
      return {
        ok: true,
        message:
          "Console price IDs cleared. Environment fallback is in effect.",
      };
    }

    let value;
    try {
      value = buildBillingPricesSetting({
        standardMonthlyPriceId: String(
          formData.get("standardMonthlyPriceId") || "",
        ),
        standardProductId: String(formData.get("standardProductId") || ""),
        companyCreditsPriceId: String(
          formData.get("companyCreditsPriceId") || "",
        ),
        teamMonthlyPriceId: String(formData.get("teamMonthlyPriceId") || ""),
        teamProductId: String(formData.get("teamProductId") || ""),
        enterpriseMonthlyPriceId: String(
          formData.get("enterpriseMonthlyPriceId") || "",
        ),
        enterpriseProductId: String(
          formData.get("enterpriseProductId") || "",
        ),
      });
    } catch (error) {
      return { ok: false, message: toSafeError(error) };
    }

    await validateBillingPricesAgainstStripe(value);
    await upsertBillingPricesSetting({
      value,
      actorUserId: user.id,
    });
    revalidateBillingConsole();
    return {
      ok: true,
      message:
        "Price IDs verified with Stripe and saved for new Checkout sessions.",
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

function parseFloorField(
  formData: FormData,
  name: string,
  required: boolean,
): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") {
    if (required) throw new TenantError(`${name} is required.`);
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw new TenantError(`${name} must be a non-negative integer.`);
  }
  return n;
}

function floorsFromForm(
  formData: FormData,
  prefix: "paid" | "trial",
): CatalogEntitlementFloors {
  const companyResearchLimit = parseFloorField(
    formData,
    `${prefix}CompanyResearchLimit`,
    true,
  )!;
  const dailyEmailLimit = parseFloorField(
    formData,
    `${prefix}DailyEmailLimit`,
    true,
  )!;
  const monthlyEmailLimit = parseFloorField(
    formData,
    `${prefix}MonthlyEmailLimit`,
    false,
  );
  const dailyAiGenerationLimit = parseFloorField(
    formData,
    `${prefix}DailyAiGenerationLimit`,
    true,
  )!;
  const researchFreshnessDays = parseFloorField(
    formData,
    `${prefix}ResearchFreshnessDays`,
    true,
  )!;
  if (researchFreshnessDays < 1) {
    throw new TenantError("Research freshness days must be at least 1.");
  }
  return {
    companyResearchLimit,
    dailyEmailLimit,
    monthlyEmailLimit,
    dailyAiGenerationLimit,
    researchFreshnessDays,
    companiesPerSeat: null,
    seatMin: null,
    seatMax: null,
  };
}

export async function updateBillingCatalogSettingAction(
  _prev: PlatformSettingsActionResult | null,
  formData: FormData,
): Promise<PlatformSettingsActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const intent = String(formData.get("intent") || "save").trim();

    if (intent === "clear") {
      await deletePlatformSetting({
        key: PLATFORM_SETTING_BILLING_CATALOG,
        actorUserId: user.id,
      });
      revalidateBillingConsole();
      return {
        ok: true,
        message: "Console catalog cleared. Code defaults are in effect.",
      };
    }

    const planCode = String(formData.get("planCode") || "").trim();
    if (!planCode) {
      return { ok: false, message: "Plan code is required." };
    }

    let otherPlans: CatalogPlanEntry[] = [];
    try {
      const raw = String(formData.get("otherPlansJson") || "[]");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        otherPlans = parsed as CatalogPlanEntry[];
      }
    } catch {
      return { ok: false, message: "Could not parse existing catalog plans." };
    }

    const featureBullets = String(formData.get("featureBullets") || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const hasTrialFloors =
      String(formData.get("hasTrialFloors") || "") === "1" ||
      String(formData.get("hasTrialFloors") || "").toLowerCase() === "on";
    const hasCompanyCredits =
      String(formData.get("hasCompanyCredits") || "") === "1" ||
      String(formData.get("hasCompanyCredits") || "").toLowerCase() === "on";

    const paid = floorsFromForm(formData, "paid");
    let trial: CatalogEntitlementFloors | null = null;
    if (hasTrialFloors) {
      trial = floorsFromForm(formData, "trial");
    }

    const companiesPerSeat = parseFloorField(
      formData,
      "companiesPerSeat",
      false,
    );
    const seatMin = parseFloorField(formData, "seatMin", false);
    const seatMax = parseFloorField(formData, "seatMax", false);

    paid.companiesPerSeat = companiesPerSeat;
    paid.seatMin = seatMin;
    paid.seatMax = seatMax;
    if (trial) {
      trial.companiesPerSeat = companiesPerSeat;
      trial.seatMin = seatMin;
      trial.seatMax = seatMax;
    }

    const entry: CatalogPlanEntry = {
      planCode,
      displayName: String(formData.get("displayName") || "").trim(),
      tagline: String(formData.get("tagline") || "").trim(),
      featureBullets,
      trialNote: String(formData.get("trialNote") || "").trim(),
      sellable:
        String(formData.get("sellable") || "") === "1" ||
        String(formData.get("sellable") || "").toLowerCase() === "on",
      active:
        String(formData.get("active") || "") === "1" ||
        String(formData.get("active") || "").toLowerCase() === "on",
      entitlementFloors: { trial, paid },
      companyCredits: null,
    };

    if (!entry.displayName) {
      return { ok: false, message: "Display name is required." };
    }

    if (hasCompanyCredits) {
      const blockSize = parseFloorField(formData, "creditsBlockSize", true)!;
      const expiryMonths = parseFloorField(
        formData,
        "creditsExpiryMonths",
        true,
      )!;
      if (blockSize < 1 || expiryMonths < 1) {
        return {
          ok: false,
          message: "Credit block size and expiry must be at least 1.",
        };
      }
      entry.companyCredits = {
        blockSize,
        displayPriceNote: String(
          formData.get("creditsDisplayPriceNote") || "",
        ).trim(),
        expiryMonths,
      };
    }

    const plans = [
      ...otherPlans.filter((p) => p.planCode !== planCode),
      entry,
    ];

    let value;
    try {
      value = buildBillingCatalogSetting({ plans });
    } catch (error) {
      return { ok: false, message: toSafeError(error) };
    }

    await upsertBillingCatalogSetting({
      value,
      actorUserId: user.id,
    });
    revalidateBillingConsole();
    return {
      ok: true,
      message: `Catalog saved for ${entry.displayName}. New Checkout and Stripe sync use these floors; existing orgs keep their stored policies.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function updateHarperDraftSettingsAction(
  _prev: PlatformSettingsActionResult | null,
  formData: FormData,
): Promise<PlatformSettingsActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const intent = String(formData.get("intent") || "save").trim();
    if (intent === "clear") {
      await deletePlatformSetting({
        key: HARPER_DRAFT_SETTINGS_KEY,
        actorUserId: user.id,
      });
      await deletePlatformSetting({
        key: LIKELY_QUESTIONS_PER_PERSON_KEY,
        actorUserId: user.id,
      });
      revalidatePath("/platform/harper");
      return {
        ok: true,
        message: "Harper draft settings cleared. Defaults apply on the next Harper run.",
      };
    }
    const raw = Object.fromEntries(
      Object.keys(DEFAULT_HARPER_DRAFT_SETTINGS).map((key) => [key, formData.get(key)]),
    );
    const settings = parseHarperDraftSettings(raw);
    const likelyQuestionsPerPerson = parseLikelyQuestionsPerPerson({
      max: formData.get("likelyQuestionsPerPerson"),
    });
    await upsertPlatformSetting({
      key: HARPER_DRAFT_SETTINGS_KEY,
      value: settings,
      actorUserId: user.id,
    });
    await upsertPlatformSetting({
      key: LIKELY_QUESTIONS_PER_PERSON_KEY,
      value: { max: likelyQuestionsPerPerson },
      actorUserId: user.id,
    });
    revalidatePath("/platform/harper");
    return {
      ok: true,
      message: "Harper draft settings saved. Harper reads them the next time it plans or drafts.",
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}
