/**
 * Part D: ignore → worker planning / continue / learnings reassess never re-asks
 * the ignored question or a near-duplicate; Ignored reopen restores answerability.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";
import {
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import {
  askedQuestionsFromTurns,
  planQuestionRound,
  questionDuplicatesAsked,
} from "@/lib/consultation/questions";
import {
  consultationQuestionAcceptsReply,
  isIgnoredSeekerTurn,
  isTargetCurrentlyIgnored,
} from "@/lib/consultation/qa-view";

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

const IGNORED_QUESTION =
  "How do you run a weekly forecast when several deals compete for attention?";
const NEAR_DUP_QUESTION =
  "How do you run a weekly forecast when several deals compete for attention and capacity?";
const OTHER_QUESTION =
  "At Northwind, how did you decide which enterprise account to pursue first?";

describe("Harper ignore askedAndSkipped gap (source)", () => {
  it("askedAndSkipped prefers isIgnoredSeekerTurn so ignore cannot miss skippedKeys", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const fn = service.slice(
      service.indexOf("function askedAndSkipped"),
      service.indexOf("function resolveConsultationTargets"),
    );
    expect(fn).toContain("isIgnoredSeekerTurn");
    expect(fn).toContain("skippedKeys.add");
  });

  it("planQuestionRound drops ignored target keys and near-duplicates", () => {
    const asked = askedQuestionsFromTurns([
      {
        id: "q1",
        speaker: "CONSULTANT",
        body: IGNORED_QUESTION,
        targetKey: "required:forecast",
        followUp: false,
        skipped: false,
      },
      {
        id: "s1",
        speaker: "SEEKER",
        body: "",
        targetKey: "required:forecast",
        followUp: false,
        skipped: false,
        analysisJson: { ignored: true, replyToTurnId: "q1" },
      },
    ]);
    expect(asked[0]?.ignored).toBe(true);
    expect(questionDuplicatesAsked(NEAR_DUP_QUESTION, asked)).toBe(true);
    const planned = planQuestionRound({
      assessments: [
        {
          key: "required:forecast",
          kind: "REQUIRED",
          text: "Run a weekly forecast",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "ACKNOWLEDGE",
          explanation: "Missing.",
          strategyText: "Ask.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
        {
          key: "required:channel",
          kind: "REQUIRED",
          text: "Build a partner channel",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "ACKNOWLEDGE",
          explanation: "Missing.",
          strategyText: "Ask.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
      ],
      modelQuestions: [
        {
          targetKey: "required:forecast",
          text: NEAR_DUP_QUESTION,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Needs forecast discipline.",
          interviewTypeTag: "focused_competency",
        },
        {
          targetKey: "required:channel",
          text: OTHER_QUESTION,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Needs channel judgment.",
          interviewTypeTag: "focused_competency",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(["required:forecast"]),
      skippedKeys: new Set(["required:forecast"]),
      includeChronology: false,
      chronologyAsked: false,
      askedQuestions: asked,
    });
    expect(planned.questions.every((q) => q.targetKey !== "required:forecast")).toBe(
      true,
    );
    expect(
      planned.questions.every((q) => !questionDuplicatesAsked(q.text, asked)),
    ).toBe(true);
  });
});

describe.skipIf(!hasTestDatabase())(
  "Harper ignore through database and worker path",
  // Multi-step worker path against real Postgres; default 5s fails under parallel suite load.
  { timeout: 60_000 },
  () => {
    const suffix = `ign-e2e-${Date.now().toString(36)}`;
    let prisma: import("@prisma/client").PrismaClient;
    let organizationId = "";
    let userId = "";
    let productId = "";
    let icpId = "";
    let campaignId = "";
    let sessionId = "";
    let questionTurnId = "";
    const profile = fixtureAlexChenProfile();

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Ignore worker ${suffix}`,
          slug: `ignore-worker-${suffix}`,
        },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `ignore-worker-${suffix}@example.test`,
          emailNormalized: `ignore-worker-${suffix}@example.test`,
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `[TEST] Product ${suffix}`,
          profileJson: profile,
        },
      });
      productId = product.id;
      const icp = await prisma.icp.create({
        data: {
          organizationId,
          productId,
          name: `[TEST] ICP ${suffix}`,
        },
      });
      icpId = icp.id;
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `[TEST] Ignore worker ${suffix}`,
          productId,
          icpId,
          whyThisCompany: "The warehouse robotics mission matches my reliability work.",
        },
      });
      campaignId = campaign.id;
      const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId,
          rawText: NORMAL_JOB_POSTING,
          title: parsed.title,
          companyName: parsed.companyName,
          seniority: parsed.seniority,
          reportingLine: parsed.reportingLine,
          responsibilities: parsed.responsibilities,
          requiredItems: parsed.requiredItems,
          preferredItems: parsed.preferredItems,
          scorecardJson: parsed.scorecard,
          employerDisposition: "IDENTIFIED",
        },
      });
      await prisma.persona.create({
        data: {
          organizationId,
          productId,
          campaignId,
          name: "Hiring Manager",
          targetTitles: ["Director of Engineering"],
          whyThisPersonaMatters: "Owns the role and its hiring decision.",
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

    beforeEach(async () => {
      generateStructured.mockReset();
      isConsultationAiConfigured.mockReturnValue(true);
      await prisma.consultationSession.deleteMany({ where: { campaignId } });
      await prisma.applicationJob.deleteMany({ where: { campaignId } });

      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId,
          productId,
          status: "IN_PROGRESS",
          generationStatus: "READY",
          promptVersion: "test",
          briefingJson: {
            overall: "Ready.",
            strongestAngles: [],
            importantGaps: [],
            storyPlan: [],
          },
        },
      });
      sessionId = session.id;
      await prisma.consultationAssessment.createMany({
        data: [
          {
            organizationId,
            sessionId,
            targetKey: "required:forecast",
            kind: "REQUIRED",
            text: "Run a weekly forecast",
            strength: "NONE",
            supportingFactIds: [],
          },
          {
            organizationId,
            sessionId,
            targetKey: "required:channel",
            kind: "REQUIRED",
            text: "Build a partner channel",
            strength: "NONE",
            supportingFactIds: [],
          },
        ],
      });
      const question = await prisma.consultationTurn.create({
        data: {
          organizationId,
          sessionId,
          sequence: 1,
          speaker: "CONSULTANT",
          body: IGNORED_QUESTION,
          targetKey: "required:forecast",
          followUp: false,
        },
      });
      questionTurnId = question.id;

      generateStructured.mockImplementation(async (request: { schemaName: string }) => {
        if (
          request.schemaName === "consultation_plan" ||
          request.schemaName === "consultation_plan_decision" ||
          request.schemaName === "consultation_plan_writing"
        ) {
          const plan = {
              commentary: "Keep probing gaps.",
              briefing: {
                overall: "Forecast remains open unless ignored.",
                strongestAngles: ["Reliability ownership", "Measured outcomes"],
                importantGaps: ["Forecast", "Channel"],
                storyPlan: [],
              },
              closingNote: null,
              assessments: [
                {
                  targetKey: "required:forecast",
                  strength: "NONE",
                  supportingFactIds: [],
                  relevantRoleIds: [],
                  explanation: "Still open in the model view.",
                  strategyMode: "ACKNOWLEDGE",
                  strategy: "Ask about forecast discipline.",
                },
                {
                  targetKey: "required:channel",
                  strength: "NONE",
                  supportingFactIds: [],
                  relevantRoleIds: [],
                  explanation: "Channel evidence is missing.",
                  strategyMode: "ACKNOWLEDGE",
                  strategy: "Ask about channel judgment.",
                },
              ],
              questions: [
                {
                  targetKey: "required:forecast",
                  text: NEAR_DUP_QUESTION,
                  requirementInterpretation: "Forecast discipline",
                  hiringTeamRoleId: "hiring-manager",
                  whoCaresNote: "Needs forecast proof.",
                  interviewTypeTag: "focused_competency",
                },
                {
                  targetKey: "required:channel",
                  text: OTHER_QUESTION,
                  requirementInterpretation: "Channel judgment",
                  hiringTeamRoleId: "hiring-manager",
                  whoCaresNote: "Needs channel proof.",
                  interviewTypeTag: "focused_competency",
                },
              ],
          };
          if (request.schemaName === "consultation_plan_decision") {
            return {
              data: {
                assessments: plan.assessments.map((assessment) => ({
                  targetKey: assessment.targetKey,
                  strength: assessment.strength,
                  strategyMode: assessment.strategyMode,
                })),
                questions: plan.questions.map((question) => ({
                  targetKey: question.targetKey,
                  text: question.text,
                  hiringTeamRoleId: question.hiringTeamRoleId,
                  interviewTypeTag: question.interviewTypeTag,
                })),
              },
            };
          }
          if (request.schemaName === "consultation_plan_writing") {
            return {
              data: {
                overall: plan.briefing.overall,
                strongestAngles: plan.briefing.strongestAngles,
                importantGaps: plan.briefing.importantGaps,
                commentary: plan.commentary,
                closingNote: plan.closingNote,
                assessments: plan.assessments.map((assessment) => ({
                  targetKey: assessment.targetKey,
                  supportingFactIds: assessment.supportingFactIds,
                  relevantRoleIds: assessment.relevantRoleIds,
                  explanation: assessment.explanation,
                  strategy: assessment.strategy,
                })),
                questions: plan.questions.map((question) => ({
                  targetKey: question.targetKey,
                  whoCaresNote: question.whoCaresNote,
                  requirementInterpretation: question.requirementInterpretation,
                })),
              },
            };
          }
          return { data: plan };
        }
        if (request.schemaName === "consultation_extract") {
          return {
            data: {
              replyType: "answer",
              revisedQuestion: null,
              facts: [],
              story: {
                situation: "Competing deals",
                task: "Pick one",
                action: "Ranked by margin",
                result: "Hit quota by 12%",
              },
              demonstratedTargets: [
                {
                  targetKey: "required:forecast",
                  explanation: "Weekly ranking covered forecast discipline.",
                },
              ],
              missingStarElements: [],
              coaching: null,
              followUpQuestion: null,
              gapDecision: "evidence",
              companyMotivation: null,
            },
          };
        }
        if (request.schemaName === "consultation_polish") {
          return {
            data: {
              answerFramework: "STAR",
              interviewAnswer: null,
              challenge: null,
              situation: "Competing deals needed a weekly call.",
              task: "Pick which account to pursue.",
              action: "I ranked them by margin and capacity each Monday.",
              result: "We hit quota and cut slipped deals by 12%.",
              resumeBullet: null,
              strengtheningNote: null,
            },
          };
        }
        throw new Error(`Unexpected schema ${request.schemaName}`);
      });
    });

    async function runConsultationWorker(operations: string[]) {
      const { enqueueApplicationJob } = await import(
        "@/lib/application-jobs/service"
      );
      const { processApplicationJob } = await import(
        "@/lib/application-jobs/process"
      );
      const job = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "CONSULTATION",
        payload: { operations },
        initiatedByUserId: userId,
      });
      await prisma.applicationJob.update({
        where: { id: job.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(),
          workerHeartbeatAt: new Date(),
        },
      });
      const result = await processApplicationJob(job.id);
      expect(result.ok).toBe(true);
    }

    function assertIgnoredNotReasked(
      turns: Array<{ speaker: string; body: string; targetKey: string | null }>,
    ) {
      const afterIgnore = turns.filter(
        (turn) => turn.speaker === "CONSULTANT" && turn.body !== IGNORED_QUESTION,
      );
      expect(
        afterIgnore.some((turn) => turn.targetKey === "required:forecast"),
      ).toBe(false);
      expect(
        afterIgnore.some((turn) =>
          questionDuplicatesAsked(turn.body, [
            {
              text: IGNORED_QUESTION,
              answered: false,
              ignored: true,
              targetKey: "required:forecast",
              followUp: false,
            },
          ]),
        ),
      ).toBe(false);
    }

    it("ignore blocks continue and learnings reassess re-asks; reopen restores answer", async () => {
      const {
        ignoreConsultationQuestion,
        reopenIgnoredConsultationTarget,
        answerConsultationQuestion,
      } = await import("@/lib/consultation/service");

      await ignoreConsultationQuestion({
        organizationId,
        campaignId,
        targetKey: `question:${questionTurnId}`,
      });

      const afterIgnore = await prisma.consultationTurn.findMany({
        where: { sessionId },
        orderBy: { sequence: "asc" },
      });
      expect(
        afterIgnore.some(
          (turn) =>
            isIgnoredSeekerTurn(turn) && turn.targetKey === "required:forecast",
        ),
      ).toBe(true);
      expect(isTargetCurrentlyIgnored(afterIgnore, "required:forecast")).toBe(true);

      await runConsultationWorker(["continue"]);
      let turns = await prisma.consultationTurn.findMany({
        where: { sessionId, speaker: "CONSULTANT" },
        orderBy: { sequence: "asc" },
      });
      assertIgnoredNotReasked(turns);

      await runConsultationWorker(["reassess"]);
      turns = await prisma.consultationTurn.findMany({
        where: { sessionId, speaker: "CONSULTANT" },
        orderBy: { sequence: "asc" },
      });
      assertIgnoredNotReasked(turns);

      // Drift shape: ignored:true without skipped:true must still cover the gap.
      await prisma.consultationTurn.create({
        data: {
          organizationId,
          sessionId,
          sequence: 50,
          speaker: "SEEKER",
          body: "",
          targetKey: "required:forecast",
          skipped: false,
          seekerAuthored: true,
          analysisJson: {
            status: "READY",
            ignored: true,
            replyToTurnId: questionTurnId,
          },
        },
      });
      await runConsultationWorker(["continue"]);
      turns = await prisma.consultationTurn.findMany({
        where: { sessionId, speaker: "CONSULTANT" },
        orderBy: { sequence: "asc" },
      });
      assertIgnoredNotReasked(turns);

      await reopenIgnoredConsultationTarget({
        organizationId,
        campaignId,
        targetKey: `question:${questionTurnId}`,
      });
      const afterReopen = await prisma.consultationTurn.findMany({
        where: { sessionId },
        orderBy: { sequence: "asc" },
      });
      expect(isTargetCurrentlyIgnored(afterReopen, "required:forecast")).toBe(false);

      const { buildConsultationQaView } = await import(
        "@/lib/consultation/qa-view"
      );
      const view = buildConsultationQaView({
        turns: afterReopen.map((turn) => ({
          id: turn.id,
          speaker: turn.speaker,
          body: turn.body,
          targetKey: turn.targetKey,
          followUp: turn.followUp,
          skipped: turn.skipped,
          sequence: turn.sequence,
          intent: turn.intent,
          analysisJson: turn.analysisJson,
        })),
        statements: [],
      });
      const forecastQ = view.questions.find(
        (item) => item.targetKey === "required:forecast",
      );
      expect(forecastQ).toBeTruthy();
      expect(forecastQ?.ignored).toBe(false);
      expect(consultationQuestionAcceptsReply(forecastQ!)).toBe(true);

      await answerConsultationQuestion({
        organizationId,
        campaignId,
        targetKey: `question:${questionTurnId}`,
        answer:
          "At Northwind I ranked competing deals by margin and capacity each Monday.",
      });
      const answered = await prisma.consultationTurn.findFirst({
        where: {
          sessionId,
          speaker: "SEEKER",
          body: {
            contains: "ranked competing deals",
          },
        },
      });
      expect(answered).not.toBeNull();
      expect(isIgnoredSeekerTurn(answered!)).toBe(false);
    });
  },
);
