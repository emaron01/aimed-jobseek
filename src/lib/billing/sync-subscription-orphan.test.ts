import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  orgFindUnique: vi.fn(),
  billingFindFirst: vi.fn(),
  retrieve: vi.fn(),
  syncUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: state.orgFindUnique },
    organizationBillingProfile: {
      findFirst: state.billingFindFirst,
      findUnique: vi.fn(),
      upsert: state.syncUpsert,
    },
  },
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: state.retrieve },
  }),
}));

vi.mock("@/lib/billing/apply-plan-entitlements", () => ({
  applyPlanEntitlements: vi.fn(),
}));

vi.mock("@/lib/billing/effective-prices", () => ({
  loadFlattenedBillingPrices: async () => ({}),
}));

import {
  findOrganizationIdForSubscription,
  syncSubscriptionById,
} from "@/lib/billing/sync-subscription";

describe("stripe sync after org hard-delete", () => {
  beforeEach(() => {
    state.orgFindUnique.mockReset();
    state.billingFindFirst.mockReset();
    state.retrieve.mockReset();
    state.syncUpsert.mockReset();
  });

  it("ignores stale metadata organizationId when the org is gone", async () => {
    state.orgFindUnique.mockResolvedValue(null);
    state.billingFindFirst.mockResolvedValue(null);

    const id = await findOrganizationIdForSubscription({
      subscription: {
        id: "sub_1",
        metadata: { organizationId: "org_deleted" },
        customer: "cus_1",
      } as never,
    });
    expect(id).toBeNull();
    expect(state.orgFindUnique).toHaveBeenCalledWith({
      where: { id: "org_deleted" },
      select: { id: true },
    });
  });

  it("syncSubscriptionById no-ops instead of upserting when org is gone", async () => {
    state.retrieve.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
      metadata: { organizationId: "org_deleted" },
      customer: "cus_1",
      items: { data: [] },
      discounts: [],
    });
    state.orgFindUnique.mockResolvedValue(null);
    state.billingFindFirst.mockResolvedValue(null);

    const result = await syncSubscriptionById({
      subscriptionId: "sub_1",
      organizationId: "org_deleted",
    });
    expect(result).toBeNull();
    expect(state.syncUpsert).not.toHaveBeenCalled();
  });

  it("webhook deleted path uses markSubscriptionCanceled, not full sync upsert", () => {
    const webhook = readFileSync(
      "src/lib/billing/handle-stripe-webhook.ts",
      "utf8",
    );
    expect(webhook).toContain('case "customer.subscription.deleted"');
    expect(webhook).toContain("markSubscriptionCanceled");
    // Scope only the deleted case — later invoice.* cases intentionally sync.
    const deletedStart = webhook.indexOf('case "customer.subscription.deleted"');
    const invoiceFailed = webhook.indexOf('case "invoice.payment_failed"');
    const deletedEnd =
      invoiceFailed > deletedStart
        ? invoiceFailed
        : webhook.indexOf("default:", deletedStart);
    const deletedBlock = webhook.slice(deletedStart, deletedEnd);
    expect(deletedBlock).not.toContain("syncSubscriptionById");
    expect(deletedBlock).toContain("findOrganizationIdForSubscription");
    const sync = readFileSync("src/lib/billing/sync-subscription.ts", "utf8");
    expect(sync).toContain("Stale Checkout/subscription metadata");
  });
});
