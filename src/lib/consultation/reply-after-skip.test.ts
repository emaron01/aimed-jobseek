import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConsultationSection } from "@/components/ConsultationSection";
import { consultationConversationCopy } from "@/lib/product-config";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";

const generateStructured = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured: () => true,
    isConsultationReplyAiConfigured: () => true,
    getConsultationAiProvider: () => ({ generateStructured }),
    getConsultationReplyAiProvider: () => ({ generateStructured }),
    createAiProvider: () => ({ generateStructured }),
  };
});

import {
  continueConsultationPlanning,
  processConsultationReply,
  recordConsultationAnswerEdit,
  recordConsultationReply,
  skipConsultationQuestion,
} from "@/lib/consultation/service";
import { generateRoleExpertiseWithModel } from "@/lib/consultation/role-expertise";

const QUESTION =
  "How did you scale the team or its coverage model to support separate new-logo and expansion motions?";
const REPLY =
  "At Login VSI I split coverage so one pod owned new logos and another owned expansion.";
const BEST_PRACTICE = "What do you look for in a top performing sales rep?";
const EMPTY_COPY =
  "Best-practice questions will appear here when Harper prepares them.";

function callsFor(schemaName: string): number {
  return generateStructured.mock.calls.filter(
    (call) =>
      (call[0] as { schemaName?: string } | undefined)?.schemaName === schemaName,
  ).length;
}

describe("reply after skip", () => {
  it("keeps typed text when a reply fails and does not fill from a page", () => {
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    const replyForm = thread.slice(
      thread.indexOf("function QuestionReplyForm"),
      thread.indexOf("function QuestionPrintView"),
    );
    const submitStart = replyForm.indexOf("onSubmitStart");
    const onSuccess = replyForm.indexOf("onSuccess");
    expect(onSuccess).toBeGreaterThan(submitStart);
    expect(replyForm.slice(submitStart, onSuccess)).not.toContain("draft.clear");
    expect(replyForm.slice(onSuccess)).toContain("draft.clear()");
    const editForm = thread.slice(
      thread.indexOf("function SeekerAnswerEntry"),
      thread.indexOf("function SeekerRepliesSection"),
    );
    expect(editForm).toContain("defaultValue={answer.body}");
    expect(editForm).toContain('submitLabel={consultationConversationCopy.saveAnswer}');
    expect(editForm).not.toContain("draft.clear");

    for (const path of [
      "src/components/ConsultationStanding.tsx",
      "src/components/ConsultationSection.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toContain("generateRoleExpertiseWithModel");
      expect(text).not.toContain("recoverBestPracticeFillIfEmpty");
      expect(text).not.toContain("enqueueApplicationJob");
    }
  });
});

describe.skipIf(!hasTestDatabase())(
  "reply after skip (database)",
  { timeout: 60_000 },
  () => {
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    let organizationId = "";
    let userId = "";
    let productId = "";
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
        data: {
          name: `[TEST] Reply after skip ${suffix}`,
          slug: `reply-after-skip-${suffix}`,
        },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `reply-after-skip-${suffix}@example.test`,
          emailNormalized: `reply-after-skip-${suffix}@example.test`,
          firstName: "Alex",
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Profile ${suffix}`,
          profileJson: {
            ...emptyCandidateProfile(),
            facts: [{ id: "fact-1", text: "Led enterprise sales teams." }],
          },
        },
      });
      productId = product.id;
      const icp = await prisma.icp.create({
        data: { organizationId, productId, name: `Employer ${suffix}` },
      });
      icpId = icp.id;
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
    });

    async function seedCampaign(name: string): Promise<string> {
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `${name} ${suffix}`,
          productId,
          icpId,
          whyThisCompany: "The sales motion matches teams I have led.",
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          rawText: "Enterprise sales leader.",
          title: "Enterprise sales leader",
          companyName: "Northwind",
          requiredItems: [],
          preferredItems: [],
          responsibilities: [],
          scorecardJson: {},
        },
      });
      return campaign.id;
    }

    async function seedSkippedSession(input: {
      campaignId: string;
      status?: "IN_PROGRESS" | "DONE";
      questionCount?: number;
    }) {
      const questionCount = input.questionCount ?? 2;
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: input.campaignId,
          productId,
          status: "IN_PROGRESS",
          generationStatus: "READY",
          promptVersion: "37",
        },
      });
      const questions = [];
      for (let index = 0; index < questionCount; index += 1) {
        const question = await prisma.consultationTurn.create({
          data: {
            organizationId,
            sessionId: session.id,
            sequence: index + 1,
            speaker: "CONSULTANT",
            body: index === 0 ? QUESTION : `${QUESTION} (${index + 1})`,
            targetKey: `required:${index}`,
            followUp: false,
          },
        });
        questions.push(question);
        await prisma.consultationAssessment.create({
          data: {
            organizationId,
            sessionId: session.id,
            targetKey: `required:${index}`,
            kind: "REQUIRED",
            text: `Requirement ${index}`,
            strength: "NONE",
            supportingFactIds: [],
          },
        });
      }
      for (const question of questions) {
        await skipConsultationQuestion({
          organizationId,
          campaignId: input.campaignId,
          targetKey: `question:${question.id}`,
        });
      }
      if (input.status === "DONE") {
        await prisma.consultationSession.update({
          where: { id: session.id },
          data: { status: "DONE" },
        });
      }
      return session.id;
    }

    it("saves and processes a reply to a skipped question after every gap is skipped", async () => {
      generateStructured.mockImplementation(async (request: { schemaName: string }) => {
        if (request.schemaName === "consultation_extract") {
          return {
            data: {
              replyType: "answer",
              facts: [{ text: REPLY }],
              story: {
                situation: "At Login VSI new-logo and expansion work were mixed.",
                task: "I needed separate coverage for each motion.",
                action: "I split the team into a new-logo pod and an expansion pod.",
                result: "Each motion had an owner and the pipeline stayed current.",
              },
              demonstratedTargets: [],
              missingStarElements: [],
              revisedQuestion: null,
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
              answerFramework: "CAR",
              interviewAnswer: null,
              challenge: "At Login VSI new-logo and expansion work were mixed.",
              situation: null,
              task: null,
              action: "I split the team into a new-logo pod and an expansion pod.",
              result: "Each motion had an owner and the pipeline stayed current.",
              resumeBullet: "Split Login VSI coverage into new-logo and expansion pods.",
              strengtheningNote: null,
            },
          };
        }
        throw new Error(`Unexpected schema ${request.schemaName}`);
      });

      const campaignId = await seedCampaign("Skip all");
      const sessionId = await seedSkippedSession({ campaignId });
      const afterSkips = await prisma.consultationSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const seekerTurns = await prisma.consultationTurn.findMany({
        where: { sessionId, speaker: "SEEKER" },
        orderBy: { sequence: "asc" },
      });
      expect(seekerTurns).toHaveLength(2);
      expect(seekerTurns.every((turn) => turn.skipped && turn.body === "")).toBe(true);
      expect(afterSkips.status).toBe("IN_PROGRESS");

      await prisma.consultationSession.update({
        where: { id: sessionId },
        data: { status: "DONE" },
      });
      const skipped = seekerTurns[0]!;
      await expect(
        recordConsultationAnswerEdit({
          organizationId,
          campaignId,
          turnId: "missing-turn",
          answer: REPLY,
        }),
      ).rejects.toThrow(consultationConversationCopy.replyFailed);
      const unchanged = await prisma.consultationTurn.findUniqueOrThrow({
        where: { id: skipped.id },
      });
      expect(unchanged.body).toBe("");
      expect(unchanged.skipped).toBe(true);

      const recorded = await recordConsultationAnswerEdit({
        organizationId,
        campaignId,
        turnId: skipped.id,
        answer: `  ${REPLY}  `,
      });
      const saved = await prisma.consultationTurn.findUniqueOrThrow({
        where: { id: recorded.turnId },
      });
      expect(saved.body).toBe(REPLY);
      expect(saved.skipped).toBe(false);
      expect(
        (
          await prisma.consultationSession.findUniqueOrThrow({
            where: { id: sessionId },
          })
        ).status,
      ).toBe("IN_PROGRESS");

      await processConsultationReply({
        organizationId,
        campaignId,
        sessionId,
        turnId: recorded.turnId,
        questionTurnId: recorded.questionTurnId,
        targetKey: recorded.targetKey,
        answer: REPLY,
      });
      const statement = await prisma.consultationStatement.findFirst({
        where: { sessionId, turnId: recorded.turnId, kind: "INTERVIEW_ANSWER" },
      });
      expect(statement?.content).toMatch(/new-logo pod/i);
      expect(callsFor("consultation_extract")).toBeGreaterThan(0);
      expect(callsFor("consultation_polish")).toBeGreaterThan(0);
    });

    it("also accepts a normal reply to a skipped question", async () => {
      const campaignId = await seedCampaign("Compose");
      const sessionId = await seedSkippedSession({
        campaignId,
        status: "DONE",
      });
      const question = await prisma.consultationTurn.findFirstOrThrow({
        where: { sessionId, speaker: "CONSULTANT" },
        orderBy: { sequence: "asc" },
      });
      const recorded = await recordConsultationReply({
        organizationId,
        campaignId,
        targetKey: `question:${question.id}`,
        answer: REPLY,
      });
      const saved = await prisma.consultationTurn.findUniqueOrThrow({
        where: { id: recorded.turnId },
      });
      expect(saved.body).toBe(REPLY);
      expect(saved.skipped).toBe(false);
      expect(
        (
          await prisma.consultationSession.findUniqueOrThrow({
            where: { id: sessionId },
          })
        ).status,
      ).toBe("IN_PROGRESS");
    });

    it("fills best-practice questions once on the next Harper action after a closed session", async () => {
      generateStructured.mockReset();
      generateStructured.mockImplementation(async (request: { schemaName: string }) => {
        if (request.schemaName === "role_expertise_questions") {
          return {
            data: {
              questions: [
                { text: BEST_PRACTICE, interviewTypeTag: "focused_competency" },
              ],
            },
          };
        }
        if (request.schemaName === "role_expertise_answers") {
          return {
            data: {
              answers: [
                {
                  text: BEST_PRACTICE,
                  answerFramework: "CAR",
                  challenge: null,
                  situation: null,
                  task: null,
                  action: "I look for reps who prepare before the call.",
                  result: "",
                  followUpQuestion: null,
                },
              ],
            },
          };
        }
        throw new Error(`Unexpected schema ${request.schemaName}`);
      });

      const campaignId = await seedCampaign("Recover");
      const sessionId = await seedSkippedSession({
        campaignId,
        status: "DONE",
        questionCount: 19,
      });
      const before = await generateRoleExpertiseWithModel({
        organizationId,
        campaignId,
        job: {
          title: "Enterprise sales leader",
          companyName: "Northwind",
          seniority: null,
          location: null,
          workArrangement: null,
          requiredItems: [],
          preferredItems: [],
          responsibilities: [],
          scorecardJson: {},
        },
        minCount: 1,
        maxCount: 2,
        askedQuestions: [],
        chronologyAlreadyAsked: true,
        recentRoles: [],
        careerStage: "early_career",
        profileItems: [{ kind: "FACT", text: "Led enterprise sales teams." }],
      });
      expect(before.ok).toBe(true);
      expect(callsFor("role_expertise_questions")).toBe(1);
      const storedBefore = await prisma.consultationTurn.count({
        where: { sessionId, targetKey: { startsWith: "role-expertise:" } },
      });
      expect(storedBefore).toBe(0);

      const questionsBeforeContinue = callsFor("role_expertise_questions");
      await continueConsultationPlanning({ organizationId, campaignId });
      expect(callsFor("role_expertise_questions")).toBe(questionsBeforeContinue);
      expect(callsFor("role_expertise_answers")).toBeGreaterThan(0);
      const stored = await prisma.consultationTurn.findFirst({
        where: {
          sessionId,
          speaker: "CONSULTANT",
          targetKey: { startsWith: "role-expertise:" },
        },
      });
      expect(stored?.body).toBe(BEST_PRACTICE);

      const questionsAfter = callsFor("role_expertise_questions");
      const answersAfter = callsFor("role_expertise_answers");
      await continueConsultationPlanning({ organizationId, campaignId });
      expect(callsFor("role_expertise_questions")).toBe(questionsAfter);
      expect(callsFor("role_expertise_answers")).toBe(answersAfter);

      const html = renderToStaticMarkup(
        await ConsultationSection({
          campaignId,
          organizationId,
          canEdit: false,
          jobs: [],
        }),
      );
      expect(html).toContain(BEST_PRACTICE);
      expect(html).not.toContain(EMPTY_COPY);
      expect(callsFor("role_expertise_questions")).toBe(questionsAfter);
      expect(callsFor("role_expertise_answers")).toBe(answersAfter);
    });
  },
);
