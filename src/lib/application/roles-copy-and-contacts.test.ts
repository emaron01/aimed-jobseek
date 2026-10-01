// @vitest-environment happy-dom
/**
 * Hiring Team roles notice, Contacts page Add Contact, and no paid work on render.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";
import { vocab } from "@/lib/product-config";

const ROLES_NOTICE =
  "Harper identified these Hiring Team roles from the job posting and company research. Select the roles that align to the title or responsibilities of the person who you are interviewing with. NOTE: You can select personas as they are identified.";

const actionState = vi.hoisted(() => ({
  result: { ok: true, message: "Contact added." },
}));
const addApplicationContactAction = vi.hoisted(() =>
  vi.fn<
    (
      prev: { ok: boolean; message: string } | null,
      formData: FormData,
    ) => Promise<{ ok: boolean; message: string }>
  >(async () => actionState.result),
);
const enqueueApplicationJob = vi.hoisted(() => vi.fn());
const runPaidStructuredCall = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/campaigns/camp_1/contacts",
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

import { HiringTeamAssumptionNotice } from "@/components/HiringTeamAssumptionNotice";
import { ApplicationContactsPageHeader } from "@/components/ApplicationOutreachSections";
import {
  addApplicationContact,
  listApplicationContacts,
} from "@/lib/application/contacts";

function filesWith(dir: string, needle: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      filesWith(path, needle, found);
      continue;
    }
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    if (readFileSync(path, "utf8").includes(needle)) found.push(path);
  }
  return found;
}

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

describe("Hiring Team roles notice", () => {
  it("renders the exact text in the orange warning notice and drops the old sentence", () => {
    const html = renderToStaticMarkup(createElement(HiringTeamAssumptionNotice));
    expect(html).toContain(ROLES_NOTICE);
    expect(html).toContain("rounded-md border border-warning bg-warning-tint");
    expect(html).toContain("text-warning");
    expect(html).toContain('data-testid="hiring-team-assumption-notice"');
    expect(html).not.toContain("guessed these");
    expect(html).not.toContain("They are assumptions");
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    expect(workspace).toContain("<HiringTeamAssumptionNotice />");
    expect(filesWith("src", "guessed these")).toEqual([]);
    expect(filesWith("src", "They are assumptions. Confirm or correct them.")).toEqual(
      [],
    );
    enqueueApplicationJob.mockClear();
    runPaidStructuredCall.mockClear();
    renderToStaticMarkup(createElement(HiringTeamAssumptionNotice));
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });
});

describe("Contacts page Add Contact", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    addApplicationContactAction.mockClear();
    actionState.result = { ok: true, message: "Contact added." };
    enqueueApplicationJob.mockClear();
    runPaidStructuredCall.mockClear();
  });

  function header(canEdit = true) {
    return createElement(ApplicationContactsPageHeader, {
      campaignId: "camp_1",
      canEdit,
      title: "Contacts",
      description: "Acme · Contacts on this application.",
      backHref: "/campaigns/camp_1",
      roles: [{ id: "role_1", name: "Hiring Manager" }],
    });
  }

  it("opens the same Send Outreach form, saves through the same action, and shows validation the same way", async () => {
    const view = mount(header());
    root = view.root;
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain("Add Contact");
    expect(view.host.textContent).toContain("Back to application");
    expect(view.host.querySelector("[data-testid='add-application-contact']")).toBeNull();

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
    expect(form).toBeTruthy();
    for (const name of [
      "firstName",
      "lastName",
      "title",
      "email",
      "linkedinUrl",
      "linkedInProfileText",
      "personaId",
    ]) {
      expect(form.querySelector(`[name='${name}']`)).toBeTruthy();
    }
    expect(form.querySelector("[name='personaId']")?.hasAttribute("required")).toBe(
      true,
    );

    act(() => {
      typeInto(form.querySelector("[name='firstName']") as HTMLInputElement, "Ada");
      typeInto(form.querySelector("[name='lastName']") as HTMLInputElement, "Lovelace");
      typeInto(form.querySelector("[name='title']") as HTMLInputElement, "Director");
      typeInto(form.querySelector("[name='personaId']") as HTMLSelectElement, "role_1");
    });
    await act(async () => {
      form.requestSubmit();
    });
    expect(addApplicationContactAction).toHaveBeenCalled();
    const formData = addApplicationContactAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("campaignId")).toBe("camp_1");
    expect(formData.get("firstName")).toBe("Ada");
    expect(formData.get("personaId")).toBe("role_1");
    expect(view.host.textContent).toContain("Contact added.");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("shows a refused save in the same danger status as Send Outreach", async () => {
    actionState.result = {
      ok: false,
      message: `Choose ${vocab.persona.aSingular}.`,
    };
    const view = mount(header());
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
    act(() => {
      typeInto(form.querySelector("[name='firstName']") as HTMLInputElement, "Ada");
      typeInto(form.querySelector("[name='lastName']") as HTMLInputElement, "Lovelace");
      typeInto(form.querySelector("[name='title']") as HTMLInputElement, "Director");
      typeInto(form.querySelector("[name='personaId']") as HTMLSelectElement, "role_1");
    });
    await act(async () => {
      form.requestSubmit();
    });
    const error = view.host.querySelector("[role='status']") as HTMLElement;
    expect(error.textContent).toBe(`Choose ${vocab.persona.aSingular}.`);
    expect(error.className).toContain("text-danger");
  });

  it("uses the Send Outreach action and service, and revalidates contact pages, with no extra paid work", () => {
    const action = readFileSync("src/app/actions/application-outreach.ts", "utf8");
    const start = action.indexOf("export async function addApplicationContactAction");
    const end = action.indexOf("export async function updateApplicationContactRoleAction");
    const body = action.slice(start, end);
    expect(body).toContain("addApplicationContact(");
    expect(body).toContain("saveLinkedInPaste");
    expect(body).not.toContain("offerPersonPrep");
    expect(body).not.toContain("runPaidStructuredCall");
    expect(body).not.toContain("enqueueApplicationJob");
    expect(action).toContain("`/campaigns/${campaign}/contacts`");
    expect(action).toContain("`/campaigns/${campaign}/outreach`");
    expect(action).toContain("`/campaigns/${campaign}/hiring-team`");
    expect(action).toContain("`/campaigns/${campaign}/interviews`");
    const page = readFileSync("src/app/(app)/contacts/page.tsx", "utf8");
    const directory = readFileSync("src/components/ContactsDirectory.tsx", "utf8");
    const retired = readFileSync(
      "src/app/(app)/campaigns/[id]/contacts/page.tsx",
      "utf8",
    );
    expect(page).toContain("ContactsDirectory");
    expect(directory).toContain("ApplicationContactsPageHeader");
    expect(retired).toContain("redirect(workspaceApplicationContactsHref");
    expect(retired).not.toContain("listApplicationContacts");
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    expect(section).toContain("addApplicationContactAction");
    const header = section.slice(
      section.indexOf("export function ApplicationContactsPageHeader"),
      section.indexOf("export function ApplicationAppliedSection"),
    );
    expect(header).toContain("<AddContactForm");
    expect(header).toContain("addApplicationContactAction");
  });
});

describe.skipIf(!hasTestDatabase())(
  "Contacts page add uses the outreach contact service",
  { timeout: 60_000 },
  () => {
    const suffix = `roles_${Date.now().toString(36)}`;
    let prisma: import("@prisma/client").PrismaClient;
    let organizationId = "";
    let userId = "";
    let campaignId = "";
    let personaId = "";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      const organization = await prisma.organization.create({
        data: { name: `[TEST] Roles contacts ${suffix}`, slug: `roles-contacts-${suffix}` },
      });
      organizationId = organization.id;
      const user = await prisma.user.create({
        data: {
          email: `roles-contacts-${suffix}@example.test`,
          emailNormalized: `roles-contacts-${suffix}@example.test`,
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: { organizationId, name: `Candidate ${suffix}` },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          productId: product.id,
          name: `App ${suffix}`,
        },
      });
      campaignId = campaign.id;
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          campaignId,
          name: "Hiring Manager",
          suggestionKey: "hiring_manager",
          targetTitles: ["Director"],
        },
      });
      personaId = persona.id;
    });

    afterAll(async () => {
      if (!prisma || !organizationId) return;
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await prisma.$disconnect();
    });

    it("creates the contact on this application and lists it", async () => {
      const added = await addApplicationContact({
        organizationId,
        campaignId,
        userId,
        firstName: "Ada",
        lastName: "Lovelace",
        title: "Director",
        email: `ada-${suffix}@example.test`,
        personaId,
      });
      const listed = await listApplicationContacts({ organizationId, campaignId });
      expect(listed.some((row) => row.contactId === added.contactId)).toBe(true);
      expect(
        listed.find((row) => row.contactId === added.contactId)?.contact.firstName,
      ).toBe("Ada");
      expect(enqueueApplicationJob).not.toHaveBeenCalled();
      expect(runPaidStructuredCall).not.toHaveBeenCalled();
    });
  },
);
