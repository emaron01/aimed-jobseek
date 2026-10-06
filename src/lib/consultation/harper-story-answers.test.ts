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
  gapQuestionIsSupported,
  selectApprovedAnswersForTargets,
} from "@/lib/consultation/harper-library";
import { bestPracticeDraftsForAnswers, draftSupportedGapQuestions } from "@/lib/consultation/role-expertise";
import { ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION } from "@/lib/consultation/role-expertise";
import { ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";

const STORY_SENTENCE =
  'For a story question (tell me about a time, describe a situation, give an example), tell a real experience from the Personal Profile or approvedAnswers as what happened. Never answer a story question hypothetically with "I would". When no stated experience fits exactly, use the closest stated experience and say plainly what happened there.';

const STORY_ADDITION =
  "A story answer names where it happened (the employer, school, or project, and the role), what you did, and what changed. Never describe a general habit in place of a story.";

const SELLER_QUESTION =
  "Describe a situation in which an experienced seller was underperforming";

const OPENTEXT_QUESTION = "Tell me about a time you dealt with underperformance on your team.";

const OPENTEXT_CONTENT =
  "At OpenText I exited two underperformers and recruited two representatives who became top performers.";

function candidate(
  statementId: string,
  question: string,
  content: string,
): ApprovedAnswerCandidate {
  return {
    statementId,
    question,
    content,
    approvedAt: new Date("2026-06-01T00:00:00.000Z"),
    sourceCampaignId: "csc",
    targetKey: "required:team",
    whyThisCompany: null,
  };
}

describe("story answer instructions", () => {
  it("places the approved story sentence directly after the existing story-question sentence", () => {
    const at = ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS.indexOf(STORY_SENTENCE);
    expect(at).toBeGreaterThanOrEqual(0);
    const after = ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS.slice(at + STORY_SENTENCE.length);
    expect(after.trimStart().startsWith(STORY_ADDITION)).toBe(true);
    expect(ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION).toBe("8");
  });
});

describe("per-question approved-answer matching", () => {
  const openText = candidate("stmt-opentext", OPENTEXT_QUESTION, OPENTEXT_CONTENT);
  const forecast = candidate(
    "stmt-forecast",
    "How have you used deal reviews to improve forecast confidence?",
    "I ran weekly deal reviews so the forecast the leadership team saw was one I would stand behind.",
  );

  it("sends the OpenText underperformer story to the underperforming-seller question", () => {
    const selected = selectApprovedAnswersForTargets({
      campaignId: "sift",
      targets: [{ key: "role-expertise:seller", text: SELLER_QUESTION, question: true }],
      answers: [forecast, openText],
    });
    expect(selected.map((answer) => answer.statementId)).toEqual(["stmt-opentext"]);
    expect(selected[0]?.content).toContain("OpenText");
    expect(selected[0]?.content).toContain("underperformers");

    const requirementOnly = selectApprovedAnswersForTargets({
      campaignId: "sift",
      targets: [{ key: "required:revenue", text: "Own a multi-product revenue number" }],
      answers: [openText],
    });
    expect(requirementOnly).toEqual([]);
  });

  it("treats a gap question as supported when the approved answer covers the question", () => {
    expect(
      gapQuestionIsSupported({
        question: SELLER_QUESTION,
        targetText: "Own a multi-product revenue number",
        approvedAnswers: [{ question: OPENTEXT_QUESTION, content: OPENTEXT_CONTENT }],
        profileItems: [],
      }),
    ).toBe(true);
    expect(
      gapQuestionIsSupported({
        question: SELLER_QUESTION,
        targetText: "Own a multi-product revenue number",
        approvedAnswers: [{ question: forecast.question, content: forecast.content }],
        profileItems: [],
      }),
    ).toBe(false);
  });
});

describe("whole stored drafts", () => {
  it("keeps the opening when the challenge lived only in the text field", () => {
    const question = SELLER_QUESTION;
    const drafts = bestPracticeDraftsForAnswers(
      [
        {
          text: question,
          targetKey: "role-expertise:seller",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: "The company had just been acquired. I led North American sales for the Series A company during that transition. The team kept its largest accounts.",
          answerFramework: "CAR",
          challenge: null,
          situation: null,
          task: null,
          action: "I led North American sales for the Series A company during that transition.",
          result: "The team kept its largest accounts.",
          followUpQuestion: null,
        },
      ],
      [],
    );
    const content = drafts[0]?.content ?? "";
    expect(content.startsWith("The company had just been acquired")).toBe(true);
    expect(content).toContain(
      "I led North American sales for the Series A company during that transition",
    );
    expect(content.indexOf("The company had just been acquired")).toBeLessThan(
      content.indexOf("I led North American"),
    );
  });

  it("keeps a story opening the claim filter would otherwise drop", () => {
    const drafts = bestPracticeDraftsForAnswers(
      [
        {
          text: SELLER_QUESTION,
          targetKey: "role-expertise:seller",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: SELLER_QUESTION,
          answerFramework: "CAR",
          challenge: "I joined OpenText as the region changed hands.",
          situation: null,
          task: null,
          action: "I led North American sales for the Series A company during that transition.",
          result: "Done.",
          followUpQuestion: null,
        },
      ],
      ["North American sales for the Series A company"],
    );
    const content = drafts[0]?.content ?? "";
    expect(content.startsWith("I joined OpenText")).toBe(true);
    expect(content.indexOf("I joined OpenText")).toBeLessThan(
      content.indexOf("I led North American"),
    );
  });
});

describe("gap question drafts from a question match", () => {
  beforeEach(() => {
    answersGenerate.mockReset();
    gate.mockClear();
    findMany.mockReset();
    findFirst.mockReset();
    createStatement.mockReset();
    findMany.mockResolvedValue([
      {
        id: "stmt-opentext",
        content: OPENTEXT_CONTENT,
        approvedAt: new Date("2026-06-01T00:00:00.000Z"),
        session: {
          campaignId: "csc",
          campaign: { whyThisCompany: null },
        },
        turn: {
          body: OPENTEXT_QUESTION,
          targetKey: "required:team",
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
            challenge: "At OpenText two experienced sellers were missing plan.",
            situation: null,
            task: null,
            action: "I exited two underperformers and recruited two representatives.",
            result: "Those two representatives became top performers.",
            followUpQuestion: null,
          })),
        },
      };
    });
  });

  it("drafts a gap question the approved answer covers even when the requirement does not", async () => {
    const result = await draftSupportedGapQuestions({
      organizationId: "org-1",
      campaignId: "sift",
      sessionId: "session-1",
      careerStage: "late_career",
      jobSources: { title: "Director of Sales", employer: "Sift" },
      approvedAnswers: [],
      profileItems: [],
      questions: [
        {
          text: SELLER_QUESTION,
          targetKey: "gap:seller",
          interviewTypeTag: "focused_competency",
          targetText: "Own a multi-product revenue number",
        },
        {
          text: "How do you build SQL reporting for the warehouse?",
          targetKey: "gap:sql",
          interviewTypeTag: "focused_competency",
          targetText: "SQL reporting for the warehouse",
        },
      ],
    });

    expect(result).toEqual({ drafted: 1, called: true });
    expect(gate).toHaveBeenCalledTimes(1);
    const user = answersGenerate.mock.calls[0]?.[0].messages[1].content as string;
    expect(user).toContain("OpenText");
    expect(user).toContain("underperformers");
    expect(user).not.toContain("warehouse");
    expect(createStatement).toHaveBeenCalledTimes(1);
    expect(createStatement.mock.calls[0]?.[0].data).toMatchObject({
      kind: "INTERVIEW_ANSWER",
      status: "DRAFT",
      content: expect.stringContaining("OpenText"),
    });
  });

  it("stores a real story for a gap question instead of a hypothetical or mid-thought draft", () => {
    const market =
      "At OpenText I led the response to an enterprise SaaS market shift and convened Sales and Product. Win rate rose.";
    const forecast =
      "At OpenText the forecast process was inconsistent and I rebuilt the inspection cadence. Forecast accuracy rose.";
    const sellers = OPENTEXT_CONTENT;
    const sources = [market, forecast, sellers, "OpenText", "Sift"];

    function storyDraft(
      question: string,
      action: string,
      result: string,
    ): string {
      const drafts = bestPracticeDraftsForAnswers(
        [
          {
            text: question,
            targetKey: "required:0",
            interviewTypeTag: "focused_competency",
          },
        ],
        [
          {
            text: question,
            answerFramework: "CAR",
            challenge: action,
            situation: null,
            task: null,
            action,
            result,
            followUpQuestion: null,
          },
        ],
        sources,
      );
      return drafts[0]?.content ?? "";
    }

    const hypothetical = storyDraft(
      "Tell me about a recent enterprise SaaS market shift you led.",
      "I would convene Sales, Product, Marketing, and Customer Success to respond to the enterprise SaaS market shift.",
      "Win rate rose after that response.",
    );
    expect(hypothetical).toBe(market);
    expect(hypothetical).not.toMatch(/^\s*I would\b/i);
    expect(hypothetical).toContain("OpenText");

    const midThought = storyDraft(
      "Tell me about a time the forecast lacked consistency.",
      "The lack of consistency made it difficult to forecast the quarter.",
      "Forecast accuracy rose after the rebuild.",
    );
    expect(midThought).toBe(forecast);
    expect(midThought).not.toMatch(/^\s*The lack of consistency\b/);
    expect(midThought).toContain("OpenText");

    const unnamed = storyDraft(
      SELLER_QUESTION,
      "Two individuals were underperforming on the team.",
      "Those representatives became top performers.",
    );
    expect(unnamed).toBe(sellers);
    expect(unnamed).not.toMatch(/^\s*Two individuals\b/);
    expect(unnamed).toContain("OpenText");

    const alreadyGrounded = storyDraft(
      "Tell me about a time you coached sellers at a company.",
      "I joined OpenText and coached two sellers through a hard quarter.",
      "Both sellers hit quota the next quarter.",
    );
    expect(alreadyGrounded.startsWith("I joined OpenText")).toBe(true);
    expect(alreadyGrounded).toContain("coached two sellers");

    const withIncidentalWould = bestPracticeDraftsForAnswers(
      [
        {
          text: "Tell me about a time you ran deal reviews.",
          targetKey: "required:1",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: "Tell me about a time you ran deal reviews.",
          answerFramework: "CAR",
          challenge: "I ran weekly deal reviews at OpenText so the forecast the leadership team saw was one I would stand behind.",
          situation: null,
          task: null,
          action: "I ran weekly deal reviews at OpenText so the forecast the leadership team saw was one I would stand behind.",
          result: "Forecast confidence rose the next quarter.",
          followUpQuestion: null,
        },
      ],
      sources,
    );
    expect(withIncidentalWould[0]?.content).toContain("I would stand behind");
    expect(withIncidentalWould[0]?.content).toContain("OpenText");
    expect(withIncidentalWould[0]?.content).not.toMatch(/^\s*I would\b/);

    const pointOfView = bestPracticeDraftsForAnswers(
      [
        {
          text: "Which leading indicators would you use to inspect the forecast?",
          targetKey: "required:2",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: "Which leading indicators would you use to inspect the forecast?",
          answerFramework: "CAR",
          challenge: null,
          situation: null,
          task: null,
          action: "Leading indicators I would use are activity and pipeline creation.",
          result: "",
          followUpQuestion: null,
        },
      ],
      sources,
    );
    expect(pointOfView[0]?.content).toContain("I would use");
  });
});
