import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationStepCards } from "@/components/ApplicationStepCards";
import {
  dashboardOpenSearch,
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
  step({ key: "applied", title: "Application Status", number: 1, actionHref: "/campaigns/camp_1#applied" }),
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
    expect(html).toContain('href="/campaigns/camp_1/consultation"');
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
  });
});
