import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const pathnameRef = vi.hoisted(() => ({ value: "/campaigns/camp_1/consultation" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
}));

import { ApplicationTrackerList } from "@/components/ApplicationSidebarTracker";
import {
  buildApplicationStepViews,
  emptyApplicationStepFacts,
} from "@/lib/application/step-progress";
import { applicationStepFromPathname } from "@/lib/product-config/application-steps";

const CURRENT_ROW =
  "border-l-2 border-l-primary bg-primary/10 text-primary";

function trackerHtml(pathname: string): string {
  pathnameRef.value = pathname;
  const currentStep = applicationStepFromPathname(pathname);
  const tracker = {
    campaignId: "camp_1",
    campaignName: "Acme",
    currentStep,
    steps: buildApplicationStepViews({
      campaignId: "camp_1",
      currentStep,
      facts: emptyApplicationStepFacts(),
      jobs: [],
      seen: {},
    }),
  };
  return renderToStaticMarkup(
    createElement(ApplicationTrackerList, { tracker, variant: "sidebar" }),
  );
}

function rowTag(html: string, testId: string): string {
  const match = html.match(
    new RegExp(`<a\\b[^>]*data-testid="${testId}"[^>]*>`),
  );
  expect(match, testId).not.toBeNull();
  return match?.[0] ?? "";
}

function expectCurrent(html: string, key: string) {
  const current = rowTag(html, `tracker-step-${key}`);
  expect(current).toContain('aria-current="page"');
  expect(current).toContain(CURRENT_ROW);
  const others = html.match(/<a\b[^>]*>/g) ?? [];
  const currentRows = others.filter(
    (tag) => tag.includes('aria-current="page"') || tag.includes("bg-primary/10"),
  );
  expect(currentRows).toHaveLength(1);
  expect(currentRows[0]).toContain(`data-testid="tracker-step-${key}"`);
}

describe("application sidebar current step", () => {
  it("marks only Harper on the Harper route", () => {
    const html = trackerHtml("/campaigns/camp_1/consultation");
    expectCurrent(html, "consultation");
    const job = rowTag(html, "tracker-step-job");
    expect(job).not.toContain('aria-current="page"');
    expect(job).toContain("bg-surface text-ink");
    expect(job).not.toContain("bg-primary/10");
    expect(job).not.toContain("border-l-primary");
    expect(job).not.toContain("text-primary");
    expect(html).toContain("bg-primary text-on-primary");
  });

  it("marks only the Interview Cheat Sheet on its route", () => {
    const html = trackerHtml("/campaigns/camp_1/summary");
    expectCurrent(html, "summary");
    expect(rowTag(html, "tracker-step-consultation")).toContain("bg-surface text-ink");
    expect(rowTag(html, "tracker-step-consultation")).not.toContain("text-primary");
  });

  it("marks only the job step on the job route", () => {
    const html = trackerHtml("/campaigns/camp_1/job");
    expectCurrent(html, "job");
    expect(rowTag(html, "tracker-step-summary")).toContain("bg-surface text-ink");
    expect(rowTag(html, "tracker-step-consultation")).not.toContain('aria-current="page"');
  });

  it("does not make a paid call or enqueue a job while rendering", () => {
    const source = readFileSync(
      "src/components/ApplicationSidebarTracker.tsx",
      "utf8",
    );
    expect(source).not.toContain("enqueueApplicationJob");
    expect(source).not.toContain("runPaidStructuredCall");
    const html = trackerHtml("/campaigns/camp_1/consultation");
    expect(html).toContain("application-step-tracker");
    expect(html).not.toContain("enqueueApplicationJob");
    expect(html).not.toContain("runPaidStructuredCall");
  });

  it("highlights only Contacts on the Contacts page", () => {
    const html = trackerHtml("/campaigns/camp_1/contacts");
    const contacts = rowTag(html, "tracker-application-contacts");
    expect(contacts).toContain('aria-current="page"');
    expect(contacts).toContain(CURRENT_ROW);
    const steps = html.match(/data-testid="tracker-step-/g) ?? [];
    expect(steps.length).toBeGreaterThan(0);
    for (const tag of html.match(/<a\b[^>]*>/g) ?? []) {
      if (tag.includes("tracker-application-contacts")) continue;
      expect(tag).not.toContain('aria-current="page"');
      expect(tag).not.toContain("bg-primary/10");
      expect(tag).not.toContain("border-l-primary");
    }
  });

  it("does not highlight Contacts on a numbered step page", () => {
    const html = trackerHtml("/campaigns/camp_1/job");
    const contacts = rowTag(html, "tracker-application-contacts");
    expect(contacts).not.toContain('aria-current="page"');
    expect(contacts).not.toContain("bg-primary/10");
    expect(contacts).not.toContain("border-l-primary");
    expect(contacts).not.toContain("text-primary");
    expectCurrent(html, "job");
  });
});
