import { describe, expect, it } from "vitest";
import {
  applicationStepFromPathname,
  applicationStepHref,
  applicationStepList,
} from "@/lib/product-config/application-steps";
import { applicationAssetConfig, applicationSummaryConfig } from "@/lib/product-config";
import {
  buildApplicationStepViews,
  resolveApplicationStepState,
  type ApplicationStepFactInput,
} from "@/lib/application/step-progress";

const idle: ApplicationStepFactInput = {
  researchDone: false,
  researchFailed: false,
  researchInProgress: false,
  hasJobTitle: false,
  fitNeedsRescore: false,
  hiringTeamRoleCount: 0,
  hasApprovedResume: false,
  hasApprovedCoverLetter: false,
  contactCount: 0,
  interviewStageCount: 0,
  cheatSheetReady: false,
  appliedAt: null,
  consultationStarted: false,
};

describe("application step routes", () => {
  it("gives every page step its own URL and keeps Applied on the overview", () => {
    expect(applicationStepHref("camp_1", "company")).toBe("/campaigns/camp_1/company");
    expect(applicationStepHref("camp_1", "job")).toBe("/campaigns/camp_1/job");
    expect(applicationStepHref("camp_1", "hiring-team")).toBe(
      "/campaigns/camp_1/hiring-team",
    );
    expect(applicationStepHref("camp_1", "assets")).toBe("/campaigns/camp_1/assets");
    expect(applicationStepHref("camp_1", "outreach")).toBe("/campaigns/camp_1/outreach");
    expect(applicationStepHref("camp_1", "interviews")).toBe(
      "/campaigns/camp_1/interviews",
    );
    expect(applicationStepHref("camp_1", "summary")).toBe("/campaigns/camp_1/summary");
    expect(applicationStepHref("camp_1", "applied")).toBe("/campaigns/camp_1#applied");
    expect(applicationStepFromPathname("/campaigns/camp_1")).toBe("overview");
    expect(applicationStepFromPathname("/campaigns/camp_1/job")).toBe("job");
    expect(applicationStepFromPathname("/campaigns/camp_1/interviews/stage_1")).toBe(
      "interviews",
    );
    expect(applicationStepHref("camp_1", "consultation")).toBe(
      "/campaigns/camp_1/consultation",
    );
    expect(applicationStepList.map((step) => step.key)).toEqual([
      "applied",
      "company",
      "job",
      "consultation",
      "assets",
      "hiring-team",
      "outreach",
      "interviews",
      "summary",
    ]);
    expect(applicationStepList.find((step) => step.key === "assets")?.title).toBe(
      applicationAssetConfig.labels.sectionTitle,
    );
    expect(applicationStepList.find((step) => step.key === "summary")?.title).toBe(
      applicationSummaryConfig.title,
    );
  });
});

describe("application step done states", () => {
  it("follows real application data", () => {
    expect(resolveApplicationStepState("assets", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState("assets", { ...idle, hasApprovedResume: true }, []),
    ).toBe("done");
    expect(
      resolveApplicationStepState("applied", { ...idle, appliedAt: "2026-09-25" }, []),
    ).toBe("done");
    expect(
      resolveApplicationStepState(
        "company",
        { ...idle, researchInProgress: true },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("company", { ...idle, researchFailed: true }, []),
    ).toBe("needs_attention");
    expect(
      resolveApplicationStepState(
        "assets",
        idle,
        [
          {
            id: "job_1",
            type: "RESUME",
            status: "FAILED",
            targetId: null,
            error: "Retry.",
            canRetry: true,
            progressText: "Writing",
            waitKind: "longer",
            sectionId: "assets",
            readyText: "Resume is ready.",
          },
        ],
      ),
    ).toBe("needs_attention");
  });

  it("shows one new marker per latest result and clears it after view", () => {
    const views = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "assets",
      facts: { ...idle, hasApprovedResume: true },
      jobs: [],
      seen: {},
    });
    const assets = views.find((step) => step.key === "assets");
    expect(assets?.hasNew).toBe(true);
    expect(assets?.isCurrent).toBe(true);
    expect(assets?.href).toBe("/campaigns/camp_1/assets");
    const viewed = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "assets",
      facts: { ...idle, hasApprovedResume: true },
      jobs: [],
      seen: { assets: "resume:approved" },
    });
    expect(viewed.find((step) => step.key === "assets")?.hasNew).toBe(false);
    expect(views.filter((step) => step.hasNew).map((step) => step.key)).toEqual([
      "assets",
    ]);
  });
});
