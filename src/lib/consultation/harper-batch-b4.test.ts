import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  workspaceHarperCoachItemHref,
  workspaceHarperQuestionHref,
} from "@/lib/application/workspace-links";
import {
  compileNotesFromInterviewsWithPerson,
  notesFromInterviewsWithHeading,
} from "@/lib/application-summary/interview-notes";
import {
  harperCoachItemAnchorId,
  harperQuestionAnchorId,
} from "@/lib/consultation/harper-layout";
import { consultationConversationCopy } from "@/lib/product-config/consultation";
import { interviewConfig } from "@/lib/product-config/interview";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Harper Batch B4 Cheat Sheet read-only", () => {
  const page = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
  const body = src("src/components/CheatSheetPersonBody.tsx");
  const coach = src("src/components/CheatSheetCoachItems.tsx");
  const personView = src("src/components/HarperPersonView.tsx");
  const layout = src("src/lib/consultation/harper-layout.ts");
  const filter = src("src/components/HarperPeopleFilter.tsx");
  const consultationPage = src(
    "src/app/(app)/campaigns/[id]/consultation/page.tsx",
  );

  it("Cheat Sheet page answers coach items inline with Harper's question list", () => {
    expect(page).not.toContain("showCoachAnswerForms={false}");
    expect(page).not.toContain("harperLinkContactId");
    expect(coach).toContain("QuestionList");
    expect(coach).toContain("answerCheatSheetCoachAction");
    expect(coach).not.toContain("workspaceHarperQuestionHref");
    expect(coach).not.toContain("workspaceHarperCoachItemHref");
    expect(personView).toContain("showCoachAnswerForms");
    expect(personView).not.toContain("harperLinkContactId");
    expect(personView).not.toContain("showCoachAnswerForms={false}");
  });

  it("answered question uses Harper's question anchor, not a link off the Cheat Sheet", () => {
    expect(coach).not.toContain("workspaceHarperQuestionHref");
    expect(consultationConversationCopy.editAnswer).toBe("Edit");
    expect(harperQuestionAnchorId("turn-42")).toBe("harper-q:turn-42");
    const href = workspaceHarperQuestionHref("camp_1", "ct_1", "turn-42");
    expect(href).toContain("/campaigns/camp_1/summary");
    expect(href).toContain("person=contact%3Act_1");
    expect(href).toContain(encodeURIComponent("contact:ct_1"));
    expect(href).not.toContain("harper-q");
  });

  it("unanswered coach item keeps the Harper anchor and answers in place", () => {
    expect(coach).not.toContain("workspaceHarperCoachItemHref");
    expect(consultationConversationCopy.answerGap).toBe("Answer");
    expect(harperCoachItemAnchorId("contact:c1:likely:1")).toBe(
      "harper-coach:contact:c1:likely:1",
    );
    expect(layout).toContain("harperCoachItemAnchorId");
    expect(coach).toContain("harperCoachItemAnchorId");
    expect(coach).toContain("id={anchorId}");
    const href = workspaceHarperCoachItemHref(
      "camp_1",
      "ct_1",
      "contact:c1:likely:1",
    );
    expect(href).toContain("/campaigns/camp_1/summary");
    expect(href).toContain("person=contact%3Act_1");
    expect(href).toContain(encodeURIComponent("contact:ct_1"));
    expect(href).not.toContain("harper-coach");
    // Harper person view still mounts coach items (anchors via shared component).
    expect(personView).toContain("CheatSheetPersonBody");
    expect(personView).toContain("showCoachAnswerForms");
  });

  it("company, position, person prep, search, and print remain on the Cheat Sheet", () => {
    expect(page).toContain("applicationSummaryConfig.sections.overview");
    expect(page).toContain("applicationSummaryConfig.sections.company");
    expect(page).toContain("applicationSummaryConfig.sections.position");
    expect(page).toContain("CheatSheetPeopleFilter");
    expect(page).toContain("CheatSheetPrintButton");
    expect(page).toContain("CheatSheetPersonBody");
    expect(body).toContain("section.caresAbout");
    expect(body).toContain("section.positioningStatements");
    expect(body).toContain("section.keyStatements");
    expect(body).toContain("section.likelyQuestions");
    expect(body).toContain("section.questionsToAsk");
  });

  it("Notes From Interviews With {Name} compiles gained + before/after once, hidden when empty", () => {
    expect(notesFromInterviewsWithHeading("Alex Kim")).toBe(
      "Notes From Interviews With Alex Kim",
    );
    expect(body).toContain("notesFromInterviewsWithHeading");
    expect(body).toContain("NotesFromInterviewsSection");
    expect(page).toContain("CheatSheetInterviewNotes");
    expect(page).not.toContain("compileNotesFromInterviewsWithPerson");

    const empty = compileNotesFromInterviewsWithPerson({
      contactId: "c1",
      gainedNotes: [],
      stages: [
        {
          id: "s1",
          type: "HIRING_MANAGER",
          scheduledAt: "2026-04-01T12:00:00.000Z",
          notesBefore: null,
          notesAfter: null,
          interviewerContactIds: ["c1"],
        },
      ],
    });
    expect(empty).toEqual([]);

    const notes = compileNotesFromInterviewsWithPerson({
      contactId: "c1",
      gainedNotes: [
        {
          id: "n1",
          text: "They care about forecast cadence.",
          stageId: null,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
        {
          id: "n1",
          text: "Duplicate id must not double-render.",
          stageId: null,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
      ],
      stages: [
        {
          id: "s-late",
          type: "PANEL_COMPETENCY",
          scheduledAt: "2026-05-10T15:00:00.000Z",
          notesBefore: "Prep panel stories.",
          notesAfter: "Panel liked the GSI story.",
          interviewerContactIds: ["c1", "c2"],
        },
        {
          id: "s-early",
          type: "RECRUITER_SCREEN",
          scheduledAt: "2026-04-02T15:00:00.000Z",
          notesBefore: "Expect logistics questions.",
          notesAfter: "Recruiter confirmed timeline.",
          interviewerContactIds: ["c1"],
        },
        {
          id: "s-other",
          type: "EXECUTIVE",
          scheduledAt: "2026-06-01T15:00:00.000Z",
          notesBefore: "Not for this person.",
          notesAfter: "Also not for this person.",
          interviewerContactIds: ["c9"],
        },
      ],
    });
    expect(notes.map((row) => row.id)).toEqual([
      "gained:n1",
      "interview:s-early:notesBefore",
      "interview:s-early:notesAfter",
      "interview:s-late:notesBefore",
      "interview:s-late:notesAfter",
    ]);
    expect(notes.every((row) => row.text.trim().length > 0)).toBe(true);
    expect(notes.filter((row) => row.id === "gained:n1")).toHaveLength(1);
    expect(notes[1]?.kindLabel).toBe(interviewConfig.labels.notesBefore);
    expect(notes[2]?.kindLabel).toBe(interviewConfig.labels.notesAfter);
    expect(notes[0]?.kindLabel).toBe(interviewConfig.labels.gainedInformation);
    // Stage list no longer inlines notesAfter (person section owns them once).
    expect(page).not.toContain("stage.notesAfter ?");
  });

  it("generation and missing-section controls stay, and persona build uses the shared research labels", () => {
    expect(page).toContain("generateApplicationSummaryAction");
    expect(page).toContain('testId="application-summary-generation"');
    expect(body).toContain("buildCheatSheetPersonaAction");
    expect(body).toContain("generateApplicationSummaryAction");
    expect(body).toContain("hiringTeamConfig.actions.build");
    expect(body).toContain("hiringTeamConfig.queuedBuild");
    expect(body).toContain("applicationSummaryConfig.actions.generateSection");
  });

  it("Harper deep-link selects person via ?person= and scrolls to hash", () => {
    expect(consultationPage).not.toContain("initialPersonKey");
    expect(filter).toContain("initialPersonKey");
    expect(filter).toContain("harper-q:");
    expect(filter).toContain("harper-coach:");
  });

  it("rendering the Cheat Sheet and Harper enqueues no job and makes no paid call", () => {
    for (const path of [
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "src/components/CheatSheetCoachItems.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/HarperPersonView.tsx",
      "src/lib/application-summary/coach-qa.ts",
      "src/lib/application-summary/interview-notes.ts",
    ]) {
      const text = src(path);
      expect(text).not.toContain("enqueueApplicationJob");
      expect(text).not.toContain("runPaidStructuredCall");
    }
  });
});
