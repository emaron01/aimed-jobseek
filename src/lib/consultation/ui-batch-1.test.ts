/**
 * UI batch 1: Harper approved status, cheat sheet collapse, persona groups,
 * outreach sent prompt, stage interviewer setup, and collapsed question labels.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHEAT_SHEET_HEADING_CLASS,
  cheatSheetScrollTarget,
  cheatSheetSectionIdsToOpen,
  initialCheatSheetOpenIds,
} from "@/lib/application-summary/cheat-sheet-collapse";
import {
  formatOutreachHistoryLine,
  formatOutreachTypeLabel,
} from "@/lib/application-assets/display";
import { sentMessagesForContact } from "@/components/ApplicationOutreachSections";
import {
  APPROVED_STATUS_BADGE_CLASS,
  approvedAnswersAreAllExpanded,
  approvedCollapseControlLabel,
  collapsedApprovedQuestionLabel,
  collectApprovedQuestionIds,
  nextApprovedExpandedIds,
} from "@/lib/consultation/approved-collapse";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import {
  consultationConversationCopy,
  consultationStatementLabels,
  hiringTeamConfig,
  outreachConfig,
} from "@/lib/product-config";

function src(rel: string): string {
  return readFileSync(rel, "utf8");
}

function qa(partial: Partial<ConsultationQaItem> & Pick<ConsultationQaItem, "questionTurnId" | "question">): ConsultationQaItem {
  return {
    targetKey: null,
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    pendingDraftTalkingPoint: null,
    pendingDraftResumeBullet: null,
    ignored: false,
    needsMoreDetail: false,
    ...partial,
  };
}

const approvedAnswer = {
  id: "st-1",
  turnId: "q-approved",
  kind: "INTERVIEW_ANSWER" as const,
  status: "APPROVED" as const,
  content: "I led the SEV1 response and cut MTTR.",
  strengtheningNote: null,
};

describe("UI batch 1 Harper approved status and collapse", () => {
  const thread = src("src/components/ConsultationThread.tsx");
  const standing = src("src/components/ConsultationStanding.tsx");

  it("renders Approved as a compact success-green badge at body text size when collapsed and expanded", () => {
    expect(consultationStatementLabels.APPROVED).toBe("Approved");
    expect(APPROVED_STATUS_BADGE_CLASS).toContain("text-sm");
    expect(APPROVED_STATUS_BADGE_CLASS).toContain("font-bold");
    expect(APPROVED_STATUS_BADGE_CLASS).toContain("px-1.5");
    expect(APPROVED_STATUS_BADGE_CLASS).toContain("py-0.5");
    expect(APPROVED_STATUS_BADGE_CLASS).toContain("text-success");
    expect(APPROVED_STATUS_BADGE_CLASS).toContain("bg-success-tint");
    expect(APPROVED_STATUS_BADGE_CLASS).toContain("border-success");
    expect(APPROVED_STATUS_BADGE_CLASS).not.toContain("text-base");
    expect(APPROVED_STATUS_BADGE_CLASS).not.toContain("text-ink");
    expect(APPROVED_STATUS_BADGE_CLASS).not.toContain("text-xs");
    expect(thread).toContain("APPROVED_STATUS_BADGE_CLASS");
    expect(thread).toContain('data-testid="consultation-approved-badge"');
    expect(thread).toContain('data-testid="consultation-approved-badge-expanded"');
    expect(thread).toContain("consultationStatementLabels.APPROVED");
    const collapsed = thread.slice(
      thread.indexOf('data-harper-collapsed="approved"'),
      thread.indexOf("consultation-question-item"),
    );
    expect(collapsed).toContain("APPROVED_STATUS_BADGE_CLASS");
    expect(collapsed).not.toContain("text-ink bg-canvas");
    const expanded = thread.slice(
      thread.indexOf("function ResultBody"),
      thread.indexOf("function SeekerAnswerEntry"),
    );
    expect(expanded).toContain("APPROVED_STATUS_BADGE_CLASS");
    expect(expanded).toContain("consultationStatementLabels[statement.kind]");
  });

  it("collapses and expands every approved answer without touching open questions or drafts", () => {
    expect(consultationConversationCopy.collapseAllApproved).toBe(
      "Collapse all approved",
    );
    expect(consultationConversationCopy.expandAllApproved).toBe(
      "Expand all approved",
    );
    const approved = qa({
      questionTurnId: "q-approved",
      question: "Tell me about a production incident.",
      talkingPoint: approvedAnswer,
    });
    const draft = qa({
      questionTurnId: "q-draft",
      question: "What would your first 90 days look like?",
      talkingPoint: { ...approvedAnswer, id: "st-draft", status: "DRAFT", turnId: "q-draft" },
    });
    const open = qa({
      questionTurnId: "q-open",
      question: "Why this company?",
    });
    const ids = collectApprovedQuestionIds({
      standingEntries: [{ questions: [approved, open] }],
      bestPracticeQuestions: [draft],
    });
    expect(ids).toEqual(["q-approved"]);
    expect(approvedCollapseControlLabel(false)).toBe("Expand all approved");
    const expanded = nextApprovedExpandedIds(ids, new Set(), { type: "toggle-all" });
    expect([...expanded]).toEqual(["q-approved"]);
    expect(approvedAnswersAreAllExpanded(ids, expanded)).toBe(true);
    expect(approvedCollapseControlLabel(true)).toBe("Collapse all approved");
    const collapsed = nextApprovedExpandedIds(ids, expanded, { type: "toggle-all" });
    expect(collapsed.size).toBe(0);
    const one = nextApprovedExpandedIds(ids, collapsed, {
      type: "set",
      id: "q-approved",
      expanded: true,
    });
    expect([...one]).toEqual(["q-approved"]);
    const ignoredDraft = nextApprovedExpandedIds(ids, one, {
      type: "set",
      id: "q-draft",
      expanded: false,
    });
    expect([...ignoredDraft]).toEqual(["q-approved"]);
    expect(standing).toContain('data-testid="consultation-toggle-all-approved"');
    expect(standing).toContain("approvedCollapseControlLabel(allApprovedExpanded)");
    expect(standing).toContain("collectApprovedQuestionIds");
    const needsInfo = standing.slice(
      standing.indexOf('data-testid="harper-needs-info-list"'),
      standing.indexOf('testId="harper-section-best-practice"'),
    );
    expect(needsInfo).not.toContain("onApprovedExpandedChange");
    expect(needsInfo).toContain("collapseWhenIgnored");
  });
});

describe("UI batch 1 collapsed approved rows show the question", () => {
  it("uses the question text, the Approved badge, and the show link", () => {
    const question = "Tell me about a production incident you led.";
    const answer = "I led the SEV1 response and cut MTTR.";
    expect(collapsedApprovedQuestionLabel(question)).toBe(question);
    expect(collapsedApprovedQuestionLabel(question)).not.toBe(answer);
    expect(collapsedApprovedQuestionLabel(`${"word ".repeat(40)}end`)).toMatch(/…$/);
    const thread = src("src/components/ConsultationThread.tsx");
    const collapsed = thread.slice(
      thread.indexOf('data-harper-collapsed="approved"'),
      thread.indexOf('data-testid="consultation-question"'),
    );
    expect(collapsed).toContain("collapsedApprovedQuestionLabel");
    expect(collapsed).toContain("item.question");
    expect(collapsed).not.toContain("oneLinePreview");
    expect(collapsed).not.toContain("talkingPoint?.content");
    expect(collapsed).toContain('data-testid="consultation-approved-badge"');
    expect(collapsed).toContain("consultationConversationCopy.showApprovedAnswer");
    expect(consultationConversationCopy.showApprovedAnswer).toBe("Show approved answer");
  });
});

describe("UI batch 1 cheat sheet collapse", () => {
  const page = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
  const body = src("src/components/CheatSheetPersonBody.tsx");
  const collapsible = src("src/components/CheatSheetCollapsible.tsx");
  const css = src("src/app/globals.css");
  const filter = src("src/components/CheatSheetPeopleFilter.tsx");

  it("starts collapsed and uses the Harper heading treatment on every component", () => {
    expect(initialCheatSheetOpenIds().size).toBe(0);
    expect(collapsible).toContain("initialCheatSheetOpenIds()");
    expect(collapsible).toContain("CHEAT_SHEET_HEADING_CLASS");
    expect(CHEAT_SHEET_HEADING_CLASS).toContain("!bg-primary/10");
    expect(collapsible).toContain("text-primary");
    expect(collapsible).toContain("aria-expanded={open}");
    expect(collapsible).toContain('{open ? "▼" : "▶"}');
    expect(collapsible).toContain('data-cheat-sheet-indicator={open ? "open" : "collapsed"}');
    expect(page).not.toContain('CheatSheetSection id="overview"');
    expect(page).not.toContain('CheatSheetSection id="stages"');
    expect(page).toContain('CheatSheetSection id="company"');
    expect(page).toContain('CheatSheetSection id="position"');
    expect(page).toContain("CheatSheetSection id={person.sectionKey}");
    expect(body).toContain("sections.caresAbout");
    expect(body).toContain("sections.positioningStatements");
    expect(body).toContain("sections.keyStatements");
    expect(body).toContain("sections.likelyQuestions");
    expect(body).toContain("sections.questionsToAsk");
    expect(body).toContain("notesFromInterviewsWithHeading");
    expect(body).toContain("ADDITIONAL_INTERVIEW_PREP_QA_HEADING");
    expect(body).toContain("CheatSheetSubsection");
    expect(filter).toContain("CheatSheetCollapseProvider");
  });

  it("opens an anchor or ?person= target and scrolls to it, and print keeps the body", () => {
    expect(
      cheatSheetSectionIdsToOpen({ hash: "#company", personQuery: null }),
    ).toEqual(["company"]);
    expect(cheatSheetScrollTarget({ hash: "#overview", personQuery: null })).toBe(
      "overview",
    );
    expect(
      cheatSheetSectionIdsToOpen({ hash: "#position", personQuery: null }),
    ).toEqual(["position"]);
    expect(
      cheatSheetSectionIdsToOpen({ hash: "#stages", personQuery: null }),
    ).toEqual(["stages"]);
    expect(
      cheatSheetSectionIdsToOpen({
        hash: "#contact:abc-likely-questions",
        personQuery: null,
      }).sort(),
    ).toEqual(["contact:abc", "contact:abc-likely-questions"]);
    expect(
      cheatSheetSectionIdsToOpen({
        hash: "",
        personQuery: "contact:abc",
      }),
    ).toEqual(["contact:abc"]);
    expect(
      cheatSheetScrollTarget({ hash: "", personQuery: "contact:abc" }),
    ).toBe("contact:abc");
    expect(
      cheatSheetScrollTarget({
        hash: "#contact:abc-likely-questions",
        personQuery: "contact:abc",
      }),
    ).toBe("contact:abc-likely-questions");
    expect(collapsible).toContain("cheatSheetSectionIdsToOpen");
    expect(collapsible).toContain("scrollIntoView");
    expect(collapsible).toContain("hashchange");
    expect(css).toContain(".application-summary .cheat-sheet-collapsible-body");
    expect(css).toContain("display: block !important");
    expect(css).toContain(
      ".application-summary button:not(.cheat-sheet-collapsible-heading)",
    );
    expect(collapsible).toContain("cheat-sheet-collapsible-body");
  });
});

describe("UI batch 1 persona review groups", () => {
  it("lists each role without an Approve group", () => {
    expect(hiringTeamConfig.status.researched).toBe("Researched");
    expect(hiringTeamConfig.status.notResearched).toBe("Not researched yet");
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    const section = workspace.slice(
      workspace.indexOf("async function HiringTeamSection"),
      workspace.indexOf("function AnnotatedBlock"),
    );
    expect(section).not.toContain("approve-role-");
    expect(section).not.toContain("hiring-team-group-approved");
    expect(section).not.toContain("hiring-team-group-needs-review");
    expect(section.indexOf('groupKey="direct"')).toBeLessThan(
      section.indexOf('groupKey="indirect"'),
    );
    expect(section).toContain("hiringTeamConfig.status.researched");
    expect(section).toContain("hiringTeamConfig.responsibilitiesLabel");
    expect(section).not.toMatch(/<details[^>]*\sopen/);
  });
});

describe("UI batch 1 outreach did-you-send prompt", () => {
  const section = src("src/components/ApplicationOutreachSections.tsx");
  const action = src("src/app/actions/application-outreach.ts");
  const recorder = src("src/lib/application-assets/outreach.ts");

  it("prompts after an email open or LinkedIn copy, and Yes records today through the existing path", () => {
    expect(outreachConfig.labels.didYouSendPrompt).toBe("Did you send this message?");
    expect(outreachConfig.labels.didYouSendYes).toBe("Yes, mark as sent");
    expect(outreachConfig.labels.didYouSendNotYet).toBe("Not yet");
    expect(section).toContain("openEmailOption");
    expect(section).toContain("promptIfUnsent");
    expect(section).toContain("confirmSentToday");
    expect(section).toContain("todayInputValue()");
    expect(section).toContain("sentFormRef.current?.requestSubmit()");
    expect(section).toContain("setAskSent(false)");
    expect(section).toContain("outreachConfig.labels.didYouSendPrompt");
    expect(section).toContain("outreachConfig.labels.didYouSendYes");
    expect(section).toContain("outreachConfig.labels.didYouSendNotYet");
    const notYet = section.slice(
      section.indexOf("did-you-send-not-yet-"),
      section.indexOf("did-you-send-not-yet-") + 400,
    );
    expect(notYet).toContain("setAskSent(false)");
    expect(notYet).not.toContain("requestSubmit");
    expect(notYet).not.toContain("markOutreachSent");
    expect(action).toContain("markOutreachSent");
    expect(recorder).toContain('data: { sentAt: input.sentAt, status: "APPROVED" }');
    const sent = {
      id: "asset_email",
      type: "EMAIL" as const,
      version: 1,
      status: "APPROVED" as const,
      personaId: "role_1",
      contactId: "contact_1",
      purpose: "PROACTIVE" as const,
      sentAt: "2026-09-30T12:00:00.000Z",
      createdAt: "2026-09-30T12:00:00.000Z",
      emailLength: "MEDIUM" as const,
      content: null,
    };
    const draft = {
      ...sent,
      id: "asset_draft",
      status: "DRAFT" as const,
      sentAt: null,
      createdAt: "2026-09-29T12:00:00.000Z",
    };
    expect(sentMessagesForContact([sent, draft], "contact_1")).toEqual([sent]);
    expect(formatOutreachHistoryLine(sent.type, sent.sentAt!)).toBe(
      `${formatOutreachTypeLabel("EMAIL")} · Sent Sep 30`,
    );
    expect(section).toContain("formatOutreachHistoryLine");
    expect(section).toContain("outreach-contact-history-");
    expect(section).not.toContain("enqueueApplicationJob");
    expect(section).not.toContain("runPaidStructuredCall");
    expect(section).not.toContain('from "@/lib/mailbox/send"');
  });
});

describe("UI batch 1 stage interviewer setup", () => {
  const section = src("src/components/InterviewStagesSection.tsx");
  const createForm = src("src/components/StageInterviewerSection.tsx");
  const panel = src("src/components/InterviewStagePanel.tsx");
  const stages = src("src/lib/interview/stages.ts");
  const action = src("src/app/actions/interview.ts");

  it("adds interviewers on the create form and assigns them without starting prep", () => {
    expect(section).toContain("AddSomeoneYoureMeeting");
    expect(createForm).toContain("StageAddContactForm");
    expect(createForm).toContain("AddContactForm");
    expect(createForm).toContain("addApplicationContactAction");
    expect(createForm).toContain("interviewConfig.labels.addSomeoneYoureMeeting");
    expect(createForm).toContain("createInterviewStageAction");
    expect(createForm).toContain('name="contactId"');
    expect(section).not.toContain("InterviewStageSetupInterviewers");
    expect(panel).not.toContain("stage-setup-interviewers");
    expect(panel).not.toContain("assignExistingInterviewerAction");
    expect(panel).not.toContain("addInterviewInterviewerAction");
    expect(action).toContain("interviewerContactIds: [contactId]");
    expect(action).not.toContain("readStageSetupInterviewers");
    const setup = stages.slice(
      stages.indexOf("export async function assignInterviewersDuringStageSetup"),
      stages.indexOf("export async function addInterviewStageInterviewer"),
    );
    expect(setup).toContain("keepOtherInterviewers: true");
    expect(setup).not.toContain("offerPersonPrep");
    expect(setup).not.toContain("enqueueApplicationJob");
    expect(setup).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(setup).not.toContain("saveLinkedInPaste");
    expect(setup).not.toContain("startPersonPrepForContact");
    expect(stages).toContain("replaceStageInterviewer");
  });
});

describe("UI batch 1 render paths do not pay or enqueue", () => {
  it("keeps page and status modules free of paid calls and job enqueue", () => {
    for (const rel of [
      "src/components/ConsultationStanding.tsx",
      "src/components/ConsultationThread.tsx",
      "src/components/CheatSheetCollapsible.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ApplicationOutreachSections.tsx",
      "src/components/InterviewStagesSection.tsx",
      "src/components/InterviewStagePanel.tsx",
      "src/components/HiringTeamReviewGroup.tsx",
    ]) {
      const body = src(rel);
      expect(body, rel).not.toContain("runPaidStructuredCall");
      expect(body, rel).not.toContain("enqueueApplicationJob");
    }
  });
});
