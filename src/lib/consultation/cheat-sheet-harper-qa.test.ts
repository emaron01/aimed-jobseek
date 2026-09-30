import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
import { QuestionList } from "@/components/ConsultationThread";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import {
  applicationSummaryConfig,
  consultationConversationCopy,
  consultationStatementLabels,
} from "@/lib/product-config";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const talkingPoint = {
  id: "stmt_1",
  turnId: "seeker_1",
  kind: "INTERVIEW_ANSWER" as const,
  status: "DRAFT",
  content: "I inspect the deal before I commit the forecast.",
  strengtheningNote: null,
};

const question: ConsultationQaItem = {
  questionTurnId: "q_1",
  targetKey: "cheatSheet:likely:1",
  question: "Tell me how you run a weekly forecast.",
  followUp: null,
  seekerAnswers: [
    {
      id: "seeker_1",
      body: "Raw note: I sat in on two calls and should not be the answer.",
    },
  ],
  statements: [talkingPoint],
  resumeBullet: null,
  talkingPoint,
  pendingDraftTalkingPoint: null,
  pendingDraftResumeBullet: null,
  ignored: false,
};

function renderQuestion() {
  return renderToStaticMarkup(
    createElement(
      HarperDraftProvider,
      null,
      createElement(QuestionList, {
        campaignId: "camp_1",
        canEdit: true,
        questions: [question],
        showReply: true,
        pendingTarget: null,
        jobsActive: false,
        onSubmitStart: () => undefined,
      }),
    ),
  );
}

describe("Cheat Sheet uses Harper question workflow", () => {
  it("renders the same QuestionList states and does not show the raw reply as the answer", () => {
    const html = renderQuestion();
    expect(html).toContain('data-testid="consultation-question"');
    expect(html).toContain("Tell me how you run a weekly forecast.");
    expect(html).toContain(talkingPoint.content);
    expect(html).toContain(consultationStatementLabels.INTERVIEW_ANSWER);
    expect(html).toContain(consultationStatementLabels.DRAFT);
    expect(html).toContain(consultationConversationCopy.approve);
    expect(html).toContain(consultationConversationCopy.showYourReplies);
    expect(html).not.toContain(question.seekerAnswers[0]?.body ?? "");
    expect(html).not.toContain("/consultation");
    const coach = renderToStaticMarkup(
      createElement(
        HarperDraftProvider,
        null,
        createElement(CheatSheetCoachItems, {
          campaignId: "camp_1",
          canEdit: true,
          items: [
            {
              id: "likely:1",
              prompt: "Tell me how you run a weekly forecast.",
              sampleAnswer: "I rebuilt the Monday commit.",
              harperQuestion: null,
              supports: [],
            },
          ],
          qaItems: [question],
        }),
      ),
    );
    expect(coach).toContain(talkingPoint.content);
    expect(coach).not.toContain("I rebuilt the Monday commit.");
    expect(coach).not.toContain(question.seekerAnswers[0]?.body ?? "");
    expect(coach).not.toContain("workspaceHarper");
    expect(coach).not.toContain("/campaigns/camp_1/consultation");
  });

  it("shows a generated sample answer the same way when Harper has no turn yet", () => {
    const html = renderToStaticMarkup(
      createElement(CheatSheetCoachItems, {
        campaignId: "camp_1",
        canEdit: true,
        items: [
          {
            id: "likely:2",
            prompt: "Tell me about a time you rebuilt a forecast.",
            sampleAnswer: "I moved the commit to Monday.",
            harperQuestion: "What changed after that Monday commit?",
            supports: [],
          },
        ],
      }),
    );
    expect(html).toContain(applicationSummaryConfig.sections.sampleAnswer);
    expect(html).toContain("I moved the commit to Monday.");
    expect(html).toContain("What changed after that Monday commit?");
    expect(html).toContain(consultationConversationCopy.threadReply);
    expect(html).toContain("cheat-sheet-coach-reply-likely:2");
    expect(html).not.toContain("/consultation");
  });

  it("wires both pages to Harper actions and does not pay or enqueue on render", () => {
    const summary = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    const coach = src("src/components/CheatSheetCoachItems.tsx");
    const prep = src("src/components/AdditionalInterviewPrepQa.tsx");
    const person = src("src/components/HarperPersonView.tsx");
    const actions = src("src/app/actions/consultation.ts");
    const coachAction = src("src/app/actions/application-summary.ts");
    expect(summary).toContain("CheatSheetPersonBody");
    expect(summary).not.toContain("harperLinkContactId");
    expect(summary).not.toContain("workspaceHarperQuestionHref");
    expect(coach).toContain("QuestionList");
    expect(prep).toContain("QuestionList");
    expect(person).toContain("QuestionList");
    expect(person).toContain("CheatSheetPersonBody");
    for (const name of [
      "replyConsultationAction",
      "editConsultationAnswerAction",
      "approveConsultationQaResultAction",
      "saveEditedConsultationStatementAction",
      "skipConsultationQuestionAction",
      "ignoreConsultationQuestionAction",
    ]) {
      expect(actions).toContain(name);
      const start = actions.indexOf(`export async function ${name}`);
      const fn = actions.slice(start, start + 1200);
      expect(fn).toContain("revalidateHarperAndCheatSheet");
    }
    expect(coachAction).toContain('operation: "process_reply"');
    expect(coachAction).toContain("/summary");
    expect(coachAction).toContain("/consultation");
    for (const path of [
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "src/components/CheatSheetCoachItems.tsx",
      "src/components/AdditionalInterviewPrepQa.tsx",
      "src/components/CheatSheetPersonBody.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("enqueueApplicationJob");
      expect(text).not.toContain("runPaidStructuredCall");
    }
  });
});
