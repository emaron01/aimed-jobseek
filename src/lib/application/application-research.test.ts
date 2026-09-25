import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applicationResearchPhase,
  toApplicationResearchStatusView,
} from "@/lib/application/research-status";
import { applicationResearchCopy } from "@/lib/product-config";
import { enqueueApplicationResearch } from "@/lib/research/runs-service";
import {
  isResearchRunQueuedUnstarted,
  RESEARCH_RUN_QUEUED_STALE_MS_DEFAULT,
} from "@/lib/research/run-types";

const { findFirst, create, researchCompany } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  researchCompany: vi.fn(),
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
    company: {
      findFirst,
    },
  },
}));

vi.mock("@/lib/tenant/company-research-service", () => ({
  getCompaniesNeedingResearchForContactList: vi.fn(),
  researchCompany,
}));

vi.mock("@/lib/tenant/request-context", () => ({
  runWithTenantContext: async (
    _ctx: unknown,
    fn: () => Promise<unknown>,
  ) => fn(),
}));

describe("application research enqueue", () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset();
    researchCompany.mockReset();
  });

  it("does not call researchCompany from application save paths", () => {
    const src = readFileSync("src/lib/application/service.ts", "utf8");
    expect(src).toContain("enqueueApplicationResearch");
    expect(src).toContain("queueApplicationResearch");
    expect(src).not.toMatch(/researchCompany\(/);
    expect(src).not.toContain("researchAndMaybeScore");
  });

  it("creates a PENDING run and returns without researching", async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "co_1", name: "Acme Robotics" });
    create.mockResolvedValue({
      id: "run_1",
      organizationId: "org_1",
      contactListId: null,
      campaignId: "camp_1",
      scoringRunId: null,
      status: "PENDING",
      forceRefresh: false,
      failuresOnly: false,
      retryOfRunId: null,
      totalCompanies: 1,
      completedCount: 0,
      failedCount: 0,
      skippedFreshCount: 0,
      quotaBlockedCount: 0,
      currentCompanyName: "Acme Robotics",
      lastError: null,
      failedCompanyIds: null,
      quotaBlockedCompanyNames: null,
      workerHeartbeatAt: null,
      startedAt: null,
      completedAt: null,
      pausedAt: null,
      createdAt: new Date("2026-09-25T12:00:00.000Z"),
    });

    const hung = enqueueApplicationResearch({
      organizationId: "org_1",
      campaignId: "camp_1",
      companyId: "co_1",
    });
    const raced = await Promise.race([
      hung,
      new Promise((resolve) => {
        setTimeout(() => resolve("timed_out"), 50);
      }),
    ]);
    expect(raced).not.toBe("timed_out");
    expect(researchCompany).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org_1",
        campaignId: "camp_1",
        contactListId: null,
        status: "PENDING",
        currentCompanyId: "co_1",
        totalCompanies: 1,
      }),
    });
  });
});

describe("application research status", () => {
  it("marks a stale queued run as not started", () => {
    const phase = applicationResearchPhase({
      run: {
        status: "PENDING",
        createdAt: "2026-09-25T12:00:00.000Z",
        workerHeartbeatAt: null,
      },
      researchStatus: "NOT_STARTED",
      nowMs: Date.parse("2026-09-25T12:03:00.000Z"),
      queuedStaleMs: RESEARCH_RUN_QUEUED_STALE_MS_DEFAULT,
    });
    expect(phase).toBe("not_started");
    const view = toApplicationResearchStatusView(phase, "run_1");
    expect(view.label).toBe(applicationResearchCopy.notStarted);
    expect(view.canRetry).toBe(true);
    expect(view.detail).toBe(applicationResearchCopy.notStartedDetail);
  });

  it("keeps a fresh PENDING run queued", () => {
    expect(
      applicationResearchPhase({
        run: {
          status: "PENDING",
          createdAt: "2026-09-25T12:00:00.000Z",
          workerHeartbeatAt: null,
        },
        researchStatus: "NOT_STARTED",
        nowMs: Date.parse("2026-09-25T12:00:30.000Z"),
        queuedStaleMs: RESEARCH_RUN_QUEUED_STALE_MS_DEFAULT,
      }),
    ).toBe("queued");
  });

  it("maps in-progress, completed, and failed runs", () => {
    expect(
      applicationResearchPhase({
        run: {
          status: "IN_PROGRESS",
          createdAt: "2026-09-25T12:00:00.000Z",
          workerHeartbeatAt: "2026-09-25T12:00:05.000Z",
        },
        researchStatus: "IN_PROGRESS",
        nowMs: Date.parse("2026-09-25T12:01:00.000Z"),
      }),
    ).toBe("researching");
    expect(
      applicationResearchPhase({
        run: {
          status: "COMPLETED",
          createdAt: "2026-09-25T12:00:00.000Z",
          workerHeartbeatAt: "2026-09-25T12:02:00.000Z",
        },
        researchStatus: "COMPLETED",
      }),
    ).toBe("done");
    expect(
      applicationResearchPhase({
        run: {
          status: "FAILED",
          createdAt: "2026-09-25T12:00:00.000Z",
          workerHeartbeatAt: "2026-09-25T12:02:00.000Z",
        },
        researchStatus: "FAILED",
      }),
    ).toBe("failed");
  });

  it("treats PENDING without a heartbeat after the configured wait as unstarted", () => {
    expect(
      isResearchRunQueuedUnstarted(
        {
          status: "PENDING",
          createdAt: "2026-09-25T12:00:00.000Z",
          workerHeartbeatAt: null,
        },
        Date.parse("2026-09-25T12:02:01.000Z"),
      ),
    ).toBe(true);
    expect(
      isResearchRunQueuedUnstarted(
        {
          status: "PENDING",
          createdAt: "2026-09-25T12:00:00.000Z",
          workerHeartbeatAt: null,
        },
        Date.parse("2026-09-25T12:01:00.000Z"),
      ),
    ).toBe(false);
  });
});
