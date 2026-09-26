import { describe, expect, it } from "vitest";
import { buildHarperSuggestions } from "@/lib/application/harper-suggestions";
import type { ApplicationStepFactInput } from "@/lib/application/step-progress";
import { consultationConfig } from "@/lib/product-config";

const facts: ApplicationStepFactInput = {
  researchDone: true,
  researchFailed: false,
  researchInProgress: false,
  hasJobTitle: true,
  fitNeedsRescore: false,
  hiringTeamRoleCount: 1,
  hasApprovedResume: true,
  hasApprovedCoverLetter: true,
  contactCount: 1,
  interviewStageCount: 1,
  cheatSheetReady: false,
  appliedAt: null,
  consultationStarted: false,
};

describe("Harper suggestions", () => {
  it("changes with the current step and skips actions the data cannot support", () => {
    const resume = buildHarperSuggestions({
      campaignId: "camp_1",
      step: "assets",
      facts,
      people: [{ name: "Alex Rivera" }],
    });
    expect(resume.some((item) => item.type === "review_resume")).toBe(true);
    expect(resume.every((item) => item.label)).toBe(true);
    expect(resume.some((item) => item.label.includes(consultationConfig.displayName))).toBe(
      true,
    );

    const hiring = buildHarperSuggestions({
      campaignId: "camp_1",
      step: "hiring-team",
      facts,
      people: [{ name: "Alex Rivera" }],
    });
    expect(hiring.some((item) => item.type === "prepare_person")).toBe(true);
    expect(hiring.find((item) => item.type === "prepare_person")?.label).toContain(
      "Alex Rivera",
    );

    const emptyHiring = buildHarperSuggestions({
      campaignId: "camp_1",
      step: "hiring-team",
      facts,
      people: [],
    });
    expect(emptyHiring.some((item) => item.type === "prepare_person")).toBe(false);

    const applied = buildHarperSuggestions({
      campaignId: "camp_1",
      step: "overview",
      facts: { ...facts, appliedAt: "2026-09-25" },
      people: [],
    });
    expect(applied.some((item) => item.type === "mark_applied")).toBe(false);
  });
});
