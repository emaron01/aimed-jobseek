import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

import { CheatSheetSection } from "@/components/CheatSheetCollapsible";
import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
import {
  CheatSheetFilterProvider,
  CheatSheetPersonSection,
  CheatSheetSharedSection,
} from "@/components/CheatSheetPeopleFilter";
import { CheatSheetQuestionCards } from "@/components/CheatSheetQuestionCards";
import { QuestionList } from "@/components/ConsultationThread";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { cheatSheetSectionIdsToOpen } from "@/lib/application-summary/cheat-sheet-collapse";
import {
  alreadyAnsweredGeneralDuplicateCount,
  questionTextNearDuplicate,
} from "@/lib/consultation/general-question-match";
import {
  generalQuestionsForCheatSheet,
  partitionGeneralQuestionsForStanding,
} from "@/lib/consultation/harper-layout";
import { questionNearDuplicate } from "@/lib/consultation/questions";
import {
  consultationReplyTargetKey,
  type ConsultationQaItem,
} from "@/lib/consultation/qa-view";
import {
  consultationConversationCopy,
  consultationStatementLabels,
} from "@/lib/product-config";

function openQuestion(
  questionTurnId: string,
  targetKey: string,
  question: string,
  extra: Partial<ConsultationQaItem> = {},
): ConsultationQaItem {
  return {
    questionTurnId,
    targetKey,
    question,
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    pendingDraftTalkingPoint: null,
    pendingDraftResumeBullet: null,
    ignored: false,
    ...extra,
  };
}

function el(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
): ReactNode {
  return createElement(type as never, props, ...children);
}

function markup(node: ReactNode): string {
  return renderToStaticMarkup(createElement(HarperDraftProvider, null, node));
}

const sharedText = "Tell me how you run a weekly forecast inspection.";
const generalShared = openQuestion("q-general", "required:forecast", sharedText, {
  interviewTypeTag: "focused_competency",
});
const personOnly = "How do you coach a manager who misses the commit?";
const otherPerson = "What did you change in the handoff to delivery?";

describe("Cheat Sheet batch 2b", () => {
  it("shows a sample answer as an Interview answer draft with Approve, Edit, and Save Answer", () => {
    const html = markup(
      createElement(CheatSheetCoachItems, {
        campaignId: "camp_1",
        canEdit: true,
        items: [
          {
            id: "likely:1",
            prompt: "Tell me how you run a weekly forecast.",
            sampleAnswer: "I moved the commit to Monday.",
            harperQuestion: null,
            supports: [],
          },
        ],
      }),
    );
    expect(html).toContain(consultationStatementLabels.INTERVIEW_ANSWER);
    expect(html).toContain(consultationStatementLabels.DRAFT);
    expect(html).toContain(consultationConversationCopy.approve);
    expect(html).toContain(consultationConversationCopy.editAnswer);
    expect(html).toContain(consultationConversationCopy.threadReply);
    expect(html).toContain("I moved the commit to Monday.");
    expect(html.match(/Tell me how you run a weekly forecast\./g)?.length).toBe(1);
  });

  it("keeps the working state until the outcome is written", () => {
    const pending = openQuestion(
      "q_pending",
      "required:forecast",
      "Tell me how you run a weekly forecast.",
      {
        seekerAnswers: [
          {
            id: "s1",
            body: "I sat in on two calls.",
            analysisJson: { status: "PENDING" },
          },
        ],
      },
    );
    const waiting = markup(
      createElement(QuestionList, {
        campaignId: "camp_1",
        canEdit: true,
        questions: [pending],
        showReply: true,
        pendingTarget: null,
        jobsActive: true,
        onSubmitStart: () => undefined,
      }),
    );
    expect(waiting).toContain(consultationConversationCopy.thinking);
    expect(waiting).toContain(consultationConversationCopy.processingCanTakeMinutes);
    expect(waiting).not.toContain(consultationConversationCopy.showYourReplies);
    expect(waiting).not.toContain(consultationConversationCopy.editAnswer);

    const drafted = openQuestion(
      "q_done",
      "required:forecast",
      "Tell me how you run a weekly forecast.",
      {
        seekerAnswers: [
          {
            id: "s1",
            body: "I sat in on two calls.",
            analysisJson: { status: "READY" },
          },
        ],
        talkingPoint: {
          id: "st1",
          turnId: "s1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I inspect the deal before I commit the forecast.",
          strengtheningNote: null,
        },
        statements: [
          {
            id: "st1",
            turnId: "s1",
            kind: "INTERVIEW_ANSWER",
            status: "DRAFT",
            content: "I inspect the deal before I commit the forecast.",
            strengtheningNote: null,
          },
        ],
      },
    );
    const done = markup(
      createElement(QuestionList, {
        campaignId: "camp_1",
        canEdit: true,
        questions: [drafted],
        showReply: true,
        pendingTarget: null,
        jobsActive: false,
        onSubmitStart: () => undefined,
      }),
    );
    expect(done).toContain("I inspect the deal before I commit the forecast.");
    expect(done).toContain(consultationStatementLabels.DRAFT);
    expect(done).not.toContain(consultationConversationCopy.thinking);
  });

  it("renders each question once and puts general items only in General Questions", () => {
    const why = openQuestion("q-why", "why-this-company", "Why do you want this company?");
    const career = openQuestion(
      "q-career",
      "chronology",
      "Walk me through your career path from your first role.",
    );
    const role = openQuestion(
      "q-role",
      "role-expertise:forecast",
      "How would you run forecast in the first 90 days?",
    );
    const requirement = openQuestion(
      "q-req",
      "required:motion",
      "Tell me how you built a repeatable enterprise motion.",
    );
    const overview = openQuestion(
      "q-gap",
      "cheatSheet:overview:gap:local",
      "Where have you not run this motion yet?",
    );
    const leftover = openQuestion("q-left", "general:leftover", "What should I know that we have not covered?");
    const personQuestion = openQuestion("q-person", "person-prep:c1", personOnly);
    const partition = partitionGeneralQuestionsForStanding({
      general: [why, career, role, requirement, overview, leftover],
      requirementTargetKeys: ["required:motion"],
    });
    const general = generalQuestionsForCheatSheet(partition);
    expect(general.map((item) => item.questionTurnId)).toEqual([
      "q-why",
      "q-career",
      "q-role",
      "q-req",
      "q-gap",
      "q-left",
    ]);
    expect(general.some((item) => item.questionTurnId === personQuestion.questionTurnId)).toBe(
      false,
    );

    const options = [
      {
        sectionKey: "contact:c1",
        heading: "Priya",
        personName: "Priya",
        personaName: "Hiring Manager",
        titles: ["Director"],
      },
      {
        sectionKey: "contact:c2",
        heading: "Sam",
        personName: "Sam",
        personaName: "Recruiter",
        titles: ["Recruiter"],
      },
    ];
    const html = markup(
      el(
        CheatSheetFilterProvider,
        { options, initialPersonKey: null },
        el(
          "div",
          null,
          el(CheatSheetSharedSection, null, el("p", null, "At a glance stays with the shared sections.")),
          el(
            CheatSheetSection,
            { id: "general-questions", title: "General Questions" },
            createElement(CheatSheetQuestionCards, {
              campaignId: "camp_1",
              canEdit: true,
              questions: general,
              testId: "cheat-sheet-general-questions",
            }),
          ),
          el(
            CheatSheetPersonSection,
            { sectionKey: "contact:c1" },
            el("div", { "data-testid": "person-a" }, personOnly),
          ),
          el(
            CheatSheetPersonSection,
            { sectionKey: "contact:c2" },
            el("div", { "data-testid": "person-b" }, otherPerson),
          ),
        ),
      ),
    );
    for (const item of general) {
      expect(html.match(new RegExp(item.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(1);
    }
    expect(html).toContain('id="general-questions"');
    expect(html).toContain("General Questions");
    expect(html).toContain('data-cheat-sheet-open="false"');
    expect(html).toContain("cheat-sheet-collapsible-heading");
    expect(html).toContain("cheat-sheet-collapsible-body");
    expect(html).toContain(personOnly);
    expect(html).toContain(otherPerson);
    const generalBlock = html.slice(
      html.indexOf('data-testid="cheat-sheet-general-questions"'),
      html.indexOf('data-testid="person-a"'),
    );
    expect(generalBlock).toContain(why.question);
    expect(generalBlock).not.toContain(personOnly);
    expect(html.slice(html.indexOf('data-testid="person-a"'))).not.toContain(why.question);

    const filtered = markup(
      el(
        CheatSheetFilterProvider,
        { options, initialPersonKey: "contact:c1" },
        el(
          "div",
          null,
          el(CheatSheetSharedSection, null, el("p", null, "At a glance stays with the shared sections.")),
          el(
            CheatSheetSection,
            { id: "general-questions", title: "General Questions" },
            createElement(CheatSheetQuestionCards, {
              campaignId: "camp_1",
              canEdit: true,
              questions: [why],
            }),
          ),
        ),
      ),
    );
    expect(filtered).toContain(why.question);
    expect(filtered).not.toContain("At a glance stays with the shared sections.");
    expect(cheatSheetSectionIdsToOpen({ hash: "#general-questions", personQuery: null })).toContain(
      "general-questions",
    );
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".application-summary .cheat-sheet-collapsible-body");
    expect(css).toContain("display: block !important");
  });

  it("shares a matching General question and leaves non-matches and answered items alone", () => {
    const intentOnlyGeneral = openQuestion(
      "q-intent",
      "chronology",
      "Walk me through your career path starting with your first employer.",
      { interviewTypeTag: "chronological_walk_through" },
    );
    const intentOnlyPerson = "Walk me through your roles and why you moved on.";
    expect(questionNearDuplicate(intentOnlyGeneral.question, intentOnlyPerson)).toBe(true);
    expect(questionTextNearDuplicate(intentOnlyGeneral.question, intentOnlyPerson)).toBe(false);

    const answered = openQuestion("q-own", "cheatSheet:likely:own", sharedText, {
      interviewTypeTag: "focused_competency",
      seekerAnswers: [{ id: "s-own", body: "I already answered this one." }],
    });
    const html = markup(
      createElement(CheatSheetCoachItems, {
        campaignId: "camp_1",
        canEdit: true,
        generalQuestions: [generalShared, intentOnlyGeneral],
        qaItems: [answered],
        items: [
          {
            id: "likely:shared",
            prompt: sharedText,
            interviewTypeTag: "focused_competency",
            sampleAnswer: "A sample that must not replace the general card.",
            harperQuestion: null,
            supports: [],
          },
          {
            id: "likely:intent",
            prompt: intentOnlyPerson,
            interviewTypeTag: "chronological_walk_through",
            sampleAnswer: null,
            harperQuestion: null,
            supports: [],
          },
          {
            id: "likely:own",
            prompt: sharedText,
            interviewTypeTag: "focused_competency",
            sampleAnswer: null,
            harperQuestion: null,
            supports: [],
          },
          {
            id: "likely:only",
            prompt: personOnly,
            interviewTypeTag: "screening",
            sampleAnswer: null,
            harperQuestion: null,
            supports: [],
          },
        ],
      }),
    );
    expect(html).toContain('data-testid="cheat-sheet-shared-general-question"');
    expect(html).toContain(`name="targetKey" value="${consultationReplyTargetKey(generalShared.questionTurnId)}"`);
    expect(html.match(new RegExp(sharedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(2);
    expect(html).toContain(intentOnlyPerson);
    expect(html).not.toContain(intentOnlyGeneral.question);
    expect(html).toContain('data-testid="cheat-sheet-coach-harper-qa"');
    expect(html).toContain(consultationConversationCopy.showYourReplies);
    expect(html).toContain(personOnly);
    expect(html).not.toContain("A sample that must not replace the general card.");
    expect(
      alreadyAnsweredGeneralDuplicateCount({
        personItems: [
          {
            text: sharedText,
            tag: "focused_competency",
            item: answered,
          },
        ],
        generalQuestions: [generalShared],
      }),
    ).toBe(1);

    const generalHtml = markup(
      createElement(CheatSheetQuestionCards, {
        campaignId: "camp_1",
        canEdit: true,
        questions: [generalShared],
      }),
    );
    expect(generalHtml).toContain(
      `name="targetKey" value="${consultationReplyTargetKey(generalShared.questionTurnId)}"`,
    );
  });

  it("does not pay or enqueue while rendering the Cheat Sheet or Harper person view", () => {
    for (const path of [
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "src/components/HarperPersonView.tsx",
      "src/components/CheatSheetCoachItems.tsx",
      "src/components/CheatSheetQuestionCards.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/ConsultationThread.tsx",
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toContain("runPaidStructuredCall");
      expect(text, path).not.toContain("enqueueApplicationJob");
    }
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(page).not.toContain("additionalInterviewPrepQuestionsForProfile");
    expect(page).toContain('id="general-questions"');
    expect(page).toContain('title="General Questions"');
  });
});
