import { describe, expect, it } from "vitest";
import {
  mergePersonLikelyQuestions,
  resolvePersonLikelyQuestions,
} from "@/lib/application-summary/likely-questions";
import {
  DEFAULT_LIKELY_QUESTIONS_PER_PERSON,
  parseLikelyQuestionsPerPerson,
} from "@/lib/application-summary/likely-question-limit";

const EXACT = "I ran OpenText Migrate outreach with Product Marketing and the launch held.";

describe("person-guide likely questions", () => {
  it("inserts an approved answer word for word and blanks an unknown or null id", () => {
    const items = resolvePersonLikelyQuestions({
      likelyQuestions: [
        {
          prompt: "How have you worked with marketing on a launch?",
          approvedAnswerId: "stmt-migrate",
          interviewTypeTag: "focused_competency",
        },
        {
          prompt: "Why are you looking now?",
          approvedAnswerId: "missing",
          interviewTypeTag: "screening",
        },
        {
          prompt: "What compensation are you targeting?",
          approvedAnswerId: null,
          interviewTypeTag: "screening",
        },
      ],
      harperAskedCareerWalkThrough: false,
      approvedAnswers: [
        {
          id: "stmt-migrate",
          question: "Tell me about a cross-functional launch.",
          content: EXACT,
        },
      ],
    });
    expect(items[0]?.prompt).toBe("How have you worked with marketing on a launch?");
    expect(items[0]?.sampleAnswer).toBe(EXACT);
    expect(items[1]?.sampleAnswer).toBeNull();
    expect(items[2]?.sampleAnswer).toBeNull();
    expect(items.every((item) => item.generalQuestionId == null)).toBe(true);
  });

  it("trims a list over the setting to the first max items and keeps seeker answers unchanged", () => {
    const kept = {
      id: "contact:c1:likely:kept",
      prompt: "Why are you looking now?",
      sampleAnswer: "I want a marketing seat.",
      harperQuestion: null,
      supports: [],
    };
    const harperOnly = {
      id: "contact:c1:likely:old",
      prompt: "How have you used pipeline inspection and forecasting?",
      generalQuestionId: "turn-general",
      sampleAnswer: null,
      harperQuestion: null,
      supports: [],
    };
    const incoming = [
      "What compensation range are you targeting?",
      "When could you start?",
      "How large a team have you led?",
      "Which markets have you launched in?",
      "How do you measure a campaign?",
      "Who did you partner with in product marketing?",
      "What would you ask our customers first?",
      "How do you handle a missed launch date?",
      "What budget have you owned?",
      "How do you brief a sales team on a launch?",
    ].map((prompt) => ({
      prompt,
      sampleAnswer: null,
      harperQuestion: null,
      supports: [],
    }));
    const merged = mergePersonLikelyQuestions({
      existing: [kept, harperOnly],
      incoming,
      seekerKeptIds: new Set([kept.id]),
      max: DEFAULT_LIKELY_QUESTIONS_PER_PERSON,
    });
    expect(DEFAULT_LIKELY_QUESTIONS_PER_PERSON).toBe(8);
    expect(parseLikelyQuestionsPerPerson(null)).toBe(8);
    expect(parseLikelyQuestionsPerPerson({})).toBe(8);
    expect(parseLikelyQuestionsPerPerson({ max: 8 })).toBe(8);
    expect(merged).toHaveLength(8);
    expect(merged[0]).toEqual(kept);
    expect(merged.map((item) => item.prompt)).not.toContain(harperOnly.prompt);
    expect(merged[1]?.prompt).toBe(incoming[0]?.prompt);
  });
});
