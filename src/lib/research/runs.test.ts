import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchRun } from "@/lib/research/runs-service";

const { findFirst, create } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  },
}));

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    researchRun: {
      findFirst,
      create,
    },
  },
}));

vi.mock("@/lib/tenant/company-research-service", () => ({
  getCompaniesNeedingResearchForContactList: vi.fn(),
  researchCompany: vi.fn(),
}));

vi.mock("@/lib/tenant/request-context", () => ({
  runWithTenantContext: async (
    _ctx: unknown,
    fn: () => Promise<unknown>,
  ) => fn(),
}));

describe("research runs", () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset();
  });

  it("rejects a second active run for the same list", async () => {
    findFirst.mockResolvedValue({
      id: "run_active",
      organizationId: "org_1",
      contactListId: "list_1",
      status: "PENDING",
      workerHeartbeatAt: new Date(),
      startedAt: new Date(),
      createdAt: new Date(),
    });

    const second = await createResearchRun({
      organizationId: "org_1",
      contactListId: "list_1",
      initiatedByUserId: "user_1",
      forceRefresh: true,
    });

    expect(second.ok).toBe(false);
    if (!second.ok && second.code === "ACTIVE_RUN") {
      expect(second.activeRunId).toBe("run_active");
    } else {
      expect.fail("expected ACTIVE_RUN");
    }
    expect(create).not.toHaveBeenCalled();
  });
});
