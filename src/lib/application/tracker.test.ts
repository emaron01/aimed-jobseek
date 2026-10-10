import { describe, expect, it } from "vitest";
import {
  consultationFacts,
  harperQuestionsNeedingAnswer,
  interviewerProfileQuestionsToAnswer,
  interviewersMissingPrepGuides,
} from "@/lib/application/tracker";
import {
  buildApplicationStepViews,
  emptyApplicationStepFacts,
  resolveApplicationStepState,
} from "@/lib/application/step-progress";

function turn(input: {
  id: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
  targetKey: string | null;
  sequence: number;
  analysisJson?: unknown;
}) {
  return {
    id: input.id,
    speaker: input.speaker,
    body: input.body,
    targetKey: input.targetKey,
    followUp: false,
    skipped: false,
    sequence: input.sequence,
    intent: null,
    analysisJson: input.analysisJson ?? null,
  };
}

describe("consultationFacts Harper green", () => {
  it("is complete when every asked question is answered", () => {
    const facts = consultationFacts({
      turns: [
        turn({
          id: "q1",
          speaker: "CONSULTANT",
          body: "Walk me through the last decade of your career?",
          targetKey: "chronology",
          sequence: 1,
        }),
        turn({
          id: "a1",
          speaker: "SEEKER",
          body: "I led sales at Acme then OpenText.",
          targetKey: "chronology",
          sequence: 2,
          analysisJson: { replyToTurnId: "q1" },
        }),
      ],
    });
    expect(facts).toEqual({
      started: true,
      unanswered: false,
      complete: true,
      unansweredCount: 0,
      firstUnansweredTurnId: null,
      guideQuestionsToAnswerCount: 0,
    });
    expect(
      resolveApplicationStepState(
        "consultation",
        {
          ...emptyApplicationStepFacts(),
          consultationStarted: facts.started,
          consultationComplete: facts.complete,
          consultationUnanswered: facts.unanswered,
        },
        [],
      ),
    ).toBe("done");
  });

  it("is incomplete when a new question is unanswered", () => {
    const facts = consultationFacts({
      turns: [
        turn({
          id: "q1",
          speaker: "CONSULTANT",
          body: "Walk me through the last decade of your career?",
          targetKey: "chronology",
          sequence: 1,
        }),
        turn({
          id: "a1",
          speaker: "SEEKER",
          body: "I led sales at Acme then OpenText.",
          targetKey: "chronology",
          sequence: 2,
          analysisJson: { replyToTurnId: "q1" },
        }),
        turn({
          id: "q2",
          speaker: "CONSULTANT",
          body: "Tell me about a forecasting win at OpenText?",
          targetKey: "forecasting",
          sequence: 3,
        }),
      ],
    });
    expect(facts).toEqual({
      started: true,
      unanswered: true,
      complete: false,
      unansweredCount: 1,
      firstUnansweredTurnId: "q2",
      guideQuestionsToAnswerCount: 0,
    });
    expect(
      resolveApplicationStepState(
        "consultation",
        {
          ...emptyApplicationStepFacts(),
          consultationStarted: facts.started,
          consultationComplete: facts.complete,
          consultationUnanswered: facts.unanswered,
        },
        [],
      ),
    ).toBe("in_progress");
  });

  it("is green when remaining questions are answered and the rest are ignored", () => {
    const facts = consultationFacts({
      turns: [
        turn({
          id: "q1",
          speaker: "CONSULTANT",
          body: "Walk me through the last decade of your career?",
          targetKey: "chronology",
          sequence: 1,
        }),
        turn({
          id: "a1",
          speaker: "SEEKER",
          body: "I led sales at Acme then OpenText.",
          targetKey: "chronology",
          sequence: 2,
          analysisJson: { replyToTurnId: "q1" },
        }),
        turn({
          id: "q2",
          speaker: "CONSULTANT",
          body: "Tell me about a forecasting win at OpenText?",
          targetKey: "forecasting",
          sequence: 3,
        }),
        {
          ...turn({
            id: "ignore-2",
            speaker: "SEEKER",
            body: "",
            targetKey: "forecasting",
            sequence: 4,
            analysisJson: {
              status: "READY",
              replyToTurnId: "q2",
              ignored: true,
            },
          }),
          skipped: true,
        },
      ],
    });
    expect(facts).toEqual({
      started: true,
      unanswered: false,
      complete: true,
      unansweredCount: 0,
      firstUnansweredTurnId: null,
      guideQuestionsToAnswerCount: 0,
    });
    expect(
      resolveApplicationStepState(
        "consultation",
        {
          ...emptyApplicationStepFacts(),
          consultationStarted: facts.started,
          consultationComplete: facts.complete,
          consultationUnanswered: facts.unanswered,
        },
        [],
      ),
    ).toBe("done");
  });
});

function statement(input: {
  id: string;
  turnId: string;
  status: "DRAFT" | "APPROVED";
}) {
  return {
    id: input.id,
    turnId: input.turnId,
    kind: "INTERVIEW_ANSWER" as const,
    status: input.status,
    content: "Shaped answer",
    strengtheningNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("harperQuestionsNeedingAnswer", () => {
  it("counts unanswered, skipped, and unapproved drafts, and skips approved and ignored", () => {
    const result = harperQuestionsNeedingAnswer({
      turns: [
        turn({
          id: "open",
          speaker: "CONSULTANT",
          body: "What was the forecasting result?",
          targetKey: "forecasting",
          sequence: 1,
        }),
        turn({
          id: "skipped-q",
          speaker: "CONSULTANT",
          body: "Walk me through a deal you lost?",
          targetKey: "deal",
          sequence: 2,
        }),
        {
          ...turn({
            id: "skip-1",
            speaker: "SEEKER",
            body: "",
            targetKey: "deal",
            sequence: 3,
            analysisJson: { status: "READY", replyToTurnId: "skipped-q" },
          }),
          skipped: true,
        },
        turn({
          id: "draft-q",
          speaker: "CONSULTANT",
          body: "How do you run a forecast?",
          targetKey: "role-expertise:forecast",
          sequence: 4,
        }),
        turn({
          id: "draft-a",
          speaker: "SEEKER",
          body: "I rebuild the model with the team.",
          targetKey: "role-expertise:forecast",
          sequence: 5,
          analysisJson: { replyToTurnId: "draft-q" },
        }),
        turn({
          id: "approved-q",
          speaker: "CONSULTANT",
          body: "Why this company?",
          targetKey: "why-this-company",
          sequence: 6,
        }),
        turn({
          id: "ignored-q",
          speaker: "CONSULTANT",
          body: "Tell me about a gap?",
          targetKey: "gap",
          sequence: 7,
        }),
        {
          ...turn({
            id: "ignore-1",
            speaker: "SEEKER",
            body: "",
            targetKey: "gap",
            sequence: 8,
            analysisJson: {
              status: "READY",
              replyToTurnId: "ignored-q",
              ignored: true,
            },
          }),
          skipped: true,
        },
      ],
      statements: [
        statement({ id: "draft-1", turnId: "draft-a", status: "DRAFT" }),
        statement({ id: "approved-1", turnId: "approved-q", status: "APPROVED" }),
      ],
    });
    expect(result.count).toBe(3);
    expect(result.firstTurnId).toBe("open");
    const facts = consultationFacts({
      turns: [
        turn({
          id: "approved-q",
          speaker: "CONSULTANT",
          body: "Why this company?",
          targetKey: "why-this-company",
          sequence: 1,
        }),
      ],
      statements: [
        statement({ id: "approved-1", turnId: "approved-q", status: "APPROVED" }),
      ],
    });
    expect(facts.unansweredCount).toBe(0);
    expect(facts.unanswered).toBe(true);
    expect(facts.complete).toBe(false);
  });
});

describe("interviewer profile questions", () => {
  it("keeps guide questions off the Harper count and on the guide lines", () => {
    const turns = [
      turn({
        id: "harper-open",
        speaker: "CONSULTANT",
        body: "What was the forecasting result?",
        targetKey: "forecasting",
        sequence: 1,
      }),
      turn({
        id: "guide-open",
        speaker: "CONSULTANT",
        body: "How do you run a forecast?",
        targetKey: "cheatSheet:contact:ashley:likely:1",
        sequence: 2,
      }),
      turn({
        id: "guide-skipped-q",
        speaker: "CONSULTANT",
        body: "Walk me through a deal you lost?",
        targetKey: "cheatSheet:contact:sam:likely:1",
        sequence: 3,
      }),
      {
        ...turn({
          id: "guide-skip",
          speaker: "SEEKER",
          body: "",
          targetKey: "cheatSheet:contact:sam:likely:1",
          sequence: 4,
          analysisJson: { status: "READY", replyToTurnId: "guide-skipped-q" },
        }),
        skipped: true,
      },
      turn({
        id: "guide-approved-q",
        speaker: "CONSULTANT",
        body: "Why this company?",
        targetKey: "cheatSheet:contact:sam:likely:2",
        sequence: 5,
      }),
      turn({
        id: "guide-ignored-q",
        speaker: "CONSULTANT",
        body: "Tell me about a gap?",
        targetKey: "cheatSheet:contact:sam:likely:3",
        sequence: 6,
      }),
      {
        ...turn({
          id: "guide-ignore",
          speaker: "SEEKER",
          body: "",
          targetKey: "cheatSheet:contact:sam:likely:3",
          sequence: 7,
          analysisJson: {
            status: "READY",
            replyToTurnId: "guide-ignored-q",
            ignored: true,
          },
        }),
        skipped: true,
      },
    ];
    const statements = [
      statement({ id: "approved-guide", turnId: "guide-approved-q", status: "APPROVED" }),
    ];
    expect(harperQuestionsNeedingAnswer({ turns, statements })).toEqual({
      count: 1,
      firstTurnId: "harper-open",
    });
    expect(interviewerProfileQuestionsToAnswer({ turns, statements })).toEqual([
      {
        contactId: "ashley",
        count: 1,
        hash: "harper-coach:contact:ashley:likely:1",
      },
      {
        contactId: "sam",
        count: 1,
        hash: "harper-coach:contact:sam:likely:1",
      },
    ]);
    const facts = {
      ...emptyApplicationStepFacts(),
      cheatSheetReady: true,
      guideQuestionsToAnswerCount: 2,
    };
    const steps = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "overview",
      facts,
      jobs: [],
      seen: {},
    });
    const guides = steps.find((step) => step.key === "summary");
    expect(guides?.workDone).toBe(false);
    expect(guides?.turnCountLabel).toBe("2 questions to answer");
    expect(guides?.state).not.toBe("not_started");
  });
});

describe("interviewersMissingPrepGuides", () => {
  it("counts interviewers on the newest interview first and names the first one without a guide", () => {
    const readyPerson = {
      contactId: "ready",
      positioningStatements: ["a"],
      keyStatements: ["b"],
      caresAbout: ["c"],
      likelyQuestions: ["d"],
      questionsToAsk: ["e"],
    };
    const result = interviewersMissingPrepGuides({
      stages: [
        {
          id: "older",
          scheduledAt: "2026-01-01T00:00:00.000Z",
          interviewerContactIds: ["missing_old"],
        },
        {
          id: "newer",
          scheduledAt: "2026-06-01T00:00:00.000Z",
          interviewerContactIds: ["ready", "missing_new"],
        },
      ],
      guidanceJson: { people: [readyPerson] },
    });
    expect(result).toEqual({ count: 2, firstContactId: "missing_new" });
  });
});
