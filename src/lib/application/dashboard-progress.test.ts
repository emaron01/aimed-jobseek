// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicationOverview } from "@/components/ApplicationOverview";
import { ApplicationStepCards } from "@/components/ApplicationStepCards";
import { ApplicationStepMarker } from "@/components/ApplicationSidebarTracker";
import { TopBar } from "@/components/TopBar";
import { harperLivePresentation } from "@/components/HarperLiveStatus";
import { mergeWorkspaceJobSnapshots } from "@/components/workspace-jobs-context";
import {
  applicationProgressLine,
  buildApplicationStepViews,
  dashboardStepShowsSpinner,
  emptyApplicationStepFacts,
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
    actionLabel: "Open Harper",
    actionHref: "/campaigns/camp_1/consultation",
    turnCountLabel: null,
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
    expect(spinning).toContain(applicationStepCopy.harperIsWorking);

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

describe("dashboard step wording", () => {
  function card(html: string, key: string): string {
    const match = html.match(
      new RegExp(`data-testid="overview-step-${key}"[\\s\\S]*?</a>`),
    );
    expect(match?.[0], key).toBeTruthy();
    return match?.[0] ?? "";
  }

  it("shows the new names and status wording on the dashboard and in the top-bar pills", () => {
    const steps = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "overview",
      facts: {
        ...emptyApplicationStepFacts(),
        appliedAt: "2026-09-25",
        hasJobTitle: true,
        researchDone: true,
        consultationStarted: true,
        consultationComplete: false,
        hasResumeVersion: true,
        latestResumeApproved: true,
        hasApprovedResume: true,
        hiringTeamRoleCount: 1,
        hiringTeamBuiltCount: 0,
        interviewStageCount: 1,
        cheatSheetReady: true,
      },
      jobs: [],
      seen: { consultation: "consultation:open" },
    });
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, { steps }),
    );

    expect(card(html, "applied")).toContain("Application Status");
    expect(card(html, "applied")).toContain(applicationStepCopy.appliedDone);
    expect(card(html, "applied")).toContain("bg-success-tint");
    expect(card(html, "job")).toContain(applicationStepCopy.jobDone);
    expect(card(html, "company")).toContain("Company Research");
    expect(card(html, "company")).toContain(applicationStepCopy.companyDone);
    expect(card(html, "consultation")).toContain("Harper Questionnaire");
    expect(card(html, "consultation")).not.toContain(
      applicationStepCopy.consultationInProgress,
    );
    expect(card(html, "assets")).toContain(applicationStepCopy.assetsDone);
    expect(card(html, "hiring-team")).toContain("Personas and Interviewers");
    expect(card(html, "hiring-team")).toContain(applicationStepCopy.newHiringPersonas);
    expect(card(html, "outreach")).toContain("Send Outreach");
    expect(card(html, "outreach")).toContain(applicationStepCopy.notStarted);
    const interviews = card(html, "interviews");
    expect(interviews).toContain("Interview Notes");
    expect(interviews).toContain(applicationStepCopy.interviewsDone);
    expect(interviews).toContain("bg-warning-tint");
    expect(interviews).not.toContain("bg-success-tint");
    expect(card(html, "summary")).toContain("Interview Preparation Guides");
    expect(card(html, "summary")).toContain(applicationStepCopy.summaryStatus);

    const companyNext = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "overview",
      facts: { ...emptyApplicationStepFacts(), hasJobTitle: true },
      jobs: [],
      seen: {},
    });
    const companyPills = renderToStaticMarkup(
      createElement(TopBar, {
        menuModel: null,
        workspaceTitle: "Acme Workspace",
        progress: applicationProgressLine(companyNext),
      }),
    );
    expect(companyPills).toContain("Currently Completing: Company Research");
    expect(companyPills).toContain("Next Up: Harper Questionnaire");

    const guidesNext = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "overview",
      facts: {
        ...emptyApplicationStepFacts(),
        hasJobTitle: true,
        researchDone: true,
        consultationStarted: true,
        consultationComplete: true,
        hasResumeVersion: true,
        latestResumeApproved: true,
        hasApprovedResume: true,
        appliedAt: "2026-09-25",
        hiringTeamRoleCount: 1,
        hiringTeamBuiltCount: 1,
        interviewStageCount: 1,
      },
      jobs: [],
      seen: {},
    });
    const guidePills = renderToStaticMarkup(
      createElement(TopBar, {
        menuModel: null,
        progress: applicationProgressLine(guidesNext),
      }),
    );
    expect(guidePills).toContain("Next Up: Interview Preparation Guides");

    const marker = renderToStaticMarkup(
      createElement(ApplicationStepMarker, {
        state: "done",
        current: false,
        statusLabel: applicationStepCopy.interviewsDone,
        statusTone: "progress",
      }),
    );
    expect(marker).toContain("bg-warning-tint");
    expect(marker).toContain(applicationStepCopy.interviewsDone);
    expect(marker).not.toContain("bg-success");
  });
});

describe("dashboard guidance", () => {
  function overviewView(steps: ApplicationStepView[]) {
    return {
      campaignId: "camp_1",
      campaignName: "Acme",
      jobTitle: "Analyst",
      companyName: "Northwind",
      statusLabel: "Not applied",
      statusTone: "attention" as const,
      appliedAt: null,
      nextStepText: "Add the company website.",
      nextStepFailed: false,
      fitLabel: null,
      location: null,
      workArrangement: null,
      compensation: null,
      steps,
    };
  }

  it("shows a your-turn count and the task button from the existing step state", () => {
    const steps = buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep: "overview",
      facts: {
        ...emptyApplicationStepFacts(),
        consultationStarted: true,
        consultationComplete: false,
        consultationUnanswered: true,
        consultationUnansweredCount: 3,
        consultationFirstUnansweredTurnId: "turn_9",
        hiringTeamRoleCount: 2,
        hiringTeamBuiltCount: 0,
        interviewersWithoutGuideCount: 2,
        firstInterviewerWithoutGuideId: "contact_2",
      },
      jobs: [],
      seen: {},
    });
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, { steps }),
    );
    const consultation = steps.find((item) => item.key === "consultation");
    expect(consultation?.state).toBe("in_progress");
    const text = html.replaceAll("&#x27;", "'").replaceAll("&#39;", "'");
    expect(text).toContain(applicationStepCopy.yourTurn);
    expect(text).toContain("3 questions need your answer");
    expect(text).toContain(applicationStepCopy.answerHarper);
    expect(html).toContain(
      'href="/campaigns/camp_1/consultation#harper-q%3Aturn_9"',
    );
    expect(html).toContain("2 personas are not built");
    const guides = steps.find((item) => item.key === "summary");
    expect(guides?.state).toBe("not_started");
    expect(guides?.turnCountLabel).toBe("2 interviewers have no prep guide");
    expect(guides?.actionLabel).toBe(applicationStepCopy.createPrepGuides);
    expect(guides?.actionHref).toBe(
      "/campaigns/camp_1/interviews#person-section-contact_2",
    );
    expect(html).toContain(applicationStepCopy.createPrepGuides);
    expect(html).toContain('href="/campaigns/camp_1/interviews#person-section-contact_2"');
    const guideCard = html.match(
      /data-testid="overview-step-summary"[\s\S]*?<\/a>/,
    )?.[0] ?? "";
    expect(guideCard).not.toContain("2 interviewers have no prep guide");
  });

  it("uses the same step as Currently Completing and hides when every step is done", () => {
    const steps = [
      step({
        key: "job",
        title: "Job requirements",
        number: 2,
        workDone: true,
        actionLabel: "Open Job requirements",
        actionHref: "/campaigns/camp_1/job",
      }),
      step({
        key: "company",
        title: "Company Research",
        number: 3,
        hasActiveJob: true,
        state: "in_progress",
        actionLabel: applicationStepCopy.reviewCompany,
        actionHref: "/campaigns/camp_1/company",
      }),
    ];
    const progress = applicationProgressLine(steps);
    const html = renderToStaticMarkup(
      createElement(ApplicationOverview, { view: overviewView(steps) }),
    );
    expect(progress?.current).toBe(
      `${applicationStepCopy.currentlyCompleting}: Company Research`,
    );
    expect(html).toContain(
      `${applicationStepCopy.yourNextStep}: Company Research: ${applicationStepCopy.reviewCompany}`,
    );
    expect(html).toContain('data-testid="your-next-step-action"');
    expect(html).toContain('href="/campaigns/camp_1/company"');

    const finished = steps.map((item) => ({
      ...item,
      workDone: true,
      hasActiveJob: false,
    }));
    expect(applicationProgressLine(finished)).toBeNull();
    const doneHtml = renderToStaticMarkup(
      createElement(ApplicationOverview, { view: overviewView(finished) }),
    );
    expect(doneHtml).not.toContain('data-testid="your-next-step"');
  });

  it("does not enqueue work or make a paid call while drawing the dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationOverview, {
        view: overviewView(
          buildApplicationStepViews({
            campaignId: "camp_1",
            currentStep: "overview",
            facts: emptyApplicationStepFacts(),
            jobs: [],
            seen: {},
          }),
        ),
      }),
    );
    expect(html).toContain(applicationStepCopy.dashboardTitle);
    for (const path of [
      "src/components/ApplicationOverview.tsx",
      "src/components/ApplicationStepCards.tsx",
      "src/lib/application/overview.ts",
      "src/lib/application/tracker.ts",
      "src/app/(app)/campaigns/[id]/page.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("enqueueApplicationJob");
      expect(source).not.toContain("runPaidStructuredCall");
      expect(source).not.toContain("generateStructured");
    }
  });

  it("puts a small action on the text row, green for your turn and white when done", () => {
    const steps = [
      step({
        key: "consultation",
        title: "Harper Questionnaire",
        state: "in_progress",
        actionLabel: "Answer Harper's questions",
        actionHref: "/campaigns/camp_1/consultation",
      }),
      step({
        key: "job",
        title: "Job requirements",
        workDone: true,
        state: "done",
        actionLabel: "Open Job requirements",
        actionHref: "/campaigns/camp_1/job",
      }),
      step({
        key: "company",
        title: "Company Research",
        hasActiveJob: true,
        state: "in_progress",
        actionLabel: "Review company research",
        actionHref: "/campaigns/camp_1/company",
      }),
    ];
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, { steps }),
    );
    const opening = (source: string, testId: string) =>
      source.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? "";
    const card = opening(html, "overview-step-consultation");
    expect(card).toContain("flex-wrap");
    expect(card).toContain("items-center");
    expect(card).not.toContain("flex-col");
    const yourTurn = opening(html, "overview-step-action-consultation");
    expect(yourTurn).toContain("px-2.5");
    expect(yourTurn).toContain("py-1");
    expect(yourTurn).toContain("text-xs");
    expect(yourTurn).toContain("bg-success text-on-ink");
    const done = opening(html, "overview-step-action-job");
    expect(done).toContain("text-xs");
    expect(done).toContain("bg-surface text-ink");
    expect(done).not.toContain("bg-success");
    const working = opening(html, "overview-step-action-company");
    expect(working).toContain("bg-surface text-ink");
    expect(working).not.toContain("bg-success");

    const overview = renderToStaticMarkup(
      createElement(ApplicationOverview, { view: overviewView(steps) }),
    );
    const line = opening(overview, "your-next-step");
    expect(line).toContain("flex-wrap");
    expect(line).toContain("items-center");
    const next = opening(overview, "your-next-step-action");
    expect(next).toContain("text-xs");
    expect(next).toContain("px-2.5");
    expect(next).toContain("bg-surface text-ink");
    expect(next).not.toContain("bg-success");

    const yourTurnLine = renderToStaticMarkup(
      createElement(ApplicationOverview, {
        view: overviewView([
          step({
            key: "consultation",
            title: "Harper Questionnaire",
            state: "in_progress",
            actionLabel: "Answer Harper's questions",
            actionHref: "/campaigns/camp_1/consultation",
          }),
        ]),
      }),
    );
    const yourTurnNext = opening(yourTurnLine, "your-next-step-action");
    expect(yourTurnNext).toContain("text-xs");
    expect(yourTurnNext).toContain("bg-success text-on-ink");
  });
});
