// @vitest-environment happy-dom
/**
 * Application Dashboard navigation: title, entry points, side nav, selected
 * style, and Back to dashboard. Renders the pages and components seekers see.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const pathnameRef = vi.hoisted(() => ({ value: "/" }));
const searchRef = vi.hoisted(() => ({ value: "" }));
const enqueueApplicationJob = vi.hoisted(() => vi.fn());
const runPaidStructuredCall = vi.hoisted(() => vi.fn());
const trackerRef = vi.hoisted(() => ({
  value: {
    campaignId: "camp_1",
    campaignName: "Acme Role",
    currentStep: "overview" as const,
    steps: [] as Array<{
      key: string;
      number: number;
      title: string;
      href: string;
      state: "not_started";
      resultKey: null;
      newLabel: null;
      statusNote: null;
      hasNew: false;
      hasActiveJob: false;
      isCurrent: false;
      isPage: boolean;
    }>,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.value,
  useSearchParams: () => new URLSearchParams(searchRef.value),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/app/actions/application-jobs", () => ({
  getApplicationTrackerAction: async () => trackerRef.value,
  markApplicationStepViewedAction: async () => ({ ok: true }),
  readApplicationJobStatusesAction: async () => [],
  getApplicationWorkspaceLiveAction: async () => ({ jobs: [], signature: "idle" }),
  retryApplicationJobAction: vi.fn(),
  getHarperSuggestionsAction: vi.fn(),
}));

vi.mock("@/app/actions/application-outreach", () => ({
  addApplicationContactAction: async () => ({ ok: true, message: "Contact added." }),
  buildOutreachPersonaThenGenerateAction: vi.fn(),
  generateOutreachAssetAction: vi.fn(),
  markApplicationAppliedAction: vi.fn(),
  setApplicationProgressAction: vi.fn(),
  markOutreachSentAction: vi.fn(),
  saveOutreachMessageEditAction: vi.fn(),
  updateApplicationContactRoleAction: vi.fn(),
}));

vi.mock("@/app/actions/cadence", () => ({
  bulkGenerateDueForCampaignAction: vi.fn(),
}));

vi.mock("@/app/actions/email", () => ({
  generateEmailDraftAction: vi.fn(),
  addFollowUpEmailAction: vi.fn(),
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: (...args: unknown[]) => enqueueApplicationJob(...args),
}));

vi.mock("@/lib/ai/paid-call-gate", () => ({
  runPaidStructuredCall: (...args: unknown[]) => runPaidStructuredCall(...args),
}));

vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  getCurrentOrganization: async () => ({
    id: "org_1",
    name: "Northwind",
    timezone: "America/New_York",
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({
    id: "user_1",
    email: "ada@example.test",
    timezone: "America/New_York",
    platformRole: "NONE",
  }),
  requireCurrentUser: async () => ({
    id: "user_1",
    email: "ada@example.test",
    timezone: "America/New_York",
    platformRole: "NONE",
  }),
}));

vi.mock("@/lib/auth/authz", () => ({
  getMembershipForCurrentUser: async () => ({
    membership: { role: "OWNER" },
  }),
}));

const listedCampaign = {
  id: "camp_1",
  name: "Acme",
  visibility: "PRIVATE",
  archivedAt: null,
  owner: { name: "Ada", email: "ada@example.test" },
  ownerUserId: "user_1",
  status: "ACTIVE",
  product: { id: "prod_1", name: "Profile" },
  icp: { id: "icp_1", name: "Employers" },
  _count: { contacts: 2 },
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
};

vi.mock("@/lib/tenant/data", () => ({
  listCampaigns: async () => [listedCampaign],
  listContacts: async () => [],
}));

vi.mock("@/lib/workflow/home", () => ({
  getHomeWorkflow: async () => ({
    setupRail: [],
    setupFocus: "products",
    setupComplete: true,
    applicationReminders: [],
    dueByCampaign: [],
    campaignProducts: [{ id: "prod_1" }],
    campaigns: [
      {
        id: "camp_1",
        name: "Acme",
        archived: false,
        context: "Analyst",
        emailsToWrite: 0,
        companies: 1,
        qualified: 0,
        contacts: 2,
      },
    ],
  }),
}));

import { ApplicationOverview } from "@/components/ApplicationOverview";
import { ApplicationRemindersPanel } from "@/components/ApplicationRemindersPanel";
import { ApplicationWorkspaceChrome } from "@/components/ApplicationWorkspaceChrome";
import { ContactsDirectory } from "@/components/ContactsDirectory";
import { DueContactsPanel } from "@/components/DueContactsPanel";
import { Sidebar } from "@/components/Sidebar";
import { buildSidebarNavItems } from "@/lib/auth/user-menu";
import {
  buildApplicationStepViews,
  emptyApplicationStepFacts,
} from "@/lib/application/step-progress";
import { applicationStepCopy, designTokens } from "@/lib/product-config";
import {
  sidebarNavItemBranchClass,
  sidebarNavItemCurrentClass,
  sidebarNavItemIdleClass,
} from "@/components/sidebar-nav-style";
import HomePage from "@/app/(app)/page";
import CampaignsPage from "@/app/(app)/campaigns/page";

const CAMPAIGN_ID = "camp_1";
const DASHBOARD = `/campaigns/${CAMPAIGN_ID}`;

const STEP_PAGES = [
  ["job", "Job requirements", `${DASHBOARD}/job`],
  ["company", "Company Research", `${DASHBOARD}/company`],
  ["consultation", "Harper Questionnaire", `${DASHBOARD}/consultation`],
  ["assets", "Resume and cover letter", `${DASHBOARD}/assets`],
  ["hiring-team", "Interviewer Profiles", `${DASHBOARD}/hiring-team`],
  ["outreach", "Send Outreach", `${DASHBOARD}/outreach`],
  ["interviews", "Interview Notes", `${DASHBOARD}/interviews`],
  ["summary", "Interview Preparation Guides", `${DASHBOARD}/summary`],
] as const;

function markup(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function overview() {
  const steps = buildApplicationStepViews({
    campaignId: CAMPAIGN_ID,
    currentStep: "overview",
    facts: emptyApplicationStepFacts(),
    jobs: [],
    seen: {},
  });
  return createElement(ApplicationOverview, {
    view: {
      campaignId: CAMPAIGN_ID,
      campaignName: "Acme",
      jobTitle: "Analyst",
      companyName: "Northwind",
      statusLabel: "Not applied",
      statusTone: "attention",
      appliedAt: null,
      nextStepText: "Add the company website.",
      nextStepFailed: false,
      fitLabel: null,
      location: "Chicago",
      workArrangement: "Hybrid",
      compensation: "$120,000",
      steps,
    },
  });
}

function sidebar(pathname: string, search = "") {
  pathnameRef.value = pathname;
  searchRef.value = search;
  return markup(
    createElement(Sidebar, {
      items: buildSidebarNavItems({
        hasOrganization: true,
        isPlatformOperator: false,
      }),
    }),
  );
}

function anchors(html: string): string[] {
  return html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
}

function openingTag(anchor: string): string {
  return anchor.slice(0, anchor.indexOf(">") + 1);
}

function mainNavAnchors(html: string): string[] {
  const nav = html.slice(html.indexOf('data-testid="app-sidebar"'));
  return anchors(nav);
}

function applicationSection(html: string): string {
  const start = html.indexOf('data-testid="application-sidebar-section"');
  expect(start).toBeGreaterThan(-1);
  const rest = html.slice(start);
  const next = rest.indexOf('data-testid="app-sidebar"');
  return next === -1 ? rest : rest.slice(0, next);
}

function expectIdle(tag: string) {
  expect(tag).toContain(sidebarNavItemIdleClass);
  expect(tag).toContain("bg-surface");
  expect(tag).toContain("text-ink");
  expect(tag).not.toContain("bg-primary/10");
  expect(tag).not.toContain("text-primary");
  expect(tag).not.toContain("border-l-primary");
  expect(tag).not.toContain('aria-current="page"');
}

function expectCurrent(tag: string) {
  expect(tag).toContain(sidebarNavItemCurrentClass);
  expect(tag).toContain("bg-primary-tint");
  expect(tag).toContain("text-ink");
  expect(tag).toContain('aria-current="page"');
  expect(tag).not.toContain("bg-primary/10");
  expect(tag).not.toContain("text-primary");
  expect(tag).not.toContain("border-l-primary");
  expect(tag).not.toContain("bg-surface");
}

function chrome(pathname: string) {
  pathnameRef.value = pathname;
  searchRef.value = "";
  return markup(
    createElement(
      ApplicationWorkspaceChrome,
      {
        campaignId: CAMPAIGN_ID,
        initialSignature: "idle",
        initialJobs: [],
      },
      createElement("p", null, "page body"),
    ),
  );
}

function backLink(html: string): string | null {
  const match = html.match(/<a\b[^>]*data-testid="back-to-dashboard"[^>]*>[\s\S]*?<\/a>/);
  return match?.[0] ?? null;
}

describe("application dashboard navigation", () => {
  it("renders the dashboard title exactly and keeps the overview content", () => {
    const html = markup(overview());
    const title = html.match(
      /<h1\b[^>]*data-testid="application-dashboard-title"[^>]*>([\s\S]*?)<\/h1>/,
    );
    expect(title?.[1]).toBe("Application Dashboard");
    expect(applicationStepCopy.dashboardTitle).toBe("Application Dashboard");
    expect(html).toContain("Northwind");
    expect(html).toContain("Analyst");
    expect(html).toContain("Not applied");
    expect(html).toContain("Add the company website.");
    expect(html).toContain("Chicago");
    expect(html).toContain("Hybrid");
    expect(html).toContain("$120,000");
    expect(html).toContain("Application steps");
    expect(html).toContain("1. Application Status");
    expect(html).toContain(`href="${DASHBOARD}?open=applied"`);
    for (const [key, titleText, href] of STEP_PAGES) {
      expect(html).toContain(`data-testid="overview-step-${key}"`);
      expect(html).toContain(titleText);
      const actionHref =
        key === "assets"
          ? `${href}#resume-document`
          : key === "summary"
            ? `${DASHBOARD}/interviews`
            : href;
      expect(html).toContain(`href="${actionHref}"`);
    }
    expect(html).not.toContain("Back to dashboard");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("renders every application entry point on the dashboard", async () => {
    const home = markup(
      await HomePage({ searchParams: Promise.resolve({}) }),
    );
    const homeCard = home.match(/<a\b[^>]*href="\/campaigns\/camp_1"[^>]*>/);
    expect(homeCard?.[0]).toContain('href="/campaigns/camp_1"');
    expect(home).not.toContain('href="/campaigns/camp_1/');

    const list = markup(
      await CampaignsPage({ searchParams: Promise.resolve({}) }),
    );
    const listLinks = anchors(list).filter((anchor) =>
      openingTag(anchor).includes('href="/campaigns/camp_1"'),
    );
    expect(listLinks.length).toBeGreaterThanOrEqual(2);
    expect(list).toContain(">Acme<");
    expect(list).toContain(">Edit<");
    expect(list).not.toContain('href="/campaigns/camp_1/');

    const reminders = markup(
      createElement(ApplicationRemindersPanel, {
        reminders: [
          {
            campaignId: CAMPAIGN_ID,
            campaignName: "Acme",
            kind: "OUTREACH",
            appliedAt: new Date("2026-03-01T00:00:00.000Z"),
            anchorAt: new Date("2026-03-01T00:00:00.000Z"),
            day: 3,
            dueAt: new Date("2026-03-04T00:00:00.000Z"),
            urgency: "today",
          },
        ],
        timezone: "America/New_York",
        now: new Date("2026-03-04T15:00:00.000Z"),
      }),
    );
    const reminderLinks = anchors(reminders).filter((anchor) =>
      openingTag(anchor).includes("href="),
    );
    expect(reminderLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of reminderLinks) {
      expect(openingTag(link)).toContain(`href="${DASHBOARD}"`);
    }

    const directory = markup(
      createElement(ContactsDirectory, {
        contacts: [
          {
            id: "contact_1",
            firstName: "Ada",
            lastName: "Lovelace",
            title: "Director",
            company: "Analytical Engines",
            email: "ada@example.test",
            archivedAt: null,
            ownerUserId: "user_1",
            applications: [
              {
                campaignId: CAMPAIGN_ID,
                campaignName: "Acme",
                roleName: "Hiring Manager",
              },
            ],
          },
        ],
        campaigns: [{ id: CAMPAIGN_ID, name: "Acme" }],
        roles: [{ id: "role_1", name: "Hiring Manager", campaignId: CAMPAIGN_ID }],
        campaignId: CAMPAIGN_ID,
        search: "Ada",
        includeArchived: false,
        currentUserId: "user_1",
        canEdit: true,
      }),
    );
    expect(directory).toContain(`href="${DASHBOARD}"`);
    expect(directory).toContain(">Acme<");

    const due = markup(
      createElement(DueContactsPanel, {
        dueByCampaign: [
          {
            campaignId: CAMPAIGN_ID,
            campaignName: "Acme",
            overdue: 0,
            today: 1,
            thisWeek: 0,
            dueContacts: [
              {
                campaignContactId: "cc_1",
                campaignId: CAMPAIGN_ID,
                campaignName: "Acme",
                contactId: "contact_1",
                contactName: "Ada Lovelace",
                contactEmail: "ada@example.test",
                company: "Northwind",
                nextDueAt: new Date("2026-03-04T00:00:00.000Z"),
                urgency: "today",
                sentCount: 0,
                nextSequenceNumber: 1,
                hasDraft: false,
              },
            ],
          },
        ],
      }),
    );
    expect(due).toContain(`href="${DASHBOARD}"`);
    expect(due).toContain(">Acme<");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("shows Application Dashboard and a smaller branch for the current page", () => {
    const html = sidebar(`${DASHBOARD}/job`);
    const section = applicationSection(html);
    const links = anchors(section);
    expect(links).toHaveLength(2);
    expect(links[0]).toContain("Application Dashboard");
    expect(openingTag(links[0] ?? "")).toContain(`href="${DASHBOARD}"`);
    expectIdle(openingTag(links[0] ?? ""));
    expect(section).toContain('data-testid="sidebar-application-page-branch"');
    expect(links[1]).toContain("Job requirements");
    expect(openingTag(links[1] ?? "")).toContain(`href="${DASHBOARD}/job"`);
    expect(openingTag(links[1] ?? "")).toContain(sidebarNavItemBranchClass);
    expect(openingTag(links[1] ?? "")).toContain("text-xs");
    expectCurrent(openingTag(links[1] ?? ""));
    expect(section).not.toContain("tracker-step-");
    expect(section).not.toContain("tracker-application-contacts");
    expect(section).not.toContain("tracker-new-");
    expect(section).not.toContain("Interview cheat sheet");
    expect(section).not.toContain(">Contacts<");
    expect(section).not.toContain("<svg");
    expect(section).not.toContain("border-l-primary");
    expect(section).not.toContain("text-primary");

    const onDashboard = applicationSection(sidebar(DASHBOARD));
    expect(anchors(onDashboard)).toHaveLength(1);
    expect(onDashboard).not.toContain("sidebar-application-page-branch");
  });

  it("omits the application section when no application is selected", () => {
    for (const pathname of ["/", "/campaigns", "/campaigns/new", "/contacts", "/products"]) {
      const html = sidebar(pathname);
      expect(html, pathname).not.toContain("application-sidebar-section");
      expect(html, pathname).not.toContain("sidebar-application-dashboard");
    }
    const filtered = sidebar("/contacts", "campaignId=camp_1");
    const section = applicationSection(filtered);
    expect(section).toContain("Application Dashboard");
    const branch = anchors(section)[1] ?? "";
    expect(branch).toContain(">Contacts<");
    expect(openingTag(branch)).toContain("text-xs");
    expect(openingTag(branch)).toContain('href="/contacts?campaignId=camp_1"');
    expectCurrent(openingTag(branch));
  });

  it("uses white text-on-ink for idle items and light blue primary tint with aria-current for the current page", () => {
    expect(designTokens.color.surface).toBe("#FFFFFF");
    expect(designTokens.color.ink).toBe("#0B1220");
    expect(designTokens.color.primary).toBe("#1D4ED8");
    expect(designTokens.color.primaryTint).toBe("#E7F3FF");
    expect(sidebarNavItemIdleClass).toContain("active:bg-primary-tint");

    const items = buildSidebarNavItems({
      hasOrganization: true,
      isPlatformOperator: false,
    });
    expect(items.map((item) => item.label)).toEqual([
      "Home",
      "Applications",
      "Contacts",
      "Personal Profile",
      "Your voice",
      "Settings",
      "Account",
    ]);

    for (const item of items) {
      const html = sidebar(item.href);
      const tags = mainNavAnchors(html).map(openingTag);
      const current = tags.filter((tag) => tag.includes('aria-current="page"'));
      expect(current, item.label).toHaveLength(1);
      expect(current[0]).toContain(`data-testid="sidebar-${item.href}"`);
      expectCurrent(current[0] ?? "");
      for (const tag of tags) {
        if (tag === current[0]) continue;
        expectIdle(tag);
      }
    }

    const onDashboard = sidebar(DASHBOARD);
    const dashboardLink = openingTag(
      anchors(applicationSection(onDashboard))[0] ?? "",
    );
    expectCurrent(dashboardLink);
    expect(dashboardLink).toContain("sidebar-application-dashboard");
    for (const tag of mainNavAnchors(onDashboard).map(openingTag)) {
      expectIdle(tag);
    }

    const onJob = sidebar(`${DASHBOARD}/job`);
    const jobLinks = anchors(applicationSection(onJob));
    expectIdle(openingTag(jobLinks[0] ?? ""));
    expect(jobLinks[1]).toContain("Job requirements");
    expectCurrent(openingTag(jobLinks[1] ?? ""));
    for (const tag of mainNavAnchors(onJob).map(openingTag)) {
      expectIdle(tag);
    }

    const onAccount = sidebar("/settings/account");
    const accountTags = mainNavAnchors(onAccount).map(openingTag);
    const accountCurrent = accountTags.filter((tag) =>
      tag.includes('aria-current="page"'),
    );
    expect(accountCurrent).toHaveLength(1);
    expect(accountCurrent[0]).toContain('data-testid="sidebar-/settings/account"');
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("shows Back to dashboard on every application page except the dashboard", () => {
    const dashboard = chrome(DASHBOARD);
    expect(backLink(dashboard)).toBeNull();
    expect(dashboard).not.toContain("Back to dashboard");
    expect(dashboard).not.toContain("Back to application");

    for (const [, , href] of STEP_PAGES) {
      const html = chrome(href);
      const link = backLink(html);
      expect(link, href).not.toBeNull();
      expect(link).toContain(`href="${DASHBOARD}"`);
      expect(link).toContain("Back to dashboard");
      expect(html).not.toContain("Back to application");
    }

    const filtered = markup(
      createElement(ContactsDirectory, {
        contacts: [],
        campaigns: [{ id: CAMPAIGN_ID, name: "Acme" }],
        roles: [],
        campaignId: CAMPAIGN_ID,
        includeArchived: false,
        currentUserId: "user_1",
        canEdit: false,
      }),
    );
    const contactsBack = filtered.match(
      /<a\b[^>]*data-testid="contacts-page-back-to-application"[^>]*>[\s\S]*?<\/a>/,
    )?.[0];
    expect(contactsBack).toBeTruthy();
    expect(contactsBack).toContain(`href="${DASHBOARD}"`);
    expect(contactsBack).toContain("Back to dashboard");
    expect(filtered).not.toContain("Back to application");

    const allContacts = markup(
      createElement(ContactsDirectory, {
        contacts: [],
        campaigns: [{ id: CAMPAIGN_ID, name: "Acme" }],
        roles: [],
        includeArchived: false,
        currentUserId: "user_1",
        canEdit: false,
      }),
    );
    expect(allContacts).not.toContain("back-to-dashboard");
    expect(allContacts).not.toContain("Back to dashboard");
    expect(allContacts).not.toContain("Back to application");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });
});
