import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";
import {
  abandonStaleApplicationJobs,
  applicationJobAllowsFollowUpWhileRunning,
  claimNextApplicationJob,
  consultationPlanningOperationsFromPayload,
  enqueueApplicationJob,
  failApplicationJob,
  mergeApplicationJobPayload,
  readJobPayload,
  retryApplicationJob,
} from "@/lib/application-jobs/service";
import { processApplicationJob } from "@/lib/application-jobs/process";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { analysisIsComplete } from "@/lib/consultation/service";

const processConsultationReply = vi.hoisted(() => vi.fn());
const reassessConsultationStanding = vi.hoisted(() => vi.fn());
const continueConsultationPlanning = vi.hoisted(() => vi.fn());

vi.mock("@/lib/consultation/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/consultation/service")>();
  return {
    ...actual,
    processConsultationReply: processConsultationReply.mockImplementation(
      async (input: {
        organizationId: string;
        campaignId: string;
        turnId?: string;
        sessionId?: string;
      }) => {
        if (!input.turnId) return;
        const { prisma } = await import("@/lib/prisma-client");
        const turn = await prisma.consultationTurn.findFirst({
          where: { id: input.turnId },
          select: { analysisJson: true },
        });
        if (turn && actual.analysisIsComplete(turn.analysisJson)) return;
        await prisma.consultationTurn.update({
          where: { id: input.turnId },
          data: { analysisJson: { status: "READY" } },
        });
      },
    ),
    reassessConsultationStanding: reassessConsultationStanding.mockResolvedValue(
      undefined,
    ),
    continueConsultationPlanning: continueConsultationPlanning.mockResolvedValue(
      undefined,
    ),
  };
});

describe("application job serialize policy (source)", () => {
  it("maps serialized vs non-serialized types in one place", () => {
    expect(applicationJobAllowsFollowUpWhileRunning("CONSULTATION")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("HIRING_TEAM_IDENTIFY")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("HIRING_TEAM_BUILD")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("APPLICATION_SUMMARY")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("NEXT_STEP")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("RESUME")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("COVER_LETTER")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("OUTREACH")).toBe(false);
    expect(applicationJobAllowsFollowUpWhileRunning("CONTACT_PROFILE")).toBe(false);
    expect(applicationJobAllowsFollowUpWhileRunning("INTERVIEW_GUIDE")).toBe(false);
    const service = readFileSync("src/lib/application-jobs/service.ts", "utf8");
    expect(service).toContain("SERIALIZED_APPLICATION_JOB_TYPES");
    expect(service).toContain("applicationJobAllowsFollowUpWhileRunning");
  });

  it("records consultation seeker input before enqueue and drains from DB", () => {
    const actions = readFileSync("src/app/actions/consultation.ts", "utf8");
    const answerSlice = actions.slice(
      actions.indexOf("export async function answerConsultationAction"),
      actions.indexOf("export async function skipConsultationQuestionAction"),
    );
    expect(answerSlice.indexOf("recordConsultationReply")).toBeLessThan(
      answerSlice.indexOf("enqueueApplicationJob"),
    );
    expect(answerSlice).toContain('payload: { operation: "process_reply" }');
    expect(answerSlice).not.toMatch(/payload:\s*\{[^}]*\banswer\b/);

    const replySlice = actions.slice(
      actions.indexOf("export async function replyConsultationAction"),
      actions.indexOf("export async function editConsultationAnswerAction"),
    );
    expect(replySlice.indexOf("recordConsultationReply")).toBeLessThan(
      replySlice.indexOf("enqueueApplicationJob"),
    );
    expect(replySlice).not.toMatch(/turnId:/);

    const editSlice = actions.slice(
      actions.indexOf("export async function editConsultationAnswerAction"),
      actions.indexOf("export async function approveConsultationQaResultAction"),
    );
    expect(editSlice.indexOf("recordConsultationAnswerEdit")).toBeLessThan(
      editSlice.indexOf("enqueueApplicationJob"),
    );

    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(process).toContain("drainConsultationUnprocessedInput");
    expect(process).not.toContain("listIncompleteConsultationSeekerTurns");
    expect(process).not.toContain("processConsultationReply");
    const drain = readFileSync("src/lib/consultation/drain.ts", "utf8");
    expect(drain).toContain("listIncompleteConsultationSeekerTurns");
    expect(drain).toContain("processConsultationReply");
    const consultationService = readFileSync(
      "src/lib/consultation/service.ts",
      "utf8",
    );
    expect(consultationService).not.toContain(
      "export async function drainConsultationUnprocessedInput",
    );
  });

  it("merge preserves distinct planning operations in request order and collapses duplicates", () => {
    const first = mergeApplicationJobPayload({}, { operation: "reassess" });
    expect(consultationPlanningOperationsFromPayload(first)).toEqual(["reassess"]);
    const second = mergeApplicationJobPayload(first, { operation: "continue" });
    expect(consultationPlanningOperationsFromPayload(second)).toEqual([
      "reassess",
      "continue",
    ]);
    const third = mergeApplicationJobPayload(second, { operation: "reassess" });
    expect(consultationPlanningOperationsFromPayload(third)).toEqual([
      "reassess",
      "continue",
    ]);
    const withReply = mergeApplicationJobPayload(third, {
      operation: "process_reply",
    });
    expect(consultationPlanningOperationsFromPayload(withReply)).toEqual([
      "reassess",
      "continue",
    ]);
  });

  it("reply wait: Harper hides while busy; Cheat Sheet disables fields while pending", () => {
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("!jobsActive");
    expect(thread).toContain("showReply");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).toContain("consultationBusy");
    const cheat = readFileSync("src/components/CheatSheetCoachItems.tsx", "utf8");
    expect(cheat).toContain("disableFieldsWhilePending");
    const form = readFileSync("src/components/ApplicationActionForm.tsx", "utf8");
    expect(form).toContain("disableFieldsWhilePending");
    expect(form).toContain("disabled={pending}");
  });
});

describe.skipIf(!hasTestDatabase())("application job serialize same-key (database)", () => {
  const suffix = `ser-${Date.now()}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let campaignId = "";
  let campaignBId = "";
  let userId = "";
  let sessionId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `serialize-${suffix}@example.test`,
      name: "Serialize Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Serialize Profile ${suffix}`,
        approvalStatus: "APPROVED",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Serialize ${suffix}`,
        productId: product.id,
      },
    });
    campaignId = campaign.id;
    const campaignB = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Serialize B ${suffix}`,
        productId: product.id,
      },
    });
    campaignBId = campaignB.id;
    const session = await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId,
        productId: product.id,
        status: "IN_PROGRESS",
        generationStatus: "READY",
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
    });
    sessionId = session.id;
  });

  beforeEach(() => {
    processConsultationReply.mockClear();
    reassessConsultationStanding.mockClear();
    continueConsultationPlanning.mockClear();
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

  async function clearJobs() {
    await prisma.applicationJob.deleteMany({ where: { organizationId } });
  }

  /** Prefer this job in the global claim queue without touching other orgs' rows. */
  async function pinClaimFirst(jobId: string) {
    await prisma.applicationJob.update({
      where: { id: jobId },
      data: { createdAt: new Date(0) },
    });
  }

  async function addSeekerTurn(body: string, sequence: number) {
    return prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId,
        speaker: "SEEKER",
        body,
        sequence,
        seekerAuthored: true,
        analysisJson: { status: "PENDING" },
      },
    });
  }

  it("PENDING is not claimed while same-key IN_PROGRESS; different keys claim in parallel", async () => {
    await clearJobs();
    const running = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "CONSULTATION",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
        payload: { operation: "process_reply" },
      },
    });
    const pending = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "process_reply" },
    });
    expect(pending.id).not.toBe(running.id);
    expect(pending.status).toBe("PENDING");

    const other = await enqueueApplicationJob({
      organizationId,
      campaignId: campaignBId,
      type: "CONSULTATION",
      payload: { operation: "start" },
    });
    await pinClaimFirst(other.id);
    const claimed = await claimNextApplicationJob();
    expect(claimed).toBe(other.id);
    // Same-key PENDING must stay PENDING while IN_PROGRESS holds the key.
    // Do not call claim again here: the queue is global and parallel suites may
    // own unrelated PENDING rows.
    expect(
      (
        await prisma.applicationJob.findUniqueOrThrow({ where: { id: pending.id } })
      ).status,
    ).toBe("PENDING");

    await prisma.applicationJob.update({
      where: { id: running.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await pinClaimFirst(pending.id);
    const next = await claimNextApplicationJob();
    expect(next).toBe(pending.id);
  });

  it("ten consultation enqueues during IN_PROGRESS produce one PENDING", async () => {
    await clearJobs();
    await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "CONSULTATION",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
      },
    });
    const ids = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const job = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "CONSULTATION",
        payload: { operation: "process_reply" },
      });
      ids.add(job.id);
    }
    expect(ids.size).toBe(1);
    expect(
      await prisma.applicationJob.count({
        where: { organizationId, campaignId, type: "CONSULTATION", status: "PENDING" },
      }),
    ).toBe(1);
  });

  it("non-serialized types return the running job and create no follow-up", async () => {
    await clearJobs();
    for (const type of [
      "OUTREACH",
      "CONTACT_PROFILE",
      "INTERVIEW_GUIDE",
    ] as const) {
      const running = await prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type,
          targetId: `t-${type}`,
          status: "IN_PROGRESS",
          startedAt: new Date(),
          workerHeartbeatAt: new Date(),
        },
      });
      const again = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type,
        targetId: running.targetId,
      });
      expect(again.id).toBe(running.id);
      expect(
        await prisma.applicationJob.count({
          where: {
            organizationId,
            campaignId,
            type,
            status: "PENDING",
          },
        }),
      ).toBe(0);
    }
  });

  it("RESUME and COVER_LETTER create one PENDING follow-up while IN_PROGRESS", async () => {
    await clearJobs();
    for (const type of ["RESUME", "COVER_LETTER"] as const) {
      const running = await prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type,
          targetId: null,
          status: "IN_PROGRESS",
          startedAt: new Date(),
          workerHeartbeatAt: new Date(),
        },
      });
      const followUp = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type,
        targetId: null,
      });
      expect(followUp.id).not.toBe(running.id);
      expect(followUp.status).toBe("PENDING");
      const again = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type,
        targetId: null,
      });
      expect(again.id).toBe(followUp.id);
      expect(
        await prisma.applicationJob.count({
          where: {
            organizationId,
            campaignId,
            type,
            status: "PENDING",
          },
        }),
      ).toBe(1);
    }
    await clearJobs();
  });

  it("deferredOutreach survives PENDING reuse", async () => {
    await clearJobs();
    await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "HIRING_TEAM_BUILD",
        targetId: "persona-1",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
      },
    });
    const first = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "HIRING_TEAM_BUILD",
      targetId: "persona-1",
      payload: {
        deferredOutreach: {
          assetType: "EMAIL",
          personaId: "persona-1",
          purpose: "PROACTIVE",
        },
      },
    });
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "HIRING_TEAM_BUILD",
      targetId: "persona-1",
      payload: {
        deferredOutreach: {
          assetType: "EMAIL",
          personaId: "persona-1",
          purpose: "FOLLOW_UP",
          followUpToAssetId: "asset-9",
        },
      },
    });
    const row = await prisma.applicationJob.findFirstOrThrow({
      where: { id: first.id },
    });
    const payload = readJobPayload(row.payload);
    expect(payload.deferredOutreach?.purpose).toBe("FOLLOW_UP");
    expect(payload.deferredOutreach?.followUpToAssetId).toBe("asset-9");
  });

  it("retry with existing PENDING returns it and creates no second PENDING", async () => {
    await clearJobs();
    const pending = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "NEXT_STEP",
    });
    const failed = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "NEXT_STEP",
        status: "FAILED",
        error: "boom",
        completedAt: new Date(),
      },
    });
    const retried = await retryApplicationJob({
      organizationId,
      campaignId,
      jobId: failed.id,
    });
    expect(retried.id).toBe(pending.id);
    expect(
      await prisma.applicationJob.count({
        where: { organizationId, campaignId, type: "NEXT_STEP", status: "PENDING" },
      }),
    ).toBe(1);
  });

  it("abandon and timeout never create two IN_PROGRESS or lose PENDING", async () => {
    await clearJobs();
    const stale = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "CONSULTATION",
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        workerHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    const pending = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "process_reply" },
    });
    await abandonStaleApplicationJobs();
    const afterAbandon = await prisma.applicationJob.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(afterAbandon.status).toBe("FAILED");
    expect(
      await prisma.applicationJob.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({ status: "PENDING" });
    expect(
      await prisma.applicationJob.count({
        where: { organizationId, campaignId, type: "CONSULTATION", status: "IN_PROGRESS" },
      }),
    ).toBe(0);

    await clearJobs();
    const running = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "NEXT_STEP",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
        attempt: 0,
        maxAttempts: 3,
      },
    });
    const waiting = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "NEXT_STEP",
    });
    await failApplicationJob({ jobId: running.id, message: "Request timed out" });
    const failedRunning = await prisma.applicationJob.findUniqueOrThrow({
      where: { id: running.id },
    });
    expect(failedRunning.status).toBe("FAILED");
    expect(
      await prisma.applicationJob.findUniqueOrThrow({ where: { id: waiting.id } }),
    ).toMatchObject({ status: "PENDING" });
  });

  it("drain processes each incomplete turn once after the running job finishes", async () => {
    await clearJobs();
    await prisma.consultationTurn.deleteMany({ where: { sessionId } });
    const turnA = await addSeekerTurn("answer one", 1);
    const turnB = await addSeekerTurn("answer two", 2);

    const running = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "CONSULTATION",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
        payload: { operation: "process_reply" },
      },
    });
    const pending = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "process_reply" },
    });
    expect(pending.id).not.toBe(running.id);

    // Simulate first job finishing without draining (crash after claim).
    await prisma.applicationJob.update({
      where: { id: running.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await pinClaimFirst(pending.id);
    const claimed = await claimNextApplicationJob();
    expect(claimed).toBe(pending.id);
    const result = await processApplicationJob(pending.id);
    expect(result.ok).toBe(true);

    const processedIds = processConsultationReply.mock.calls
      .map((call) => call[0]?.turnId)
      .filter(Boolean);
    expect(processedIds).toEqual([turnA.id, turnB.id]);

    const a = await prisma.consultationTurn.findUniqueOrThrow({ where: { id: turnA.id } });
    const b = await prisma.consultationTurn.findUniqueOrThrow({ where: { id: turnB.id } });
    expect(analysisIsComplete(a.analysisJson)).toBe(true);
    expect(analysisIsComplete(b.analysisJson)).toBe(true);

    // Second job does not re-process complete turns.
    processConsultationReply.mockClear();
    const again = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "process_reply" },
    });
    await pinClaimFirst(again.id);
    const againId = await claimNextApplicationJob();
    expect(againId).toBe(again.id);
    await processApplicationJob(again.id);
    expect(processConsultationReply).not.toHaveBeenCalled();
  });

  it("answerConsultationAction records before enqueue (integration)", async () => {
    await clearJobs();
    await prisma.consultationTurn.deleteMany({ where: { sessionId } });
    await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId,
        speaker: "CONSULTANT",
        body: "Tell me about channel motion.",
        sequence: 1,
        targetKey: "required:channel",
      },
    });
    const { recordConsultationReply } = await import("@/lib/consultation/service");
    const recorded = await recordConsultationReply({
      organizationId,
      campaignId,
      targetKey: "required:channel",
      answer: "I built a partner channel for three years.",
    });
    expect(recorded.turnId).toBeTruthy();
    const before = await prisma.consultationTurn.findUniqueOrThrow({
      where: { id: recorded.turnId },
    });
    expect(analysisIsComplete(before.analysisJson)).toBe(false);

    await clearJobs();
    const job = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "process_reply" },
    });
    await pinClaimFirst(job.id);
    const claimed = await claimNextApplicationJob();
    expect(claimed).toBe(job.id);
    await processApplicationJob(job.id);
    const after = await prisma.consultationTurn.findUniqueOrThrow({
      where: { id: recorded.turnId },
    });
    expect(analysisIsComplete(after.analysisJson)).toBe(true);
    expect(processConsultationReply).toHaveBeenCalled();
  });

  it("two planning ops on PENDING both run once in request order; duplicates collapse", async () => {
    await clearJobs();
    await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "CONSULTATION",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
      },
    });
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "reassess" },
    });
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "continue" },
    });
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "reassess" },
    });
    const pending = await prisma.applicationJob.findFirstOrThrow({
      where: { organizationId, campaignId, type: "CONSULTATION", status: "PENDING" },
    });
    expect(consultationPlanningOperationsFromPayload(readJobPayload(pending.payload))).toEqual([
      "reassess",
      "continue",
    ]);

    await prisma.applicationJob.updateMany({
      where: { organizationId, campaignId, type: "CONSULTATION", status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await pinClaimFirst(pending.id);
    const claimed = await claimNextApplicationJob();
    expect(claimed).toBe(pending.id);
    const result = await processApplicationJob(pending.id);
    expect(result.ok).toBe(true);
    expect(reassessConsultationStanding).toHaveBeenCalledTimes(1);
    expect(continueConsultationPlanning).toHaveBeenCalledTimes(1);
    const reassessOrder = reassessConsultationStanding.mock.invocationCallOrder[0];
    const continueOrder = continueConsultationPlanning.mock.invocationCallOrder[0];
    expect(reassessOrder).toBeLessThan(continueOrder);
  });
});
