import { describe, expect, it } from "vitest";
import {
  APPLICATION_STEP_KEYS,
  applicationStepFromPathname,
  applicationStepHref,
  applicationStepList,
  applicationStepCopy,
} from "@/lib/product-config/application-steps";
import { applicationAssetConfig, applicationSummaryConfig } from "@/lib/product-config";
import { readFileSync } from "node:fs";
import {
  buildApplicationStepViews,
  emptyApplicationStepFacts,
  migrateWorkspaceSeen,
  parseWorkspaceSeenJson,
  resolveApplicationStepState,
  stepHasActiveJob,
  stepNewLabel,
  WORKSPACE_SEEN_VERSION,
  type ApplicationStepFactInput,
} from "@/lib/application/step-progress";

const idle = emptyApplicationStepFacts();

function job(type: "RESUME" | "COVER_LETTER" | "OUTREACH" | "INTERVIEW_GUIDE" | "CONSULTATION" | "APPLICATION_SUMMARY" | "HIRING_TEAM_BUILD", status: "PENDING" | "IN_PROGRESS" | "FAILED" | "COMPLETED") {
  return {
    id: "job_1",
    type,
    status,
    targetId: null,
    error: status === "FAILED" ? "Retry." : null,
    canRetry: status === "FAILED",
    progressText: "Working",
    waitKind: "longer" as const,
    sectionId: "section",
    readyText: "Ready.",
  };
}

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
      "job",
      "company",
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
    expect(applicationStepList.find((step) => step.key === "applied")?.title).toBe(
      "Application Status",
    );
    expect(applicationStepList.find((step) => step.key === "hiring-team")?.title).toBe(
      "Personas and Interviewers",
    );
    expect(applicationStepList.find((step) => step.key === "outreach")?.title).toBe(
      "Send Outreach",
    );
  });
});

describe("application step colors", () => {
  it("uses red, yellow, and green under the owner rules", () => {
    expect(resolveApplicationStepState("applied", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState(
        "applied",
        { ...idle, researchDone: true },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("applied", { ...idle, appliedAt: "2026-09-25" }, []),
    ).toBe("done");

    expect(resolveApplicationStepState("company", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState("company", { ...idle, researchInProgress: true }, []),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("company", { ...idle, researchFailed: true }, []),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("company", { ...idle, researchDone: true }, []),
    ).toBe("done");

    expect(resolveApplicationStepState("job", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState(
        "job",
        { ...idle, hasJobTitle: true, jobReprocessing: true },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("job", { ...idle, hasJobTitle: true }, []),
    ).toBe("done");

    expect(resolveApplicationStepState("consultation", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState(
        "consultation",
        {
          ...idle,
          consultationStarted: true,
          consultationComplete: false,
          consultationUnanswered: true,
        },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "consultation",
        { ...idle, consultationStarted: true, consultationComplete: true },
        [],
      ),
    ).toBe("done");

    expect(resolveApplicationStepState("assets", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState(
        "assets",
        {
          ...idle,
          hasResumeVersion: true,
          latestResumeApproved: false,
          hasUnapprovedAssetDraft: true,
          latestResumeVersion: 2,
        },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("assets", idle, [job("RESUME", "IN_PROGRESS")]),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "assets",
        {
          ...idle,
          hasResumeVersion: true,
          latestResumeApproved: true,
          hasApprovedResume: true,
          latestResumeVersion: 1,
        },
        [],
      ),
    ).toBe("done");

    expect(resolveApplicationStepState("hiring-team", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState(
        "hiring-team",
        { ...idle, hiringTeamRoleCount: 2, hiringTeamBuiltCount: 1 },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "hiring-team",
        { ...idle, hiringTeamRoleCount: 2, hiringTeamBuiltCount: 2 },
        [],
      ),
    ).toBe("done");
    expect(
      resolveApplicationStepState(
        "hiring-team",
        { ...idle, hiringTeamRoleCount: 0, hiringTeamBuiltCount: 0 },
        [],
      ),
    ).toBe("not_started");

    expect(resolveApplicationStepState("outreach", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState("outreach", { ...idle, contactCount: 1 }, []),
    ).toBe("active");
    expect(
      resolveApplicationStepState(
        "outreach",
        { ...idle, contactCount: 1 },
        [job("OUTREACH", "IN_PROGRESS")],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("outreach", { ...idle, contactCount: 3 }, []),
    ).not.toBe("done");

    expect(resolveApplicationStepState("interviews", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState("interviews", idle, [job("INTERVIEW_GUIDE", "IN_PROGRESS")]),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "interviews",
        { ...idle, interviewStageCount: 1 },
        [job("INTERVIEW_GUIDE", "IN_PROGRESS")],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "interviews",
        { ...idle, interviewStageCount: 2 },
        [],
      ),
    ).toBe("done");

    expect(resolveApplicationStepState("summary", idle, [])).toBe("not_started");
    expect(
      resolveApplicationStepState("summary", idle, [job("APPLICATION_SUMMARY", "IN_PROGRESS")]),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState("summary", { ...idle, cheatSheetReady: true }, []),
    ).toBe("done");
  });

  it("treats a failed step that already has work as yellow, not red", () => {
    expect(
      resolveApplicationStepState("assets", idle, [job("RESUME", "FAILED")]),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "company",
        { ...idle, researchFailed: true },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "hiring-team",
        { ...idle, hiringTeamRoleCount: 1, hiringTeamBuiltCount: 0 },
        [job("HIRING_TEAM_BUILD", "FAILED")],
      ),
    ).toBe("in_progress");
  });

  it("returns Harper to yellow when new data presents after every question was answered", () => {
    const complete: ApplicationStepFactInput = {
      ...idle,
      consultationStarted: true,
      consultationComplete: true,
      consultationUnanswered: false,
    };
    expect(resolveApplicationStepState("consultation", complete, [])).toBe("done");
    expect(
      resolveApplicationStepState(
        "consultation",
        {
          ...complete,
          consultationComplete: false,
          consultationUnanswered: true,
        },
        [],
      ),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "consultation",
        {
          ...complete,
          consultationComplete: false,
          consultationUnanswered: false,
        },
        [],
      ),
    ).toBe("in_progress");
  });

  it("marks Harper green when every question is answered even if open gaps remain", () => {
    expect(
      resolveApplicationStepState(
        "consultation",
        {
          ...idle,
          consultationStarted: true,
          consultationComplete: true,
          consultationUnanswered: false,
        },
        [],
      ),
    ).toBe("done");
  });

  it("shows yellow and a specific NEW pill on a green step Harper changed until it is opened", () => {
    const facts: ApplicationStepFactInput = {
      ...idle,
      latestResumeApproved: true,
      hasApprovedResume: true,
      hasResumeVersion: true,
      latestResumeVersion: 3,
      latestAssetKind: "resume",
    };
    const unread = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "job",
      facts,
      jobs: [],
      seen: { assets: "resume:v2" },
    });
    const assets = unread.find((step) => step.key === "assets");
    expect(assets?.state).toBe("in_progress");
    expect(assets?.hasActiveJob).toBe(false);
    expect(assets?.hasNew).toBe(true);
    expect(assets?.newLabel).toBe("New: resume version 3");
    expect(assets?.newLabel).not.toMatch(/^NEW$/i);
    expect(assets?.newLabel).not.toMatch(/job_|camp_|[0-9]{4}-[0-9]{2}-[0-9]{2}T/);
    const viewed = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "assets",
      facts,
      jobs: [],
      seen: { assets: "resume:v3" },
    });
    expect(viewed.find((step) => step.key === "assets")?.state).toBe("done");
    expect(viewed.find((step) => step.key === "assets")?.hasNew).toBe(false);
  });

  it("marks active jobs separately from started unfinished steps and unread results", () => {
    const activeJobViews = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: null,
      facts: { ...idle, hasResumeVersion: true },
      jobs: [job("RESUME", "IN_PROGRESS")],
      seen: {},
    });
    const assetsActive = activeJobViews.find((step) => step.key === "assets");
    expect(assetsActive?.state).toBe("in_progress");
    expect(assetsActive?.hasActiveJob).toBe(true);
    expect(
      stepHasActiveJob("assets", { ...idle, hasResumeVersion: true }, [
        job("RESUME", "PENDING"),
      ]),
    ).toBe(true);

    const startedViews = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: null,
      facts: {
        ...idle,
        consultationStarted: true,
        consultationComplete: false,
      },
      jobs: [],
      seen: {},
    });
    const consultation = startedViews.find((step) => step.key === "consultation");
    expect(consultation?.state).toBe("in_progress");
    expect(consultation?.hasActiveJob).toBe(false);

    const unreadDone = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "job",
      facts: {
        ...idle,
        researchDone: true,
      },
      jobs: [],
      seen: {},
    });
    const company = unreadDone.find((step) => step.key === "company");
    expect(company?.state).toBe("in_progress");
    expect(company?.hasNew).toBe(true);
    expect(company?.hasActiveJob).toBe(false);
    expect(company?.newLabel).toBeTruthy();
  });

  it("spins the sidebar marker only when an in-progress step has an active job", () => {
    const marker = readFileSync("src/components/ApplicationSidebarTracker.tsx", "utf8");
    expect(marker).toContain("hasActiveJob");
    expect(marker).toContain(
      "const showSpinner = state === \"in_progress\" && hasActiveJob;",
    );
    expect(marker).toContain("tracker-step-marker-spinner");
    expect(marker).toContain("tracker-step-marker-static");
  });

  it("shows the full application name wrapped to two lines with a hover title", () => {
    const tracker = readFileSync(
      "src/components/ApplicationSidebarTracker.tsx",
      "utf8",
    );
    expect(tracker).toContain("title={tracker.campaignName}");
    expect(tracker).toContain("{tracker.campaignName}");
    expect(tracker).toContain("line-clamp-2");
    expect(tracker).toContain("break-words");
    expect(tracker).toContain("min-w-0");
    const nameBlock = tracker.slice(
      tracker.indexOf("title={tracker.campaignName}"),
      tracker.indexOf("{tracker.campaignName}") + "{tracker.campaignName}".length,
    );
    expect(nameBlock).not.toMatch(/\btruncate\b/);
  });

  it("never writes NEW-only pills, ids, or timestamps, and migrates seen by bumping version only", () => {
    const facts: ApplicationStepFactInput = {
      ...idle,
      researchDone: true,
      hasJobTitle: true,
      consultationStarted: true,
      consultationComplete: true,
      hiringTeamRoleCount: 1,
      hiringTeamBuiltCount: 1,
      hasResumeVersion: true,
      latestResumeApproved: true,
      hasApprovedResume: true,
      latestResumeVersion: 1,
      latestAssetKind: "resume",
      contactCount: 1,
      interviewStageCount: 1,
      cheatSheetReady: true,
      appliedAt: "2026-09-25T00:00:00.000Z",
    };
    const legacy = parseWorkspaceSeenJson({
      company: "cuidjob1234567890",
      job: "job:ready",
      consultation: "consultation:started",
      assets: "resume:approved",
      "hiring-team": "hiring-team:1",
      outreach: "outreach:1",
      interviews: "interviews:1",
      summary: "summary:ready",
      applied: "2026-09-25T00:00:00.000Z",
    });
    const migrated = migrateWorkspaceSeen(legacy);
    expect(migrated.version).toBe(WORKSPACE_SEEN_VERSION);
    expect(migrated.keys).toEqual(legacy.keys);
    for (const key of APPLICATION_STEP_KEYS) {
      const label = stepNewLabel(key, facts);
      expect(label).toBeTruthy();
      expect(label).not.toBe("NEW");
      expect(label).not.toBe("New");
      expect(label).not.toMatch(/cuid|job_1|camp_1/);
      expect(label).not.toMatch(/T00:00:00/);
    }
    expect(applicationStepCopy.newMarker).toBe("New");
  });

  it("never shows Review remaining personas; NEW is the only sidebar prompt", () => {
    const remaining = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: null,
      facts: { ...idle, hiringTeamRoleCount: 3, hiringTeamBuiltCount: 1 },
      jobs: [],
      seen: {},
    });
    const hiring = remaining.find((step) => step.key === "hiring-team");
    expect(hiring?.state).toBe("in_progress");
    expect(hiring?.statusNote).toBeNull();
    expect(hiring?.newLabel).toBe(applicationStepCopy.newHiringPersonas);
    expect(hiring?.newLabel).not.toBe("Review remaining personas");
    expect(applicationStepCopy).not.toHaveProperty("reviewRemainingPersonas");
    const sidebar = readFileSync(
      "src/components/ApplicationSidebarTracker.tsx",
      "utf8",
    );
    expect(sidebar).not.toContain("statusNote");
    expect(sidebar).toContain("min-w-0 flex-1");
    expect(sidebar).toContain("mt-0.5 inline-block max-w-full break-words");
    expect(sidebar).not.toMatch(
      /flex-1[\s\S]*tracker-new[\s\S]*<\/span>\s*\{step\.hasNew/,
    );
    const outreach = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: null,
      facts: { ...idle, contactCount: 2 },
      jobs: [],
      seen: { outreach: "outreach:contacts:2" },
    }).find((step) => step.key === "outreach");
    expect(outreach?.state).toBe("active");
    expect(outreach?.state).not.toBe("done");
  });
});
