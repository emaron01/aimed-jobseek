/**
 * Sync OrganizationBillingProfile from a Stripe Subscription.
 * Mirrors the subscription's Price + discounts (not the env catalog price).
 */
import "server-only";

import type Stripe from "stripe";
import { applyPlanEntitlements } from "@/lib/billing/apply-plan-entitlements";
import { nextPaymentLockFields } from "@/lib/billing/payment-lock";
import {
  buildMirroredPriceDiscount,
  type MirroredCoupon,
} from "@/lib/billing/price-discount-mirror";
import {
  mapStripeSubscriptionStatus,
  resolvePlanCodeFromStripeIds,
} from "@/lib/billing/stripe-plan-mapping";
import { getStripe } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

export {
  mapStripeSubscriptionStatus,
  resolvePlanCodeFromStripeIds,
} from "@/lib/billing/stripe-plan-mapping";

function unixToDate(seconds: number | null | undefined): Date | null {
  if (seconds == null) return null;
  return new Date(seconds * 1000);
}

function extractCouponsFromSubscription(
  subscription: Stripe.Subscription,
): MirroredCoupon[] {
  const coupons: MirroredCoupon[] = [];
  for (const entry of subscription.discounts ?? []) {
    if (typeof entry === "string") continue;
    const raw = entry.source?.coupon;
    if (!raw || typeof raw === "string") continue;
    coupons.push({
      id: raw.id,
      percentOff: raw.percent_off,
      amountOffCents: raw.amount_off,
    });
  }
  return coupons;
}

function extractPrimaryItem(subscription: Stripe.Subscription): {
  priceId: string | null;
  productId: string | null;
  unitAmountCents: number | null;
  currency: string | null;
  interval: string | null;
  currentPeriodEnd: Date | null;
  quantity: number;
} {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const productRaw = price?.product;
  const productId =
    typeof productRaw === "string"
      ? productRaw
      : productRaw && !productRaw.deleted
        ? productRaw.id
        : null;

  return {
    priceId: price?.id ?? null,
    productId,
    unitAmountCents: price?.unit_amount ?? null,
    currency: price?.currency ?? subscription.currency ?? null,
    interval: price?.recurring?.interval ?? null,
    currentPeriodEnd: unixToDate(item?.current_period_end),
    quantity: item?.quantity ?? 1,
  };
}

export async function retrieveSubscriptionExpanded(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["discounts.source.coupon", "items.data.price.product"],
  });
}

export async function findOrganizationIdForSubscription(input: {
  subscription: Stripe.Subscription;
  checkoutSession?: Stripe.Checkout.Session | null;
}): Promise<string | null> {
  const fromMeta =
    input.subscription.metadata?.organizationId?.trim() ||
    input.checkoutSession?.metadata?.organizationId?.trim() ||
    null;
  if (fromMeta) {
    // Metadata can outlive a Super Admin hard-delete — never return a dead org id.
    const stillExists = await prisma.organization.findUnique({
      where: { id: fromMeta },
      select: { id: true },
    });
    if (stillExists) return fromMeta;
  }

  const customerId =
    typeof input.subscription.customer === "string"
      ? input.subscription.customer
      : input.subscription.customer?.id;

  if (customerId) {
    const byCustomer = await prisma.organizationBillingProfile.findFirst({
      where: { stripeCustomerId: customerId },
      select: { organizationId: true },
    });
    if (byCustomer) return byCustomer.organizationId;
  }

  const bySub = await prisma.organizationBillingProfile.findFirst({
    where: { stripeSubscriptionId: input.subscription.id },
    select: { organizationId: true },
  });
  return bySub?.organizationId ?? null;
}

export async function syncOrganizationFromStripeSubscription(input: {
  organizationId: string;
  subscription: Stripe.Subscription;
}): Promise<void> {
  const { organizationId, subscription } = input;
  const item = extractPrimaryItem(subscription);
  const coupons = extractCouponsFromSubscription(subscription);
  const mirror = buildMirroredPriceDiscount({
    priceId: item.priceId,
    productId: item.productId,
    unitAmountCents: item.unitAmountCents,
    currency: item.currency,
    interval: item.interval,
    coupons,
  });

  const billingStatus = mapStripeSubscriptionStatus(subscription.status);
  const { loadFlattenedBillingPrices } = await import(
    "@/lib/billing/effective-prices"
  );
  const {
    BILLING_PLAN_STANDARD,
    BILLING_PLAN_TEAM,
    BILLING_PLAN_ENTERPRISE,
  } = await import("@/lib/billing/plans");
  const { defaultMaxSeatsForPlan } = await import("@/lib/org/seat-limits");
  const prices = await loadFlattenedBillingPrices();
  const additionalPriceIds: Array<{ planCode: string; priceId: string }> = [];
  const additionalProductIds: Array<{ planCode: string; productId: string }> =
    [];
  if (prices.standardMonthlyPriceId) {
    additionalPriceIds.push({
      planCode: BILLING_PLAN_STANDARD,
      priceId: prices.standardMonthlyPriceId,
    });
  }
  if (prices.standardProductId) {
    additionalProductIds.push({
      planCode: BILLING_PLAN_STANDARD,
      productId: prices.standardProductId,
    });
  }
  if (prices.teamMonthlyPriceId) {
    additionalPriceIds.push({
      planCode: BILLING_PLAN_TEAM,
      priceId: prices.teamMonthlyPriceId,
    });
  }
  if (prices.teamProductId) {
    additionalProductIds.push({
      planCode: BILLING_PLAN_TEAM,
      productId: prices.teamProductId,
    });
  }
  if (prices.enterpriseMonthlyPriceId) {
    additionalPriceIds.push({
      planCode: BILLING_PLAN_ENTERPRISE,
      priceId: prices.enterpriseMonthlyPriceId,
    });
  }
  if (prices.enterpriseProductId) {
    additionalProductIds.push({
      planCode: BILLING_PLAN_ENTERPRISE,
      productId: prices.enterpriseProductId,
    });
  }
  const planCode = resolvePlanCodeFromStripeIds({
    priceId: item.priceId,
    productId: item.productId,
    additional: {
      priceIds: additionalPriceIds,
      productIds: additionalProductIds,
    },
  });

  const metaSeats = Number.parseInt(
    subscription.metadata?.seatQuantity ?? "",
    10,
  );
  const seatQuantity = Number.isInteger(metaSeats) && metaSeats > 0
    ? metaSeats
    : Math.max(1, item.quantity);

  const previous = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
    select: {
      billingStatus: true,
      lockReason: true,
      gracePeriodEndsAt: true,
      canceledAt: true,
      maxSeats: true,
      readOnlyStartedAt: true,
      planCode: true,
    },
  });
  const defaultMax = defaultMaxSeatsForPlan(planCode);
  const maxSeats = Math.max(
    previous?.maxSeats ?? defaultMax,
    seatQuantity,
    defaultMax,
  );

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const lockFields = nextPaymentLockFields({
    previous,
    billingStatus,
  });

  const resubscribeAfterCancel =
    previous?.billingStatus === "CANCELED" &&
    (billingStatus === "ACTIVE" || billingStatus === "TRIALING") &&
    previous.canceledAt != null;

  const entitled =
    billingStatus === "ACTIVE" ||
    billingStatus === "TRIALING" ||
    // Mid-period past_due: still entitled until period end (B3 decision 1/7).
    (billingStatus === "PAST_DUE" &&
      item.currentPeriodEnd != null &&
      item.currentPeriodEnd.getTime() > Date.now());

  await prisma.organizationBillingProfile.upsert({
    where: { organizationId },
    create: {
      organizationId,
      planCode,
      billingStatus,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: mirror.stripePriceId,
      stripeProductId: mirror.stripeProductId,
      stripePriceUnitAmountCents: mirror.stripePriceUnitAmountCents,
      stripePriceCurrency: mirror.stripePriceCurrency,
      stripePriceInterval: mirror.stripePriceInterval,
      stripeDiscountPercentOff: mirror.stripeDiscountPercentOff,
      stripeDiscountAmountOffCents: mirror.stripeDiscountAmountOffCents,
      stripeCouponId: mirror.stripeCouponId,
      stripeEffectiveUnitAmountCents: mirror.stripeEffectiveUnitAmountCents,
      seatQuantity,
      maxSeats,
      currentPeriodEnd: item.currentPeriodEnd,
      trialEndsAt: unixToDate(subscription.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: unixToDate(subscription.canceled_at),
      lockReason: lockFields.lockReason,
      gracePeriodEndsAt: lockFields.gracePeriodEndsAt,
      readOnlyStartedAt: null,
    },
    update: {
      planCode,
      billingStatus,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: mirror.stripePriceId,
      stripeProductId: mirror.stripeProductId,
      stripePriceUnitAmountCents: mirror.stripePriceUnitAmountCents,
      stripePriceCurrency: mirror.stripePriceCurrency,
      stripePriceInterval: mirror.stripePriceInterval,
      stripeDiscountPercentOff: mirror.stripeDiscountPercentOff,
      stripeDiscountAmountOffCents: mirror.stripeDiscountAmountOffCents,
      stripeCouponId: mirror.stripeCouponId,
      stripeEffectiveUnitAmountCents: mirror.stripeEffectiveUnitAmountCents,
      seatQuantity,
      // Never lower a SUPER_ADMIN-raised Enterprise cap on sync.
      maxSeats: Math.max(maxSeats, previous?.maxSeats ?? 0),
      currentPeriodEnd: item.currentPeriodEnd,
      trialEndsAt: unixToDate(subscription.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: unixToDate(subscription.canceled_at),
      lockReason: lockFields.lockReason,
      gracePeriodEndsAt: lockFields.gracePeriodEndsAt,
    },
  });

  if (entitled) {
    const { clearOrganizationReadOnly } = await import(
      "@/lib/billing/enter-read-only"
    );
    await clearOrganizationReadOnly({ organizationId });
  } else if (
    billingStatus === "CANCELED" ||
    (billingStatus === "PAST_DUE" &&
      item.currentPeriodEnd != null &&
      item.currentPeriodEnd.getTime() <= Date.now()) ||
    (billingStatus === "UNPAID" && Boolean(subscription.id))
  ) {
    const { enterOrganizationReadOnly } = await import(
      "@/lib/billing/enter-read-only"
    );
    await enterOrganizationReadOnly({
      organizationId,
      billingStatus:
        billingStatus === "PAST_DUE"
          ? "PAST_DUE"
          : billingStatus === "UNPAID"
            ? "UNPAID"
            : "CANCELED",
      canceledAt: unixToDate(subscription.canceled_at),
    });
  }

  if (resubscribeAfterCancel && previous.canceledAt) {
    const { extendCompanyResearchCreditsAfterCancelLapse } = await import(
      "@/lib/billing/company-research-credits"
    );
    await extendCompanyResearchCreditsAfterCancelLapse({
      organizationId,
      canceledAt: previous.canceledAt,
    });
  }

  if (
    billingStatus === "TRIALING" ||
    billingStatus === "ACTIVE" ||
    billingStatus === "PAST_DUE"
  ) {
    await applyPlanEntitlements({
      organizationId,
      planCode,
      billingStatus,
    });
  }
}

export async function syncSubscriptionById(input: {
  subscriptionId: string;
  organizationId?: string | null;
  checkoutSession?: Stripe.Checkout.Session | null;
}): Promise<{ organizationId: string; billingStatus: string } | null> {
  const subscription = await retrieveSubscriptionExpanded(input.subscriptionId);

  let organizationId = input.organizationId?.trim() || null;
  if (organizationId) {
    const orgStillThere = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!orgStillThere) {
      // Stale Checkout/subscription metadata after Super Admin hard-delete.
      organizationId = null;
    }
  }
  if (!organizationId) {
    organizationId = await findOrganizationIdForSubscription({
      subscription,
      checkoutSession: input.checkoutSession,
    });
  }
  if (!organizationId) return null;

  await syncOrganizationFromStripeSubscription({
    organizationId,
    subscription,
  });
  return {
    organizationId,
    billingStatus: mapStripeSubscriptionStatus(subscription.status),
  };
}

/** Mark local billing canceled and enter read-only (period ended / subscription deleted). */
export async function markSubscriptionCanceled(input: {
  organizationId: string;
  subscriptionId: string;
  /** Stripe subscription.canceled_at (unix seconds or Date). Prefer over webhook wall clock. */
  canceledAt?: Date | number | null;
}): Promise<void> {
  const profile = await prisma.organizationBillingProfile.findFirst({
    where: {
      organizationId: input.organizationId,
      stripeSubscriptionId: input.subscriptionId,
    },
  });
  if (!profile) return;

  const canceledAt =
    input.canceledAt instanceof Date
      ? input.canceledAt
      : typeof input.canceledAt === "number"
        ? unixToDate(input.canceledAt)
        : null;

  const { enterOrganizationReadOnly } = await import(
    "@/lib/billing/enter-read-only"
  );
  await enterOrganizationReadOnly({
    organizationId: input.organizationId,
    billingStatus: "CANCELED",
    canceledAt: canceledAt ?? new Date(),
  });
}
