import Link from "next/link";
import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import {
  PLATFORM_SETTING_BILLING_PRICES,
  resolveEffectiveBillingPrices,
} from "@/lib/billing/billing-prices";
import {
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import {
  PLATFORM_SETTING_BILLING_TRIAL,
  resolveEffectiveTrialPeriod,
  trialPlanFormState,
} from "@/lib/billing/trial-period";
import {
  getBillingPricesPlatformSetting,
  getBillingTrialPlatformSetting,
  hasPlatformSetting,
} from "@/lib/platform/settings";
import { BillingPricesSettingsForm } from "@/components/platform/BillingPricesSettingsForm";
import { BillingTrialSettingsForm } from "@/components/platform/BillingTrialSettingsForm";

export default async function PlatformBillingPage() {
  await requirePlatformSuperAdmin();

  const [
    trialSetting,
    hasTrialRow,
    pricesSetting,
    hasPricesRow,
  ] = await Promise.all([
    getBillingTrialPlatformSetting(),
    hasPlatformSetting(PLATFORM_SETTING_BILLING_TRIAL),
    getBillingPricesPlatformSetting(),
    hasPlatformSetting(PLATFORM_SETTING_BILLING_PRICES),
  ]);
  const effectiveStandardTrial = resolveEffectiveTrialPeriod({
    planCode: BILLING_PLAN_STANDARD,
    platformSetting: trialSetting,
  });
  const effectiveTeamTrial = resolveEffectiveTrialPeriod({
    planCode: BILLING_PLAN_TEAM,
    platformSetting: trialSetting,
  });
  const trialForm = trialPlanFormState({
    platformSetting: trialSetting,
    standardEffectiveDays: effectiveStandardTrial.days,
    teamEffectiveDays: effectiveTeamTrial.days,
  });
  const effectivePrices = resolveEffectiveBillingPrices({
    platformSetting: pricesSetting,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-subtle">
          <Link href="/platform" className="underline">
            Platform
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Billing Config
        </h1>
        <p className="mt-1 text-sm text-muted">
          Trial length, Stripe price IDs, and webhook-related billing IDs only.
          Display copy and entitlement floors live on Plan Catalog. SUPER_ADMIN
          only.
        </p>
      </div>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <h2 className="text-lg font-medium text-ink">Free trial</h2>
        <p className="mt-1 text-sm text-muted">
          Independent on/off and duration for Standard and Team. Enterprise has
          no self-serve Checkout trial.
        </p>
        <div className="mt-4">
          <BillingTrialSettingsForm
            hasConsoleRow={hasTrialRow}
            standard={{
              enabled: trialForm.standard.enabled,
              days: trialForm.standard.days,
              effectiveDays: effectiveStandardTrial.days,
              sourceLabel: effectiveStandardTrial.sourceLabel,
            }}
            team={{
              enabled: trialForm.team.enabled,
              days: trialForm.team.days,
              effectiveDays: effectiveTeamTrial.days,
              sourceLabel: effectiveTeamTrial.sourceLabel,
            }}
          />
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <h2 className="text-lg font-medium text-ink">Stripe price IDs</h2>
        <p className="mt-1 text-sm text-muted">
          Standard, Team, Enterprise, and company-credit Price/Product IDs.
          Team and Enterprise may be left blank until live IDs are ready.
          Validated against Stripe on save when filled.
        </p>
        <div className="mt-4">
          <BillingPricesSettingsForm
            consoleStandardMonthlyPriceId={
              pricesSetting?.standardMonthlyPriceId ?? null
            }
            consoleStandardProductId={pricesSetting?.standardProductId ?? null}
            consoleCompanyCreditsPriceId={
              pricesSetting?.companyCreditsPriceId ?? null
            }
            consoleTeamMonthlyPriceId={
              pricesSetting?.teamMonthlyPriceId || null
            }
            consoleTeamProductId={pricesSetting?.teamProductId || null}
            consoleEnterpriseMonthlyPriceId={
              pricesSetting?.enterpriseMonthlyPriceId || null
            }
            consoleEnterpriseProductId={
              pricesSetting?.enterpriseProductId || null
            }
            hasConsoleRow={hasPricesRow}
            effective={{
              standardMonthlyPriceId: {
                value: effectivePrices.standardMonthlyPriceId.value,
                sourceLabel: effectivePrices.standardMonthlyPriceId.sourceLabel,
              },
              standardProductId: {
                value: effectivePrices.standardProductId.value,
                sourceLabel: effectivePrices.standardProductId.sourceLabel,
              },
              companyCreditsPriceId: {
                value: effectivePrices.companyCreditsPriceId.value,
                sourceLabel: effectivePrices.companyCreditsPriceId.sourceLabel,
              },
              teamMonthlyPriceId: {
                value: effectivePrices.teamMonthlyPriceId.value,
                sourceLabel: effectivePrices.teamMonthlyPriceId.sourceLabel,
              },
              teamProductId: {
                value: effectivePrices.teamProductId.value,
                sourceLabel: effectivePrices.teamProductId.sourceLabel,
              },
              enterpriseMonthlyPriceId: {
                value: effectivePrices.enterpriseMonthlyPriceId.value,
                sourceLabel:
                  effectivePrices.enterpriseMonthlyPriceId.sourceLabel,
              },
              enterpriseProductId: {
                value: effectivePrices.enterpriseProductId.value,
                sourceLabel: effectivePrices.enterpriseProductId.sourceLabel,
              },
            }}
          />
        </div>
      </section>
    </div>
  );
}
