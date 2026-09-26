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

const followUp = {
  id: "q1b",
  speaker: "CONSULTANT" as const,
  body: "What was the result?",
  targetKey: "why",
  followUp: true,
  sequence: 3,
};

const nextQuestion = {
  id: "q2",
  speaker: "CONSULTANT" as const,
  body: "Tell me about a sale you led.",
  targetKey: "required:0",
  followUp: false,
  sequence: 6,
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

describe("Harper question-and-result coach", () => {
  it("asks one question at a time and at most one follow-up before a result", () => {
    expect(consultationConfig.roundSize).toBe(1);
    expect(consultationConfig.maxFollowUpsPerTarget).toBe(1);
    const waiting = buildConsultationQaView({
      turns: [question, seeker("s1", "I like the mission.", 2, "why"), followUp],
      statements: [
        {
          id: "st1",
          turnId: "s1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "Early draft",
          strengtheningNote: null,
        },
      ],
    });
    expect(waiting.answered).toHaveLength(0);
    expect(waiting.currentQuestion?.text).toBe(followUp.body);

    const afterFollowUp = buildConsultationQaView({
      turns: [
        question,
        seeker("s1", "I like the mission.", 2, "why"),
        followUp,
        seeker("s2", "We grew the region 40%.", 4, "why"),
        nextQuestion,
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
    expect(afterFollowUp.answered).toHaveLength(1);
    expect(afterFollowUp.answered[0]?.question).toBe(question.body);
    expect(afterFollowUp.currentQuestion?.text).toBe(nextQuestion.body);
  });

  it("keeps the question and result visible and collapses the seeker answer", () => {
    const view = buildConsultationQaView({
      turns: [
        question,
        seeker("s1", "I like the mission.", 2, "why"),
        nextQuestion,
      ],
      statements: [
        {
          id: "st2",
          turnId: "s1",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Grew enterprise revenue.",
          strengtheningNote: null,
        },
        {
          id: "st3",
          turnId: "s1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I grew enterprise revenue.",
          strengtheningNote: null,
        },
      ],
    });
    expect(view.answered[0]?.resumeBullet?.content).toBe("Grew enterprise revenue.");
    expect(view.answered[0]?.talkingPoint?.content).toBe(
      "I grew enterprise revenue.",
    );
    expect(view.answered[0]?.seekerAnswers[0]?.body).toBe("I like the mission.");

    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("consultation-answered");
    expect(thread).toContain("consultation-question");
    expect(thread).toContain("consultation-statement-${statement.kind}");
    expect(thread).toContain("consultation-seeker-answer");
    expect(thread).toContain("<details");
    expect(thread).toContain("consultationConversationCopy.yourAnswer");
    expect(thread).toContain("consultation-current-question");
    expect(thread).toContain("approveConsultationQaResultAction");
    expect(thread).toContain("regenerateConsultationQaResultAction");
    expect(thread).toContain("consultationConversationCopy.approve");
    expect(thread).toContain("polishCopy.regenerate");
  });

  it("drops the Harper-page navigation buttons and keeps Where you stand below", () => {
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).not.toContain("HarperSuggestionList");
    expect(section).toContain("consultation-standing-panel");
    expect(section.indexOf("ConsultationThread")).toBeLessThan(
      section.indexOf("consultation-standing-panel"),
    );
    expect(section).toContain("consultationConversationCopy.whereYouStand");
    expect(consultationConversationCopy.approve).toBe("Approve");
    expect(polishCopy.regenerate).toBe("Regenerate");
  });
});
