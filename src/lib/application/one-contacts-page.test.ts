// @vitest-environment happy-dom
/**
 * One Contacts page: redirect, columns, Add Contact, and the sidebar highlight.
 */
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";

const pathnameRef = vi.hoisted(() => ({ value: "/contacts" }));
const searchRef = vi.hoisted(() => ({ value: "" }));
const routerPush = vi.hoisted(() => vi.fn());
const addApplicationContactAction = vi.hoisted(() =>
  vi.fn<
    (
      prev: { ok: boolean; message: string } | null,
      formData: FormData,
    ) => Promise<{ ok: boolean; message: string }>
  >(async () => ({ ok: true, message: "Contact added." })),
);
const enqueueApplicationJob = vi.hoisted(() => vi.fn());
const runPaidStructuredCall = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  usePathname: () => pathnameRef.value,
  useSearchParams: () => new URLSearchParams(searchRef.value),
  useRouter: () => ({ push: routerPush, refresh: () => undefined }),
}));

vi.mock("@/lib/application/workspace-access", () => ({
  requireApplicationWorkspace: async (id: string) => ({
    kind: "ok" as const,
    organizationId: "org_1",
    campaignId: id,
    campaignName: "Acme",
    canEdit: true,
  }),
}));

vi.mock("@/app/actions/application-outreach", () => ({
  addApplicationContactAction: (
    prev: { ok: boolean; message: string } | null,
    formData: FormData,
  ) => addApplicationContactAction(prev, formData),
  buildOutreachPersonaThenGenerateAction: vi.fn(),
  generateOutreachAssetAction: vi.fn(),
  markApplicationAppliedAction: vi.fn(),
  setApplicationProgressAction: vi.fn(),
  markOutreachSentAction: vi.fn(),
  updateApplicationContactRoleAction: vi.fn(),
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: (...args: unknown[]) => enqueueApplicationJob(...args),
}));

vi.mock("@/lib/ai/paid-call-gate", () => ({
  runPaidStructuredCall: (...args: unknown[]) => runPaidStructuredCall(...args),
}));

import ApplicationContactsPage from "@/app/(app)/campaigns/[id]/contacts/page";
import { ApplicationTrackerList } from "@/components/ApplicationSidebarTracker";
import { ContactsDirectory } from "@/components/ContactsDirectory";
import { applicationSidebarCampaignId } from "@/components/Sidebar";
import {
  buildApplicationStepViews,
  emptyApplicationStepFacts,
} from "@/lib/application/step-progress";
import { applicationStepFromPathname } from "@/lib/product-config/application-steps";
import { outreachConfig } from "@/lib/product-config";

const COLUMNS = [
  "Name",
  "Title",
  "Company",
  "Hiring Team role",
  "Email",
  "Application",
  "Edit",
];

function mount(node: ReactNode): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

function typeInto(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function trackerHtml(pathname: string, search = ""): string {
  pathnameRef.value = pathname;
  searchRef.value = search;
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
  const view = mount(
    createElement(ApplicationTrackerList, { tracker, variant: "sidebar" }),
  );
  const html = view.host.innerHTML;
  act(() => {
    view.root.unmount();
  });
  view.host.remove();
  return html;
}

function directory(overrides: Partial<Parameters<typeof ContactsDirectory>[0]> = {}) {
  return createElement(ContactsDirectory, {
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
            campaignId: "camp_1",
            campaignName: "Acme",
            roleName: "Hiring Manager",
          },
          {
            campaignId: "camp_2",
            campaignName: "Beta",
            roleName: "Recruiter",
          },
        ],
      },
    ],
    campaigns: [
      { id: "camp_1", name: "Acme" },
      { id: "camp_2", name: "Beta" },
    ],
    roles: [
      { id: "role_1", name: "Hiring Manager", campaignId: "camp_1" },
      { id: "role_2", name: "Recruiter", campaignId: "camp_2" },
    ],
    includeArchived: false,
    currentUserId: "user_1",
    canEdit: true,
    ...overrides,
  });
}

describe("one Contacts page", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    addApplicationContactAction.mockClear();
    enqueueApplicationJob.mockClear();
    runPaidStructuredCall.mockClear();
    routerPush.mockClear();
    pathnameRef.value = "/contacts";
    searchRef.value = "";
  });

  it("redirects an application's contacts route to the filtered main page", async () => {
    await expect(
      ApplicationContactsPage({ params: Promise.resolve({ id: "camp_1" }) }),
    ).rejects.toThrow("REDIRECT /contacts?campaignId=camp_1");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("points the application sidebar Contacts link at the filtered page", () => {
    const html = trackerHtml("/campaigns/camp_1/job");
    expect(html).toContain('href="/contacts?campaignId=camp_1"');
    expect(html).toContain('data-testid="tracker-application-contacts"');
    expect(applicationSidebarCampaignId("/contacts", "camp_1")).toBe("camp_1");
    expect(applicationSidebarCampaignId("/contacts", null)).toBeNull();
    expect(applicationSidebarCampaignId("/campaigns/camp_1/job", null)).toBe(
      "camp_1",
    );
  });

  it("shows Add Contact and Back to application only when filtered from an application", () => {
    const filtered = mount(directory({ campaignId: "camp_1", search: "Ada" }));
    root = filtered.root;
    expect(filtered.host.textContent).toContain("Add Contact");
    const back = filtered.host.querySelector(
      "[data-testid='contacts-page-back-to-application']",
    ) as HTMLAnchorElement;
    expect(back).toBeTruthy();
    expect(back.textContent).toBe("Back to application");
    expect(back.getAttribute("href")).toBe("/campaigns/camp_1");
    expect(filtered.host.textContent).not.toContain("Back to applications");

    act(() => {
      root?.unmount();
    });
    const open = mount(directory());
    root = open.root;
    expect(open.host.textContent).toContain("Add Contact");
    expect(
      open.host.querySelector("[data-testid='contacts-page-back-to-application']"),
    ).toBeNull();
    expect(open.host.textContent).not.toContain("Back to application");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("renders the columns and a role on each application, and keeps the filters", () => {
    const view = mount(
      directory({ campaignId: "camp_1", search: "Ada", includeArchived: false }),
    );
    root = view.root;
    const headers = [...view.host.querySelectorAll("thead th")].map(
      (cell) => cell.textContent,
    );
    expect(headers).toEqual(COLUMNS);
    const text = view.host.textContent ?? "";
    expect(text).not.toContain("Owner");
    expect(text).not.toContain("Suppression");
    expect(text).not.toContain("Opt out");
    expect(text).not.toContain("Not scored");
    expect(text).not.toContain("0 sent");
    const row = view.host.querySelector("[data-testid='contact-row-contact_1']");
    expect(row?.textContent).toContain("Hiring Manager");
    expect(row?.textContent).toContain("Acme");
    expect(row?.textContent).toContain("Recruiter");
    expect(row?.textContent).toContain("Beta");
    const application = view.host.querySelector(
      "[data-testid='contacts-filters'] select[name='campaignId']",
    ) as HTMLSelectElement;
    const search = view.host.querySelector(
      "[data-testid='contacts-filters'] input[name='q']",
    ) as HTMLInputElement;
    expect(application.value).toBe("camp_1");
    expect(search.value).toBe("Ada");
    expect(view.host.textContent).toContain("All applications");
    const archived = view.host.querySelector(
      "[data-testid='show-archived-toggle']",
    ) as HTMLAnchorElement;
    expect(archived.textContent).toBe("Show archived contacts");
    expect(archived.getAttribute("href")).toBe(
      "/contacts?campaignId=camp_1&q=Ada&archived=1",
    );
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("keeps Search and Show archived contacts working with the application filter", () => {
    const view = mount(
      directory({ campaignId: "camp_2", search: "Beta", includeArchived: true }),
    );
    root = view.root;
    const archived = view.host.querySelector(
      "[data-testid='show-archived-toggle']",
    ) as HTMLAnchorElement;
    expect(archived.textContent).toBe("Hide archived contacts");
    expect(archived.getAttribute("href")).toBe("/contacts?campaignId=camp_2&q=Beta");
    expect(
      view.host.querySelector("[data-testid='contacts-filters'] input[name='archived']"),
    ).toBeTruthy();
    const search = view.host.querySelector(
      "[data-testid='contacts-filters'] input[name='q']",
    ) as HTMLInputElement;
    expect(search.value).toBe("Beta");
    expect(
      (view.host.querySelector(
        "[data-testid='contacts-filters'] select[name='campaignId']",
      ) as HTMLSelectElement).value,
    ).toBe("camp_2");
  });

  it("adds a contact for the filtered application with that application's roles", async () => {
    const view = mount(directory({ campaignId: "camp_1" }));
    root = view.root;
    act(() => {
      (
        view.host.querySelector(
          "[data-testid='contacts-page-add-contact']",
        ) as HTMLButtonElement
      ).click();
    });
    const form = view.host.querySelector(
      "[data-testid='add-application-contact']",
    ) as HTMLFormElement;
    expect(form.querySelector("[data-testid='add-contact-application']")).toBeNull();
    expect(
      (form.querySelector("[name='campaignId']") as HTMLInputElement).value,
    ).toBe("camp_1");
    const roles = [...form.querySelectorAll("[name='personaId'] option")].map(
      (option) => option.textContent,
    );
    expect(roles).toContain("Hiring Manager");
    expect(roles).not.toContain("Recruiter");
    act(() => {
      typeInto(form.querySelector("[name='firstName']") as HTMLInputElement, "Ada");
      typeInto(form.querySelector("[name='lastName']") as HTMLInputElement, "Lovelace");
      typeInto(form.querySelector("[name='title']") as HTMLInputElement, "Director");
      typeInto(form.querySelector("[name='personaId']") as HTMLSelectElement, "role_1");
    });
    await act(async () => {
      form.requestSubmit();
    });
    expect(addApplicationContactAction).toHaveBeenCalledTimes(1);
    const formData = addApplicationContactAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("campaignId")).toBe("camp_1");
    expect(formData.get("personaId")).toBe("role_1");
    expect(view.host.textContent).toContain("Contact added.");
    expect(
      (
        view.host.querySelector(
          "[data-testid='contacts-page-back-to-application']",
        ) as HTMLAnchorElement
      ).getAttribute("href"),
    ).toBe("/campaigns/camp_1");
    expect(routerPush).not.toHaveBeenCalled();
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("requires an application from the main navigation, then offers that application's roles", async () => {
    const view = mount(directory());
    root = view.root;
    act(() => {
      (
        view.host.querySelector(
          "[data-testid='contacts-page-add-contact']",
        ) as HTMLButtonElement
      ).click();
    });
    const form = view.host.querySelector(
      "[data-testid='add-application-contact']",
    ) as HTMLFormElement;
    const application = form.querySelector(
      "[data-testid='add-contact-application']",
    ) as HTMLSelectElement;
    expect(application.required).toBe(true);
    expect(application.value).toBe("");
    expect(form.checkValidity()).toBe(false);
    const persona = form.querySelector("[name='personaId']") as HTMLSelectElement;
    expect(persona.disabled).toBe(true);
    expect(persona.textContent).not.toContain("Hiring Manager");
    act(() => {
      typeInto(application, "camp_2");
    });
    const roles = form.querySelector("[name='personaId']") as HTMLSelectElement;
    expect(roles.disabled).toBe(false);
    expect(roles.textContent).toContain("Recruiter");
    expect(roles.textContent).not.toContain("Hiring Manager");
    act(() => {
      typeInto(form.querySelector("[name='firstName']") as HTMLInputElement, "Grace");
      typeInto(form.querySelector("[name='lastName']") as HTMLInputElement, "Hopper");
      typeInto(form.querySelector("[name='title']") as HTMLInputElement, "Admiral");
      typeInto(roles, "role_2");
    });
    await act(async () => {
      form.requestSubmit();
    });
    const formData = addApplicationContactAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("campaignId")).toBe("camp_2");
    expect(formData.get("personaId")).toBe("role_2");
    expect(formData.get("firstName")).toBe("Grace");
    expect(
      view.host.querySelector("[data-testid='contacts-page-back-to-application']"),
    ).toBeNull();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("saves through the Send Outreach action and service, with the same follow-on work and no other paid call", () => {
    const action = readFileSync("src/app/actions/application-outreach.ts", "utf8");
    const start = action.indexOf("function revalidate(");
    const end = action.indexOf("export async function updateApplicationContactRoleAction");
    const body = action.slice(start, end);
    expect(body).toContain("addApplicationContact(");
    expect(body).toContain("saveLinkedInPaste");
    expect(body).toContain("revalidate(id)");
    expect(body).toContain('revalidatePath("/contacts")');
    expect(body).toContain("`/campaigns/${campaign}/contacts`");
    expect(body).not.toContain("redirect(");
    expect(body).not.toContain("offerPersonPrep");
    expect(body).not.toContain("runPaidStructuredCall");
    expect(body).not.toContain("enqueueApplicationJob");
    const page = readFileSync("src/app/(app)/contacts/page.tsx", "utf8");
    const directorySource = readFileSync("src/components/ContactsDirectory.tsx", "utf8");
    expect(page).toContain("query.application");
    expect(page).not.toContain("runPaidStructuredCall");
    expect(page).not.toContain("enqueueApplicationJob");
    expect(directorySource).not.toContain("runPaidStructuredCall");
    expect(directorySource).not.toContain("enqueueApplicationJob");
    expect(outreachConfig.labels.addContact).toBe("Add Contact");
  });

  it("puts the sidebar Contacts link on the step card and highlights it only for this application", () => {
    const current = trackerHtml("/contacts", "campaignId=camp_1");
    const link = current.match(
      /<a\b[^>]*data-testid="tracker-application-contacts"[^>]*>/,
    )?.[0] ?? "";
    const surface =
      current.match(
        /<li\b[^>]*data-testid="tracker-application-contacts-surface"[^>]*>/,
      )?.[0] ?? "";
    expect(surface).toContain("bg-surface");
    expect(link).toContain('aria-current="page"');
    expect(link).toContain("border-l-2 border-l-primary bg-primary/10 text-primary");
    expect(current).toContain('href="/contacts?campaignId=camp_1"');

    for (const [pathname, search] of [
      ["/contacts", ""],
      ["/contacts", "campaignId=camp_2"],
      ["/contacts", "application=camp_2"],
      ["/contacts/contact_1/edit", "campaignId=camp_1"],
      ["/campaigns/camp_1/job", ""],
    ] as const) {
      const html = trackerHtml(pathname, search);
      const row =
        html.match(/<a\b[^>]*data-testid="tracker-application-contacts"[^>]*>/)?.[0] ??
        "";
      expect(row, `${pathname}?${search}`).not.toContain('aria-current="page"');
      expect(row).not.toContain("text-primary");
      const card =
        html.match(
          /<li\b[^>]*data-testid="tracker-application-contacts-surface"[^>]*>/,
        )?.[0] ?? "";
      expect(card).toContain("bg-surface");
    }

    const alias = trackerHtml("/contacts", "application=camp_1");
    expect(alias).toContain('aria-current="page"');
    const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
    const nav = sidebar.slice(sidebar.indexOf('data-testid="app-sidebar"'));
    expect(nav).toContain("bg-surface text-ink");
    expect(nav).not.toContain("tracker-application-contacts");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasTestDatabase())(
  "one Contacts page saves through the outreach service",
  { timeout: 60_000 },
  () => {
    const suffix = `one_contacts_${Date.now().toString(36)}`;
    let prisma: import("@prisma/client").PrismaClient;
    let organizationId = "";
    let userId = "";
    let firstCampaignId = "";
    let secondCampaignId = "";
    let hiringManagerId = "";
    let recruiterId = "";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      const organization = await prisma.organization.create({
        data: { name: `[TEST] One contacts ${suffix}`, slug: `one-contacts-${suffix}` },
      });
      organizationId = organization.id;
      const user = await prisma.user.create({
        data: {
          email: `one-contacts-${suffix}@example.test`,
          emailNormalized: `one-contacts-${suffix}@example.test`,
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: { organizationId, name: `Candidate ${suffix}` },
      });
      const first = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          productId: product.id,
          name: `Acme ${suffix}`,
        },
      });
      const second = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          productId: product.id,
          name: `Beta ${suffix}`,
        },
      });
      firstCampaignId = first.id;
      secondCampaignId = second.id;
      const hiringManager = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          campaignId: firstCampaignId,
          name: "Hiring Manager",
          suggestionKey: "hiring_manager",
          targetTitles: ["Director"],
        },
      });
      const recruiter = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          campaignId: secondCampaignId,
          name: "Recruiter",
          suggestionKey: "recruiter",
          targetTitles: ["Recruiter"],
        },
      });
      hiringManagerId = hiringManager.id;
      recruiterId = recruiter.id;
    });

    afterAll(async () => {
      if (!prisma || !organizationId) return;
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await prisma.$disconnect();
    });

    it("stores one contact on two applications, each with its Hiring Team role, and no paid call", async () => {
      const { addApplicationContact, listApplicationContacts } = await import(
        "@/lib/application/contacts"
      );
      const email = `ada-${suffix}@example.test`;
      const added = await addApplicationContact({
        organizationId,
        campaignId: firstCampaignId,
        userId,
        firstName: "Ada",
        lastName: "Lovelace",
        title: "Director",
        email,
        personaId: hiringManagerId,
      });
      await addApplicationContact({
        organizationId,
        campaignId: secondCampaignId,
        userId,
        firstName: "Ada",
        lastName: "Lovelace",
        title: "Director",
        email,
        personaId: recruiterId,
      });
      const first = await listApplicationContacts({
        organizationId,
        campaignId: firstCampaignId,
      });
      const second = await listApplicationContacts({
        organizationId,
        campaignId: secondCampaignId,
      });
      expect(first.find((row) => row.contactId === added.contactId)?.chosenPersona?.name).toBe(
        "Hiring Manager",
      );
      expect(second.find((row) => row.contactId === added.contactId)?.chosenPersona?.name).toBe(
        "Recruiter",
      );
      const memberships = await prisma.campaignContact.findMany({
        where: { organizationId, contactId: added.contactId },
        select: { campaignId: true, chosenPersonaId: true },
      });
      expect(memberships).toHaveLength(2);
      expect(enqueueApplicationJob).not.toHaveBeenCalled();
      expect(runPaidStructuredCall).not.toHaveBeenCalled();
    });
  },
);
