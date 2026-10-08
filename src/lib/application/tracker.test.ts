import { describe, expect, it } from "vitest";
import {
  consultationFacts,
  interviewersMissingPrepGuides,
} from "@/lib/application/tracker";
import {
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
