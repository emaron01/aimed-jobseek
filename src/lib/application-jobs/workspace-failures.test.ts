import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDatabase } from "@/test/database";
import {
  completeApplicationJob,
  retryApplicationJob,
} from "@/lib/application-jobs/service";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { supersedeObsoleteWorkspaceFailures } from "@/lib/application-jobs/obsolete-failures";
import {
  applicationAssetConfig,
  consultationConversationCopy,
  isObsoleteWorkspaceFailure,
} from "@/lib/product-config";

const STALE_ASSET =
  "The asset was not saved because its claims did not pass verification. Retry after reviewing the violations.";
const STALE_PLAN = consultationConversationCopy.planUnusable;
const STALE_STORY =
  "Consultation answer analysis did not return a fully grounded story. Retry consultation.";
const STALE_CHEAT_SHEET =
  "Application Summary guidance did not pass checks. The passing parts were not enough to save. Retry.";
const STALE_CLARIFY = "Clarifying questions could not be written. Retry.";

describe("obsolete workspace failures", () => {
  it("treats removed fail-closed messages as obsolete", () => {
    expect(isObsoleteWorkspaceFailure(STALE_ASSET)).toBe(true);
    expect(isObsoleteWorkspaceFailure(STALE_PLAN)).toBe(true);
    expect(isObsoleteWorkspaceFailure(STALE_STORY)).toBe(true);
    expect(isObsoleteWorkspaceFailure(STALE_CHEAT_SHEET)).toBe(true);
    expect(isObsoleteWorkspaceFailure(STALE_CLARIFY)).toBe(true);
    expect(
      isObsoleteWorkspaceFailure(
        "Interview Cheat Sheet guidance did not pass checks. The passing parts were not enough to save. Retry.",
      ),
    ).toBe(true);
    expect(
      isObsoleteWorkspaceFailure("Consultation answer analysis could not be grounded."),
    ).toBe(true);
    expect(
      isObsoleteWorkspaceFailure(applicationAssetConfig.labels.verificationFailed),
    ).toBe(true);
    expect(isObsoleteWorkspaceFailure("The model did not return a usable asset.")).toBe(
      false,
    );
  });
});

describe.skipIf(!hasTestDatabase())("stale fail-closed records", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let campaignId = "";
  let userId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `stale-fail-${suffix}@example.test`,
      name: "Stale Fail Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
      },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Stale fail ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("does not render old fail-closed records after cleanup", async () => {
    const [resumeJob, consultJob] = await Promise.all([
      prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type: "RESUME",
          status: "FAILED",
          error: STALE_ASSET,
        },
      }),
      prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type: "CONSULTATION",
          status: "FAILED",
          error: STALE_PLAN,
        },
      }),
    ]);
    await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId,
        productId: (await prisma.campaign.findUniqueOrThrow({
          where: { id: campaignId },
          select: { productId: true },
        })).productId,
        status: "IN_PROGRESS",
        generationStatus: "FAILED",
        generationError: STALE_STORY,
        promptVersion: "test",
      },
    });
    await prisma.applicationSummary.create({
      data: {
        organizationId,
        campaignId,
        status: "FAILED",
        generationError: STALE_CHEAT_SHEET,
        promptVersion: "test",
      },
    });
    const stage = await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        sortOrder: 0,
        type: "RECRUITER_SCREEN",
        scheduledAt: new Date(),
        format: "VIDEO",
      },
    });
    await prisma.interviewStageGuide.create({
      data: {
        organizationId,
        stageId: stage.id,
        status: "FAILED",
        generationError: STALE_CLARIFY,
        promptVersion: "test",
      },
    });

    const before = await getApplicationWorkspaceLive({
      organizationId,
      campaignId,
    });
    expect(
      before.jobs.some(
        (job) =>
          job.id === resumeJob.id &&
          (job.status === "FAILED" ||
            (job.error ?? "").includes("did not pass verification")),
      ),
    ).toBe(false);
    expect(
      before.jobs.some(
        (job) =>
          job.id === consultJob.id &&
          (job.status === "FAILED" ||
            (job.error ?? "").includes("usable plan")),
      ),
    ).toBe(false);

    const cleaned = await supersedeObsoleteWorkspaceFailures({
      organizationId,
      campaignId,
    });
    expect(cleaned.jobs).toBeGreaterThanOrEqual(2);
    expect(cleaned.sessions).toBeGreaterThanOrEqual(1);
    expect(cleaned.summaries).toBeGreaterThanOrEqual(1);
    expect(cleaned.guides).toBeGreaterThanOrEqual(1);

    const after = await getApplicationWorkspaceLive({
      organizationId,
      campaignId,
    });
    expect(
      after.jobs.some(
        (job) =>
          job.status === "FAILED" &&
          (isObsoleteWorkspaceFailure(job.error) ||
            (job.error ?? "").includes("did not pass verification") ||
            (job.error ?? "").includes("usable plan") ||
            (job.error ?? "").includes("fully grounded")),
      ),
    ).toBe(false);
    const storedResume = await prisma.applicationJob.findUniqueOrThrow({
      where: { id: resumeJob.id },
    });
    const storedConsult = await prisma.applicationJob.findUniqueOrThrow({
      where: { id: consultJob.id },
    });
    const session = await prisma.consultationSession.findUniqueOrThrow({
      where: { campaignId },
    });
    expect(storedResume.status).toBe("COMPLETED");
    expect(storedResume.error).toBeNull();
    expect(storedConsult.status).toBe("COMPLETED");
    expect(storedConsult.error).toBeNull();
    expect(session.generationError).toBeNull();
    expect(session.generationStatus).toBe("READY");
    const summary = await prisma.applicationSummary.findUniqueOrThrow({
      where: { campaignId },
    });
    expect(summary.generationError).toBeNull();
    const guide = await prisma.interviewStageGuide.findUniqueOrThrow({
      where: { stageId: stage.id },
    });
    expect(guide.generationError).toBeNull();
  });

  it("clears a failure on retry success", async () => {
    const job = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "NEXT_STEP",
        status: "FAILED",
        error: "The model did not return a usable next step.",
      },
    });
    const failed = await getApplicationWorkspaceLive({
      organizationId,
      campaignId,
    });
    expect(
      failed.jobs.some((row) => row.id === job.id && row.status === "FAILED"),
    ).toBe(true);

    const retried = await retryApplicationJob({
      organizationId,
      campaignId,
      jobId: job.id,
    });
    expect(retried.status).toBe("PENDING");
    expect(retried.error).toBeNull();

    await completeApplicationJob(job.id);
    const live = await getApplicationWorkspaceLive({
      organizationId,
      campaignId,
    });
    const view = live.jobs.find((row) => row.id === job.id);
    expect(view?.status).toBe("COMPLETED");
    expect(view?.error).toBeNull();
    expect(
      live.jobs.some((row) => row.id === job.id && row.status === "FAILED"),
    ).toBe(false);
  });
});
