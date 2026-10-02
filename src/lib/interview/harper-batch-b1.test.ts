import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interviewConfig } from "@/lib/product-config/interview";
import { workspaceHarperContactHref } from "@/lib/application/workspace-links";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Harper Batch B1 Stage timeline and Outreach thank-you", () => {
  const stages = src("src/components/InterviewStagesSection.tsx");
  const panel = src("src/components/InterviewStagePanel.tsx");
  const outreach = src("src/components/ApplicationOutreachSections.tsx");
  const workspace = src("src/components/ApplicationWorkspace.tsx");
  const assign = src("src/lib/interview/stages.ts");
  const harperSection = src("src/components/ConsultationSection.tsx");
  const harperLayout = src("src/lib/consultation/harper-layout.ts");
  const cheatSheetAnswers = src("src/lib/application-summary/service.ts");

  it("Stage has no review-open-questions, cheat-sheet person body, gap CTA, or outreach", () => {
    expect(stages).not.toContain("reviewOpenQuestions");
    expect(stages).not.toContain("workspaceInterviewLikelyQuestionsHref");
    expect(panel).not.toContain("CheatSheetPersonBody");
    expect(panel).not.toContain("noCheatSheetSection");
    expect(stages).not.toContain("CheatSheetPersonBody");
    expect(stages).not.toContain("startInterviewGapConsultationAction");
    expect(stages).not.toContain("consultation-offer-");
    expect(stages).not.toContain("generateOutreachAssetAction");
    expect(stages).not.toContain("thank-you-email-");
    expect(stages).not.toContain("thank-you-linkedin-");
    expect(stages).not.toContain("check-in-");
    expect(stages).not.toContain("thank-you-answers-");
    expect(stages).not.toContain("CheatSheetCoachItems");
  });

  it("interviewer name links to Harper contact anchor and Edit is gone", () => {
    expect(panel).toContain("workspaceHarperContactHref");
    expect(panel).toContain("harper-contact-link-");
    expect(panel).not.toContain("workspaceContactEditHref");
    expect(panel).not.toContain("edit-contact-");
    expect(panel).not.toContain("editContact");
    expect(workspaceHarperContactHref("camp_1", "ct_1")).toContain(
      "/campaigns/camp_1/consultation",
    );
    expect(workspaceHarperContactHref("camp_1", "ct_1")).toContain(
      "harper-contact%3Act_1",
    );
  });

  it("Use this interviewer assigns only — no prep, cheat sheet, persona, or contact profile", () => {
    expect(panel).not.toContain("assignExistingInterviewerAction");
    expect(stages).not.toContain("useInterviewer");
    const assignFn = assign.slice(
      assign.indexOf("export async function assignExistingInterviewStageInterviewer"),
      assign.indexOf("export async function addInterviewStageInterviewer"),
    );
    expect(assignFn).toContain("replaceStageInterviewer");
    expect(assignFn).not.toContain("saveLinkedInPaste");
    expect(assignFn).not.toContain("queueHiringTeamBuild");
    expect(assignFn).not.toContain("CONTACT_PROFILE");
    expect(assignFn).not.toContain("HIRING_TEAM_BUILD");
    // Batch B3: assign-only; prep starts on Harper
    expect(assignFn).not.toContain("offerPersonPrep");
    expect(assignFn).not.toContain("enqueueInterviewerCheatSheetSection");
  });

  it("Post Interview Notes opens the notes form with the same fields", () => {
    expect(interviewConfig.labels.postInterviewNotes).toBe("Post Interview Notes");
    expect(stages).toContain("postInterviewNotes");
    expect(stages).toContain("post-interview-notes-${stageId}");
    expect(stages).toContain("addCheatSheetInterviewNoteAction");
    expect(stages).toContain("updateInterviewStageAction");
    expect(stages).toContain("notesBefore");
    expect(stages).toContain("notesAfter");
    expect(stages).toContain("expectedDecisionAt");
    expect(stages).toContain('name="outcome"');
    expect(stages).not.toContain('name="notesBefore"');
    expect(stages).not.toContain('name="notesAfter"');
    expect(stages).not.toContain('name="expectedDecisionAt"');
    expect(stages).toContain("gainedInformation");
    expect(stages).toContain("createInterviewStageAction");
    expect(panel).not.toContain("addInterviewInterviewerAction");
  });

  it("moved thank-you clarify, thank-you generate, and check-in render on Outreach", () => {
    expect(outreach).toContain("outreach-stage-followup-");
    expect(outreach).toContain("thank-you-answers-");
    expect(outreach).toContain("thank-you-email-");
    expect(outreach).toContain("thank-you-linkedin-");
    expect(outreach).toContain("check-in-");
    expect(outreach).toContain("stageThankYouClarify");
    expect(outreach).toContain("notesAfter");
    expect(outreach).toContain("thankYouClarifyJson");
    expect(outreach).toContain("answerThankYouQuestions");
    expect(workspace).toContain("thankYouClarifyJson");
    expect(workspace).toContain("notesAfter");
    // Generator must not always skip clarify for thank-you
    expect(outreach).not.toMatch(
      /thankYouSelected\)\s*\?\s*\(\s*<input[\s\S]*skipThankYouQuestions/,
    );
  });

  it("answers given through Stage cheat-sheet coach still live in Harper session turns", () => {
    expect(cheatSheetAnswers).toContain('targetKey = `cheatSheet:${input.itemId}`');
    expect(cheatSheetAnswers).toContain("consultationTurn.create");
    expect(harperSection).toContain("buildConsultationQaView");
    expect(harperLayout).toContain("buildHarperQaLayout");
    // cheatSheet:contact:{id}:… maps to that interviewer's Harper section
    expect(harperLayout).toContain("contactIdFromCheatSheetTarget");
    expect(harperLayout).toContain("contactIdFromPersonPrepTarget");
  });
});
