import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openInterviewStage } from "@/lib/interview/stages";
import {
  applicationAssetConfig,
  consultationConfig,
  interviewConfig,
} from "@/lib/product-config";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("resume and cover letter page", () => {
  const section = source("src/components/ApplicationAssetsSection.tsx");
  const live = source("src/components/ApplicationWorkspaceLive.tsx");
  const service = source("src/lib/application-assets/service.ts");

  it("shows finished documents without plan text or a repeated edit-box list", () => {
    expect(section).not.toContain("summaryAngle");
    expect(section).not.toContain("gapHandling");
    expect(section).not.toContain("acceptPresentationPlanAction");
    expect(section).not.toContain("writePresentationPlanAction");
    expect(section).not.toContain("formatClaimEditorLabel");
    expect(section).not.toContain("xl:grid-cols-2");
    expect(section).toContain("asset-in-place-editor");
    expect(section).toContain("viewEditResume");
    expect(section).toContain("viewEditCoverLetter");
    expect(section).toContain("applicationAssetConfig.labels.adjustManually");
    expect(section).toContain("applicationAssetConfig.labels.cancel");
    expect(section).toContain("applicationAssetConfig.labels.saveNewVersion");
    expect(section).toContain("applicationAssetConfig.labels.hideRolesLegend");
    expect(section).toContain("applicationAssetConfig.labels.approve");
    expect(section).toContain("applicationAssetConfig.labels.downloadDocx");
    expect(section).toContain("regenerationInstruction");
    expect(section).toContain("applicationAssetConfig.labels.changeInstruction");
    expect(applicationAssetConfig.labels.changeInstruction).toBe(
      `What should ${consultationConfig.displayName} change?`,
    );
    expect(applicationAssetConfig.labels.viewEditResume).toBe("View/Edit Resume");
    expect(applicationAssetConfig.labels.viewEditCoverLetter).toBe(
      "View/Edit Cover Letter",
    );
    expect(applicationAssetConfig.labels.cancel).toBe("Cancel");
    expect(section).not.toContain("toLocaleString");
    expect(section).toContain("Version {asset.version} · {formatAssetStatusLabel(asset.status)}");
    expect(section).not.toContain("asset.guidance");
    expect(service).toContain("ensureAcceptedPresentationPlan");
    expect(service).toContain("guidance: null");
    const hideRolesDetails = section.slice(
      section.indexOf('name="hiddenRoleId"') - 400,
      section.indexOf('name="hiddenRoleId"'),
    );
    expect(hideRolesDetails).toContain("hideRolesLegend");
    expect(hideRolesDetails).not.toContain("adjustManually");
  });

  it("shows each document ready notice once", () => {
    expect(live).toContain("workspace-ready-notice-${type}");
    expect(live).toContain("resume-document");
    expect(live).toContain("cover-letter-document");
    expect(live).toContain("jobs.find");
    expect(live).toContain("applicationAssetConfig.labels.readyPlan");
  });
});

describe("persona picker", () => {
  const picker = source("src/components/HiringTeamPersonPicker.tsx");
  const actions = source("src/app/actions/hiring-team.ts");

  it("lists existing contacts and adds new ones without building", () => {
    expect(picker).toContain("assignExistingHiringTeamPersonAction");
    expect(picker).toContain("addHiringTeamPersonAction");
    expect(picker).toContain("people.map");
    expect(picker).toContain("interviewConfig.labels.addNewInterviewer");
    expect(actions).toContain("assignApplicationContactToPersona");
    const assignFn = actions.slice(
      actions.indexOf("export async function assignExistingHiringTeamPersonAction"),
      actions.indexOf("export async function addHiringTeamPersonAction"),
    );
    const addFn = actions.slice(
      actions.indexOf("export async function addHiringTeamPersonAction"),
      actions.indexOf("export async function saveRoleAsTemplateAction"),
    );
    expect(assignFn).not.toContain("queueHiringTeamBuild");
    expect(addFn).not.toContain("queueHiringTeamBuild");
  });
});

describe("interview stage open buttons", () => {
  const stages = source("src/components/InterviewStagesSection.tsx");
  const panel = source("src/components/InterviewStagePanel.tsx");
  const notes = source("src/lib/application-summary/service.ts");

  it("places Post Interview Notes on the earliest stage without an outcome", () => {
    expect(stages).not.toContain("InterviewStageOpenActions");
    expect(openInterviewStage([{ outcome: "ADVANCED" }, { outcome: null }])?.outcome).toBeNull();
    expect(openInterviewStage([{ outcome: null }, { outcome: null }])).toEqual({
      outcome: null,
    });
    expect(openInterviewStage([{ outcome: "COMPLETED" }])).toBeNull();
    expect(interviewConfig.labels.postInterviewNotes).toBe("Post Interview Notes");
    expect(stages).toContain("postInterviewNotes");
    expect(stages).not.toContain("reviewOpenQuestions");
    expect(stages).not.toContain("workspaceInterviewLikelyQuestionsHref");
    expect(stages).toContain("post-interview-notes-${stageId}");
    expect(stages).toContain("addCheatSheetInterviewNoteAction");
    expect(panel).not.toContain("CheatSheetPersonBody");
    expect(notes).not.toContain("enqueueCheatSheetPersonSection");
    expect(notes).toContain("enqueueLearningsReassessIfChanged");
  });
});
