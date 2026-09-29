/**
 * Stripe webhook dispatcher — run sync / grants, then claim event id.
 * Never persist the raw event payload.
 *
 * Claim-after-success: failures leave the event unclaimed so Stripe retries
 * re-apply. Successful retries hit isStripeWebhookEventClaimed and no-op.
 * Side effects are idempotent (billing upsert, credit unique keys, referrals).
 */
import "server-only";

import type Stripe from "stripe";
import { grantCreditsFromCheckoutSession } from "@/lib/billing/grant-credits-from-checkout";
import {
  attributeReferralFromCheckoutSession,
  countReferralIfActive,
} from "@/lib/billing/referrals";
import {
  claimStripeWebhookEvent,
  isStripeWebhookEventClaimed,
} from "@/lib/billing/stripe-webhook-idempotency";
import { revalidateBillingUi } from "@/lib/billing/revalidate-billing-ui";
import {
  findOrganizationIdForSubscription,
  markSubscriptionCanceled,
  syncSubscriptionById,
} from "@/lib/billing/sync-subscription";

/** Stripe Invoice → subscription id (API shape moved under parent.subscription_details). */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const sub = details.subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  return null;
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
): Promise<{ duplicate: boolean; handled: boolean }> {
  if (await isStripeWebhookEventClaimed(event.id)) {
    return { duplicate: true, handled: true };
  }

  let synced = false;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) break;
        const result = await syncSubscriptionById({
          subscriptionId,
          organizationId: session.metadata?.organizationId ?? null,
          checkoutSession: session,
        });
        synced = Boolean(result);
        if (result) {
          await attributeReferralFromCheckoutSession({
            session,
            refereeOrganizationId: result.organizationId,
            subscriptionId,
          });
          await countReferralIfActive({
            refereeOrganizationId: result.organizationId,
            subscriptionId,
            billingStatus: result.billingStatus,
          });
        }
        break;
      }
      if (session.mode === "payment") {
        const result = await grantCreditsFromCheckoutSession(session);
        synced = result.ok;
        break;
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const result = await syncSubscriptionById({
        subscriptionId: subscription.id,
        organizationId: subscription.metadata?.organizationId ?? null,
      });
      synced = Boolean(result);
      if (result) {
        await countReferralIfActive({
          refereeOrganizationId: result.organizationId,
          subscriptionId: subscription.id,
          billingStatus: result.billingStatus,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      // Explicit cancel — do not run the general upsert sync (that can re-apply
      // planCode / price mirrors from a canceled subscription's line item).
      const subscription = event.data.object as Stripe.Subscription;
      const organizationId = await findOrganizationIdForSubscription({
        subscription,
      });
      if (organizationId) {
        await markSubscriptionCanceled({
          organizationId,
          subscriptionId: subscription.id,
          canceledAt: subscription.canceled_at,
        });
        synced = true;
      }
      break;
    }
    case "invoice.payment_failed": {
      // Renewal failure: sync subscription so period-end unpaid → read-only (B3).
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (subscriptionId) {
        const result = await syncSubscriptionById({ subscriptionId });
        synced = Boolean(result);
      }
      break;
    }
    case "invoice.paid": {
      // Successful payment / renewal — clear read-only when subscription is entitled.
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (subscriptionId) {
        const result = await syncSubscriptionById({ subscriptionId });
        synced = Boolean(result);
      }
      break;
    }
    default:
      break;
  }

  // Claim only after side effects succeed (or intentional no-op for unknown types).
  // If anything above threw, we never reach here — Stripe retries with event unclaimed.
  await claimStripeWebhookEvent({
    stripeEventId: event.id,
    type: event.type,
  });

  if (synced) {
    revalidateBillingUi();
  }

  return { duplicate: false, handled: true };
}
