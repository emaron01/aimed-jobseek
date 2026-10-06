// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicationStepCards } from "@/components/ApplicationStepCards";
import { TopBar } from "@/components/TopBar";
import { harperLivePresentation } from "@/components/HarperLiveStatus";
import { mergeWorkspaceJobSnapshots } from "@/components/workspace-jobs-context";
import {
  applicationProgressLine,
  dashboardStepShowsSpinner,
  newApplicationProgressLabels,
  type ApplicationStepView,
} from "@/lib/application/step-progress";
import {
  campaignIdFromPathname,
  isNewApplicationPath,
} from "@/lib/application/workspace-links";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { applicationStepCopy } from "@/lib/product-config";

function job(
  status: WorkspaceJobStatusView["status"],
  type: WorkspaceJobStatusView["type"] = "CONSULTATION",
): WorkspaceJobStatusView {
  return {
    id: "job_1",
    type,
    status,
    targetId: null,
    error: null,
    canRetry: false,
    progressText: "Working",
    waitKind: "stayAndWatch",
    sectionId: "harper",
    readyText: "Ready",
  };
}

function step(
  patch: Partial<ApplicationStepView> & Pick<ApplicationStepView, "key" | "title">,
): ApplicationStepView {
  return {
    number: 1,
    href: "/campaigns/camp_1/consultation",
    state: "not_started",
    resultKey: null,
    newLabel: null,
    statusNote: null,
    hasNew: false,
    hasActiveJob: false,
    workDone: false,
    isCurrent: false,
    isPage: true,
    ...patch,
  };
}

describe("dashboard step cards", () => {
  it("shows the shared spinner while work is running and Done once that work has finished", () => {
    const running = step({
      key: "consultation",
      title: "Harper",
      hasActiveJob: true,
    });
    expect(dashboardStepShowsSpinner(running, [job("IN_PROGRESS")])).toBe(true);
    expect(dashboardStepShowsSpinner(running, [])).toBe(true);
    const spinning = renderToStaticMarkup(
      createElement(ApplicationStepCards, { steps: [running] }),
    );
    expect(spinning).toContain('data-testid="action-pending-spinner"');

    const finished = step({
      key: "consultation",
      title: "Harper",
      hasActiveJob: true,
      workDone: true,
      state: "in_progress",
    });
    expect(dashboardStepShowsSpinner(finished, [job("COMPLETED")])).toBe(false);
    const done = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps: [{ ...finished, hasActiveJob: false }],
      }),
    );
    expect(done).not.toContain('data-testid="action-pending-spinner"');
    expect(done).toContain(applicationStepCopy.done);
  });
});

describe("Harper refresh", () => {
  it("clears the spinner when the live job has finished even if the server snapshot is still running", () => {
    expect(
      harperLivePresentation({
        serverJobs: [job("IN_PROGRESS")],
        liveJobs: [job("COMPLETED")],
      }),
    ).toBe("clear");
    expect(
      mergeWorkspaceJobSnapshots([job("COMPLETED")], [job("IN_PROGRESS")]).map(
        (item) => item.status,
      ),
    ).toEqual(["COMPLETED"]);
  });
});

describe("application progress line", () => {
  const steps = [
    step({ key: "job", title: "Job requirements", number: 2, workDone: true }),
    step({
      key: "company",
      title: "Company",
      number: 3,
      hasActiveJob: true,
      workDone: false,
    }),
    step({ key: "consultation", title: "Harper", number: 4, workDone: false }),
    step({ key: "assets", title: "Assets", number: 5, workDone: true }),
  ];

  it("names the running step and the next unfinished step", () => {
    expect(applicationProgressLine(steps)).toEqual({
      current: `${applicationStepCopy.currentlyCompleting}: Company`,
      next: `${applicationStepCopy.nextUp}: Harper`,
    });
  });

  it("returns nothing when every step is done", () => {
    expect(
      applicationProgressLine(
        steps.map((item) => ({ ...item, workDone: true, hasActiveJob: false })),
      ),
    ).toBeNull();
  });

  it("keeps Harper current when Application Status is still not done", () => {
    const workflow = [
      step({ key: "applied", title: "Application Status", number: 1, workDone: false }),
      step({ key: "job", title: "Job requirements", number: 2, workDone: true }),
      step({ key: "company", title: "Company", number: 3, workDone: true }),
      step({ key: "consultation", title: "Harper", number: 4, workDone: false }),
      step({
        key: "assets",
        title: "Resume and cover letter",
        number: 5,
        workDone: false,
      }),
    ];
    expect(applicationProgressLine(workflow)).toEqual({
      current: `${applicationStepCopy.currentlyCompleting}: Harper`,
      next: `${applicationStepCopy.nextUp}: Resume and cover letter`,
    });
  });

  it("labels New Application without treating that page as an application", () => {
    expect(newApplicationProgressLabels()).toEqual({
      current: `${applicationStepCopy.currentlyCompleting}: ${applicationStepCopy.newApplication}`,
      next: `${applicationStepCopy.nextUp}: Job requirements`,
    });
    expect(isNewApplicationPath("/campaigns/new")).toBe(true);
    expect(campaignIdFromPathname("/campaigns/camp_1/consultation")).toBe("camp_1");
    expect(campaignIdFromPathname("/campaigns")).toBeNull();
    expect(campaignIdFromPathname("/campaigns/new")).toBeNull();
  });

  it("shows the workspace name and the step pills on one line", () => {
    const progress = applicationProgressLine(steps);
    const html = renderToStaticMarkup(
      createElement(TopBar, {
        menuModel: null,
        workspaceTitle: "Acme Workspace",
        progress,
      }),
    );
    expect(html).toContain('data-testid="workspace-heading"');
    expect(html).toContain("Acme Workspace");
    expect(html).toContain("bg-success-tint");
    expect(html).toContain("Currently Completing: Company");
    expect(html).toContain("bg-danger-tint");
    expect(html).toContain("Next Up: Harper");
    expect(html).toContain("items-center");
  });
});
