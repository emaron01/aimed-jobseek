import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePersonLikelyQuestions } from "@/lib/application-summary/likely-questions";
import { APPLICATION_SUMMARY_PROMPT_VERSION } from "@/lib/application-summary/contract";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  GUIDE_ANSWER_TAILOR_INSTRUCTION,
  buildConsultationPolishMessages,
} from "@/lib/consultation/prompt";
import { APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/application-summary";
import { CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";

const generateStructured = vi.hoisted(() => vi.fn());
const runPaidStructuredCall = vi.hoisted(() => vi.fn());
const statementFindFirst = vi.hoisted(() => vi.fn());
const statementUpdate = vi.hoisted(() => vi.fn());
const statementUpsert = vi.hoisted(() => vi.fn());
const turnFindFirst = vi.hoisted(() => vi.fn());
const storyFindMany = vi.hoisted(() => vi.fn());
const storyUpdate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() =>
  vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
);

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationReplyAiConfigured: () => true,
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

vi.mock("@/lib/ai/paid-call-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/paid-call-gate")>();
  return { ...actual, runPaidStructuredCall };
});

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    consultationStatement: {
      findFirst: statementFindFirst,
      update: statementUpdate,
      upsert: statementUpsert,
    },
    consultationTurn: { findFirst: turnFindFirst },
    profileStory: { findMany: storyFindMany, update: storyUpdate },
    $transaction: transaction,
  },
}));

import { regenerateConsultationStatement } from "@/lib/consultation/service";

const QUESTION =
  "Describe a time Product, Marketing, or Customer Success disagreed.";
const COPIED =
  "I led OpenText Migrate with the marketing team and the launch held.";
const TAILORED =
  "When Marketing and Product disagreed on the OpenText Migrate launch, I kept the marketing plan and the launch held.";
const ORIGINAL_ID = "stmt-approved-original";

const FIT_SENTENCE =
  "An answer fits only when its story directly answers the question as written and shows the seeker working with this interviewer's function; a story that mentions their function only in passing does not fit. When a question names several functions, narrow it to this interviewer's function. Use each approved answer at most once, on the question it answers best.";

function guideStatement(partial: {
  id: string;
  turnId: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
}) {
  return {
    id: partial.id,
    kind: "INTERVIEW_ANSWER",
    status: "DRAFT",
    content: COPIED,
    turnId: partial.turnId,
    sessionId: "sess-1",
    groundingJson: [],
    organizationId: "org-1",
    session: { campaignId: "camp-1" },
    turn: {
      id: partial.turnId,
      body: partial.body,
      speaker: partial.speaker,
      followUp: false,
      targetKey: "cheatSheet:item-1",
      analysisJson: null,
    },
  };
}

function polishResult() {
  return {
    data: {
      answerFramework: null,
      interviewAnswer: TAILORED,
      challenge: null,
      situation: null,
      task: null,
      action: null,
      result: null,
      resumeBullet: null,
      strengtheningNote: null,
      keyPoints: [],
    },
  };
}

describe("guide answer fit", () => {
  it("keeps a repeated approved answer only on the first question", () => {
    const items = resolvePersonLikelyQuestions({
      likelyQuestions: [
        {
          prompt: "How have you worked with marketing on a launch?",
          approvedAnswerId: "stmt-migrate",
          interviewTypeTag: "focused_competency",
        },
        {
          prompt: "How do you partner with product marketing?",
          approvedAnswerId: "stmt-migrate",
          interviewTypeTag: "focused_competency",
        },
        {
          prompt: "Tell me about a pricing disagreement.",
          approvedAnswerId: "stmt-price",
          interviewTypeTag: "focused_competency",
        },
        {
          prompt: "Tell me about another marketing launch.",
          approvedAnswerId: "stmt-migrate",
          interviewTypeTag: "focused_competency",
        },
      ],
      harperAskedCareerWalkThrough: false,
      approvedAnswers: [
        {
          id: "stmt-migrate",
          question: "Tell me about a launch.",
          content: COPIED,
        },
        {
          id: "stmt-price",
          question: "Tell me about pricing.",
          content: "I reset the price with the product team.",
        },
      ],
    });
    expect(items[0]?.sampleAnswer).toBe(COPIED);
    expect(items[1]?.sampleAnswer).toBeNull();
    expect(items[2]?.sampleAnswer).toBe("I reset the price with the product team.");
    expect(items[3]?.sampleAnswer).toBeNull();
    expect(items[3]?.prompt).toBe("Tell me about another marketing launch.");
  });

  it("puts the new fit sentence in the live instruction at version 20", () => {
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("20");
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(FIT_SENTENCE);
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).not.toContain(
      "an answer fits only when its story shows what this interviewer is asking about",
    );
  });
});

describe("guide regenerate tailors the seeker's answer", () => {
  beforeEach(() => {
    generateStructured.mockReset();
    runPaidStructuredCall.mockReset();
    statementFindFirst.mockReset();
    statementUpdate.mockReset();
    statementUpsert.mockReset();
    turnFindFirst.mockReset();
    storyFindMany.mockReset();
    storyUpdate.mockReset();
    transaction.mockClear();
    generateStructured.mockResolvedValue({ data: polishResult().data });
    runPaidStructuredCall.mockImplementation(
      async (input: { callProvider: () => Promise<unknown> }) => ({
        data: await input.callProvider(),
      }),
    );
    storyFindMany.mockResolvedValue([]);
    statementUpdate.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
    }));
    statementUpsert.mockImplementation(async ({ where }: { where: { turnId_kind: { turnId: string } } }) => ({
      id: `upsert:${where.turnId_kind.turnId}`,
    }));
  });

  it("sends the guide question and the copied answer, saves the guide turn, and leaves the original approved statement alone", async () => {
    const guide = guideStatement({
      id: "stmt-guide",
      turnId: "turn-guide",
      speaker: "CONSULTANT",
      body: QUESTION,
    });
    statementFindFirst.mockResolvedValue(guide);
    const result = await regenerateConsultationStatement({
      organizationId: "org-1",
      statementId: guide.id,
    });
    expect(result.polished).toBe(true);
    expect(runPaidStructuredCall).toHaveBeenCalledTimes(1);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const paid = runPaidStructuredCall.mock.calls[0]?.[0] as { operation: string };
    expect(paid.operation).toBe("CONSULTATION_POLISH");
    const sent = (
      generateStructured.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    ).messages
      .map((message) => message.content)
      .join("\n");
    expect(sent).toContain(GUIDE_ANSWER_TAILOR_INSTRUCTION);
    expect(sent).toContain(QUESTION);
    expect(sent).toContain(COPIED);
    expect(sent).not.toContain("Combine as many approved answers");
    expect(statementUpsert).not.toHaveBeenCalled();
    expect(statementUpdate).toHaveBeenCalledTimes(1);
    const update = statementUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { content: string; status: string; approvedAt: null };
    };
    expect(update.where.id).toBe("stmt-guide");
    expect(update.where.id).not.toBe(ORIGINAL_ID);
    expect(update.data.content).toBe(TAILORED);
    expect(update.data.status).toBe("DRAFT");
    expect(update.data.approvedAt).toBeNull();
    expect(turnFindFirst).not.toHaveBeenCalled();
  });

  it("tailors a seeker-written guide answer onto the guide question turn", async () => {
    const written = guideStatement({
      id: "stmt-seeker",
      turnId: "turn-seeker",
      speaker: "SEEKER",
      body: COPIED,
    });
    statementFindFirst.mockResolvedValue(written);
    turnFindFirst.mockResolvedValue({ id: "turn-guide", body: QUESTION });
    await regenerateConsultationStatement({
      organizationId: "org-1",
      statementId: written.id,
    });
    expect(runPaidStructuredCall).toHaveBeenCalledTimes(1);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const sent = (
      generateStructured.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    ).messages
      .map((message) => message.content)
      .join("\n");
    expect(sent).toContain(QUESTION);
    expect(sent).toContain(COPIED);
    expect(sent).toContain(GUIDE_ANSWER_TAILOR_INSTRUCTION);
    const upsert = statementUpsert.mock.calls[0]?.[0] as {
      where: { turnId_kind: { turnId: string; kind: string } };
      update: { content: string; status: string };
    };
    expect(upsert.where.turnId_kind).toEqual({
      turnId: "turn-guide",
      kind: "INTERVIEW_ANSWER",
    });
    expect(upsert.update.content).toBe(TAILORED);
    expect(upsert.update.status).toBe("DRAFT");
    const update = statementUpdate.mock.calls[0]?.[0] as { where: { id: string } };
    expect(update.where.id).toBe("stmt-seeker");
    expect(update.where.id).not.toBe(ORIGINAL_ID);
  });
});

describe("Harper regenerate stays on the existing polish instruction", () => {
  it("keeps the Harper polish instruction and version, and the Harper regenerate branch", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("39");
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(
      "You may use profile experience the person did not repeat in the reply.",
    );
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(
      "Combine as many approved answers and profile facts as the question needs.",
    );
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).not.toContain(
      GUIDE_ANSWER_TAILOR_INSTRUCTION,
    );
    const messages = buildConsultationPolishMessages({
      answer: COPIED,
      story: { situation: null, task: null, action: null, result: null },
      declinedFollowUp: false,
      strengtheningNeeds: [],
      careerStage: "mid_career",
      profileItems: [],
      spokenAnswerWords: 150,
    });
    expect(messages[0]?.content).toContain("Prompt version: 39");
    expect(messages[0]?.content).toContain(
      "Combine as many approved answers and profile facts as the question needs.",
    );
    expect(messages[0]?.content).not.toContain(GUIDE_ANSWER_TAILOR_INSTRUCTION);
    expect(messages[0]?.content).toContain(
      "Write the spoken answer in about 150 words.",
    );

    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const regenerate = service.slice(
      service.indexOf("export async function regenerateConsultationStatement"),
      service.indexOf("export async function approvalContinuesHarperPlanning"),
    );
    expect(regenerate).toContain("draftRegenerationAnswer");
    expect(regenerate).toContain("extractAnswerWithQuality");
    expect(regenerate).toContain("profileEvidenceForApplication");
    expect(regenerate).toContain('"statement_regeneration"');
    expect(regenerate).not.toContain(GUIDE_ANSWER_TAILOR_INSTRUCTION);

    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("regenerateConsultationQaResultAction");
    expect(thread).toContain("groundingSeekerEdited");
    expect(thread).toContain("polishCopy.polishMyAnswer");
    expect(thread).toContain("polishCopy.regenerate");
  });
});
