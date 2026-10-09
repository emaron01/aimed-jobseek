// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationOverview } from "@/components/ApplicationOverview";
import { ApplicationStepCards } from "@/components/ApplicationStepCards";
import { expandOuterDetails } from "@/components/DashboardOpenSection";
import {
  closeDashboardOpenStep,
  dashboardOpenSearch,
  dashboardStepHash,
  dashboardStepCardOrder,
  dashboardStepPanelOrder,
  parseDashboardOpenSteps,
  toggleDashboardOpenStep,
} from "@/lib/application/dashboard-open-steps";
import type { ApplicationStepView } from "@/lib/application/step-progress";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/campaigns/camp_1",
}));

function step(
  patch: Partial<ApplicationStepView> & Pick<ApplicationStepView, "key" | "title">,
): ApplicationStepView {
  return {
    number: 1,
    href: `/campaigns/camp_1/${patch.key}`,
    state: "not_started",
    resultKey: null,
    newLabel: null,
    statusNote: null,
    hasNew: false,
    hasActiveJob: false,
    workDone: false,
    actionLabel: `Open ${patch.title}`,
    actionHref: `/campaigns/camp_1/${patch.key}`,
    turnCountLabel: null,
    isCurrent: false,
    isPage: true,
    ...patch,
  };
}

const steps = [
  step({
    key: "applied",
    title: "Application Status",
    number: 1,
    actionHref: "/campaigns/camp_1?open=applied",
    isPage: false,
  }),
  step({ key: "job", title: "Job requirements", number: 2 }),
  step({ key: "company", title: "Company Research", number: 3 }),
  step({ key: "consultation", title: "Harper Questionnaire", number: 4 }),
];

function panelStyle(html: string, key: string): string {
  const match = html.match(
    new RegExp(`<li[^>]*data-testid="overview-step-panel-${key}"[^>]*>`),
  );
  return match?.[0] ?? "";
}

describe("dashboard steps open in place", () => {
  it("renders an open card's shared content under that card's row", () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps,
        campaignId: "camp_1",
        openSteps: ["job"],
        panels: {
          job: createElement("p", { "data-testid": "shared-job" }, "Job body"),
        },
      }),
    );
    const panel = panelStyle(html, "job");
    expect(panel).toContain("sm:col-span-2");
    expect(panel).toContain(`--step-order:${dashboardStepPanelOrder(1, 1)}`);
    expect(panel).toContain(`--step-order-sm:${dashboardStepPanelOrder(1, 2)}`);
    expect(html).toContain('data-testid="shared-job"');
    expect(html).toContain('data-testid="overview-step-full-page-job"');
    expect(html).toContain('href="/campaigns/camp_1/job"');
    expect(html).not.toContain("overview-step-panel-applied");
    expect(html).not.toContain("overview-step-panel-company");
    const jobCard = html.match(
      /<li[^>]*style="--step-order:2;--step-order-sm:2"[^>]*>/,
    );
    expect(jobCard?.[0]).toBeTruthy();
    expect(dashboardStepCardOrder(1)).toBe(2);
    expect(html).toContain('data-testid="overview-step-action-consultation"');
    expect(html).not.toContain('href="/campaigns/camp_1/consultation"');
    expect(html).not.toContain("overview-step-panel-consultation");
  });

  it("keeps the open steps in the query string across a refresh", () => {
    const opened = toggleDashboardOpenStep(["applied"], "job");
    const search = dashboardOpenSearch("?stage=list", opened);
    const again = parseDashboardOpenSteps(
      new URLSearchParams(search.slice(1)).get("open"),
    );
    expect(again).toEqual(["applied", "job"]);
    expect(search.startsWith("?")).toBe(true);
    expect(search).toContain("stage=list");
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps,
        campaignId: "camp_1",
        openSteps: again,
        panels: {
          applied: createElement("p", { "data-testid": "shared-applied" }, "Status"),
          job: createElement("p", { "data-testid": "shared-job" }, "Job"),
        },
      }),
    );
    expect(html).toContain('data-testid="shared-applied"');
    expect(html).toContain('data-testid="shared-job"');
    expect(html).not.toContain("overview-step-full-page-applied");
    expect(html).toContain('data-testid="overview-step-full-page-job"');
    const closed = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps,
        campaignId: "camp_1",
        openSteps: parseDashboardOpenSteps(undefined),
        panels: {
          job: createElement("p", { "data-testid": "shared-job" }, "Job"),
        },
      }),
    );
    expect(closed).not.toContain("shared-job");
  });

  it("does not enqueue a job or make a paid call when a card opens", () => {
    for (const path of [
      "src/components/ApplicationStepCards.tsx",
      "src/components/DashboardInPlaceStepPanels.tsx",
      "src/components/ApplicationStatusBody.tsx",
      "src/components/ApplicationJobBody.tsx",
      "src/components/ApplicationCompanyBody.tsx",
      "src/components/ApplicationAssetsBody.tsx",
      "src/components/ApplicationOutreachBody.tsx",
      "src/components/ApplicationInterviewsBody.tsx",
      "src/components/DashboardOpenSection.tsx",
      "src/components/application-workspace-model.ts",
      "src/lib/application/dashboard-open-steps.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("enqueueApplicationJob");
      expect(source).not.toContain("runPaidStructuredCall");
      expect(source).not.toContain("generateStructured");
    }
    expect(
      readFileSync("src/components/DashboardInPlaceStepPanels.tsx", "utf8"),
    ).toContain('keys.includes("job")');
  });

  it("keeps the full job and company pages on the shared bodies", () => {
    const jobPage = readFileSync(
      "src/app/(app)/campaigns/[id]/job/page.tsx",
      "utf8",
    );
    const companyPage = readFileSync(
      "src/app/(app)/campaigns/[id]/company/page.tsx",
      "utf8",
    );
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    expect(jobPage).toContain('focus="job"');
    expect(companyPage).toContain('focus="company"');
    expect(workspace).toContain("<ApplicationJobBody");
    expect(workspace).toContain("<ApplicationCompanyBody");
    expect(workspace).toContain("<ApplicationAssetsBody");
    expect(workspace).toContain("<ApplicationOutreachBody");
    expect(workspace).toContain("<ApplicationHiringTeamBody");
    expect(workspace).not.toContain("application-applied-wrap");
    expect(
      readFileSync("src/components/ApplicationJobBody.tsx", "utf8"),
    ).toContain('data-testid="job-requirement-view"');
    expect(
      readFileSync("src/components/ApplicationCompanyBody.tsx", "utf8"),
    ).toContain('data-testid="application-company"');
    expect(
      readFileSync("src/components/ApplicationStatusBody.tsx", "utf8"),
    ).toContain("ApplicationAppliedSection");
    for (const [path, focus] of [
      ["src/app/(app)/campaigns/[id]/assets/page.tsx", "assets"],
      ["src/app/(app)/campaigns/[id]/hiring-team/page.tsx", "hiring-team"],
      ["src/app/(app)/campaigns/[id]/outreach/page.tsx", "outreach"],
    ] as const) {
      expect(readFileSync(path, "utf8")).toContain(`focus="${focus}"`);
    }
    expect(readFileSync("src/components/ApplicationAssetsBody.tsx", "utf8")).toContain(
      "ApplicationAssetsSection",
    );
    expect(readFileSync("src/components/ApplicationOutreachBody.tsx", "utf8")).toContain(
      'data-testid="application-contacts-wrap"',
    );
    expect(workspace).toContain('data-testid="hiring-team"');
  });

  it("closes an open step in the query string without scrolling", () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps,
        campaignId: "camp_1",
        openSteps: ["job"],
        panels: { job: createElement("p", null, "Job body") },
      }),
    );
    expect(html.split('data-testid="overview-step-close-job"').length - 1).toBe(2);
    const closed = closeDashboardOpenStep(["applied", "job"], "job");
    expect(closed).toEqual(["applied"]);
    expect(dashboardOpenSearch("?open=applied,job", closed)).toBe("?open=applied");
    expect(closeDashboardOpenStep(closed, "job")).toEqual(["applied"]);
    const cards = readFileSync("src/components/ApplicationStepCards.tsx", "utf8");
    expect(cards).toContain("closeDashboardOpenStep");
    expect(cards).toContain("{ scroll: false }");
  });

  it("opens Application Status in place with no full page link", () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps,
        campaignId: "camp_1",
        openSteps: ["applied"],
        panels: {
          applied: createElement("p", { "data-testid": "shared-applied" }, "Status"),
        },
      }),
    );
    expect(html).toContain('data-testid="shared-applied"');
    expect(html).toContain('data-testid="overview-step-action-applied"');
    expect(html).not.toContain("overview-step-full-page-applied");
    expect(html).not.toContain('href="/campaigns/camp_1?open=applied"');
    const panel = panelStyle(html, "applied");
    expect(panel).toContain(`--step-order:${dashboardStepPanelOrder(0, 1)}`);
    expect(panel).toContain(`--step-order-sm:${dashboardStepPanelOrder(0, 2)}`);
  });

  it("renders personas, resume, and outreach under their rows", () => {
    const expanded = [
      ...steps.slice(0, 3),
      step({ key: "assets", title: "Resume and cover letter", number: 4 }),
      step({ key: "hiring-team", title: "Interviewer Profiles", number: 5 }),
      step({ key: "outreach", title: "Send Outreach", number: 6 }),
      steps[3]!,
    ];
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps: expanded,
        campaignId: "camp_1",
        openSteps: ["assets", "hiring-team", "outreach"],
        panels: {
          assets: createElement("p", { "data-testid": "shared-assets" }, "Resume"),
          "hiring-team": createElement("p", { "data-testid": "shared-hiring-team" }, "Personas"),
          outreach: createElement("p", { "data-testid": "shared-outreach" }, "Outreach"),
        },
      }),
    );
    expect(html).toContain('data-testid="shared-assets"');
    expect(html).toContain('data-testid="shared-hiring-team"');
    expect(html).toContain('data-testid="shared-outreach"');
    expect(panelStyle(html, "assets")).toContain(
      `--step-order:${dashboardStepPanelOrder(3, 1)}`,
    );
    expect(panelStyle(html, "hiring-team")).toContain(
      `--step-order-sm:${dashboardStepPanelOrder(4, 2)}`,
    );
    expect(panelStyle(html, "outreach")).toContain(
      `--step-order:${dashboardStepPanelOrder(5, 1)}`,
    );
    expect(html).toContain('data-testid="overview-step-action-consultation"');
    expect(html).not.toContain("overview-step-panel-consultation");
    const panels = readFileSync("src/components/DashboardInPlaceStepPanels.tsx", "utf8");
    expect(panels).toContain('keys.includes("assets")');
    expect(panels).toContain('keys.includes("hiring-team")');
    expect(panels).toContain("asPage={false}");
    expect(panels).toContain('keys.includes("outreach")');
    expect(panels).not.toContain("enqueueApplicationJob");
  });

  it("opens Interview Notes under its row and closes it in the query string", () => {
    const notesSteps = [
      ...steps,
      step({ key: "interviews", title: "Interview Notes", number: 8 }),
    ];
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps: notesSteps,
        campaignId: "camp_1",
        openSteps: ["interviews"],
        panels: {
          interviews: createElement("p", { "data-testid": "shared-interviews" }, "Notes"),
        },
      }),
    );
    const index = notesSteps.findIndex((item) => item.key === "interviews");
    expect(html).toContain('data-testid="shared-interviews"');
    expect(html).toContain('data-testid="overview-step-full-page-interviews"');
    expect(html).toContain('href="/campaigns/camp_1/interviews"');
    expect(html.split('data-testid="overview-step-close-interviews"').length - 1).toBe(2);
    expect(html).toContain("data-expand-outer-section");
    expect(panelStyle(html, "interviews")).toContain(
      `--step-order:${dashboardStepPanelOrder(index, 1)}`,
    );
    const closed = closeDashboardOpenStep(["interviews", "job"], "interviews");
    expect(closed).toEqual(["job"]);
    expect(dashboardOpenSearch("?open=job,interviews", closed)).toBe("?open=job");
    expect(readFileSync("src/components/DashboardInPlaceStepPanels.tsx", "utf8")).toContain(
      'keys.includes("interviews")',
    );
    expect(readFileSync("src/components/ApplicationInterviewsBody.tsx", "utf8")).toContain(
      "InterviewStagesSection",
    );
    expect(readFileSync("src/components/InterviewStagesSection.tsx", "utf8")).toContain(
      "AddSomeoneYoureMeeting",
    );
  });

  it("names the hiring-team step Interviewer Profiles and leaves Interview Personas", () => {
    expect(readFileSync("src/lib/product-config/vocabulary.ts", "utf8")).toContain(
      'hiringTeamTitle: "Interviewer Profiles"',
    );
    expect(readFileSync("src/lib/product-config/application-summary.ts", "utf8")).toContain(
      'interviewPersonas: "Interview Personas"',
    );
    const interviewsPage = readFileSync(
      "src/app/(app)/campaigns/[id]/interviews/page.tsx",
      "utf8",
    );
    const hiringPage = readFileSync(
      "src/app/(app)/campaigns/[id]/hiring-team/page.tsx",
      "utf8",
    );
    expect(interviewsPage).toContain('focus="interviews"');
    expect(hiringPage).toContain('focus="hiring-team"');
    expect(readFileSync("src/components/ApplicationWorkspace.tsx", "utf8")).toContain(
      "<ApplicationInterviewsBody",
    );
    expect(readFileSync("src/components/ApplicationWorkspace.tsx", "utf8")).not.toContain(
      'focus === "all"',
    );
  });

  it("opens Interview Preparation Guides under its row and closes it in the query string", () => {
    const guideSteps = [
      ...steps,
      step({ key: "summary", title: "Interview Preparation Guides", number: 9 }),
    ];
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps: guideSteps,
        campaignId: "camp_1",
        openSteps: ["summary"],
        panels: {
          summary: createElement("section", { "data-testid": "prep-guide-personas" }, "Guides"),
        },
      }),
    );
    const index = guideSteps.findIndex((item) => item.key === "summary");
    expect(html).toContain('data-testid="prep-guide-personas"');
    expect(html).toContain('data-testid="overview-step-full-page-summary"');
    expect(html).toContain('href="/campaigns/camp_1/summary"');
    expect(html.split('data-testid="overview-step-close-summary"').length - 1).toBe(2);
    expect(html).toContain("data-expand-outer-section");
    expect(html).toContain('data-testid="overview-step-action-consultation"');
    expect(html).not.toContain("overview-step-panel-consultation");
    expect(panelStyle(html, "summary")).toContain(
      `--step-order:${dashboardStepPanelOrder(index, 1)}`,
    );
    const closed = closeDashboardOpenStep(["summary"], "summary");
    expect(closed).toEqual([]);
    expect(dashboardOpenSearch("?open=summary", closed)).toBe("");
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const panels = readFileSync("src/components/DashboardInPlaceStepPanels.tsx", "utf8");
    expect(page).toContain("export async function InterviewPrepGuides");
    expect(page).toContain("<InterviewPrepGuides");
    expect(page).toContain("person={query.person ?? null}");
    expect(panels).toContain("<InterviewPrepGuides");
    expect(panels).toContain("showPageHeader={false}");
    for (const id of [
      '"prep-guide-personas"',
      '"prep-guide-by-title"',
      'testId="prep-guide-general-questions"',
      'testId="prep-guide-consolidated-notes"',
      'testId="prep-guide-position"',
      'testId="prep-guide-company"',
    ]) {
      expect(page).toContain(id);
    }
    expect(page).not.toContain("enqueueApplicationJob");
    expect(page).not.toContain("runPaidStructuredCall");
    expect(page).not.toContain("generateStructured");
    const print = readFileSync("src/components/PrintApplicationSummaryButton.tsx", "utf8");
    expect(print).toContain("window.print()");
    expect(print).toContain("`${pageHref}#${sectionId}`");
    expect(readFileSync("src/components/ApplicationActionForm.tsx", "utf8")).toContain(
      "router.refresh()",
    );
  });

  it("opens Harper Questionnaire under its row and closes it in the query string", () => {
    const harperSteps = [
      step({
        key: "consultation",
        title: "Harper Questionnaire",
        number: 4,
        actionLabel: "Answer Harper's questions",
        actionHref: "/campaigns/camp_1/consultation#harper-q%3Aturn_9",
        state: "in_progress",
        turnCountLabel: "3 questions need your answer",
        isCurrent: true,
      }),
    ];
    const html = renderToStaticMarkup(
      createElement(ApplicationStepCards, {
        steps: harperSteps,
        campaignId: "camp_1",
        openSteps: ["consultation"],
        panels: {
          consultation: createElement("section", { "data-testid": "consultation" }, "Harper"),
        },
      }),
    );
    const index = harperSteps.findIndex((item) => item.key === "consultation");
    expect(html).toContain('data-testid="consultation"');
    expect(html).toContain('data-testid="overview-step-action-consultation"');
    expect(html.replaceAll("&#x27;", "'").replaceAll("&#39;", "'")).toContain(
      "Answer Harper's questions",
    );
    expect(html).toContain("3 questions need your answer");
    expect(html).toContain('data-testid="overview-step-full-page-consultation"');
    expect(html).toContain('href="/campaigns/camp_1/consultation#harper-q%3Aturn_9"');
    expect(html.split('data-testid="overview-step-close-consultation"').length - 1).toBe(2);
    expect(html).toContain("data-expand-outer-section");
    expect(panelStyle(html, "consultation")).toContain(
      `--step-order:${dashboardStepPanelOrder(index, 1)}`,
    );
    const overview = renderToStaticMarkup(
      createElement(ApplicationOverview, {
        view: {
          campaignId: "camp_1",
          campaignName: "Acme",
          jobTitle: "Analyst",
          companyName: "Northwind",
          statusLabel: "Not applied",
          statusTone: "attention",
          appliedAt: null,
          nextStepText: "",
          nextStepFailed: false,
          fitLabel: null,
          location: null,
          workArrangement: null,
          compensation: null,
          steps: harperSteps,
        },
        campaignId: "camp_1",
      }),
    );
    const nextAction =
      overview.match(/<[^>]*data-testid="your-next-step-action"[^>]*>/)?.[0] ?? "";
    expect(overview).toContain('data-testid="your-next-step"');
    expect(nextAction.startsWith("<button")).toBe(true);
    expect(nextAction).not.toContain("href=");
    const closed = closeDashboardOpenStep(["consultation"], "consultation");
    expect(closed).toEqual([]);
    expect(dashboardOpenSearch("?open=consultation", closed)).toBe("");
    expect(dashboardStepHash("consultation", "#harper-q%3Aturn_9")).toBe("");
    expect(dashboardStepHash("consultation", "#consultation")).toBe("");
    expect(dashboardStepHash("job", "#applied")).toBe("#applied");
    const page = readFileSync("src/app/(app)/campaigns/[id]/consultation/page.tsx", "utf8");
    const panels = readFileSync("src/components/DashboardInPlaceStepPanels.tsx", "utf8");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(page).toContain("<ConsultationSection");
    expect(panels).toContain("<ConsultationSection");
    expect(panels).toContain('keys.includes("consultation")');
    expect(panels).toContain("jobs={live.jobs}");
    expect(section).not.toContain("enqueueApplicationJob");
    expect(section).not.toContain("runPaidStructuredCall");
    expect(section).not.toContain("generateStructured");
    expect(section).not.toContain("startConsultation(");
    expect(panels).not.toContain("enqueueApplicationJob");
    expect(readFileSync("src/lib/application/workspace-links.ts", "utf8")).toContain(
      "isApplicationDashboardPath",
    );
    expect(readFileSync("src/components/ConsultationStanding.tsx", "utf8")).toContain(
      "isApplicationDashboardPath(window.location.pathname)",
    );
    expect(readFileSync("src/components/ApplicationActionForm.tsx", "utf8")).toContain(
      "router.refresh()",
    );
    expect(readFileSync("src/app/actions/consultation.ts", "utf8")).toContain(
      "revalidatePath(`/campaigns/${campaignId}`)",
    );
    expect(readFileSync("src/components/ApplicationStepCards.tsx", "utf8")).toContain(
      "{ scroll: false }",
    );
  });

  it("expands an open panel's outer section and leaves inner profiles collapsed", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<details id="outer"><summary>Interviewer Profiles</summary>',
      '<details id="profile"><summary>Profile</summary><p>Hidden</p></details>',
      "</details>",
    ].join("");
    expandOuterDetails(root);
    expect((root.querySelector("#outer") as HTMLDetailsElement).open).toBe(true);
    expect((root.querySelector("#profile") as HTMLDetailsElement).open).toBe(false);
  });
});
