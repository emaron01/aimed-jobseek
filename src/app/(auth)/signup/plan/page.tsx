import Link from "next/link";
import { defaultBillingCatalogSetting } from "@/lib/billing/billing-catalog";
import { loadCatalogPlan } from "@/lib/billing/effective-catalog";
import { loadEffectiveTrialPeriod } from "@/lib/billing/effective-trial";
import { fetchSellableCatalogPrices } from "@/lib/billing/fetch-catalog-prices";
import {
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import { SignupPlanSelector } from "@/components/billing/SignupPlanSelector";
import { getBrandDeployment } from "@/lib/product-config/deployment";

export const dynamic = "force-dynamic";

/**
 * Plan-first entry for self-serve signup.
 * Stores plan + Team seat quantity in an httpOnly cookie, then /signup.
 */
export default async function SignupPlanPage() {
  const { supportEmail } = getBrandDeployment();
  const defaults = defaultBillingCatalogSetting();
  const [
    priceCatalog,
    standardTrial,
    teamTrial,
    standardLoad,
    teamLoad,
    enterpriseLoad,
  ] = await Promise.all([
    fetchSellableCatalogPrices(),
    loadEffectiveTrialPeriod({ planCode: BILLING_PLAN_STANDARD }),
    loadEffectiveTrialPeriod({ planCode: BILLING_PLAN_TEAM }),
    loadCatalogPlan(BILLING_PLAN_STANDARD).catch(() => ({
      plan: defaults.plans.find((p) => p.planCode === BILLING_PLAN_STANDARD)!,
    })),
    loadCatalogPlan(BILLING_PLAN_TEAM).catch(() => ({
      plan: defaults.plans.find((p) => p.planCode === BILLING_PLAN_TEAM)!,
    })),
    loadCatalogPlan(BILLING_PLAN_ENTERPRISE).catch(() => ({
      plan: defaults.plans.find(
        (p) => p.planCode === BILLING_PLAN_ENTERPRISE,
      )!,
    })),
  ]);

  function optionFor(
    planCode: string,
    plan: (typeof standardLoad)["plan"],
    fallback: (typeof defaults.plans)[number],
    trialDays: number | null,
  ) {
    const priceRow =
      priceCatalog.plans.find((p) => p.planCode === planCode) ?? null;
    return {
      planCode,
      displayName: plan.displayName || fallback.displayName,
      tagline: plan.tagline || fallback.tagline,
      featureBullets:
        plan.featureBullets.length > 0
          ? plan.featureBullets
          : fallback.featureBullets,
      priceLabel:
        priceCatalog.usedFallback || !priceRow?.priceLabel
          ? null
          : priceRow.priceLabel,
      trialDays,
      trialNote: plan.trialNote || fallback.trialNote || null,
    };
  }

  const fallbackStandard = defaults.plans.find(
    (p) => p.planCode === BILLING_PLAN_STANDARD,
  )!;
  const fallbackTeam = defaults.plans.find(
    (p) => p.planCode === BILLING_PLAN_TEAM,
  )!;
  const fallbackEnterprise = defaults.plans.find(
    (p) => p.planCode === BILLING_PLAN_ENTERPRISE,
  )!;

  return (
    <div className="mx-auto w-full space-y-6" data-testid="signup-plan-page">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Choose your plan
        </h1>
        <p className="text-base text-slate-600">
          Choose a plan first. Next you&apos;ll create your account and verify
          your email.
        </p>
      </div>

      <SignupPlanSelector
        standard={optionFor(
          BILLING_PLAN_STANDARD,
          standardLoad.plan,
          fallbackStandard,
          standardTrial.days,
        )}
        team={optionFor(
          BILLING_PLAN_TEAM,
          teamLoad.plan,
          fallbackTeam,
          teamTrial.days,
        )}
        enterprise={optionFor(
          BILLING_PLAN_ENTERPRISE,
          enterpriseLoad.plan,
          fallbackEnterprise,
          null,
        )}
        supportEmail={supportEmail}
      />

      <p className="text-center text-sm text-slate-500">
        Joining a teammate? Use the invite link they sent you instead of this
        page.{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
