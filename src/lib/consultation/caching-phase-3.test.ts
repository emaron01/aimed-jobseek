import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";

const generateStructured = vi.hoisted(() => vi.fn());
const enqueueApplicationJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationReplyAiConfigured: () => true,
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

vi.mock("@/lib/application-jobs/service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/application-jobs/service")>();
  return { ...actual, enqueueApplicationJob };
});

import {
  CONSULTATION_EXTRACT_OPERATION,
  CONSULTATION_POLISH_OPERATION,
  CONSULTATION_STATEMENT_REGENERATE_OPERATION,
  extractWithModel,
  polishAnswerWithModel,
} from "@/lib/consultation/ai";
import { polishAnswerWithQuality } from "@/lib/consultation/service";
import { ResultBody } from "@/components/ConsultationThread";
import { deriveCareerStage } from "@/lib/consultation/career-stage";

const EXTRACT = {
  replyType: "answer" as const,
  revisedQuestion: null,
  facts: [],
  story: {
    situation: "The pipeline slipped.",
    task: "I had to recover the quarter.",
    action: "I rebuilt the forecast with the team.",
    result: "We closed the gap in six weeks.",
  },
  demonstratedTargets: [],
  missingStarElements: [],
  coaching: "Name the accounts that moved.",
  followUpQuestion: "Which accounts moved in those six weeks?",
  gapDecision: "incomplete" as const,
  companyMotivation: null,
};

const POLISH = {
  answerFramework: "CAR" as const,
  interviewAnswer: null,
  challenge: "The quarter slipped and I had to recover it.",
  situation: null,
  task: null,
  action: "I rebuilt the forecast with the team.",
  result: "We closed the gap in six weeks.",
  resumeBullet: "Rebuilt a slipped quarterly forecast and closed the gap in six weeks.",
  strengtheningNote: null,
};

function usage(
  organizationId: string,
  campaignId: string,
  step: "extract" | "polish" | "statement_regeneration",
  attempt = 1,
): AiCallUsageContext {
  return {
    organizationId,
    campaignId,
    category: "CONSULTATION",
    operation: "CONSULTATION_REPLY",
    metadata: { step, attempt },
  };
}

function extractInput(organizationId: string, campaignId: string) {
  return {
    answer: "We closed the gap in six weeks.",
    seekerReplies: ["We closed the gap in six weeks."],
    question: "What happened when the quarter slipped?",
    target: {
      key: "required:forecast",
      kind: "REQUIREMENT",
      text: "Forecast ownership",
    },
    targets: [],
    profileItems: [],
    questionKey: "turn_question_1",
    usage: usage(organizationId, campaignId, "extract", 1),
  };
}

function polishInput(organizationId: string, campaignId: string) {
  return {
    answer: "We closed the gap in six weeks.",
    seekerReplies: ["We closed the gap in six weeks."],
    story: EXTRACT.story,
    declinedFollowUp: false,
    strengtheningNeeds: [],
    careerStage: deriveCareerStage({ experience: [], education: [] }),
    profileItems: [],
    questionKey: "turn_question_1",
    usage: usage(organizationId, campaignId, "polish", 1),
  };
}

describe("Harper answer page render", () => {
  it("renders a draft answer without a paid call or a job", () => {
    generateStructured.mockClear();
    enqueueApplicationJob.mockClear();
    const html = renderToStaticMarkup(
      createElement(ResultBody, {
        statement: {
          id: "stmt_1",
          turnId: "turn_1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I rebuilt the forecast and closed the gap in six weeks.",
          strengtheningNote: null,
        },
      }),
    );
    expect(html).toContain("I rebuilt the forecast and closed the gap in six weeks.");
    expect(html).toContain("Draft");
    expect(generateStructured).not.toHaveBeenCalled();
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    const page = readFileSync(
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
      "utf8",
    );
    expect(page).not.toContain("extractWithModel");
    expect(page).not.toContain("polishAnswerWithModel");
    expect(page).not.toContain("enqueueApplicationJob");
    expect(page).not.toContain("runPaidStructuredCall");
  });
});

describe.skipIf(!hasTestDatabase())(
  "Harper answer processing paid-call gate",
  { timeout: 60_000 },
  () => {
    const suffix = `c3-${Date.now()}`;
    let organizationId = "";
    const campaignId = `camp_${suffix}`;

    beforeAll(async () => {
      process.env.CONSULTATION_REPLY_AI_PROVIDER = "openai-responses";
      process.env.CONSULTATION_REPLY_AI_MODEL = "gpt-5.6-luna";
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Caching phase 3 ${suffix}`,
          slug: `caching-phase-3-${suffix}`,
        },
      });
      organizationId = org.id;
      generateStructured.mockImplementation(async (request: { schemaName?: string }) => {
        if (request.schemaName === "consultation_extract") return { data: EXTRACT };
        return { data: POLISH };
      });
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    it("calls extract once, stores a receipt, and returns that result on an identical retry", async () => {
      generateStructured.mockClear();
      const first = await extractWithModel(extractInput(organizationId, campaignId));
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.data.gapDecision).toBe("incomplete");
      expect(first.data.followUpQuestion).toBe(
        "Which accounts moved in those six weeks?",
      );
      expect(generateStructured).toHaveBeenCalledTimes(1);
      expect(generateStructured.mock.calls[0]?.[0]?.usage?.metadata).toEqual({
        step: "extract",
        attempt: 1,
      });
      const receipts = await prisma.paidCallReceipt.findMany({
        where: { organizationId, operation: CONSULTATION_EXTRACT_OPERATION },
      });
      expect(receipts).toHaveLength(1);

      const second = await extractWithModel(extractInput(organizationId, campaignId));
      expect(second).toEqual(first);
      expect(generateStructured).toHaveBeenCalledTimes(1);
    });

    it("calls again when the reply, the library prior, or the quality feedback changes", async () => {
      generateStructured.mockClear();
      await prisma.paidCallReceipt.deleteMany({ where: { organizationId } });

      await extractWithModel(extractInput(organizationId, campaignId));
      await extractWithModel({
        ...extractInput(organizationId, campaignId),
        answer: "We closed the gap in six weeks and kept the two largest accounts.",
        seekerReplies: [
          "We closed the gap in six weeks and kept the two largest accounts.",
        ],
      });
      await extractWithModel({
        ...extractInput(organizationId, campaignId),
        qualityFeedback: ["Ask which accounts moved."],
        usage: usage(organizationId, campaignId, "extract", 2),
      });
      expect(generateStructured).toHaveBeenCalledTimes(3);
      expect(generateStructured.mock.calls[2]?.[0]?.usage?.metadata).toEqual({
        step: "extract",
        attempt: 2,
      });

      const basePolish = polishInput(organizationId, campaignId);
      await polishAnswerWithModel(basePolish);
      const polishCallsAfterFirst = generateStructured.mock.calls.length;
      await polishAnswerWithModel({
        ...basePolish,
        priorApprovedAnswer: {
          statementId: "stmt_prior",
          question: "What happened when the quarter slipped?",
          content: "I recovered a slipped quarter by rebuilding the forecast.",
        },
      });
      await polishAnswerWithModel({
        ...basePolish,
        declinedFollowUp: true,
        usage: usage(organizationId, campaignId, "polish", 1),
      });
      expect(generateStructured.mock.calls.length).toBe(polishCallsAfterFirst + 2);

      const polished = await polishAnswerWithQuality({
        ...basePolish,
        sources: [{ id: "answer:1", text: basePolish.answer }],
        seekerAnswers: basePolish.seekerReplies,
      });
      expect(polished.ok).toBe(true);
      if (!polished.ok) return;
      expect(polished.data.interviewAnswer).toContain("six weeks");
      const callsAfterDraft = generateStructured.mock.calls.length;
      const again = await polishAnswerWithQuality({
        ...basePolish,
        sources: [{ id: "answer:1", text: basePolish.answer }],
        seekerAnswers: basePolish.seekerReplies,
      });
      expect(again).toEqual(polished);
      expect(generateStructured.mock.calls.length).toBe(callsAfterDraft);

      await polishAnswerWithModel({
        ...basePolish,
        usage: usage(organizationId, campaignId, "statement_regeneration", 1),
      });
      const regenReceipts = await prisma.paidCallReceipt.findMany({
        where: {
          organizationId,
          operation: CONSULTATION_STATEMENT_REGENERATE_OPERATION,
        },
      });
      expect(regenReceipts).toHaveLength(1);
      const callsAfterRegen = generateStructured.mock.calls.length;
      await polishAnswerWithModel({
        ...basePolish,
        usage: usage(organizationId, campaignId, "statement_regeneration", 1),
      });
      expect(generateStructured.mock.calls.length).toBe(callsAfterRegen);
      const polishReceipts = await prisma.paidCallReceipt.findMany({
        where: { organizationId, operation: CONSULTATION_POLISH_OPERATION },
      });
      expect(polishReceipts.length).toBeGreaterThan(0);
    });
  },
);
