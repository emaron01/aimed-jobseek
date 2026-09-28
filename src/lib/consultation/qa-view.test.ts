import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildConsultationQaView,
  consultationQuestionAcceptsReply,
  consultationReplyTargetKey,
  findConsultationQaItem,
  isLegacyInaccuracyReply,
  isPrimaryHarperQuestion,
  latestClosingNote,
  resolveReplyableQaItem,
} from "@/lib/consultation/qa-view";
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

describe("Harper question-limit coach", () => {
  it("drafts at most the application question limit in one step and lists each as collapsible", () => {
    expect(consultationConfig.roundSize).toBe(25);
    expect(consultationConfig.applicationQuestionLimit).toBe(25);
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
    expect(thread).toContain("consultation-question");
    expect(thread).toContain("consultation-question-item");
    expect(thread).toContain("name=\"targetKey\"");
    expect(thread).toContain("skipConsultationQuestionAction");
    expect(thread).toContain("consultationConversationCopy.skipQuestion");
    expect(thread).toContain("ignoreConsultationQuestionAction");
    expect(thread).toContain("consultationConversationCopy.ignoreQuestion");
    expect(thread).toContain("consultationConversationCopy.showYourReplies");
    expect(thread).toContain("consultationConversationCopy.hideYourReplies");
    expect(consultationConversationCopy.skipQuestion).toBe("Skip");
    expect(consultationConversationCopy.ignoreQuestion).toBe("Ignore");
  });

  it("keeps an ignored question on the list with Ignored state until reopened", () => {
    // Batch A: ignored questions stay visible with an Ignored reopen link (PO decision 3).
    const view = buildConsultationQaView({
      turns: [
        question,
        second,
        {
          id: "ignore-1",
          speaker: "SEEKER" as const,
          body: "",
          targetKey: "why",
          followUp: false,
          sequence: 3,
          analysisJson: {
            status: "READY",
            replyToTurnId: "q1",
            ignored: true,
          },
        },
      ],
      statements: [],
    });
    expect(view.questions.map((item) => item.questionTurnId)).toEqual(["q1", "q2"]);
    expect(view.questions.find((item) => item.questionTurnId === "q1")?.ignored).toBe(
      true,
    );
    expect(view.questions.find((item) => item.questionTurnId === "q2")?.ignored).toBe(
      false,
    );
    expect(
      consultationQuestionAcceptsReply(
        view.questions.find((item) => item.questionTurnId === "q1")!,
      ),
    ).toBe(false);
  });

  it("hides legacy Not accurate seeker turns from the thread", () => {
    const view = buildConsultationQaView({
      turns: [
        question,
        seeker("s1", "I used Python for 5 years and cut failed jobs by 40%.", 2, "why"),
        {
          id: "s-flag",
          speaker: "SEEKER" as const,
          body: "Not accurate.",
          targetKey: "why",
          followUp: false,
          sequence: 3,
          intent: "NOT_ACCURATE",
        },
      ],
      statements: [],
    });
    expect(view.questions[0]?.seekerAnswers.map((answer) => answer.body)).toEqual([
      "I used Python for 5 years and cut failed jobs by 40%.",
    ]);
    expect(
      isLegacyInaccuracyReply({
        speaker: "SEEKER",
        body: "Not accurate.",
        intent: null,
      }),
    ).toBe(true);
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
    const leftover = buildConsultationQaView({
      turns: [
        question,
        seeker("s1", "I like the mission.", 2, "why"),
        seeker("s2", "We grew the region 40%.", 3, "why"),
      ],
      statements: [
        {
          id: "old-raw",
          turnId: "s1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I like the mission.",
          strengtheningNote: null,
          createdAt: "2026-09-26T18:00:00.000Z",
        },
        {
          id: "old-frag",
          turnId: "s1",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "the mission.",
          strengtheningNote: null,
          createdAt: "2026-09-26T18:00:00.000Z",
        },
        {
          id: "new-interview",
          turnId: "s2",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I grew the region 40%.",
          strengtheningNote: null,
          createdAt: "2026-09-26T17:00:00.000Z",
        },
        {
          id: "new-bullet",
          turnId: "s2",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Grew the region 40%.",
          strengtheningNote: null,
          createdAt: "2026-09-26T17:00:00.000Z",
        },
      ],
    });
    expect(leftover.questions[0]?.talkingPoint?.content).toBe("I grew the region 40%.");
    expect(leftover.questions[0]?.resumeBullet?.content).toBe("Grew the region 40%.");
    expect(done.questions[1]?.question).toBe(second.body);

    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("consultation-answered");
    expect(thread).toContain("consultation-statement-${statement.kind}");
    expect(thread).toContain("consultation-seeker-answers");
    expect(thread).toContain("consultation-seeker-turn");
    expect(thread).toContain("editConsultationAnswerAction");
    expect(thread).toContain("consultationConversationCopy.yourReply");
    expect(thread).toContain("consultationConversationCopy.editAnswer");
    expect(thread).toContain("consultation-edit-reply");
    expect(thread).not.toContain("consultationConversationCopy.addAnotherReply");
    expect(thread).toContain("approveConsultationQaResultAction");
    expect(thread).toContain("regenerateConsultationQaResultAction");
    expect(thread).toContain("consultationConversationCopy.approve");
    expect(thread).toContain("polishCopy.regenerate");
    expect(consultationConversationCopy.approve).toBe("Approve");
    expect(polishCopy.regenerate).toBe("Regenerate");
    const card = thread.slice(thread.indexOf("function QuestionCard"));
    const resultIndex = card.indexOf("{hasResult && !item.ignored ? (");
    const repliesMatch = card.match(/\{!item\.ignored \? \(\r?\n\s*<SeekerRepliesSection/);
    const repliesIndex = repliesMatch?.index ?? -1;
    const followUpIndex = card.indexOf("consultation-follow-up");
    expect(resultIndex).toBeGreaterThan(-1);
    expect(repliesIndex).toBeGreaterThan(resultIndex);
    expect(followUpIndex).toBeGreaterThan(-1);
    expect(followUpIndex).toBeLessThan(repliesIndex);
    expect(card).not.toMatch(
      /SeekerRepliesSection[\s\S]*consultation-follow-up/,
    );
  });

  it("attaches each existing answer to the question it actually answered", () => {
    const opentext = {
      id: "q-old",
      speaker: "CONSULTANT" as const,
      body: "Walk me through the OpenText ARM go-to-market rebuild.",
      targetKey: "why-this-company",
      followUp: false,
      sequence: 1,
    };
    const csc = {
      id: "q-new",
      speaker: "CONSULTANT" as const,
      body: "What specifically draws you to CSC?",
      targetKey: "why-this-company",
      followUp: false,
      sequence: 8,
    };
    const view = buildConsultationQaView({
      turns: [
        opentext,
        seeker("s-old", "I rebuilt ARM GTM at OpenText.", 2, "why-this-company"),
        csc,
      ],
      statements: [
        {
          id: "st-old",
          turnId: "s-old",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Rebuilt OpenText ARM go-to-market.",
          strengtheningNote: null,
        },
      ],
    });
    expect(view.questions[0]?.question).toBe(opentext.body);
    expect(view.questions[0]?.resumeBullet?.content).toBe(
      "Rebuilt OpenText ARM go-to-market.",
    );
    expect(view.questions[1]?.question).toBe(csc.body);
    expect(view.questions[1]?.resumeBullet).toBeNull();
    expect(view.questions[1]?.seekerAnswers).toEqual([]);
    expect(consultationQuestionAcceptsReply(view.questions[0]!)).toBe(false);
    expect(consultationQuestionAcceptsReply(view.questions[1]!)).toBe(true);
    expect(
      findConsultationQaItem(view, consultationReplyTargetKey(opentext.id))
        ?.questionTurnId,
    ).toBe(opentext.id);
    expect(
      resolveReplyableQaItem(view, consultationReplyTargetKey(csc.id))
        ?.questionTurnId,
    ).toBe(csc.id);
    expect(resolveReplyableQaItem(view, "why-this-company")?.questionTurnId).toBe(
      csc.id,
    );
    expect(
      resolveReplyableQaItem(view, consultationReplyTargetKey(opentext.id)),
    ).toBeNull();
  });

  it("pins a later reply to the card the seeker answered when keys are shared", () => {
    const opentext = {
      id: "q-old",
      speaker: "CONSULTANT" as const,
      body: "Walk me through the OpenText ARM go-to-market rebuild.",
      targetKey: "why-this-company",
      followUp: false,
      sequence: 1,
    };
    const csc = {
      id: "q-new",
      speaker: "CONSULTANT" as const,
      body: "What specifically draws you to CSC?",
      targetKey: "why-this-company",
      followUp: false,
      sequence: 8,
    };
    const view = buildConsultationQaView({
      turns: [
        opentext,
        seeker("s-old", "I rebuilt ARM GTM at OpenText.", 2, "why-this-company"),
        csc,
        {
          ...seeker(
            "s-new",
            "I developed an emerging manager at Login VSI.",
            9,
            "why-this-company",
          ),
          analysisJson: { status: "PENDING", replyToTurnId: opentext.id },
        },
      ],
      statements: [
        {
          id: "st-old",
          turnId: "s-old",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Rebuilt OpenText ARM go-to-market.",
          strengtheningNote: null,
        },
      ],
    });
    expect(view.questions[0]?.seekerAnswers.map((answer) => answer.body)).toEqual(
      [
        "I rebuilt ARM GTM at OpenText.",
        "I developed an emerging manager at Login VSI.",
      ],
    );
    expect(view.questions[1]?.seekerAnswers).toEqual([]);
    expect(consultationQuestionAcceptsReply(view.questions[1]!)).toBe(true);
  });

  it("keeps an answer whose original question is gone as its own answered question", () => {
    const csc = {
      id: "q-new",
      speaker: "CONSULTANT" as const,
      body: "What specifically draws you to CSC?",
      targetKey: "why-this-company",
      followUp: false,
      sequence: 8,
    };
    const view = buildConsultationQaView({
      turns: [
        seeker("s-old", "I rebuilt ARM GTM at OpenText.", 2, "why-this-company"),
        csc,
      ],
      statements: [
        {
          id: "st-old",
          turnId: "s-old",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Rebuilt OpenText ARM go-to-market.",
          strengtheningNote: null,
        },
      ],
    });
    expect(view.questions[0]?.question).toBe(consultationConversationCopy.yourAnswer);
    expect(view.questions[0]?.resumeBullet?.content).toBe(
      "Rebuilt OpenText ARM go-to-market.",
    );
    expect(view.questions[0]?.seekerAnswers.map((answer) => answer.body)).toEqual([
      "I rebuilt ARM GTM at OpenText.",
    ]);
    expect(view.questions[1]?.question).toBe(csc.body);
    expect(view.questions[1]?.resumeBullet).toBeNull();
  });

  it("shows an answered follow-up with no parent as its own question", () => {
    const view = buildConsultationQaView({
      turns: [
        {
          id: "generic",
          speaker: "CONSULTANT" as const,
          body: "What changed because of that work?",
          targetKey: "why",
          followUp: false,
          sequence: 1,
        },
        seeker("s1", "I rebuilt ARM GTM at OpenText.", 2, "why"),
      ],
      statements: [
        {
          id: "st1",
          turnId: "s1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I rebuilt ARM GTM at OpenText.",
          strengtheningNote: null,
        },
      ],
    });
    expect(view.questions).toHaveLength(1);
    expect(view.questions[0]?.question).toBe(
      "What changed because of that work?",
    );
    expect(view.questions[0]?.talkingPoint?.content).toBe(
      "I rebuilt ARM GTM at OpenText.",
    );
  });

  it("nests the generic story ask under the question it follows and keeps an answer box", () => {
    const view = buildConsultationQaView({
      turns: [
        question,
        second,
        seeker("s1", "I like the mission.", 3, "why"),
        {
          id: "generic",
          speaker: "CONSULTANT" as const,
          body: "What changed because of that work?",
          targetKey: "why",
          followUp: true,
          sequence: 4,
        },
      ],
      statements: [],
    });
    expect(view.questions.map((item) => item.question)).toEqual([
      question.body,
      second.body,
    ]);
    expect(view.questions[0]?.followUp?.text).toBe(
      "What changed because of that work?",
    );
    expect(view.questions[0]?.resumeBullet).toBeNull();
    expect(consultationQuestionAcceptsReply(view.questions[0]!)).toBe(true);

    const afterFollowUp = buildConsultationQaView({
      turns: [
        question,
        second,
        seeker("s1", "I like the mission.", 3, "why"),
        {
          id: "generic",
          speaker: "CONSULTANT" as const,
          body: "What changed because of that work?",
          targetKey: "why",
          followUp: true,
          sequence: 4,
        },
        {
          ...seeker("s2", "We grew the region 40%.", 5, "why"),
          analysisJson: { status: "READY", replyToTurnId: question.id },
        },
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
    expect(afterFollowUp.questions[0]?.followUp).toBeNull();
    expect(consultationQuestionAcceptsReply(afterFollowUp.questions[0]!)).toBe(
      false,
    );
  });

  it("shows only the latest closing note and never treats it as a question", () => {
    const firstClose = {
      id: "c1",
      speaker: "CONSULTANT" as const,
      body: "The question plan is complete.",
      targetKey: null,
      followUp: false,
      sequence: 10,
      intent: "CLOSING",
    };
    const laterClose = {
      id: "c2",
      speaker: "CONSULTANT" as const,
      body: "The question plan is complete after your last answers.",
      targetKey: null,
      followUp: false,
      sequence: 14,
      intent: "CLOSING",
    };
    expect(isPrimaryHarperQuestion(firstClose)).toBe(false);
    expect(isPrimaryHarperQuestion(laterClose)).toBe(false);
    expect(
      latestClosingNote([question, firstClose, laterClose]),
    ).toBe("The question plan is complete after your last answers.");
    const view = buildConsultationQaView({
      turns: [question, firstClose, laterClose],
      statements: [],
    });
    expect(view.questions.map((item) => item.questionTurnId)).toEqual(["q1"]);
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).toContain("latestClosingNote");
    expect(section).toContain("standingWorkIsComplete");
    expect(section).toContain("threadStatus");
  });

  it("keeps Where you stand above the questions and has no Harper-page navigation", () => {
    // Batch A: standing moves above General / interviewer questions (plan report).
    // Batch B3: interviewer Q&A lives in HarperPersonInlineProfile (person view).
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const render = section.slice(section.indexOf("return ("));
    expect(section).not.toContain("HarperSuggestionList");
    expect(section).toContain("consultation-standing-panel");
    expect(render.indexOf("consultation-standing-panel")).toBeLessThan(
      render.indexOf("HarperPersonInlineProfile"),
    );
    expect(section).toContain("consultationConversationCopy.whereYouStand");
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    expect(service).not.toContain("async function continueAfterAnsweredRound");
    const actions = readFileSync("src/app/actions/consultation.ts", "utf8");
    const approveAction = actions.slice(
      actions.indexOf("export async function approveConsultationQaResultAction"),
      actions.indexOf("export async function regenerateConsultationQaResultAction"),
    );
    expect(approveAction).toContain("approveConsultationQaResult");
    expect(approveAction).toContain('operation: "continue"');
    expect(consultationConversationCopy.confirmed).toBe("Approved.");
    const live = readFileSync("src/components/ApplicationWorkspaceLive.tsx", "utf8");
    expect(live).toContain("export function WorkspaceJobRefresh");
    expect(section).toContain("WorkspaceJobRefresh");
    expect(section).toContain("consultationHasUnansweredQuestions");
    expect(section).toContain("{consultationBusy ? (");
    expect(section).not.toContain(
      "consultationBusy || session?.generationStatus === \"GENERATING\"",
    );
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("consultation-result-");
    expect(thread).toContain("-approved");
    expect(thread).toContain("consultationReplyTargetKey");
    expect(thread).toContain("consultationQuestionAcceptsReply");
    expect(thread).not.toContain("item.targetKey ||");
    expect(thread).not.toContain("That question is not open.");
    expect(service).not.toContain("That question is not open.");
    expect(actions).not.toContain("That question is not open.");
    expect(actions).not.toContain("That question was not found.");
    expect(consultationConversationCopy.replyFailed).toBe(
      "The reply could not be sent.",
    );
  });
});
