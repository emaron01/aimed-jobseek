/**
 * Cancel Stripe subscription before local org wipe / hard-delete.
 * Shared by Super Admin wipe, seeker cancel, and COMPED conversion.
 */
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";

/**
 * Failsafe: cancel Stripe subscription before org hard-delete / wipe.
 * Already-canceled / missing subscriptions are treated as success.
 * No subscription id → skip (Comped / never billed).
 * Stripe not configured while a subscription id exists → refuse (do not
 * delete locally while Stripe may keep billing).
 */
export async function cancelStripeSubscriptionForOrgDelete(
  stripeSubscriptionId: string | null | undefined,
): Promise<{
  skipped: boolean;
  canceled: boolean;
  alreadyCanceled: boolean;
  subscriptionId: string | null;
}> {
  if (!stripeSubscriptionId) {
    return {
      skipped: true,
      canceled: false,
      alreadyCanceled: false,
      subscriptionId: null,
    };
  }
  if (!stripeConfigured()) {
    throw new Error(
      "Cannot delete this organization: a Stripe subscription is linked but STRIPE_SECRET_KEY is not configured. Configure Stripe (or cancel the subscription in the Stripe Dashboard) before deleting.",
    );
  }

  const stripe = getStripe();
  try {
    const existing = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (existing.status === "canceled") {
      return {
        skipped: false,
        canceled: false,
        alreadyCanceled: true,
        subscriptionId: stripeSubscriptionId,
      };
    }
    await stripe.subscriptions.cancel(stripeSubscriptionId);
    return {
      skipped: false,
      canceled: true,
      alreadyCanceled: false,
      subscriptionId: stripeSubscriptionId,
    };
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "";
    // Already gone in Stripe — safe to proceed with local delete.
    if (code === "resource_missing") {
      return {
        skipped: false,
        canceled: false,
        alreadyCanceled: true,
        subscriptionId: stripeSubscriptionId,
      };
    }
    throw error;
  }
}
