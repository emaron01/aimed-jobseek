import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  orgFindUnique: vi.fn(),
  billingUpdate: vi.fn(),
  usageUpdate: vi.fn(),
  transaction: vi.fn(),
  cancel: vi.fn(),
  retrieve: vi.fn(),
  list: vi.fn(),
  audit: vi.fn(),
  stripeConfigured: true,
  applyPlanEntitlements: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: state.orgFindUnique },
    organizationBillingProfile: { update: state.billingUpdate },
    organizationUsagePolicy: { update: state.usageUpdate },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      state.transaction(fn),
  },
}));

vi.mock("@/lib/billing/stripe", () => ({
  stripeConfigured: () => state.stripeConfigured,
  getStripe: () => ({
    subscriptions: {
      retrieve: state.retrieve,
      cancel: state.cancel,
      list: state.list,
    },
  }),
}));

vi.mock("@/lib/auth/audit", () => ({
  recordAdminAuditEvent: (...args: unknown[]) => state.audit(...args),
}));

vi.mock("@/lib/billing/apply-plan-entitlements", () => ({
  applyPlanEntitlements: (...args: unknown[]) => state.applyPlanEntitlements(...args),
}));

import { convertOrganizationToComped } from "@/lib/platform/orgs";

describe("convertOrganizationToComped", () => {
  beforeEach(() => {
    state.orgFindUnique.mockReset();
    state.billingUpdate.mockReset();
    state.usageUpdate.mockReset();
    state.transaction.mockReset();
    state.cancel.mockReset();
    state.retrieve.mockReset();
    state.list.mockReset();
    state.audit.mockReset();
    state.applyPlanEntitlements.mockReset();
    state.stripeConfigured = true;
    state.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        organizationBillingProfile: { update: state.billingUpdate },
        organizationUsagePolicy: { update: state.usageUpdate },
      }),
    );
  });

  it("cancels Stripe, refuses COMPED write while subscription stays live", async () => {
    state.orgFindUnique.mockResolvedValue({
      id: "org_1",
      name: "Acme",
      billingProfile: {
        planCode: "TEAM",
        billingStatus: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      },
    });
    state.retrieve
      .mockResolvedValueOnce({ id: "sub_1", status: "active" }) // cancel path retrieve
      .mockResolvedValueOnce({ id: "sub_1", status: "active" }); // assert after cancel
    state.cancel.mockResolvedValue({ id: "sub_1", status: "canceled" });

    await expect(
      convertOrganizationToComped({
        organizationId: "org_1",
        actorUserId: "sa_1",
        activeResearchedCompanyLimit: 50,
        dailyEmailSendWarningLimit: 50,
        monthlyEmailSendLimit: null,
      }),
    ).rejects.toThrow(/still "active"/);

    expect(state.cancel).toHaveBeenCalledWith("sub_1");
    expect(state.billingUpdate).not.toHaveBeenCalled();
  });

  it("writes comped billing state without replacing the product plan", async () => {
    state.orgFindUnique.mockResolvedValue({
      id: "org_1",
      name: "Acme",
      billingProfile: {
        planCode: "STANDARD",
        billingStatus: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      },
    });
    state.retrieve
      .mockResolvedValueOnce({ id: "sub_1", status: "active" })
      .mockResolvedValueOnce({ id: "sub_1", status: "canceled" })
      .mockResolvedValueOnce({ id: "sub_1", status: "canceled" });
    state.cancel.mockResolvedValue({ id: "sub_1", status: "canceled" });
    state.list.mockResolvedValue({ data: [] });
    state.billingUpdate.mockResolvedValue({});
    state.usageUpdate.mockResolvedValue({});
    state.audit.mockResolvedValue(undefined);

    const result = await convertOrganizationToComped({
      organizationId: "org_1",
      actorUserId: "sa_1",
      activeResearchedCompanyLimit: 75,
      dailyEmailSendWarningLimit: 40,
      monthlyEmailSendLimit: null,
    });

    expect(result.previousPlanCode).toBe("STANDARD");
    expect(state.cancel).toHaveBeenCalledWith("sub_1");
    expect(state.billingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1" },
        data: expect.objectContaining({
          planCode: "COMPED",
          billingStatus: "FREE",
          stripeSubscriptionId: null,
          stripeCustomerId: null,
        }),
      }),
    );
    expect(state.applyPlanEntitlements).toHaveBeenCalledWith({
      organizationId: "org_1",
      planCode: "COMPED",
      billingStatus: "FREE",
    });
    expect(state.usageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeResearchedCompanyLimit: 75,
          dailyEmailSendWarningLimit: 40,
          monthlyEmailSendLimit: null,
        }),
      }),
    );
    expect(state.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PLATFORM_ORGANIZATION_CONVERTED_TO_COMPED",
      }),
    );
  });

  it("platform console wires convert panel and action", () => {
    const page = readFileSync("src/app/platform/orgs/[id]/page.tsx", "utf8");
    expect(page).toContain("ConvertOrganizationToCompedPanel");
    const actions = readFileSync("src/app/actions/platform-orgs.ts", "utf8");
    expect(actions).toContain("convertOrganizationToCompedAction");
    const panel = readFileSync(
      "src/components/platform/ConvertOrganizationToCompedPanel.tsx",
      "utf8",
    );
    expect(panel).toContain('CONFIRM_PHRASE = "COMPED"');
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("PLATFORM_ORGANIZATION_CONVERTED_TO_COMPED");
  });
});
