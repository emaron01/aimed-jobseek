import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildConsultationQaView } from "@/lib/consultation/qa-view";
import {
  consultationConfig,
  consultationConversationCopy,
  polishCopy,
} from "@/lib/product-config";

const question = {
  id: "q1",
  speaker: "CONSULTANT" as const,
  body: "Why do you want this role?",
  targetKey: "why",
  followUp: false,
  sequence: 1,
};

const second = {
  id: "q2",
  speaker: "CONSULTANT" as const,
  body: "Tell me about a sale you led.",
  targetKey: "required:0",
  followUp: false,
  sequence: 2,
};

const followUp = {
  id: "q1b",
  speaker: "CONSULTANT" as const,
  body: "What was the result?",
  targetKey: "why",
  followUp: true,
  sequence: 4,
};

function seeker(id: string, body: string, sequence: number, targetKey: string) {
  return {
    id,
    speaker: "SEEKER" as const,
    body,
    targetKey,
    followUp: false,
    sequence,
  };
}

describe("Harper ten-question coach", () => {
  it("drafts at most 10 questions in one step and lists each as collapsible", () => {
    expect(consultationConfig.roundSize).toBe(10);
    expect(consultationConfig.maxFollowUpsPerTarget).toBe(1);
    const drafted = Array.from({ length: 12 }, (_, index) => ({
      id: `q${index}`,
      speaker: "CONSULTANT" as const,
      body: `Question ${index + 1}?`,
      targetKey: `gap:${index}`,
      followUp: false,
      sequence: index + 1,
    }));
    const view = buildConsultationQaView({ turns: drafted, statements: [] });
    expect(view.questions.length).toBeGreaterThan(1);
    expect(view.questions[0]?.question).toBe("Question 1?");
    expect(view.questions[1]?.question).toBe("Question 2?");

    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("<details");
    expect(thread).toContain("consultation-question");
    expect(thread).toContain("consultation-question-item");
    expect(thread).toContain("name=\"targetKey\"");
  });

  it("lets the seeker answer in any order and keeps the other questions", () => {
    const afterSecond = buildConsultationQaView({
      turns: [
        question,
        second,
        seeker("s2", "I led a $4M renewal.", 3, "required:0"),
      ],
      statements: [
        {
          id: "st2",
          turnId: "s2",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Led a $4M renewal.",
          strengtheningNote: null,
        },
        {
          id: "st3",
          turnId: "s2",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I led a $4M renewal.",
          strengtheningNote: null,
        },
      ],
    });
    expect(afterSecond.questions).toHaveLength(2);
    expect(afterSecond.questions[0]?.question).toBe(question.body);
    expect(afterSecond.questions[0]?.resumeBullet).toBeNull();
    expect(afterSecond.questions[1]?.resumeBullet?.content).toBe("Led a $4M renewal.");
    expect(afterSecond.questions[1]?.talkingPoint?.content).toBe("I led a $4M renewal.");
  });

  it("asks at most one follow-up, then shows a resume bullet and talking point", () => {
    const waiting = buildConsultationQaView({
      turns: [question, second, seeker("s1", "I like the mission.", 3, "why"), followUp],
      statements: [],
    });
    expect(waiting.questions[0]?.followUp?.text).toBe(followUp.body);
    expect(waiting.questions[0]?.resumeBullet).toBeNull();
    expect(waiting.questions[1]?.question).toBe(second.body);

    const done = buildConsultationQaView({
      turns: [
        question,
        second,
        seeker("s1", "I like the mission.", 3, "why"),
        followUp,
        seeker("s2", "We grew the region 40%.", 5, "why"),
      ],
      statements: [
        {
          id: "st2",
          turnId: "s2",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Grew the region 40%.",
          strengtheningNote: null,
        },
        {
          id: "st3",
          turnId: "s2",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I grew the region 40%.",
          strengtheningNote: null,
        },
      ],
    });
    expect(done.questions[0]?.followUp).toBeNull();
    expect(done.questions[0]?.resumeBullet?.content).toBe("Grew the region 40%.");
    expect(done.questions[0]?.talkingPoint?.content).toBe("I grew the region 40%.");
    expect(done.questions[0]?.seekerAnswers.map((answer) => answer.body)).toEqual([
      "I like the mission.",
      "We grew the region 40%.",
    ]);
    expect(done.questions[1]?.question).toBe(second.body);

    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("consultation-answered");
    expect(thread).toContain("consultation-statement-${statement.kind}");
    expect(thread).toContain("consultation-seeker-answer");
    expect(thread).toContain("approveConsultationQaResultAction");
    expect(thread).toContain("regenerateConsultationQaResultAction");
    expect(thread).toContain("consultationConversationCopy.approve");
    expect(thread).toContain("polishCopy.regenerate");
    expect(consultationConversationCopy.approve).toBe("Approve");
    expect(polishCopy.regenerate).toBe("Regenerate");
  });

  it("keeps Where you stand below the questions and has no Harper-page navigation", () => {
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).not.toContain("HarperSuggestionList");
    expect(section).toContain("consultation-standing-panel");
    expect(section.indexOf("ConsultationThread")).toBeLessThan(
      section.indexOf("consultation-standing-panel"),
    );
    expect(section).toContain("consultationConversationCopy.whereYouStand");
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    expect(service).not.toContain("async function continueAfterAnsweredRound");
  });
});
