import Link from "next/link";
import { redirect } from "next/navigation";
import {
  canManageBillingSpend,
  canManageOrganizationPolicy,
  canViewBilling,
  getMembershipForCurrentUser,
} from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import {
  BILLING_PLAN_COMPED,
  billingPlanDescription,
  billingPlanLabel,
  billingStatusLabel,
  formatBillingDate,
  formatDiscountSummary,
  formatStripeMoney,
  formatTrialEndsSummary,
  formatPriceInterval,
  requiresStripeCheckout,
} from "@/lib/billing/billing-state";
import { ONBOARDING_SUBSCRIBE_PATH } from "@/lib/billing/paths";
import { hasActiveDiscount } from "@/lib/billing/price-discount-mirror";
import {
  getPlanDefinition,
  planAllowsReferrals,
  planUsesInvoicedBilling,
  planUsesPerUserCompanyAllowance,
  planUsesSeatBilling,
} from "@/lib/billing/plans";
import { loadEffectiveBillingCatalog } from "@/lib/billing/effective-catalog";
import { resolveCatalogEntitlementsForStatus } from "@/lib/billing/billing-catalog";
import {
  getOrganizationPaymentLockState,
  paymentLockUserMessage,
} from "@/lib/billing/payment-lock";
import { BillingCheckoutRefresh } from "@/components/billing/BillingCheckoutRefresh";
import { BuyCompanyCreditsButton } from "@/components/billing/BuyCompanyCreditsButton";
import { ConvertTrialNowButton } from "@/components/billing/ConvertTrialNowButton";
import { OpenCustomerPortalButton } from "@/components/billing/OpenCustomerPortalButton";
import { ReferralProgramPanel } from "@/components/billing/ReferralProgramPanel";
import { ResubscribeCheckoutButton } from "@/components/billing/ResubscribeCheckoutButton";
import { SeatManagementPanel } from "@/components/billing/SeatManagementPanel";
import { canOfferEarlyTrialConversion } from "@/lib/billing/end-trial-now";
import { getCompanyResearchCreditBalance } from "@/lib/billing/company-research-credits";
import { effectiveCreditsAreCheckoutReady } from "@/lib/billing/billing-prices";
import { loadEffectiveBillingPrices } from "@/lib/billing/effective-prices";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  ensureOrganizationPolicies,
  getEffectiveUsagePolicy,
} from "@/lib/usage/policy";
import { buildSeatSnapshot } from "@/lib/org/seat-limits";
import { defaultMaxSeatsForPlan } from "@/lib/org/seat-limits";
import { features, vocab } from "@/lib/product-config";

/** Always read live billing state — never serve a pre-checkout RSC snapshot. */
export const dynamic = "force-dynamic";

/**
 * Manage subscription only (portal, dates, capacity).
 * Unpaid self-serve → /onboarding/subscribe.
 * Payment-locked orgs land here for resubscribe only.
 */
export default async function OrganizationBillingSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization, user, membership } = await getMembershipForCurrentUser();
  const isAdmin = canManageOrganizationPolicy(membership.role);
  const isOwner = canManageBillingSpend(membership.role);
  const mayViewBilling = canViewBilling(membership.role);
  await ensureOrganizationPolicies(organization.id);
  const params = searchParams ? await searchParams : {};
  const checkoutState =
    typeof params.checkout === "string" ? params.checkout : null;
  const creditsState =
    typeof params.credits === "string" ? params.credits : null;

  const [
    billing,
    policy,
    canConvertTrialEarly,
    prices,
    catalogEffective,
    lockState,
    memberCount,
  ] = await Promise.all([
    prisma.organizationBillingProfile.findUnique({
      where: { organizationId: organization.id },
    }),
    getEffectiveUsagePolicy({
      organizationId: organization.id,
      userId: user.id,
    }),
    canOfferEarlyTrialConversion(organization.id),
    loadEffectiveBillingPrices(),
    loadEffectiveBillingCatalog(),
    getOrganizationPaymentLockState(organization.id),
    prisma.organizationMembership.count({
      where: { organizationId: organization.id },
    }),
  ]);

  const paymentLocked = lockState.locked;
  const spendBlocked = lockState.spendBlocked;

  if (!mayViewBilling) {
    if (paymentLocked || spendBlocked) {
      return (
        <div className="mx-auto max-w-lg space-y-4" data-testid="billing-member-lock">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Billing
          </h1>
          <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Your workspace billing needs attention. Contact your organization
            owner to update the payment method. Team members cannot manage
            billing.
          </p>
          <p className="text-sm text-slate-600">
            <Link href="/" className="underline">
              Return home
            </Link>
          </p>
        </div>
      );
    }
    redirect("/settings");
  }

  if (billing && requiresStripeCheckout(billing)) {
    redirect(ONBOARDING_SUBSCRIBE_PATH);
  }

  const planCode = billing?.planCode ?? BILLING_PLAN_COMPED;
  const billingStatus = billing?.billingStatus ?? "FREE";
  const perUserCredits = planUsesPerUserCompanyAllowance(planCode);
  const invoiceManaged = planUsesInvoicedBilling(planCode);

  const [activeCompanies, creditBalance] = await Promise.all([
    countActiveResearchedCompanies(
      organization.id,
      new Date(),
      perUserCredits
        ? { firstResearchedByUserId: user.id }
        : undefined,
    ),
    getCompanyResearchCreditBalance(organization.id, new Date(), {
      userId: perUserCredits ? user.id : null,
    }),
  ]);

  const remaining = Math.max(
    0,
    policy.activeResearchedCompanyLimit +
      creditBalance.activeCreditCompanies -
      activeCompanies,
  );
  const effectiveLimit =
    policy.activeResearchedCompanyLimit + creditBalance.activeCreditCompanies;

  const isComped =
    planCode === BILLING_PLAN_COMPED ||
    planCode === "FREE" ||
    (billingStatus === "FREE" && !billing?.stripeCustomerId);

  const hasLiveSubscription =
    Boolean(billing?.stripeSubscriptionId) &&
    (billingStatus === "ACTIVE" ||
      billingStatus === "TRIALING" ||
      billingStatus === "PAST_DUE");

  const canOpenPortal = Boolean(billing?.stripeCustomerId);
  const showPortal =
    canOpenPortal && (hasLiveSubscription || paymentLocked || spendBlocked);
  const showResubscribe =
    paymentLocked && isOwner && !hasLiveSubscription && !isComped;

  const creditsDisabledReason = !isOwner
    ? "Only the organization owner can buy credits."
    : !effectiveCreditsAreCheckoutReady(prices)
      ? "Company credit packs are not configured yet."
      : !hasLiveSubscription
        ? "Subscribe before buying extra company capacity."
        : null;

  const discountActive = billing
    ? hasActiveDiscount({
        stripeDiscountPercentOff: billing.stripeDiscountPercentOff,
        stripeDiscountAmountOffCents: billing.stripeDiscountAmountOffCents,
        stripeEffectiveUnitAmountCents: billing.stripeEffectiveUnitAmountCents,
        stripePriceUnitAmountCents: billing.stripePriceUnitAmountCents,
      })
    : false;

  // Trial end date comes from the Stripe-synced billing profile — never from
  // BILLING_TRIAL_PERIOD_DAYS (env only affects NEW Checkout sessions).
  const trialSummary =
    billingStatus === "TRIALING"
      ? formatTrialEndsSummary({ trialEndsAt: billing?.trialEndsAt })
      : null;

  const showNextBilling =
    (billingStatus === "ACTIVE" || billingStatus === "PAST_DUE") &&
    Boolean(billing?.currentPeriodEnd);

  // Trial allowance = what this org actually has stored.
  const trialAllowance = policy.activeResearchedCompanyLimit;

  // Paid company capacity after early convert (catalog floors, else plans.ts).
  const paidEntitlements = resolveCatalogEntitlementsForStatus({
    catalog: catalogEffective.catalog,
    planCode,
    billingStatus: "ACTIVE",
  });
  const trialEntitlements = resolveCatalogEntitlementsForStatus({
    catalog: catalogEffective.catalog,
    planCode,
    billingStatus: "TRIALING",
  });
  const planDef = getPlanDefinition(planCode);
  const companiesPerSeat =
    paidEntitlements?.companiesPerSeat ??
    planDef?.seats.companiesPerSeat ??
    null;
  const trialCompaniesPerSeat =
    trialEntitlements?.companiesPerSeat ??
    planDef?.seats.companiesPerSeat ??
    null;
  const paidCompanyFloor =
    paidEntitlements?.activeResearchedCompanyLimit ??
    planDef?.entitlements.activeResearchedCompanyLimit ??
    null;
  const trialCompanyFloor =
    trialEntitlements?.activeResearchedCompanyLimit ??
    planDef?.trialEntitlements?.activeResearchedCompanyLimit ??
    null;
  const seatQty = Math.max(1, billing?.seatQuantity ?? 1);
  const paidCompanyCapacityLabel = planUsesSeatBilling(planCode)
    ? companiesPerSeat != null
      ? `${companiesPerSeat * seatQty} companies`
      : null
    : paidCompanyFloor != null
      ? `${paidCompanyFloor} companies`
      : null;
  // Team trial/paid are both 150/seat — converting only starts billing.
  const capacityIncreasesOnConvert = planUsesSeatBilling(planCode)
    ? companiesPerSeat != null &&
      trialCompaniesPerSeat != null &&
      companiesPerSeat > trialCompaniesPerSeat
    : paidCompanyFloor != null &&
      trialCompanyFloor != null &&
      paidCompanyFloor > trialCompanyFloor;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <BillingCheckoutRefresh checkoutState={checkoutState} />
      <div>
        {paymentLocked ? null : (
          <Link
            href="/settings"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Settings
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Billing
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Plan and status for{" "}
          <span className="font-medium text-slate-900">{organization.name}</span>
          . Signed in as {user.email}.
        </p>
      </div>

      {spendBlocked && lockState.profile ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="billing-payment-lock-banner"
        >
          <p className="font-medium">
            {paymentLockUserMessage(lockState.profile)}
          </p>
          {billingStatus === "CANCELED" ? (
            <>
              <p>
                For 30 days from cancellation
                {billing?.canceledAt
                  ? ` (${formatBillingDate(billing.canceledAt)})`
                  : ""}
                , we keep your {vocab.contact.plural}, {vocab.campaign.plural}, research,
                drafts, send history, and{" "}
                <span className="font-medium">opt-out / suppression list</span>.
                Resubscribe in that window and all of it unlocks with this
                workspace.
              </p>
              <p>
                After 30 days we permanently delete that {vocab.contact.singular} and{" "}
                {vocab.outreach.singular} data — including suppressions. Your account,{" "}
                {vocab.product.plural}, {vocab.icp.plural}, {vocab.persona.plural}, voice,
                signature, billing, and credit packs stay so you can return and rebuild{" "}
                {vocab.campaign.plural}.
              </p>
            </>
          ) : billingStatus === "PAST_DUE" && !paymentLocked ? (
            <p>
              You can still open {vocab.campaign.plural}, {vocab.contact.plural}, and setup pages to view
              your work, but the workspace is read-only — no setup changes,
              research, email generation, or sending until payment succeeds.
              Stripe may retry the charge automatically; you can also update your
              card in the billing portal.
              {billing?.gracePeriodEndsAt
                ? ` If payment is still unpaid after ${formatBillingDate(billing.gracePeriodEndsAt)}, access narrows to this billing page only.`
                : ""}
            </p>
          ) : (
            <p>
              Your {vocab.product.plural}, {vocab.icp.plural}, {vocab.persona.plural}, and account stay on this workspace.
              Resubscribe or update payment to unlock the {vocab.product.singular} again.
            </p>
          )}
          {!isAdmin ? (
            <p>
              Ask an organization admin to update billing — members cannot start
              Checkout.
            </p>
          ) : null}
        </div>
      ) : null}

      {checkoutState === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Checkout completed. Refreshing subscription status from Stripe…
        </p>
      ) : null}

      {creditsState === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Credit purchase completed. Capacity updates when Stripe confirms
          (usually a few seconds) — refresh if the balance has not changed.
        </p>
      ) : null}

      <section
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        data-testid="billing-stripe-hook"
      >
        <h2 className="text-lg font-medium text-slate-900">Current plan</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Plan
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billingPlanLabel(planCode)}
            </dd>
            <p className="mt-1 text-sm text-slate-600">
              {billingPlanDescription({
                planCode,
                billingStatus,
                activeResearchedCompanyLimit:
                  policy.activeResearchedCompanyLimit,
                dailyEmailSendWarningLimit: policy.dailyEmailSendWarningLimit,
                monthlyEmailSendLimit: policy.monthlyEmailSendLimit,
                seatQuantity: billing?.seatQuantity,
                maxSeats: billing?.maxSeats,
                usedSeats: memberCount,
                companiesPerSeat: planUsesSeatBilling(planCode)
                  ? policy.activeResearchedCompanyLimit
                  : null,
              })}
            </p>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billingStatusLabel(billingStatus)}
            </dd>
          </div>
          {trialSummary ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Trial
              </dt>
              <dd className="mt-1 font-medium text-slate-900">{trialSummary}</dd>
            </div>
          ) : null}
          {showNextBilling ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Next billing date
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {formatBillingDate(billing?.currentPeriodEnd)}
                {billing?.cancelAtPeriodEnd
                  ? " · cancels at period end"
                  : ""}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Billing {vocab.contact.singular}
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {billing?.billingEmail ?? "—"}
            </dd>
          </div>
          {billing?.stripePriceId ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Amount
              </dt>
              <dd className="mt-1 space-y-1 font-medium text-slate-900">
                {(() => {
                  const unit =
                    billing.stripeEffectiveUnitAmountCents ??
                    billing.stripePriceUnitAmountCents;
                  const seats = Math.max(1, billing.seatQuantity ?? 1);
                  const currency = billing.stripePriceCurrency;
                  const interval = formatPriceInterval(
                    billing.stripePriceInterval,
                  );
                  if (unit == null) return <span>—</span>;
                  if (planUsesSeatBilling(planCode)) {
                    return (
                      <>
                        <p>
                          {seats} seats × {formatStripeMoney(unit, currency)} /{" "}
                          {interval} per seat
                        </p>
                        <p className="text-lg font-semibold text-slate-900">
                          Total {formatStripeMoney(unit * seats, currency)} /{" "}
                          {interval}
                        </p>
                      </>
                    );
                  }
                  return (
                    <p>
                      {formatStripeMoney(unit, currency)} / {interval}
                    </p>
                  );
                })()}
              </dd>
            </div>
          ) : null}
          {discountActive && billing ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Discount
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {formatDiscountSummary({
                  percentOff: billing.stripeDiscountPercentOff,
                  amountOffCents: billing.stripeDiscountAmountOffCents,
                  currency: billing.stripePriceCurrency,
                  couponId: billing.stripeCouponId,
                })}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="text-sm text-slate-600">
          {isComped
            ? "This account is comped — no payment required. Card details stay in Stripe if you subscribe later."
            : "Card details stay in Stripe — never stored in this app."}
        </p>

        {showResubscribe ? <ResubscribeCheckoutButton /> : null}

        {showPortal && isOwner ? <OpenCustomerPortalButton /> : null}
        {showPortal && !isOwner ? (
          <p className="text-sm text-slate-600">
            Only the organization owner can open Stripe to update the card or
            manage the subscription.
          </p>
        ) : null}

        {canConvertTrialEarly && isOwner ? (
          <div
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
            data-testid="billing-convert-trial"
          >
            <p className="mb-2 text-sm text-slate-700">
              {capacityIncreasesOnConvert ? (
                <>
                  Need Full Company Research capacity before{" "}
                  {trialSummary ?? "trial end"}? Convert now and get FULL ACCESS
                  — we charge your card today and start the{" "}
                  {billingPlanLabel(planCode)} billing cycle immediately
                  {paidCompanyCapacityLabel
                    ? ` (${paidCompanyCapacityLabel})`
                    : ""}
                  .
                </>
              ) : (
                <>
                  Want to end your trial before {trialSummary ?? "trial end"}?
                  Convert now — we charge your card today and start the{" "}
                  {billingPlanLabel(planCode)} billing cycle. Company research
                  capacity stays the same
                  {planUsesSeatBilling(planCode) && companiesPerSeat != null
                    ? ` (${companiesPerSeat} per seat)`
                    : paidCompanyFloor != null
                      ? ` (${paidCompanyFloor} companies)`
                      : ""}
                  .
                </>
              )}
            </p>
            <ConvertTrialNowButton
              planLabel={billingPlanLabel(planCode)}
              paidCompanyCapacityLabel={
                capacityIncreasesOnConvert ? paidCompanyCapacityLabel : null
              }
              capacityIncreasesOnConvert={capacityIncreasesOnConvert}
            />
          </div>
        ) : null}

        {isComped && !hasLiveSubscription && isOwner && !invoiceManaged ? (
          <p className="text-sm text-slate-600">
            <Link
              href={ONBOARDING_SUBSCRIBE_PATH}
              className="font-medium text-slate-900 underline"
            >
              Subscribe to Standard
            </Link>{" "}
            if you want to move this account onto a paid plan.
          </p>
        ) : null}
      </section>

      {!paymentLocked &&
      features.teamSeats &&
      planUsesSeatBilling(planCode) &&
      hasLiveSubscription ? (
        <section
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
          data-testid="billing-seats-section"
        >
          <h2 className="text-lg font-medium text-slate-900">Seats</h2>
          <SeatManagementPanel
            canManage={isOwner}
            canAdd={
              buildSeatSnapshot({
                planCode,
                seatQuantity: billing?.seatQuantity ?? 1,
                maxSeats:
                  billing?.maxSeats ??
                  defaultMaxSeatsForPlan(planCode),
                usedSeats: memberCount,
              }).canAddSeatSelfServe
            }
            canRemove={(billing?.seatQuantity ?? 1) > memberCount &&
              (billing?.seatQuantity ?? 1) >
                (getPlanDefinition(planCode)?.seats.seatMin ?? 2)}
            seatLabel={`${memberCount} of ${billing?.seatQuantity ?? 1} seats used`}
            addDisabledReason={
              (billing?.seatQuantity ?? 1) >=
              (billing?.maxSeats ?? defaultMaxSeatsForPlan(planCode))
                ? "Seat cap reached."
                : null
            }
            removeDisabledReason={
              (billing?.seatQuantity ?? 1) <= memberCount
                ? "Remove members before reducing seats."
                : null
            }
          />
        </section>
      ) : null}

      {paymentLocked ||
      !features.referralProgram ||
      !planAllowsReferrals(billing?.planCode)
        ? null
        : (
            <ReferralProgramPanel />
          )}

      {paymentLocked ? null : (
      <section
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        data-testid="billing-research-capacity"
      >
        <h2 className="text-lg font-medium text-slate-900">
          Company research capacity
        </h2>
        <p className="text-sm text-slate-600">
          {activeCompanies} of {effectiveLimit} active researched companies used
          {remaining > 0
            ? ` — ${remaining} remaining.`
            : " — allowance used."}
          {creditBalance.activeCreditCompanies > 0
            ? ` Includes ${creditBalance.activeCreditCompanies} purchased credit companies` +
              (creditBalance.nextExpiresAt
                ? ` (next expiry ${formatBillingDate(creditBalance.nextExpiresAt)})`
                : "") +
              "."
            : ""}
        </p>
        {billingStatus === "TRIALING" && trialAllowance != null ? (
          <p className="text-sm text-slate-600">
            Trial allowance is {trialAllowance} companies
            {planUsesSeatBilling(planCode) ? " per user" : ""}
            {capacityIncreasesOnConvert && paidCompanyCapacityLabel
              ? `; paid ${billingPlanLabel(planCode)} is ${paidCompanyCapacityLabel}`
              : !capacityIncreasesOnConvert
                ? `; paid ${billingPlanLabel(planCode)} keeps the same company research floor`
                : ""}
            .
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            One slot per distinct company with fresh research. Refreshing a
            company you already researched does not use another slot. Plan base
            is {policy.activeResearchedCompanyLimit}; credit packs stack on top
            for 12 months
            {perUserCredits
              ? " and apply to your personal researched-company allowance"
              : ""}
            .
          </p>
        )}
        <BuyCompanyCreditsButton disabledReason={creditsDisabledReason} />
      </section>
      )}
    </div>
  );
}
