import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  usageFind: vi.fn(),
  usageUpsert: vi.fn(),
  researchUpsert: vi.fn(),
  billingFind: vi.fn(),
  billingUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationUsagePolicy: {
      findUnique: state.usageFind,
      upsert: state.usageUpsert,
    },
    researchPolicy: { upsert: state.researchUpsert },
    organizationBillingProfile: {
      findUnique: state.billingFind,
      update: state.billingUpdate,
    },
  },
}));

vi.mock("@/lib/billing/effective-catalog", () => ({
  loadEffectiveBillingCatalog: async () => ({ catalog: null }),
}));

import { applyPlanEntitlements } from "@/lib/billing/apply-plan-entitlements";
import { BILLING_PLAN_COMPED, BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

describe("applyPlanEntitlements", () => {
  beforeEach(() => {
    state.usageFind.mockReset();
    state.usageUpsert.mockReset();
    state.researchUpsert.mockReset();
    state.billingFind.mockReset();
    state.billingUpdate.mockReset();
    state.usageFind.mockResolvedValue({
      activeResearchedCompanyLimit: 0,
      dailyEmailGenerationLimit: 0,
    });
    state.usageUpsert.mockResolvedValue({});
    state.researchUpsert.mockResolvedValue({});
    state.billingFind.mockResolvedValue(null);
  });

  it("updates the research allowance when the plan changes to COMPED", async () => {
    await applyPlanEntitlements({
      organizationId: "org_1",
      planCode: BILLING_PLAN_COMPED,
      billingStatus: "FREE",
    });
    expect(state.usageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1" },
        update: expect.objectContaining({
          activeResearchedCompanyLimit: 50,
        }),
        create: expect.objectContaining({
          activeResearchedCompanyLimit: 50,
        }),
      }),
    );
  });

  it("applies Standard paid entitlements when the plan changes from an empty allowance", async () => {
    await applyPlanEntitlements({
      organizationId: "org_1",
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "ACTIVE",
    });
    expect(state.usageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          activeResearchedCompanyLimit: 100,
        }),
      }),
    );
  });
});
