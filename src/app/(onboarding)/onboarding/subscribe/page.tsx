import { redirect } from "next/navigation";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import { requiresStripeCheckout } from "@/lib/billing/billing-state";
import { loadCatalogPlan } from "@/lib/billing/effective-catalog";
import { fetchSellableCatalogPrices } from "@/lib/billing/fetch-catalog-prices";
import {
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import { effectivePricesAreCheckoutReady } from "@/lib/billing/billing-prices";
import { loadEffectiveBillingPrices } from "@/lib/billing/effective-prices";
import { loadEffectiveTrialPeriod } from "@/lib/billing/effective-trial";
import { stripeConfigured } from "@/lib/billing/stripe";
import { OnboardingPlanSelector } from "@/components/billing/OnboardingPlanSelector";
import { defaultBillingCatalogSetting } from "@/lib/billing/billing-catalog";
import { getBrandDeployment } from "@/lib/product-config/deployment";

export const dynamic = "force-dynamic";

function planOptionFromCatalog(input: {
  planCode: string;
  displayName: string;
  tagline: string;
  featureBullets: string[];
  trialNote: string;
  priceLabel: string | null;
  creditsBulletNote: string | null;
}) {
  return {
    planCode: input.planCode,
    displayName: input.displayName,
    tagline: input.tagline,
    featureBullets: input.featureBullets,
    trialNote: input.trialNote || null,
    priceLabel: input.priceLabel,
    creditsBulletNote: input.creditsBulletNote,
  };
}

/**
 * Post-verify subscribe pitch — unpaid self-serve only.
 * Marketing copy + floors from billing.catalog (code fallback).
 * Price amount from Stripe via billing.prices.
 */
export default async function OnboardingSubscribePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supportEmail } = getBrandDeployment();
  const { organization } = await requireOrgAdmin();
  const params = searchParams ? await searchParams : {};
  const checkoutState =
    typeof params.checkout === "string" ? params.checkout : null;

  const billing = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: organization.id },
  });

  const hasLiveSubscription =
    Boolean(billing?.stripeSubscriptionId) &&
    (billing?.billingStatus === "ACTIVE" ||
      billing?.billingStatus === "TRIALING" ||
      billing?.billingStatus === "PAST_DUE");

  if (hasLiveSubscription) {
    redirect("/");
  }

  if (
    billing &&
    !requiresStripeCheckout(billing) &&
    billing.billingStatus === "FREE"
  ) {
    redirect("/");
  }

  const defaults = defaultBillingCatalogSetting();
  const [
    priceCatalog,
    prices,
    standardTrial,
    teamTrial,
    standardLoad,
    teamLoad,
    enterpriseLoad,
  ] = await Promise.all([
    fetchSellableCatalogPrices(),
    loadEffectiveBillingPrices(),
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

  const fallbackStandard = defaults.plans.find(
    (p) => p.planCode === BILLING_PLAN_STANDARD,
  )!;
  const fallbackTeam = defaults.plans.find(
    (p) => p.planCode === BILLING_PLAN_TEAM,
  )!;
  const fallbackEnterprise = defaults.plans.find(
    (p) => p.planCode === BILLING_PLAN_ENTERPRISE,
  )!;

  function optionFor(
    planCode: string,
    plan: (typeof standardLoad)["plan"],
    fallback: (typeof fallbackStandard),
  ) {
    const priceRow =
      priceCatalog.plans.find((p) => p.planCode === planCode) ?? null;
    const credits = plan.companyCredits ?? fallback.companyCredits;
    const creditsBulletNote =
      credits?.displayPriceNote?.trim() ||
      (credits
        ? `Add Company Research Credits in blocks of ${credits.blockSize}`
        : null);
    return planOptionFromCatalog({
      planCode,
      displayName: plan.displayName || fallback.displayName,
      tagline: plan.tagline || fallback.tagline,
      featureBullets:
        plan.featureBullets.length > 0
          ? plan.featureBullets
          : fallback.featureBullets,
      trialNote: plan.trialNote || fallback.trialNote,
      priceLabel:
        priceCatalog.usedFallback || !priceRow?.priceLabel
          ? null
          : priceRow.priceLabel,
      creditsBulletNote,
    });
  }

  const standard = optionFor(
    BILLING_PLAN_STANDARD,
    standardLoad.plan,
    fallbackStandard,
  );
  const team = optionFor(BILLING_PLAN_TEAM, teamLoad.plan, fallbackTeam);
  const enterprise = optionFor(
    BILLING_PLAN_ENTERPRISE,
    enterpriseLoad.plan,
    fallbackEnterprise,
  );

  let globalDisabledReason: string | null = null;
  if (!stripeConfigured()) {
    globalDisabledReason =
      "Checkout is not configured yet. Contact support if this persists."
  }

  const { readPendingSignupIntent } = await import(
    "@/lib/billing/pending-signup-intent-cookie"
  );
  const intent = await readPendingSignupIntent();
  const profilePlan = billing?.planCode?.trim() || null;
  const lockedPlanCode =
    intent?.planCode === BILLING_PLAN_TEAM ||
    intent?.planCode === BILLING_PLAN_STANDARD
      ? intent.planCode
      : profilePlan === BILLING_PLAN_TEAM || profilePlan === BILLING_PLAN_STANDARD
        ? profilePlan
        : null;
  const lockedSeatQuantity =
    intent?.seatQuantity ??
    (billing?.seatQuantity && billing.seatQuantity > 1
      ? billing.seatQuantity
      : lockedPlanCode === BILLING_PLAN_TEAM
        ? 2
        : 1);
  const lockSelection = Boolean(lockedPlanCode);
  const selectedTrialDays =
    lockedPlanCode === BILLING_PLAN_TEAM
      ? teamTrial.days
      : lockedPlanCode === BILLING_PLAN_STANDARD
        ? standardTrial.days
        : standardTrial.days ?? teamTrial.days;
  const anyTrialOn =
    lockSelection
      ? selectedTrialDays != null
      : standardTrial.days != null || teamTrial.days != null;

  return (
    <div className="space-y-8" data-testid="onboarding-subscribe-page">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          {lockSelection
            ? anyTrialOn
              ? "Start Your Free Trial"
              : "Complete checkout"
            : anyTrialOn
              ? "Start Your Free Trial"
              : "Choose a plan"}
        </h1>
        <p className="text-base text-muted">
          {anyTrialOn
            ? "No charge until your trial ends. Cancel anytime."
            : "Billing starts when Checkout completes. Cancel anytime."}
        </p>
      </div>

      {checkoutState === "canceled" ? (
        <p className="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink">
          Checkout canceled — no charge was made. You can start again below.
        </p>
      ) : null}

      <OnboardingPlanSelector
        standard={standard}
        team={team}
        enterprise={enterprise}
        standardTrialDays={standardTrial.days}
        teamTrialDays={teamTrial.days}
        standardCheckoutReady={effectivePricesAreCheckoutReady(
          prices,
          BILLING_PLAN_STANDARD,
        )}
        teamCheckoutReady={effectivePricesAreCheckoutReady(
          prices,
          BILLING_PLAN_TEAM,
        )}
        globalDisabledReason={globalDisabledReason}
        initialPlanCode={lockedPlanCode ?? BILLING_PLAN_STANDARD}
        initialSeatQuantity={lockedSeatQuantity}
        lockSelection={lockSelection}
        supportEmail={supportEmail}
      />
    </div>
  );
}
