import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConsultationSection } from "@/components/ConsultationSection";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import { consultationConfig } from "@/lib/product-config";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";

const questionsGenerate = vi.hoisted(() => vi.fn());
const answersGenerate = vi.hoisted(() => vi.fn());
const enqueueApplicationJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured: () => true,
    isConsultationReplyAiConfigured: () => true,
    getConsultationAiProvider: () => ({ generateStructured: questionsGenerate }),
    getConsultationReplyAiProvider: () => ({ generateStructured: answersGenerate }),
    createAiProvider: () => ({ generateStructured: questionsGenerate }),
  };
});

vi.mock("@/lib/application-jobs/service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/application-jobs/service")>();
  return { ...actual, enqueueApplicationJob };
});

import {
  generateRoleExpertiseWithModel,
  roleExpertiseJobFingerprint,
  storeRoleExpertiseQuestions,
} from "@/lib/consultation/role-expertise";
import { startConsultation } from "@/lib/consultation/service";

const POV = "What do you look for in a top performing sales rep?";
const STORY = "Walk me through a time you rebuilt a weekly forecast.";
const FAILED = "What is your philosophy on discounting to win a deal?";
const FACT = "Closed 14 deals at Northwind";
const CLOSEST =
  "I rebuilt the review around the commits the team had already made.";
const POV_DRAFT = "I look for reps who prepare before the call.";
const STORY_RESULT = "The team used the forecast I stood behind.";
const EMPTY_COPY =
  "Best-practice questions will appear here when Harper prepares them.";

const JOB = {
  title: "Forecast analyst",
  companyName: "Northwind",
  seniority: null,
  location: null,
  workArrangement: null,
  requiredItems: [] as string[],
  preferredItems: [] as string[],
  responsibilities: [] as string[],
  scorecardJson: {},
};

function car(text: string, parts: {
  challenge?: string | null;
  action?: string;
  result?: string;
}) {
  return {
    text,
    answerFramework: "CAR" as const,
    challenge: parts.challenge ?? null,
    situation: null,
    task: null,
    action: parts.action ?? "",
    result: parts.result ?? "",
    followUpQuestion: null,
  };
}

function callsFor(schemaName: string): number {
  return [...questionsGenerate.mock.calls, ...answersGenerate.mock.calls].filter(
    (call) =>
      (call[0] as { schemaName?: string } | undefined)?.schemaName === schemaName,
  ).length;
}

describe("best-practice questions stay when answers fail", () => {
  it("does not run the fill from a page", () => {
    for (const path of [
      "src/components/ConsultationStanding.tsx",
      "src/components/ConsultationSection.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toContain("generateRoleExpertiseWithModel");
      expect(text).not.toContain("runPaidStructuredCall");
      expect(text).not.toContain("enqueueApplicationJob");
    }
  });
});

describe.skipIf(!hasTestDatabase())(
  "best-practice fill recovery",
  { timeout: 60_000 },
  () => {
    const suffix = Date.now().toString(36);
    let organizationId = "";
    let userId = "";
    let productId = "";
    let povCampaignId = "";
    let failCampaignId = "";
    let storyCampaignId = "";
    let recoverCampaignId = "";
    let hiringRoleId = "";
    let icpId = "";

    beforeAll(async () => {
      process.env.CONSULTATION_AI_PROVIDER = "openai-responses";
      process.env.CONSULTATION_AI_MODEL = "gpt-5.6-terra";
      process.env.CONSULTATION_AI_MODEL_URL = "https://api.openai.com/v1/responses";
      process.env.CONSULTATION_AI_API_KEY = "test-key";
      process.env.CONSULTATION_REPLY_AI_PROVIDER = "openai-responses";
      process.env.CONSULTATION_REPLY_AI_MODEL = "gpt-5.6-luna";
      process.env.CONSULTATION_REPLY_AI_MODEL_URL = "https://api.openai.com/v1/responses";
      process.env.CONSULTATION_REPLY_AI_API_KEY = "test-key";
      delete process.env.ROLE_EXPERTISE_AI_MODEL;
      const org = await prisma.organization.create({
        data: { name: `[TEST] Best practice ${suffix}`, slug: `best-practice-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `best-practice-${suffix}@example.com`,
          emailNormalized: `best-practice-${suffix}@example.com`,
          firstName: "Alex",
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Profile ${suffix}`,
          profileJson: emptyCandidateProfile(),
        },
      });
      productId = product.id;
      const icp = await prisma.icp.create({
        data: { organizationId, productId, name: `Employer ${suffix}` },
      });
      icpId = icp.id;
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId,
          name: "Hiring Manager",
          whyThisPersonaMatters: "Owns the hiring decision.",
        },
      });
      hiringRoleId = persona.id;
      povCampaignId = await seedCampaign(icp.id, "POV");
      failCampaignId = await seedCampaign(icp.id, "Fail");
      storyCampaignId = await seedCampaign(icp.id, "Story");
      recoverCampaignId = await seedCampaign(icp.id, "Recover");
      await prisma.persona.update({
        where: { id: hiringRoleId },
        data: { campaignId: recoverCampaignId },
      });
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      }
    });

    async function seedCampaign(icpId: string, name: string): Promise<string> {
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `${name} ${suffix}`,
          productId,
          icpId,
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          rawText: "Forecast analyst.",
          title: JOB.title,
          companyName: JOB.companyName,
          requiredItems: [],
          preferredItems: [],
          responsibilities: [],
          scorecardJson: {},
        },
      });
      return campaign.id;
    }

    function input(campaignId: string) {
      return {
        organizationId,
        campaignId,
        job: JOB,
        minCount: 1,
        maxCount: 2,
        askedQuestions: [],
        chronologyAlreadyAsked: true,
        recentRoles: [],
        careerStage: "early_career" as const,
        profileItems: [{ kind: "FACT", text: FACT }],
      };
    }

    it("stores and shows a point-of-view draft without an outcome, then skips an identical call", async () => {
      questionsGenerate.mockReset();
      answersGenerate.mockReset();
      questionsGenerate.mockResolvedValue({
        data: { questions: [{ text: POV, interviewTypeTag: "focused_competency" }] },
      });
      answersGenerate.mockResolvedValue({
        data: {
          answers: [car(POV, { action: POV_DRAFT, result: "" })],
        },
      });
      const first = await generateRoleExpertiseWithModel(input(povCampaignId));
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.questions).toHaveLength(1);
      expect(first.questions[0]?.content).toContain("prepare before the call");
      expect(first.questions[0]?.grounding.result.trim()).toBe("");
      expect(callsFor("role_expertise_questions")).toBe(1);
      expect(callsFor("role_expertise_answers")).toBe(1);

      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: povCampaignId,
          productId,
          promptVersion: "37",
        },
      });
      await storeRoleExpertiseQuestions({
        organizationId,
        sessionId: session.id,
        questions: first.questions,
      });
      questionsGenerate.mockClear();
      answersGenerate.mockClear();
      const again = await generateRoleExpertiseWithModel(input(povCampaignId));
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.questionsSkipped).toBe(true);
      expect(again.answersSkipped).toBe(true);
      expect(questionsGenerate).not.toHaveBeenCalled();
      expect(answersGenerate).not.toHaveBeenCalled();

      enqueueApplicationJob.mockClear();
      const html = renderToStaticMarkup(
        await ConsultationSection({
          campaignId: povCampaignId,
          organizationId,
          canEdit: false,
          jobs: [],
        }),
      );
      expect(html).toContain("top performing sales rep");
      expect(html).toContain("prepare before the call");
      expect(html).not.toContain(EMPTY_COPY);
      expect(questionsGenerate).not.toHaveBeenCalled();
      expect(answersGenerate).not.toHaveBeenCalled();
      expect(enqueueApplicationJob).not.toHaveBeenCalled();
    });

    it("stores and shows the question when every suggested answer fails", async () => {
      questionsGenerate.mockReset();
      answersGenerate.mockReset();
      questionsGenerate.mockResolvedValue({
        data: { questions: [{ text: FAILED, interviewTypeTag: "focused_competency" }] },
      });
      answersGenerate.mockResolvedValue({
        data: { answers: [car(FAILED, { action: FACT, result: "" })] },
      });
      const result = await generateRoleExpertiseWithModel(input(failCampaignId));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(callsFor("role_expertise_answers")).toBe(
        consultationConfig.qualityRegenerationAttempts + 1,
      );
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]?.text).toBe(FAILED);
      expect(result.questions[0]?.content).toContain(FACT);
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: failCampaignId,
          productId,
          promptVersion: "37",
        },
      });
      await storeRoleExpertiseQuestions({
        organizationId,
        sessionId: session.id,
        questions: result.questions,
      });
      const turn = await prisma.consultationTurn.findFirstOrThrow({
        where: { sessionId: session.id, body: FAILED },
        include: { statements: true },
      });
      expect(turn.targetKey?.startsWith("role-expertise:")).toBe(true);
      expect(turn.statements).toHaveLength(1);
      expect(turn.statements[0]?.content).toContain(FACT);
      enqueueApplicationJob.mockClear();
      questionsGenerate.mockClear();
      answersGenerate.mockClear();
      const html = renderToStaticMarkup(
        await ConsultationSection({
          campaignId: failCampaignId,
          organizationId,
          canEdit: false,
          jobs: [],
        }),
      );
      expect(html).toContain("philosophy on discounting");
      expect(html).not.toContain(EMPTY_COPY);
      expect(html).toContain(FACT);
      expect(questionsGenerate).not.toHaveBeenCalled();
      expect(answersGenerate).not.toHaveBeenCalled();
      expect(enqueueApplicationJob).not.toHaveBeenCalled();
    });

    it("keeps story checks and stores the closest real attempt after the retries", async () => {
      questionsGenerate.mockReset();
      answersGenerate.mockReset();
      questionsGenerate.mockResolvedValue({
        data: {
          questions: [
            { text: STORY, interviewTypeTag: "focused_competency" },
            { text: FAILED, interviewTypeTag: "screening" },
          ],
        },
      });
      const storyAttempts = [
        car(STORY, {
          challenge: "The Monday forecast review kept slipping.",
          action: CLOSEST,
          result: "",
        }),
        car(STORY, { action: FACT, result: "" }),
        car(STORY, {
          challenge: "The Monday forecast review kept slipping.",
          action: "I compared the two reports against the shipments already counted.",
          result: STORY_RESULT,
        }),
      ];
      let answerCall = 0;
      answersGenerate.mockImplementation(async () => {
        const story = storyAttempts[Math.min(answerCall, storyAttempts.length - 1)]!;
        answerCall += 1;
        return {
          data: {
            answers: [story, car(FAILED, { action: FACT, result: "" })],
          },
        };
      });
      const result = await generateRoleExpertiseWithModel({
        ...input(storyCampaignId),
        minCount: 2,
        maxCount: 2,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(callsFor("role_expertise_answers")).toBe(
        consultationConfig.qualityRegenerationAttempts + 1,
      );
      const story = result.questions.find((question) => question.text === STORY);
      const failed = result.questions.find((question) => question.text === FAILED);
      expect(story?.content).toContain("forecast I stood behind");
      expect(story?.grounding.result).toContain("forecast I stood behind");
      expect(failed?.content).toContain(FACT);
      expect(story?.content).not.toContain(FACT);
    });

    it("stores a draft for each reported point-of-view and story question", async () => {
      const attract = "What attracts you to CSC's Senior Director of Sales role?";
      const pipeline = "Describe a time when you inherited an unhealthy pipeline?";
      const indicators =
        "Which leading and lagging indicators would you use to inspect the forecast?";
      const campaignId = await seedCampaign(icpId, "Kinds");
      questionsGenerate.mockReset();
      answersGenerate.mockReset();
      questionsGenerate.mockResolvedValue({
        data: {
          questions: [
            { text: attract, interviewTypeTag: "screening" },
            { text: pipeline, interviewTypeTag: "focused_competency" },
            { text: indicators, interviewTypeTag: "focused_competency" },
          ],
        },
      });
      answersGenerate.mockResolvedValue({
        data: {
          answers: [
            car(attract, {
              action: "",
              result:
                "I am drawn to CSC's Senior Director of Sales role because it owns forecast discipline and manager standards.",
            }),
            car(pipeline, {
              action: "",
              result:
                "I inherited an unhealthy pipeline and reset inspection so the forecast became reliable.",
            }),
            car(indicators, {
              action:
                "Leading indicators I would use are activity and pipeline creation, and lagging indicators are win rate and cycle time.",
              result: "",
            }),
          ],
        },
      });
      const result = await generateRoleExpertiseWithModel({
        ...input(campaignId),
        job: {
          ...JOB,
          title: "Senior Director of Sales",
          companyName: "CSC",
        },
        profileItems: [
          { kind: "FACT", text: "CSC" },
          { kind: "FACT", text: "Senior Director of Sales" },
        ],
        minCount: 3,
        maxCount: 3,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const byText = new Map(result.questions.map((question) => [question.text, question.content]));
      expect(byText.get(attract)).toContain("forecast discipline");
      expect(byText.get(pipeline)).toContain("unhealthy pipeline");
      expect(byText.get(indicators)).toContain("Leading indicators");
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId,
          productId,
          promptVersion: "37",
        },
      });
      await storeRoleExpertiseQuestions({
        organizationId,
        sessionId: session.id,
        questions: result.questions,
      });
      const statements = await prisma.consultationStatement.findMany({
        where: { sessionId: session.id, status: "DRAFT" },
      });
      expect(statements).toHaveLength(3);
      expect(statements.map((statement) => statement.content).join(" ")).toContain(
        "forecast discipline",
      );
      expect(statements.map((statement) => statement.content).join(" ")).toContain(
        "unhealthy pipeline",
      );
      expect(statements.map((statement) => statement.content).join(" ")).toContain(
        "Leading indicators",
      );
    });

    it("re-runs a fill that stored nothing on the next Harper round and then makes no paid call", async () => {
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: recoverCampaignId,
          productId,
          status: "IN_PROGRESS",
          generationStatus: "READY",
          promptVersion: "37",
        },
      });
      for (let index = 0; index < 18; index += 1) {
        await prisma.consultationTurn.create({
          data: {
            organizationId,
            sessionId: session.id,
            sequence: index + 1,
            speaker: "CONSULTANT",
            body: `How did the ward ${index + 1} night team cover a sudden absence?`,
            targetKey: `seed-gap-${index + 1}`,
            followUp: false,
          },
        });
      }
      const recoveredQuestion = "What do you look for when a buyer goes quiet?";
      await prisma.paidCallReceipt.create({
        data: {
          organizationId,
          operation: "ROLE_EXPERTISE_QUESTIONS",
          subjectKey: recoverCampaignId,
          inputHash: roleExpertiseJobFingerprint(JOB),
          resultJson: {
            questions: [
              { text: recoveredQuestion, interviewTypeTag: "focused_competency" },
            ],
          },
        },
      });
      questionsGenerate.mockReset();
      answersGenerate.mockReset();
      questionsGenerate.mockImplementation(async (request: { schemaName?: string }) => {
        if (request.schemaName === "consultation_plan_decision") {
          return {
            data: {
              assessments: [
                {
                  targetKey: WHY_THIS_COMPANY_TARGET_KEY,
                  strength: "PARTIAL",
                  strategyMode: "REFRAME_ADJACENT",
                },
              ],
              questions: [
                {
                  targetKey: WHY_THIS_COMPANY_TARGET_KEY,
                  text: "What part of this company's forecasting work do you want?",
                  hiringTeamRoleId: hiringRoleId,
                  interviewTypeTag: "screening",
                },
              ],
            },
          };
        }
        if (request.schemaName === "application_summary_shell") {
          return {
            data: {
              overview: {
                companyBackground: { text: "Northwind builds warehouse tools." },
                jobRequirements: [{ text: "Own the weekly forecast." }],
                whereSeekerShines: [{ text: "You have led a forecast." }],
              },
            },
          };
        }
        throw new Error(`questions provider should not run ${request.schemaName ?? ""}`);
      });
      answersGenerate.mockImplementation(async (request: { schemaName?: string }) => {
        if (request.schemaName === "consultation_plan_writing") {
          return {
            data: {
              overall: "You are ready to talk about the work you have already done.",
              strongestAngles: [
                "You have led delivery.",
                "You have worked with customers.",
              ],
              importantGaps: ["The posting does not name a team size."],
              commentary: "You can speak from the work you have done.",
              closingNote: null,
              assessments: [
                {
                  targetKey: WHY_THIS_COMPANY_TARGET_KEY,
                  supportingFactIds: [],
                  relevantRoleIds: [],
                  explanation: "You can connect the forecast work you already led.",
                  strategy: "Tell that story in your own words.",
                },
              ],
              questions: [
                {
                  targetKey: WHY_THIS_COMPANY_TARGET_KEY,
                  text: "What part of this company's forecasting work do you want?",
                  hiringTeamRoleId: hiringRoleId,
                  interviewTypeTag: "screening",
                  whoCaresNote: "The hiring manager needs to hear why this work matters to you.",
                  requirementInterpretation: null,
                },
              ],
            },
          };
        }
        if (request.schemaName === "role_expertise_answers") {
          return {
            data: {
              answers: [
                car(recoveredQuestion, {
                  action: "I ask what changed for the buyer before I fill the silence.",
                  result: "",
                }),
              ],
            },
          };
        }
        throw new Error(`unexpected answers schema ${request.schemaName ?? ""}`);
      });

      await startConsultation({ organizationId, campaignId: recoverCampaignId });
      expect(callsFor("role_expertise_questions")).toBe(0);
      expect(callsFor("role_expertise_answers")).toBe(1);
      const stored = await prisma.consultationTurn.findFirst({
        where: { sessionId: session.id, body: recoveredQuestion },
        include: { statements: true },
      });
      expect(stored?.targetKey?.startsWith("role-expertise:")).toBe(true);
      expect(stored?.statements[0]?.content).toContain("before I fill the silence");

      enqueueApplicationJob.mockClear();
      const questionCalls = questionsGenerate.mock.calls.length;
      const answerCalls = answersGenerate.mock.calls.length;
      const html = renderToStaticMarkup(
        await ConsultationSection({
          campaignId: recoverCampaignId,
          organizationId,
          canEdit: false,
          jobs: [],
        }),
      );
      expect(html).toContain("buyer goes quiet");
      expect(html).toContain("before I fill the silence");
      expect(html).not.toContain(EMPTY_COPY);
      expect(questionsGenerate.mock.calls.length).toBe(questionCalls);
      expect(answersGenerate.mock.calls.length).toBe(answerCalls);
      expect(enqueueApplicationJob).not.toHaveBeenCalled();

      await startConsultation({ organizationId, campaignId: recoverCampaignId });
      expect(questionsGenerate.mock.calls.length).toBe(questionCalls);
      expect(answersGenerate.mock.calls.length).toBe(answerCalls);
    });
  },
);
