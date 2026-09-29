import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeState = vi.hoisted(() => ({
  retrieve: vi.fn(),
  cancel: vi.fn(),
  configured: true,
}));

vi.mock("@/lib/billing/stripe", () => ({
  stripeConfigured: () => stripeState.configured,
  getStripe: () => ({
    subscriptions: {
      retrieve: stripeState.retrieve,
      cancel: stripeState.cancel,
    },
  }),
}));

import { cancelStripeSubscriptionForOrgDelete } from "@/lib/billing/cancel-stripe-for-org-delete";

describe("cancelStripeSubscriptionForOrgDelete", () => {
  beforeEach(() => {
    stripeState.configured = true;
    stripeState.retrieve.mockReset();
    stripeState.cancel.mockReset();
  });

  it("skips when no subscription id", async () => {
    await expect(cancelStripeSubscriptionForOrgDelete(null)).resolves.toEqual({
      skipped: true,
      canceled: false,
      alreadyCanceled: false,
      subscriptionId: null,
    });
    expect(stripeState.retrieve).not.toHaveBeenCalled();
  });

  it("refuses when Stripe is not configured and a subscription id exists", async () => {
    stripeState.configured = false;
    await expect(
      cancelStripeSubscriptionForOrgDelete("sub_123"),
    ).rejects.toThrow(/STRIPE_SECRET_KEY is not configured/);
    expect(stripeState.retrieve).not.toHaveBeenCalled();
  });

  it("still skips when there is no subscription id even if Stripe is off", async () => {
    stripeState.configured = false;
    await expect(cancelStripeSubscriptionForOrgDelete(null)).resolves.toEqual({
      skipped: true,
      canceled: false,
      alreadyCanceled: false,
      subscriptionId: null,
    });
  });

  it("treats already-canceled as success without cancel call", async () => {
    stripeState.retrieve.mockResolvedValue({ status: "canceled" });
    await expect(
      cancelStripeSubscriptionForOrgDelete("sub_123"),
    ).resolves.toEqual({
      skipped: false,
      canceled: false,
      alreadyCanceled: true,
      subscriptionId: "sub_123",
    });
    expect(stripeState.cancel).not.toHaveBeenCalled();
  });

  it("cancels an active subscription", async () => {
    stripeState.retrieve.mockResolvedValue({ status: "active" });
    stripeState.cancel.mockResolvedValue({ status: "canceled" });
    await expect(
      cancelStripeSubscriptionForOrgDelete("sub_123"),
    ).resolves.toEqual({
      skipped: false,
      canceled: true,
      alreadyCanceled: false,
      subscriptionId: "sub_123",
    });
    expect(stripeState.cancel).toHaveBeenCalledWith("sub_123");
  });

  it("treats resource_missing as already canceled", async () => {
    stripeState.retrieve.mockRejectedValue({ code: "resource_missing" });
    await expect(
      cancelStripeSubscriptionForOrgDelete("sub_gone"),
    ).resolves.toEqual({
      skipped: false,
      canceled: false,
      alreadyCanceled: true,
      subscriptionId: "sub_gone",
    });
  });
});
