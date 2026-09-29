/**
 * Schedule Stripe cancel-at-period-end for seeker self-serve cancel (B3).
 * Immediate cancel remains in cancelStripeSubscriptionForOrgDelete (wipe / Comped).
 */
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma-client";

/**
 * Mirror cancel-at-period-end locally (tests / pre-Stripe sync paths).
 * Does not call Stripe. Keeps full access until period end.
 */
export async function mirrorCancelAtPeriodEndLocally(input: {
  organizationId: string;
  currentPeriodEnd: Date;
}): Promise<void> {
  await prisma.organizationBillingProfile.update({
    where: { organizationId: input.organizationId },
    data: {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: input.currentPeriodEnd,
      readOnlyStartedAt: null,
      lockReason: null,
      gracePeriodEndsAt: null,
    },
  });
}

/**
 * Ask Stripe to cancel at period end; mirror cancelAtPeriodEnd locally.
 * Keeps ACTIVE/TRIALING — seeker retains full access until period end.
 */
export async function scheduleSubscriptionCancelAtPeriodEnd(input: {
  organizationId: string;
  stripeSubscriptionId: string;
}): Promise<{
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}> {
  if (!stripeConfigured()) {
    throw new Error(
      "Cannot schedule cancellation: STRIPE_SECRET_KEY is not configured.",
    );
  }

  const stripe = getStripe();
  const updated = await stripe.subscriptions.update(input.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  const periodEndUnix =
    (
      updated as {
        current_period_end?: number;
      }
    ).current_period_end ?? null;
  const currentPeriodEnd =
    typeof periodEndUnix === "number"
      ? new Date(periodEndUnix * 1000)
      : null;

  const existing = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: { currentPeriodEnd: true },
  });
  const periodEnd = currentPeriodEnd ?? existing?.currentPeriodEnd;
  if (!periodEnd) {
    throw new Error(
      "Cannot schedule cancellation: subscription has no current period end.",
    );
  }

  await mirrorCancelAtPeriodEndLocally({
    organizationId: input.organizationId,
    currentPeriodEnd: periodEnd,
  });

  return {
    cancelAtPeriodEnd: true,
    currentPeriodEnd: periodEnd,
  };
}
