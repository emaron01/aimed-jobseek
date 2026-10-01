// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as applicationJobs from "@/lib/application-jobs/service";
import * as paidGate from "@/lib/ai/paid-call-gate";
import {
  CheatSheetCollapseProvider,
  CheatSheetPrintBanner,
  CheatSheetSection,
} from "@/components/CheatSheetCollapsible";
import { CheatSheetQuestionCards } from "@/components/CheatSheetQuestionCards";
import { ConsultationThread } from "@/components/ConsultationThread";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { HarperPersonInlineProfile } from "@/components/HarperPersonView";
import { APPROVED_STATUS_BADGE_CLASS } from "@/lib/consultation/approved-collapse";
import type { ConsultationQaItem, QaStatement } from "@/lib/consultation/qa-view";
import {
  consultationConversationCopy,
  consultationStatementLabels,
} from "@/lib/product-config";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const enqueueSpy = vi.spyOn(applicationJobs, "enqueueApplicationJob");
const paidSpy = vi.spyOn(paidGate, "runPaidStructuredCall");

const followUpText = "What metric did you move?";
const replyBody = "Raw note that must stay hidden until shown.";
const approvedText = "I led the SEV1 response and cut MTTR.";
const draftText = "Draft answer that is not approved yet.";
const resumeText = "Cut MTTR on the SEV1 response.";

function statement(
  partial: Partial<QaStatement> & Pick<QaStatement, "id" | "kind" | "status" | "content">,
): QaStatement {
  return {
    turnId: "q-1",
    strengtheningNote: null,
    ...partial,
  };
}

function question(partial: Partial<ConsultationQaItem> = {}): ConsultationQaItem {
  const talkingPoint = statement({
    id: "st-approved",
    kind: "INTERVIEW_ANSWER",
    status: "APPROVED",
    content: approvedText,
  });
  return {
    questionTurnId: "q-1",
    targetKey: "why-this-company",
    question: "Tell me about a production incident.",
    followUp: { turnId: "fu-1", text: followUpText },
    seekerAnswers: [{ id: "reply-1", body: replyBody }],
    statements: [talkingPoint],
    resumeBullet: statement({
      id: "st-resume",
      kind: "RESUME_BULLET",
      status: "APPROVED",
      content: resumeText,
    }),
    talkingPoint,
    pendingDraftTalkingPoint: null,
    pendingDraftResumeBullet: null,
    ignored: false,
    needsMoreDetail: false,
    ...partial,
  };
}

function withDraft(host: HTMLElement, node: ReactNode) {
  return createElement(HarperDraftProvider, null, node);
}

function mount(node: ReactNode): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(withDraft(host, node));
  });
  return { host, root };
}

function badge(host: ParentNode): HTMLElement {
  const found = host.querySelector("[data-testid='consultation-approved-badge'], [data-testid='consultation-approved-badge-expanded']");
  if (!found) throw new Error("Approved badge was not rendered");
  return found as HTMLElement;
}

describe("Q&A declutter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    enqueueSpy.mockClear();
    paidSpy.mockClear();
  });

  it("renders a compact body-size Approved pill on Harper, the person view, and the Cheat Sheet", () => {
    const item = question();
    const harper = mount(
      createElement(ConsultationThread, {
        campaignId: "camp",
        canEdit: true,
        sessionStatus: "IN_PROGRESS",
        jobsActive: false,
        turns: [],
        statements: [],
        interviewerSections: [
          { contactId: "c-1", heading: "Alex Rivera", questions: [item] },
        ],
      }),
    );
    const person = mount(
      createElement(HarperPersonInlineProfile, {
        campaignId: "camp",
        canEdit: true,
        contactId: "c-1",
        heading: "Alex Rivera",
        sectionKey: "contact:c-1",
        section: null,
        notes: [],
        personaBuilt: false,
        personaId: "persona-1",
        prepStarted: true,
        interviewerSection: {
          contactId: "c-1",
          heading: "Alex Rivera",
          questions: [item],
        },
        sessionStatus: "IN_PROGRESS",
        jobsActive: false,
      }),
    );
    const sheet = mount(
      createElement(CheatSheetQuestionCards, {
        campaignId: "camp",
        canEdit: true,
        questions: [item],
      }),
    );

    for (const view of [harper.host, person.host, sheet.host]) {
      const pill = badge(view);
      expect(pill.textContent).toBe(consultationStatementLabels.APPROVED);
      expect(pill.className).toBe(APPROVED_STATUS_BADGE_CLASS);
      expect(pill.className).toContain("text-sm");
      expect(pill.className).toContain("font-bold");
      expect(pill.className).toContain("text-success");
      expect(pill.className).toContain("px-1.5");
      expect(pill.className).toContain("py-0.5");
      expect(view.textContent).toContain(consultationStatementLabels.INTERVIEW_ANSWER);
      expect(view.textContent).toContain(consultationStatementLabels.RESUME_BULLET);
    }
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    harper.root.unmount();
    person.root.unmount();
    sheet.root.unmount();
  });

  it("renders Interview answer and Resume bullet labels in ink", () => {
    const html = renderToStaticMarkup(
      withDraft(
        document.body,
        createElement(CheatSheetQuestionCards, {
          campaignId: "camp",
          canEdit: true,
          questions: [question()],
        }),
      ),
    );
    for (const label of [
      consultationStatementLabels.INTERVIEW_ANSWER,
      consultationStatementLabels.RESUME_BULLET,
    ]) {
      const at = html.indexOf(label);
      expect(at).toBeGreaterThan(-1);
      const open = html.lastIndexOf("<p ", at);
      const tag = html.slice(open, html.indexOf(">", open));
      expect(tag).toContain("text-ink");
      expect(tag).toContain("text-xs");
      expect(tag).not.toContain("text-subtle");
    }
  });

  it("puts Show your replies on the Edit row beneath the question and answer, and toggles replies", () => {
    const { host, root } = mount(
      createElement(CheatSheetQuestionCards, {
        campaignId: "camp",
        canEdit: true,
        questions: [question()],
      }),
    );
    const questionNode = host.querySelector("[data-testid='consultation-question']");
    const edit = host.querySelector("[data-testid='consultation-edit-reply']");
    const toggle = host.querySelector("[data-testid='consultation-toggle-replies']");
    expect(questionNode?.textContent).toContain("Tell me about a production incident.");
    expect(edit?.textContent).toBe(consultationConversationCopy.editAnswer);
    expect(toggle?.textContent).toBe(consultationConversationCopy.showYourReplies);
    expect(edit?.parentElement).toBe(toggle?.parentElement);
    expect(
      questionNode!.compareDocumentPosition(edit!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const answerAt = host.innerHTML.indexOf(approvedText);
    const editAt = host.innerHTML.indexOf('data-testid="consultation-edit-reply"');
    expect(answerAt).toBeGreaterThan(-1);
    expect(editAt).toBeGreaterThan(answerAt);
    expect(host.textContent).not.toContain(replyBody);

    act(() => {
      toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(host.textContent).toContain(replyBody);
    expect(
      host.querySelector("[data-testid='consultation-toggle-replies']")?.textContent,
    ).toBe(consultationConversationCopy.hideYourReplies);
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    root.unmount();
  });

  it("hides a stored follow-up on an approved answer and shows a follow-up on a newer draft", () => {
    const approved = mount(
      createElement(CheatSheetQuestionCards, {
        campaignId: "camp",
        canEdit: true,
        questions: [question()],
      }),
    );
    expect(approved.host.textContent).not.toContain(followUpText);
    expect(approved.host.querySelector("[data-testid='consultation-follow-up']")).toBeNull();

    const newer = mount(
      createElement(CheatSheetQuestionCards, {
        campaignId: "camp",
        canEdit: true,
        questions: [
          question({
            pendingDraftTalkingPoint: statement({
              id: "st-new",
              kind: "INTERVIEW_ANSWER",
              status: "DRAFT",
              content: "A newer draft after the reply.",
            }),
          }),
        ],
      }),
    );
    expect(newer.host.textContent).toContain(followUpText);
    expect(newer.host.querySelector("[data-testid='consultation-follow-up']")).not.toBeNull();
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    approved.root.unmount();
    newer.root.unmount();
  });

  it("prints questions as plain text with approved answers only, and expands the rest of the section", () => {
    const unanswered = question({
      questionTurnId: "q-open",
      question: "Why this company?",
      talkingPoint: statement({
        id: "st-draft",
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: draftText,
      }),
      resumeBullet: null,
      statements: [],
      followUp: { turnId: "fu-2", text: "Which team?" },
      seekerAnswers: [],
    });
    const html = renderToStaticMarkup(
      createElement(
        "div",
        { className: "application-summary" },
        createElement(CheatSheetPrintBanner),
        withDraft(
          document.body,
          createElement(CheatSheetQuestionCards, {
            campaignId: "camp",
            canEdit: true,
            questions: [question(), unanswered],
          }),
        ),
        createElement(
          CheatSheetCollapseProvider,
          null,
          createElement(
            CheatSheetSection as (props: {
              id: string;
              title: string;
              children?: ReactNode;
            }) => ReactNode,
            { id: "overview", title: "Company and role" },
            createElement("p", null, "Acme builds industrial pumps."),
          ),
        ),
      ),
    );

    expect(html.startsWith("<div")).toBe(true);
    expect(html.indexOf("Approved answers only.")).toBeLessThan(html.indexOf("Tell me about a production incident."));
    const prints = html.split('data-testid="consultation-print-question"').slice(1);
    expect(prints.length).toBe(2);
    const approvedPrint = prints[0]!.slice(0, prints[0]!.indexOf("consultation-question-screen"));
    const openPrint = prints[1]!.slice(0, prints[1]!.indexOf("consultation-question-screen"));
    expect(approvedPrint).toContain("Tell me about a production incident.");
    expect(approvedPrint).toContain(approvedText);
    for (const excluded of [
      "Approved",
      "Interview answer",
      "Resume bullet",
      resumeText,
      followUpText,
      replyBody,
      "Show your replies",
      "Edit",
      draftText,
      consultationConversationCopy.followUpReplyHint,
      consultationConversationCopy.thinking,
    ]) {
      expect(approvedPrint).not.toContain(excluded);
    }
    expect(openPrint).toContain("Why this company?");
    expect(openPrint).not.toContain(draftText);
    expect(openPrint).not.toContain("Which team?");
    expect(html).toContain("Acme builds industrial pumps.");

    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".application-summary .cheat-sheet-collapsible-body");
    expect(css).toContain("display: block !important");
    expect(css).toContain(".application-summary .consultation-question-print");
    expect(css).toContain(".application-summary .consultation-question-screen");
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const main = page.slice(page.indexOf("<main"));
    expect(main.indexOf("<CheatSheetPrintBanner />")).toBeLessThan(main.indexOf("<PageHeader"));
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
  });
});
