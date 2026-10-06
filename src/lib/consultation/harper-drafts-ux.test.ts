/**
 * Where-you-stand answers stay in that section, and a draft edit is stored
 * without a paid call.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    consultationStatement: { findFirst, update },
    profileStory: { updateMany },
    $transaction: transaction,
  },
}));

import { saveEditedConsultationStatement } from "@/lib/consultation/service";
import { buildConsultationQaView, type QaTurn } from "@/lib/consultation/qa-view";
import { buildStandingListEntries } from "@/lib/consultation/standing-entries";
import {
  harperSectionForQuestion,
  partitionHarperThreeSections,
} from "@/lib/consultation/harper-three-sections";
import { consultationConversationCopy } from "@/lib/product-config/consultation";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function turn(
  overrides: Partial<QaTurn> & Pick<QaTurn, "id" | "speaker" | "body" | "sequence">,
): QaTurn {
  return {
    targetKey: null,
    followUp: false,
    ...overrides,
  };
}

const whyRequirement = {
  id: "why-assess",
  targetKey: WHY_THIS_COMPANY_TARGET_KEY,
  text: consultationConversationCopy.whyThisCompanyTarget,
  strength: "NONE" as const,
  kind: "MISSION" as const,
  explanation: null,
  experience: null,
  facts: [],
};

function shareView(status: "DRAFT" | "APPROVED", content: string) {
  const seeker = turn({
    id: "s-why",
    speaker: "SEEKER",
    body: "I want to work here because of the robotics mission.",
    targetKey: WHY_THIS_COMPANY_TARGET_KEY,
    sequence: 1,
    analysisJson: { status: "COMPLETE" },
  });
  return buildConsultationQaView({
    turns: [seeker],
    statements: [
      {
        id: "st-why",
        turnId: "s-why",
        kind: "INTERVIEW_ANSWER",
        status,
        content,
        strengtheningNote: null,
      },
    ],
  });
}

function partitionShare(status: "DRAFT" | "APPROVED", content: string) {
  const view = shareView(status, content);
  const entries = buildStandingListEntries({
    requirements: [whyRequirement],
    dedicatedTopics: [
      {
        kind: "why-this-company",
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        label: consultationConversationCopy.whyThisCompanyTarget,
        questions: view.questions,
      },
    ],
    questionsByTargetKey: new Map(),
  });
  return { view, model: partitionHarperThreeSections(entries) };
}

describe("Harper drafts stay put and can be edited", () => {
  it("keeps an answer from Where you stand there through drafting and approval", () => {
    const drafted = partitionShare(
      "DRAFT",
      "I want to join because their robotics mission matches my reliability work.",
    );
    const share = drafted.view.questions[0]!;
    expect(share.question).toBe(consultationConversationCopy.yourAnswer);
    expect(harperSectionForQuestion(share)).toBe("where-you-stand");
    expect(drafted.model.needsInfoQuestions).toEqual([]);
    const host = drafted.model.standingEntries.find(
      (entry) => entry.kind !== "TOPIC" && entry.targetKey === WHY_THIS_COMPANY_TARGET_KEY,
    );
    expect(host?.showShareForm).toBe(false);
    expect(host?.questions.map((question) => question.questionTurnId)).toEqual(["s-why"]);
    expect(host?.questions[0]?.talkingPoint?.status).toBe("DRAFT");
    expect(host?.questions[0]?.talkingPoint?.content).toBe(
      "I want to join because their robotics mission matches my reliability work.",
    );
    expect(drafted.model.standingEntries.some((entry) => entry.kind === "TOPIC")).toBe(
      false,
    );

    const approved = partitionShare(
      "APPROVED",
      "I want to join because their robotics mission matches my reliability work.",
    );
    expect(approved.model.needsInfoQuestions).toEqual([]);
    const approvedHost = approved.model.standingEntries.find(
      (entry) => entry.kind !== "TOPIC" && entry.targetKey === WHY_THIS_COMPANY_TARGET_KEY,
    );
    expect(approvedHost?.questions.map((question) => question.questionTurnId)).toEqual([
      "s-why",
    ]);
    expect(approvedHost?.questions[0]?.talkingPoint?.status).toBe("APPROVED");
    expect(approved.model.standingEntries.some((entry) => entry.kind === "TOPIC")).toBe(
      false,
    );
  });

  it("keeps a requirement answered from Where you stand on that requirement", () => {
    const seeker = turn({
      id: "s-gap",
      speaker: "SEEKER",
      body: "I led incident response at Acme.",
      targetKey: "required:0",
      sequence: 1,
      analysisJson: { status: "COMPLETE" },
    });
    const view = buildConsultationQaView({
      turns: [seeker],
      statements: [
        {
          id: "st-gap",
          turnId: "s-gap",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I led SEV1 response at Acme and cut MTTR.",
          strengtheningNote: null,
        },
      ],
    });
    const entries = buildStandingListEntries({
      requirements: [
        {
          id: "a0",
          targetKey: "required:0",
          text: "Leads incident response",
          strength: "PARTIAL",
          kind: "REQUIRED",
          explanation: null,
          experience: null,
          facts: [],
        },
      ],
      dedicatedTopics: [],
      questionsByTargetKey: new Map([["required:0", view.questions]]),
    });
    const model = partitionHarperThreeSections(entries);
    expect(model.needsInfoQuestions).toEqual([]);
    expect(model.standingEntries).toHaveLength(1);
    expect(model.standingEntries[0]?.targetKey).toBe("required:0");
    expect(model.standingEntries[0]?.showShareForm).toBe(false);
    expect(model.standingEntries[0]?.questions[0]?.talkingPoint?.content).toBe(
      "I led SEV1 response at Acme and cut MTTR.",
    );
  });

  it("keeps a Harper-asked gap in its Where you stand row through the draft and after approval", () => {
    const question = turn({
      id: "q-gap",
      speaker: "CONSULTANT",
      body: "Tell me about leading incidents.",
      targetKey: "required:0",
      sequence: 1,
    });
    const seeker = turn({
      id: "s-gap",
      speaker: "SEEKER",
      body: "I led incident response at Acme.",
      targetKey: "required:0",
      sequence: 2,
      analysisJson: { status: "COMPLETE", replyToTurnId: "q-gap" },
    });
    const drafted = buildConsultationQaView({
      turns: [question, seeker],
      statements: [
        {
          id: "st-gap",
          turnId: "s-gap",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I led SEV1 response at Acme.",
          strengtheningNote: null,
        },
      ],
    });
    expect(drafted.questions[0]?.question).toBe("Tell me about leading incidents.");
    expect(harperSectionForQuestion(drafted.questions[0]!)).toBe("where-you-stand");
    const entries = buildStandingListEntries({
      requirements: [
        {
          id: "a0",
          targetKey: "required:0",
          text: "Leads incident response",
          strength: "PARTIAL",
          kind: "REQUIRED",
          explanation: null,
          experience: null,
          facts: [],
        },
      ],
      dedicatedTopics: [],
      questionsByTargetKey: new Map([["required:0", drafted.questions]]),
    });
    const model = partitionHarperThreeSections(entries);
    expect(model.needsInfoQuestions).toEqual([]);
    expect(model.standingEntries[0]?.questions.map((item) => item.questionTurnId)).toEqual([
      "q-gap",
    ]);

    const approved = buildConsultationQaView({
      turns: [question, seeker],
      statements: [
        {
          id: "st-gap",
          turnId: "s-gap",
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content: "I led SEV1 response at Acme.",
          strengtheningNote: null,
        },
      ],
    });
    const approvedModel = partitionHarperThreeSections(
      buildStandingListEntries({
        requirements: [
          {
            id: "a0",
            targetKey: "required:0",
            text: "Leads incident response",
            strength: "PARTIAL",
            kind: "REQUIRED",
            explanation: null,
            experience: null,
            facts: [],
          },
        ],
        dedicatedTopics: [],
        questionsByTargetKey: new Map([["required:0", approved.questions]]),
      }),
    );
    expect(approvedModel.needsInfoQuestions).toEqual([]);
    expect(approvedModel.standingEntries[0]?.questions[0]?.questionTurnId).toBe("q-gap");
  });

  it("puts Edit in the same row as Approve and Regenerate", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    const start = thread.indexOf(
      'className="mt-3 flex flex-nowrap items-center gap-2" data-testid={testId}',
    );
    expect(start).toBeGreaterThan(-1);
    const row = thread.slice(start, thread.indexOf("</div>", start));
    expect(row).toContain("consultationConversationCopy.approve");
    expect(row).toContain("polishCopy.regenerate");
    expect(row).toContain("consultationConversationCopy.editAnswer");
    expect(row).toContain("consultationConversationCopy.saveAnswer");
    expect(row).toContain("testId={`${testId}-approve`}");
    expect(row).toContain("testId={`${testId}-regenerate`}");
    expect(row).toContain("testId={`${testId}-save`}");
    expect(row).toContain('data-testid={`${testId}-edit`}');
    expect(row.indexOf("consultationConversationCopy.editAnswer")).toBeGreaterThan(
      row.indexOf("polishCopy.regenerate"),
    );
    expect(thread).toContain("saveEditedConsultationStatementAction");
    expect(thread).not.toMatch(/enqueueApplicationJob|runPaidStructuredCall/);
  });

  it("saves a draft edit without a paid call and approves that text", async () => {
    findFirst.mockResolvedValue({
      id: "st-1",
      status: "DRAFT",
      kind: "INTERVIEW_ANSWER",
      turnId: "turn-1",
    });
    update.mockImplementation((args: unknown) => Promise.resolve(args));
    transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));

    await saveEditedConsultationStatement({
      organizationId: "org-1",
      statementId: "st-1",
      content: "Edited draft text.",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "st-1" },
      data: { content: "Edited draft text." },
    });
    expect(updateMany).not.toHaveBeenCalled();
    const saved = update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(saved.data.status).toBeUndefined();

    const service = src("src/lib/consultation/service.ts");
    const save = service.slice(
      service.indexOf("export async function saveEditedConsultationStatement"),
      service.indexOf("export async function recordConsultationAnswerEdit"),
    );
    expect(save).toContain("data: { content }");
    expect(save).not.toContain("enqueueApplicationJob");
    expect(save).not.toContain("runPaidStructuredCall");
    const approve = service.slice(
      service.indexOf("export async function approveConsultationQaResult"),
      service.indexOf("export async function regenerateConsultationQaResult"),
    );
    expect(approve).toContain("content: statement.content");

    const actions = src("src/app/actions/consultation.ts");
    const action = actions.slice(
      actions.indexOf("export async function saveEditedConsultationStatementAction"),
      actions.indexOf("export async function replyConsultationAction"),
    );
    expect(action).toContain("saveEditedConsultationStatement");
    expect(action).not.toContain("enqueueApplicationJob");
    expect(action).not.toContain("runPaidStructuredCall");
    expect(action).not.toContain("getConsultationReplyAiProvider");
  });
});

beforeEach(() => {
  findFirst.mockReset();
  update.mockReset();
  updateMany.mockReset();
  transaction.mockReset();
});
