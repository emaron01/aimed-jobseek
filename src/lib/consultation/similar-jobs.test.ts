import { beforeEach, describe, expect, it, vi } from "vitest";

const answersGenerate = vi.hoisted(() => vi.fn());
const gate = vi.hoisted(() =>
  vi.fn(async (input: { callProvider: () => Promise<unknown> }) => ({
    data: await input.callProvider(),
    skipped: false,
  })),
);
const findMany = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const createStatement = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationReplyAiConfigured: () => true,
    getConsultationReplyAiProvider: () => ({
      generateStructured: answersGenerate,
    }),
  };
});

vi.mock("@/lib/ai/paid-call-gate", () => ({
  runPaidStructuredCall: gate,
  fingerprintPaidCallInputs: (value: unknown) => JSON.stringify(value),
  findPaidCallReceipt: async () => null,
}));

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    consultationStatement: {
      findMany,
      create: createStatement,
    },
    consultationTurn: {
      findFirst,
    },
  },
}));

import type { ApprovedAnswerCandidate } from "@/lib/consultation/harper-library";
import {
  CHRONOLOGY_LIBRARY_TARGET,
  gapQuestionIsSupported,
  selectApprovedAnswersForTargets,
} from "@/lib/consultation/harper-library";
import {
  bestPracticeDraftsForAnswers,
  draftSupportedGapQuestions,
  gapDraftSubjectKey,
} from "@/lib/consultation/role-expertise";

function answer(
  overrides: Partial<ApprovedAnswerCandidate> &
    Pick<ApprovedAnswerCandidate, "statementId" | "question" | "content">,
): ApprovedAnswerCandidate {
  return {
    approvedAt: new Date("2026-06-01T00:00:00.000Z"),
    sourceCampaignId: "csc",
    targetKey: "required:coach",
    whyThisCompany: null,
    ...overrides,
  };
}

describe("approved answers on a similar job", () => {
  it("passes an approved answer that covers the target in different wording", () => {
    const selected = selectApprovedAnswersForTargets({
      campaignId: "sift",
      targets: [
        {
          key: "required:forecast",
          text: "Build forecast confidence through disciplined deal reviews",
        },
        {
          key: "required:coach",
          text: "Coach and develop the sales team",
        },
        CHRONOLOGY_LIBRARY_TARGET,
        {
          key: "required:hiring",
          text: "Hire a finance partner for the close",
        },
      ],
      answers: [
        answer({
          statementId: "forecast",
          question: "How have you used deal reviews to improve forecast confidence?",
          content:
            "I ran weekly deal reviews so the forecast the leadership team saw was one I would stand behind.",
          targetKey: "required:forecast",
        }),
        answer({
          statementId: "coach",
          question: "Tell me about coaching an underperforming representative.",
          content:
            "I coached an underperforming sales representative each week and developed the rest of the team the same way.",
        }),
        answer({
          statementId: "walk",
          question:
            "Starting with OpenText, walk me through your roles, accomplishments, and why you moved on.",
          content: "I started at OpenText as a director and later moved on to CSC.",
          targetKey: "chronology",
        }),
        answer({
          statementId: "unrelated",
          question: "How do you hire a finance partner?",
          content: "I hired a finance partner at Northwind.",
          targetKey: "required:hiring",
        }),
      ],
    });

    expect(selected.map((item) => item.statementId)).toEqual([
      "forecast",
      "coach",
      "walk",
      "unrelated",
    ]);
    const hiring = selectApprovedAnswersForTargets({
      campaignId: "sift",
      targets: [
        {
          key: "required:forecast",
          text: "Build forecast confidence through disciplined deal reviews",
        },
      ],
      answers: [
        answer({
          statementId: "unrelated",
          question: "How do you hire a finance partner?",
          content: "I hired a finance partner at Northwind.",
        }),
      ],
    });
    expect(hiring).toEqual([]);
  });

  it("drafts only gap questions that approved answers or the profile support", () => {
    const approved = [
      {
        question: "Tell me about coaching an underperforming representative.",
        content:
          "I coached an underperforming sales representative each week and developed the rest of the team the same way.",
      },
    ];
    expect(
      gapQuestionIsSupported({
        question: "How have you coached an underperforming sales representative?",
        targetText: "Coach and develop the sales team",
        approvedAnswers: approved,
        profileItems: [],
      }),
    ).toBe(true);
    expect(
      gapQuestionIsSupported({
        question: "How do you build SQL reporting for the warehouse?",
        targetText: "SQL reporting for the warehouse",
        approvedAnswers: approved,
        profileItems: [
          {
            kind: "FACT",
            text: "I built the SQL report the warehouse team used each Monday.",
          },
        ],
      }),
    ).toBe(true);
    expect(
      gapQuestionIsSupported({
        question: "How do you build SQL reporting for the warehouse?",
        targetText: "SQL reporting for the warehouse",
        approvedAnswers: approved,
        profileItems: [],
      }),
    ).toBe(false);
  });
});

describe("best-practice drafts", () => {
  it("stores a draft when the answer prose is in text and does not echo the question", () => {
    const attract = "What attracts you to this Director of Sales role?";
    const story = "Describe a time when you inherited an unhealthy pipeline?";
    const drafts = bestPracticeDraftsForAnswers(
      [
        {
          text: attract,
          targetKey: "role-expertise:1",
          interviewTypeTag: "screening",
        },
        {
          text: story,
          targetKey: "role-expertise:2",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: "I am drawn to this role because it owns forecast discipline and manager standards.",
          answerFramework: "CAR",
          challenge: null,
          situation: null,
          task: null,
          action: "",
          result: "",
          followUpQuestion: null,
        },
        {
          text: "pipeline story",
          answerFramework: "CAR",
          challenge: "I inherited an unhealthy pipeline.",
          situation: null,
          task: null,
          action: "I reset the inspection rhythm with the managers.",
          result: "The forecast I stood behind was the one we shipped.",
          followUpQuestion: null,
        },
      ],
      [],
    );
    expect(drafts[0]?.content).toContain("forecast discipline");
    expect(drafts[1]?.content).toContain("forecast I stood behind");
  });
});

describe("gap drafts in one answers call", () => {
  beforeEach(() => {
    answersGenerate.mockReset();
    gate.mockClear();
    findMany.mockReset();
    findFirst.mockReset();
    createStatement.mockReset();
    findMany.mockResolvedValue([
      {
        id: "stmt-csc",
        content:
          "I coached an underperforming sales representative each week and developed the rest of the team the same way.",
        approvedAt: new Date("2026-06-01T00:00:00.000Z"),
        session: {
          campaignId: "csc",
          campaign: { whyThisCompany: null },
        },
        turn: {
          body: "Tell me about coaching an underperforming representative.",
          targetKey: "required:coach",
        },
      },
    ]);
    findFirst.mockImplementation(
      async (query: { where: { body?: string; targetKey?: string } }) => ({
        id: `turn-${query.where.targetKey}`,
        statements: [],
      }),
    );
    createStatement.mockResolvedValue({ id: "draft" });
    answersGenerate.mockImplementation(async (request: { messages: { content: string }[] }) => {
      const payload = JSON.parse(request.messages[1]!.content) as {
        questions: Array<{ text: string }>;
      };
      return {
        data: {
          answers: payload.questions.map((question) => ({
            text: question.text,
            answerFramework: "CAR",
            challenge: "The rep was missing quota.",
            situation: null,
            task: null,
            action: "I coached that sales representative every week.",
            result: "The rep hit quota the next quarter.",
            followUpQuestion: null,
          })),
        },
      };
    });
  });

  it("drafts every supported gap question in one batched answers call", async () => {
    const result = await draftSupportedGapQuestions({
      organizationId: "org-1",
      campaignId: "sift",
      sessionId: "session-1",
      careerStage: "late_career",
      jobSources: { title: "Director of Sales", employer: "Sift" },
      approvedAnswers: [
        {
          question: "Tell me about coaching an underperforming representative.",
          content:
            "I coached an underperforming sales representative each week and developed the rest of the team the same way.",
        },
        {
          question: "How have you used deal reviews to improve forecast confidence?",
          content:
            "I ran weekly deal reviews so the forecast the leadership team saw was one I would stand behind.",
        },
      ],
      profileItems: [],
      questions: [
        {
          text: "How have you coached an underperforming sales representative?",
          targetKey: "required:coach",
          interviewTypeTag: "focused_competency",
          targetText: "Coach and develop the sales team",
        },
        {
          text: "How have you used deal reviews to build forecast confidence?",
          targetKey: "required:forecast",
          interviewTypeTag: "focused_competency",
          targetText: "Build forecast confidence through disciplined deal reviews",
        },
        {
          text: "How do you build SQL reporting for the warehouse?",
          targetKey: "required:sql",
          interviewTypeTag: "focused_competency",
          targetText: "SQL reporting for the warehouse",
        },
      ],
    });

    expect(result).toEqual({ drafted: 2, called: true });
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate.mock.calls[0]?.[0]).toMatchObject({
      operation: "ROLE_EXPERTISE_ANSWERS",
      subjectKey: gapDraftSubjectKey("sift"),
    });
    expect(answersGenerate).toHaveBeenCalledTimes(1);
    const user = answersGenerate.mock.calls[0]?.[0].messages[1].content as string;
    expect(user).toContain("underperforming sales representative");
    expect(user).toContain("forecast confidence");
    expect(user).not.toContain("warehouse");
    expect(createStatement).toHaveBeenCalledTimes(2);
    expect(createStatement.mock.calls[0]?.[0].data).toMatchObject({
      kind: "INTERVIEW_ANSWER",
      status: "DRAFT",
    });
  });
});
