import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { ApplicationOverview } from "@/components/ApplicationOverview";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";

const generateStructured = vi.hoisted(() => vi.fn());
const enqueueApplicationJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured: () => true,
    isConsultationReplyAiConfigured: () => true,
    getConsultationAiProvider: () => ({ generateStructured }),
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

vi.mock("@/lib/application-jobs/service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/application-jobs/service")>();
  return { ...actual, enqueueApplicationJob };
});

vi.mock("@/lib/consultation/role-expertise", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/consultation/role-expertise")>();
  return {
    ...actual,
    generateRoleExpertiseWithModel: vi.fn(async () => ({
      ok: true as const,
      questions: [],
      skipped: true,
      questionsSkipped: true,
      answersSkipped: true,
      keptAfterPartial: null,
    })),
  };
});

import {
  CONSULTATION_PLAN_OPERATION,
  CONSULTATION_PLAN_WRITING_OPERATION,
  planConsultationWithModel,
} from "@/lib/consultation/ai";
import { startConsultation } from "@/lib/consultation/service";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";

const QUESTION =
  "What part of this company's forecasting work do you want to be responsible for?";

const PLAN = {
  commentary: "You can speak from the work you have done.",
  briefing: {
    overall: "You are ready to talk about the work you have already done.",
    strongestAngles: [
      "You have led delivery.",
      "You have worked with customers.",
    ],
    importantGaps: ["The posting does not name a team size."],
    storyPlan: [],
  },
  closingNote: null,
  assessments: [
    {
      targetKey: WHY_THIS_COMPANY_TARGET_KEY,
      strength: "NONE" as const,
      supportingFactIds: [],
      relevantRoleIds: [],
      explanation: "The posting does not say why this company.",
      strategyMode: "ACKNOWLEDGE" as const,
      strategy: "Ask why this company.",
    },
  ],
  questions: [
    {
      targetKey: WHY_THIS_COMPANY_TARGET_KEY,
      text: QUESTION,
      requirementInterpretation: null,
      hiringTeamRoleId: "role_pending",
      whoCaresNote: "The hiring manager needs to hear why this work matters to you.",
      interviewTypeTag: "screening" as const,
    },
  ],
};

function callsFor(schemaName: string): number {
  return generateStructured.mock.calls.filter(
    (call) => call[0]?.schemaName === schemaName,
  ).length;
}

function usage(
  organizationId: string,
  campaignId: string,
  attempt = 1,
): AiCallUsageContext {
  return {
    organizationId,
    campaignId,
    category: "CONSULTATION",
    operation: "CONSULTATION",
    metadata: { step: "plan", attempt },
  };
}

function planInput(input: {
  organizationId: string;
  campaignId: string;
  sessionId: string;
  qualityFeedback?: string[];
  attempt?: number;
}) {
  return {
    targets: [
      {
        key: WHY_THIS_COMPANY_TARGET_KEY,
        kind: "MISSION",
        text: "Why you want to work at this company",
      },
    ],
    profileItems: [],
    careerStage: "early_career" as const,
    recentRoles: [],
    hiringTeam: [],
    seekerStatedFacts: [],
    companyResearch: null,
    askedQuestions: [],
    chronologyRequested: false,
    coveredTargetKeys: [],
    qualityFeedback: input.qualityFeedback ?? [],
    sessionId: input.sessionId,
    usage: usage(input.organizationId, input.campaignId, input.attempt ?? 1),
  };
}

describe("Harper planner page render", () => {
  it("renders the saved next step without a paid call or a job", () => {
    generateStructured.mockClear();
    enqueueApplicationJob.mockClear();
    const html = renderToStaticMarkup(
      createElement(ApplicationOverview, {
        view: {
          campaignId: "camp_render",
          campaignName: "Analyst",
          jobTitle: "Analyst",
          companyName: "Northwind",
          statusLabel: "Not applied",
          statusTone: "attention",
          appliedAt: null,
          nextStepText: "Schedule your initial consultation.",
          nextStepFailed: false,
          fitLabel: null,
          location: null,
          workArrangement: null,
          compensation: null,
          steps: [
            {
              key: "consultation",
              number: 4,
              title: "Consultation",
              href: "/campaigns/camp_render/consultation",
              state: "not_started",
              resultKey: null,
              newLabel: null,
              statusNote: null,
              hasNew: false,
              hasActiveJob: false,
              workDone: false,
              actionLabel: "Answer Harper's questions",
              actionHref: "/campaigns/camp_render/consultation",
              turnCountLabel: null,
              isCurrent: false,
              isPage: false,
            },
          ],
        },
      }),
    );
    expect(html).toContain("Schedule your initial consultation.");
    expect(generateStructured).not.toHaveBeenCalled();
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    for (const path of [
      "src/app/(app)/campaigns/[id]/page.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const page = readFileSync(path, "utf8");
      expect(page).not.toContain("planConsultationWithModel");
      expect(page).not.toContain("writeApplicationNextStep");
      expect(page).not.toContain("runPaidStructuredCall");
      expect(page).not.toContain("enqueueApplicationJob");
    }
  });
});

describe.skipIf(!hasTestDatabase())(
  "Harper planner paid-call gate",
  { timeout: 60_000 },
  () => {
    const suffix = `plan-${Date.now()}`;
    let organizationId = "";
    let userId = "";
    const campaignId = `camp_${suffix}`;
    const sessionId = `sess_${suffix}`;

    beforeAll(async () => {
      process.env.CONSULTATION_AI_PROVIDER = "openai-responses";
      process.env.CONSULTATION_AI_MODEL = "gpt-5.6-terra";
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Planner gate ${suffix}`,
          slug: `planner-gate-${suffix}`,
        },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `planner-gate-${suffix}@example.com`,
          emailNormalized: `planner-gate-${suffix}@example.com`,
          firstName: "Alex",
        },
      });
      userId = user.id;
      generateStructured.mockImplementation(async (request: { schemaName?: string }) => {
        if (request.schemaName === "consultation_plan_decision") {
          return {
            data: {
              assessments: PLAN.assessments.map((assessment) => ({
                targetKey: assessment.targetKey,
                strength: assessment.strength,
                strategyMode: assessment.strategyMode,
              })),
              questions: PLAN.questions.map((question) => ({
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
              overall: PLAN.briefing.overall,
              strongestAngles: PLAN.briefing.strongestAngles,
              importantGaps: PLAN.briefing.importantGaps,
              commentary: PLAN.commentary,
              closingNote: PLAN.closingNote,
              assessments: PLAN.assessments.map((assessment) => ({
                targetKey: assessment.targetKey,
                supportingFactIds: assessment.supportingFactIds,
                relevantRoleIds: assessment.relevantRoleIds,
                explanation: assessment.explanation,
                strategy: assessment.strategy,
              })),
              questions: PLAN.questions.map((question) => ({
                targetKey: question.targetKey,
                whoCaresNote: question.whoCaresNote,
                requirementInterpretation: question.requirementInterpretation,
              })),
            },
          };
        }
        throw new Error(`unexpected schema ${request.schemaName ?? ""}`);
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
    });

    it("calls the planning model once, stores a receipt, and reuses it for an identical retry", async () => {
      generateStructured.mockClear();
      const first = await planConsultationWithModel(
        planInput({ organizationId, campaignId, sessionId }),
      );
      expect(first.ok).toBe(true);
      if (!first.ok || first.writingFailed) return;
      expect(first.data.questions[0]?.text).toBe(QUESTION);
      expect(callsFor("consultation_plan_decision")).toBe(1);
      expect(callsFor("consultation_plan_writing")).toBe(1);
      expect(generateStructured.mock.calls[0]?.[0]?.usage?.metadata).toEqual({
        step: "plan_decision",
        attempt: 1,
      });
      expect(generateStructured.mock.calls[1]?.[0]?.usage?.metadata).toEqual({
        step: "plan_writing",
        attempt: 1,
      });
      const receipts = await prisma.paidCallReceipt.findMany({
        where: { organizationId, operation: CONSULTATION_PLAN_OPERATION },
      });
      expect(receipts).toHaveLength(1);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId, operation: CONSULTATION_PLAN_WRITING_OPERATION },
        }),
      ).toBe(1);

      const second = await planConsultationWithModel(
        planInput({ organizationId, campaignId, sessionId }),
      );
      expect(second).toEqual(first);
      expect(callsFor("consultation_plan_decision")).toBe(1);
      expect(callsFor("consultation_plan_writing")).toBe(1);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId, operation: CONSULTATION_PLAN_OPERATION },
        }),
      ).toBe(1);
    });

    it("calls the model again when quality feedback changes", async () => {
      const before = callsFor("consultation_plan_decision");
      const again = await planConsultationWithModel(
        planInput({
          organizationId,
          campaignId,
          sessionId,
          qualityFeedback: [
            "Write one question for every remaining gap, most important first.",
          ],
          attempt: 2,
        }),
      );
      expect(again.ok).toBe(true);
      if (!again.ok || again.writingFailed) return;
      expect(again.data.questions[0]?.text).toBe(QUESTION);
      expect(callsFor("consultation_plan_decision")).toBe(before + 1);
      expect(callsFor("consultation_plan_writing")).toBe(2);
      const feedbackCall = generateStructured.mock.calls.find(
        (call) =>
          call[0]?.schemaName === "consultation_plan_decision" &&
          call[0]?.usage?.metadata?.attempt === 2,
      )?.[0];
      expect(feedbackCall?.schemaName).toBe("consultation_plan_decision");
      expect(feedbackCall?.usage?.metadata).toEqual({
        step: "plan_decision",
        attempt: 2,
      });
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId, operation: CONSULTATION_PLAN_OPERATION },
        }),
      ).toBe(2);
    });

    it("stores a reused plan exactly once after a crash before the round is saved, and does not duplicate it after a crash once it is saved", async () => {
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Planner product ${suffix}`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          productId: product.id,
          name: `Planner campaign ${suffix}`,
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          rawText: "Analyst role.",
          title: "Analyst",
          scorecardJson: {},
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          campaignId: campaign.id,
          name: "Hiring manager",
        },
      });
      PLAN.questions[0]!.hiringTeamRoleId = persona.id;

      generateStructured.mockClear();
      await prisma.paidCallReceipt.deleteMany({
        where: { organizationId, operation: CONSULTATION_PLAN_OPERATION },
      });

      await startConsultation({ organizationId, campaignId: campaign.id });
      expect(callsFor("consultation_plan_decision")).toBe(1);
      expect(callsFor("consultation_plan_writing")).toBe(1);
      expect(generateStructured.mock.calls[0]?.[0]?.usage?.metadata).toMatchObject({
        step: "plan_decision",
        attempt: 1,
      });

      const session = await prisma.consultationSession.findUniqueOrThrow({
        where: { campaignId: campaign.id },
      });
      const stored = await prisma.consultationTurn.findMany({
        where: {
          sessionId: session.id,
          speaker: "CONSULTANT",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.body).toBe(QUESTION);

      await prisma.consultationTurn.deleteMany({ where: { sessionId: session.id } });
      await prisma.consultationSession.update({
        where: { id: session.id },
        data: {
          generationStatus: "GENERATING",
          briefingJson: Prisma.JsonNull,
          coachNote: null,
          generationError: null,
        },
      });
      const callsAfterStoredPlan = callsFor("consultation_plan_decision");
      await startConsultation({ organizationId, campaignId: campaign.id });
      const restored = await prisma.consultationTurn.findMany({
        where: {
          sessionId: session.id,
          speaker: "CONSULTANT",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        },
      });
      expect(restored).toHaveLength(1);
      expect(restored[0]?.body).toBe(QUESTION);
      expect(callsFor("consultation_plan_decision")).toBe(callsAfterStoredPlan);

      await prisma.consultationSession.update({
        where: { id: session.id },
        data: {
          generationStatus: "GENERATING",
          briefingJson: Prisma.JsonNull,
          coachNote: null,
          generationError: null,
        },
      });
      await startConsultation({ organizationId, campaignId: campaign.id });
      const duplicated = await prisma.consultationTurn.findMany({
        where: {
          sessionId: session.id,
          speaker: "CONSULTANT",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        },
      });
      expect(duplicated).toHaveLength(1);
      expect(duplicated[0]?.body).toBe(QUESTION);
      // The saved question is now part of the planner payload, so this retry is
      // not an identical plan. It may call the model again, and it must not
      // insert a second copy of the question already stored.
      expect(callsFor("consultation_plan_decision")).toBeGreaterThanOrEqual(
        callsAfterStoredPlan,
      );
    });
  },
);
