import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cheatSheetLikelyQuestionsElementId,
  cheatSheetPersonQueryKey,
} from "@/lib/application-summary/filter";
import { workspaceInterviewLikelyQuestionsHref } from "@/lib/application/workspace-links";
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
    expect(section).toContain("asset-in-place-editor");
    expect(section).toContain("applicationAssetConfig.labels.saveNewVersion");
    expect(section).toContain("applicationAssetConfig.labels.approve");
    expect(section).toContain("applicationAssetConfig.labels.downloadDocx");
    expect(section).toContain("regenerationInstruction");
    expect(section).toContain("applicationAssetConfig.labels.changeInstruction");
    expect(applicationAssetConfig.labels.changeInstruction).toBe(
      `What should ${consultationConfig.displayName} change?`,
    );
    expect(section).not.toContain("toLocaleString");
    expect(section).toContain("Version {asset.version} · {formatAssetStatusLabel(asset.status)}");
    expect(section).not.toContain("asset.guidance");
    expect(service).toContain("ensureAcceptedPresentationPlan");
    expect(service).toContain("guidance: null");
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
  const openActions = source("src/components/InterviewStageOpenActions.tsx");
  const notes = source("src/lib/application-summary/service.ts");
  const body = source("src/components/CheatSheetPersonBody.tsx");
  const filter = source("src/components/CheatSheetPeopleFilter.tsx");

  it("places buttons on the earliest stage without an outcome", () => {
    expect(stages).toContain("openInterviewStage(stages)");
    expect(stages).toContain("InterviewStageOpenActions");
    expect(openInterviewStage([{ outcome: "ADVANCED" }, { outcome: null }])?.outcome).toBeNull();
    expect(openInterviewStage([{ outcome: null }, { outcome: null }])).toEqual({
      outcome: null,
    });
    expect(openInterviewStage([{ outcome: "COMPLETED" }])).toBeNull();
    expect(interviewConfig.labels.addNewlyGainedInformation).toBe(
      "Add newly gained information here",
    );
    expect(interviewConfig.labels.reviewOpenQuestions).toBe(
      "Review open questions for this interview",
    );
    expect(openActions).toContain("addNewlyGainedInformation");
    expect(openActions).toContain("reviewOpenQuestions");
    expect(openActions).toContain("disabled={!interviewerContactId}");
    expect(openActions).toContain("workspaceInterviewLikelyQuestionsHref");
    expect(panel).toContain("gained-information-${stageId}");
    expect(panel).toContain("addCheatSheetInterviewNoteAction");
    expect(notes).toContain("enqueueCheatSheetPersonSection");
    expect(notes).toContain('operation: "reassess"');
    expect(body).toContain("cheatSheetLikelyQuestionsElementId");
    expect(filter).toContain("initialPersonKey");
    expect(cheatSheetLikelyQuestionsElementId("contact:abc")).toBe(
      "contact:abc-likely-questions",
    );
    expect(cheatSheetPersonQueryKey("contact:abc")).toBe("contact:abc");
    expect(cheatSheetPersonQueryKey("other")).toBeNull();
    expect(workspaceInterviewLikelyQuestionsHref("camp_1", "ct_1")).toContain(
      "person=contact%3Act_1",
    );
    expect(workspaceInterviewLikelyQuestionsHref("camp_1", "ct_1")).toContain(
      "contact%3Act_1-likely-questions",
    );
  });
});
