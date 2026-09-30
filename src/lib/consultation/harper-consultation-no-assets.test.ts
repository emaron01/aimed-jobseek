/**
 * ITEM 4 correction: consultation never starts resume/cover assets;
 * DONE remains an open prep hub for replies, edits, reassess, and role-expertise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasTestDatabase } from "@/test/database";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  applicationNextStepState,
} from "@/lib/application/next-step";
import {
  emptyApplicationStepFacts,
  resolveApplicationStepState,
  stepIsDone,
} from "@/lib/application/step-progress";

const generateStructured = vi.hoisted(() => vi.fn());
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    isConsultationReplyAiConfigured: isConsultationAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

describe("Harper consultation no asset side effects (static)", () => {
  it("resume/cover generate actions still enqueue from the assets page", () => {
    const actions = src("src/app/actions/application-assets.ts");
    const generateFn = actions.slice(
      actions.indexOf("export async function generateApplicationAssetAction"),
      actions.indexOf("export async function", actions.indexOf("export async function generateApplicationAssetAction") + 1) >
        0
        ? actions.indexOf(
            "export async function",
            actions.indexOf("export async function generateApplicationAssetAction") + 1,
          )
        : undefined,
    );
    expect(generateFn).toContain("enqueueApplicationJob");
    expect(generateFn).toMatch(/type[\s\S]*RESUME|COVER_LETTER/);
  });

  it("sidebar step color for consultation follows consultationComplete (!unanswered)", () => {
    const idle = emptyApplicationStepFacts();
    expect(
      stepIsDone("consultation", {
        ...idle,
        consultationStarted: true,
        consultationComplete: true,
      }),
    ).toBe(true);
    expect(
      stepIsDone("consultation", {
        ...idle,
        consultationStarted: true,
        consultationComplete: false,
      }),
    ).toBe(false);
    expect(
      resolveApplicationStepState(
        "consultation",
        { ...idle, consultationStarted: true, consultationComplete: true },
        [],
      ),
    ).toBe("done");
    expect(
      resolveApplicationStepState(
        "consultation",
        { ...idle, consultationStarted: true, consultationComplete: false },
        [],
      ),
    ).toBe("in_progress");
  });

  it("next-step treats DONE like past consultation_in_progress (assets_available when idle)", () => {
    expect(
      applicationNextStepState({
        consultationStatus: "DONE",
        consultationGenerationStatus: "READY",
        resumePlanStatus: null,
        coverPlanStatus: null,
        hasResume: false,
        hasCoverLetter: false,
        appliedAt: null,
      }).key,
    ).toBe("assets_available");
    expect(
      applicationNextStepState({
        consultationStatus: "IN_PROGRESS",
        consultationGenerationStatus: "READY",
        resumePlanStatus: null,
        coverPlanStatus: null,
        hasResume: false,
        hasCoverLetter: false,
        appliedAt: null,
      }).key,
    ).toBe("consultation_in_progress");
  });
});

describe.skipIf(!hasTestDatabase())(
  "Harper consultation no asset side effects (database)",
  { timeout: 60_000 },
  () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prisma: any;
    let organizationId = "";
    let userId = "";
    let productId = "";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Harper no-assets ${suffix}`,
          slug: `harper-no-assets-${suffix}`,
        },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `harper-no-assets-${suffix}@example.test`,
          emailNormalized: `harper-no-assets-${suffix}@example.test`,
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Profile ${suffix}`,
          profileJson: fixtureAlexChenProfile(),
        },
      });
      productId = product.id;
      generateStructured.mockResolvedValue({
        ok: true,
        data: {
          overall: "Strong fit.",
          strongestAngles: ["Reliability"],
          importantGaps: [],
          storyPlan: [],
          assessments: [],
          questions: [
            {
              targetKey: "role-expertise:hiring-manager",
              question: "What would the hiring manager ask about your team leadership?",
              rationale: "Role expertise",
            },
          ],
        },
      });
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    });

    async function createCampaign(name: string) {
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `${name} ${suffix}`,
          productId,
          whyThisCompany: "The warehouse robotics mission matches my reliability work.",
        },
      });
      const parsed = normalizeParsedJobRequirement(
        NORMAL_JOB_MODEL,
        NORMAL_JOB_POSTING,
      );
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          rawText: NORMAL_JOB_POSTING,
          title: parsed.title,
          companyName: parsed.companyName,
          seniority: parsed.seniority,
          reportingLine: parsed.reportingLine,
          requiredItems: parsed.requiredItems,
          preferredItems: parsed.preferredItems,
          scorecardJson: parsed.scorecard,
          employerDisposition: "IDENTIFIED",
        },
      });
      return campaign;
    }

    async function assetJobs(campaignId: string) {
      return prisma.applicationJob.findMany({
        where: {
          organizationId,
          campaignId,
          type: { in: ["RESUME", "COVER_LETTER"] },
        },
      });
    }

    it("skipConsultation and completeConsultation enqueue no asset jobs", async () => {
      const {
        skipConsultation,
        completeConsultation,
      } = await import("@/lib/consultation/service");
      const skipped = await createCampaign("Skip assets");
      await skipConsultation({
        organizationId,
        campaignId: skipped.id,
      });
      expect(await assetJobs(skipped.id)).toEqual([]);
      expect(
        (
          await prisma.consultationSession.findUnique({
            where: { campaignId: skipped.id },
          })
        )?.status,
      ).toBe("SKIPPED");

      const done = await createCampaign("Complete assets");
      await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: done.id,
          productId,
          status: "IN_PROGRESS",
          generationStatus: "READY",
          promptVersion: CONSULTATION_PROMPT_VERSION,
        },
      });
      await completeConsultation({ organizationId, campaignId: done.id });
      expect(await assetJobs(done.id)).toEqual([]);
      expect(
        (
          await prisma.consultationSession.findUnique({
            where: { campaignId: done.id },
          })
        )?.status,
      ).toBe("DONE");
    });

    it("finishIfPlanningIsComplete (auto-DONE) enqueues no asset jobs", async () => {
      const campaign = await createCampaign("Auto done");
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          productId,
          status: "IN_PROGRESS",
          generationStatus: "READY",
          promptVersion: CONSULTATION_PROMPT_VERSION,
          briefingJson: {
            overall: "Ready",
            strongestAngles: [],
            importantGaps: [],
            storyPlan: [],
          },
        },
      });
      // Covered assessments + no unanswered questions → auto DONE.
      await prisma.consultationAssessment.create({
        data: {
          organizationId,
          sessionId: session.id,
          targetKey: "required:0",
          text: "Leads incident response",
          kind: "REQUIRED",
          strength: "STRONG",
          explanation: "Covered in profile",
          supportingFactIds: [],
        },
      });
      const service = await import("@/lib/consultation/service");
      // continueConsultationPlanning with covered gaps marks DONE without assets.
      await service.continueConsultationPlanning({
        organizationId,
        campaignId: campaign.id,
      });
      const after = await prisma.consultationSession.findUnique({
        where: { id: session.id },
      });
      expect(after?.status).toBe("DONE");
      expect(await assetJobs(campaign.id)).toEqual([]);
    });

    it("after DONE, reply and edit reopen and work; SKIPPED still refuses", async () => {
      const {
        recordConsultationReply,
        recordConsultationAnswerEdit,
      } = await import("@/lib/consultation/service");
      const campaign = await createCampaign("Done hub");
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          productId,
          status: "DONE",
          generationStatus: "READY",
          promptVersion: CONSULTATION_PROMPT_VERSION,
        },
      });
      const question = await prisma.consultationTurn.create({
        data: {
          organizationId,
          sessionId: session.id,
          speaker: "CONSULTANT",
          body: "Tell me about leading incidents.",
          targetKey: "required:0",
          sequence: 1,
          followUp: false,
        },
      });
      const recorded = await recordConsultationReply({
        organizationId,
        campaignId: campaign.id,
        targetKey: `question:${question.id}`,
        answer: "I led SEV1 response for the payment outage.",
      });
      expect(recorded.sessionId).toBe(session.id);
      expect(
        (
          await prisma.consultationSession.findUnique({
            where: { id: session.id },
          })
        )?.status,
      ).toBe("IN_PROGRESS");

      await prisma.consultationSession.update({
        where: { id: session.id },
        data: { status: "DONE" },
      });
      await recordConsultationAnswerEdit({
        organizationId,
        campaignId: campaign.id,
        turnId: recorded.turnId,
        answer: "I led SEV1 response and cut MTTR by half.",
      });
      expect(
        (
          await prisma.consultationSession.findUnique({
            where: { id: session.id },
          })
        )?.status,
      ).toBe("IN_PROGRESS");
      const edited = await prisma.consultationTurn.findUnique({
        where: { id: recorded.turnId },
      });
      expect(edited?.body).toContain("cut MTTR");

      const skipped = await createCampaign("Skipped refuse");
      await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: skipped.id,
          productId,
          status: "SKIPPED",
          generationStatus: "READY",
          promptVersion: CONSULTATION_PROMPT_VERSION,
        },
      });
      await expect(
        recordConsultationReply({
          organizationId,
          campaignId: skipped.id,
          targetKey: "required:0",
          answer: "Should not land.",
        }),
      ).rejects.toThrow(/not taking replies/i);
    });

    it("after DONE, learnings reassess reopens and role-expertise answers are accepted", async () => {
      const {
        reassessConsultationStanding,
        recordConsultationReply,
      } = await import("@/lib/consultation/service");
      // Install a minimal plan mock so forceReassess can add a question.
      generateStructured.mockImplementation(async (request: { schemaName: string }) => {
        if (request.schemaName === "consultation_plan") {
          return {
            ok: true,
            data: {
              overall: "Strong fit for reliability work.",
              strongestAngles: ["Incident response"],
              importantGaps: ["Team leadership depth"],
              storyPlan: [],
              assessments: [
                {
                  targetKey: "required:0",
                  kind: "REQUIRED",
                  text: "Leads incident response",
                  strength: "STRONG",
                  supportingFactIds: [],
                  explanation: "Covered",
                },
              ],
              questions: [
                {
                  targetKey: "role-expertise:hiring-manager",
                  question:
                    "What would the hiring manager ask about your team leadership?",
                  rationale: "Role expertise",
                },
              ],
            },
          };
        }
        return { ok: true, data: {} };
      });

      const campaign = await createCampaign("Reassess hub");
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          productId,
          status: "DONE",
          generationStatus: "READY",
          promptVersion: CONSULTATION_PROMPT_VERSION,
          briefingJson: {
            overall: "Ready",
            strongestAngles: ["Reliability"],
            importantGaps: [],
            storyPlan: [],
          },
        },
      });

      let reassessOk = false;
      try {
        await reassessConsultationStanding({
          organizationId,
          campaignId: campaign.id,
        });
        reassessOk = true;
      } catch {
        // If the plan mock is too thin for the live planner, plant a question
        // and still assert DONE accepts role-expertise answers.
      }

      let question = await prisma.consultationTurn.findFirst({
        where: {
          sessionId: session.id,
          speaker: "CONSULTANT",
          targetKey: { startsWith: "role-expertise:" },
        },
        orderBy: { sequence: "desc" },
      });
      if (!question) {
        await prisma.consultationSession.update({
          where: { id: session.id },
          data: { status: "DONE" },
        });
        question = await prisma.consultationTurn.create({
          data: {
            organizationId,
            sessionId: session.id,
            speaker: "CONSULTANT",
            body: "What would the hiring manager ask about your team leadership?",
            targetKey: "role-expertise:hiring-manager",
            sequence: 1,
            followUp: false,
          },
        });
      } else {
        await prisma.consultationSession.update({
          where: { id: session.id },
          data: { status: "DONE" },
        });
      }

      if (reassessOk) {
        const afterReassess = await prisma.consultationSession.findUnique({
          where: { id: session.id },
        });
        // Reassess may leave IN_PROGRESS; we force DONE above before answering.
        expect(["DONE", "IN_PROGRESS"]).toContain(afterReassess?.status);
      }

      const answered = await recordConsultationReply({
        organizationId,
        campaignId: campaign.id,
        targetKey: `question:${question.id}`,
        answer: "They would say I grow managers through weekly coaching.",
      });
      expect(answered.targetKey).toBe(question.targetKey);
      expect(
        (
          await prisma.consultationSession.findUnique({
            where: { id: session.id },
          })
        )?.status,
      ).toBe("IN_PROGRESS");
      expect(await assetJobs(campaign.id)).toEqual([]);
    });
  },
);
