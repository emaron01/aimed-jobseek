// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApplicationTrackerList } from "@/components/ApplicationSidebarTracker";
import { InterviewStagesList } from "@/components/InterviewStagesSection";
import {
  buildApplicationStepViews,
  emptyApplicationStepFacts,
} from "@/lib/application/step-progress";
import { parseCheatSheetNotes } from "@/lib/application-summary/notes";
import { applicationStepFromPathname } from "@/lib/product-config/application-steps";
import { workspaceCheatSheetPersonHref } from "@/lib/application/workspace-links";
import { listInterviewStages } from "@/lib/interview/stages";
import { formatSavedInterviewNoteAt } from "@/lib/interview/saved-note-label";
import {
  applicationStepCopy,
  applicationSummaryConfig,
  interviewConfig,
  outreachConfig,
} from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import * as jobs from "@/lib/application-jobs/service";
import * as paid from "@/lib/ai/paid-call-gate";
import type { InterviewFormat, InterviewStageOutcome, InterviewStageType } from "@prisma/client";

const session = vi.hoisted(() => ({ userId: "", organizationId: "" }));
const pathnameRef = vi.hoisted(() => ({ value: "/campaigns/camp/interviews" }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => pathnameRef.value,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/auth/authz", () => ({
  requireCurrentUser: async () => ({ id: session.userId }),
}));

vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  requireOrganizationId: async () => session.organizationId,
}));

const enqueue = vi.spyOn(jobs, "enqueueApplicationJob").mockResolvedValue({ id: "job" } as never);
const paidCall = vi.spyOn(paid, "runPaidStructuredCall").mockResolvedValue({} as never);

type Person = {
  contactId: string;
  name: string;
  title: string | null;
  personaId: string | null;
  personaName: string | null;
};

type Stage = {
  id: string;
  type: InterviewStageType;
  format: InterviewFormat;
  scheduledAt: Date;
  outcome: InterviewStageOutcome | null;
  notesBefore: string | null;
  notesAfter: string | null;
  expectedDecisionAt: Date | null;
  interviewers: Array<{
    id: string;
    contactId: string;
    contact: { firstName: string | null; lastName: string | null; title: string | null };
  }>;
};

const priya: Person = {
  contactId: "priya",
  name: "Priya Shah",
  title: "Recruiter",
  personaId: "role-1",
  personaName: "Recruiter",
};

function stage(partial: Partial<Stage> & { id: string }): Stage {
  return {
    type: "RECRUITER_SCREEN",
    format: "VIDEO",
    scheduledAt: new Date("2026-08-01T15:00:00.000Z"),
    outcome: null,
    notesBefore: null,
    notesAfter: null,
    expectedDecisionAt: null,
    interviewers: [
      {
        id: `link-${partial.id}`,
        contactId: priya.contactId,
        contact: { firstName: "Priya", lastName: "Shah", title: "Recruiter" },
      },
    ],
    ...partial,
  };
}

async function paint(root: Root, node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

async function click(host: HTMLElement, selector: string) {
  const node = host.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  await act(async () => {
    node.click();
  });
}

function follows(earlier: Element | null, later: Element | null) {
  expect(earlier).not.toBeNull();
  expect(later).not.toBeNull();
  expect(earlier!.compareDocumentPosition(later!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("interview notes polish", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeAll(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterAll(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows View Interview Prep Guide only when that person's guide exists", async () => {
    enqueue.mockClear();
    paidCall.mockClear();
    act(() => root.unmount());
    root = createRoot(host);
    const alex: Person = {
      contactId: "alex",
      name: "Alex Chen",
      title: "Director",
      personaId: "role-2",
      personaName: "Hiring Manager",
    };
    await paint(
      root,
      createElement(InterviewStagesList, {
        campaignId: "camp",
        canEdit: true,
        roles: [{ id: "role-1", name: "Recruiter", suggestionKey: "recruiter" }],
        people: [priya, alex],
        notesByContactId: new Map(),
        guideReadyByContactId: new Map([[priya.contactId, true]]),
        stages: [
          stage({ id: "priya-stage" }),
          stage({
            id: "alex-stage",
            interviewers: [
              {
                id: "link-alex",
                contactId: alex.contactId,
                contact: { firstName: "Alex", lastName: "Chen", title: "Director" },
              },
            ],
          }),
        ],
      }),
    );

    const view = host.querySelector("[data-testid=view-interview-prep-guide-priya]");
    expect(view?.textContent).toBe(applicationSummaryConfig.actions.viewInterviewPrepGuide);
    expect(view?.getAttribute("href")).toBe(
      workspaceCheatSheetPersonHref("camp", priya.contactId),
    );
    expect(view?.className).toContain("bg-primary");
    expect(host.querySelector("[data-testid=view-interview-prep-guide-alex]")).toBeNull();
    expect(host.querySelector("[data-testid=interview-prep-guide-priya]")?.textContent).toContain(
      "Update Interview Prep Guide",
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    act(() => root.unmount());
    root = createRoot(host);
  });

  it("renders the collapsed add flow, saved notes, follow-up, outcome spacing, and Interview Notes", async () => {
    enqueue.mockClear();
    paidCall.mockClear();
    const older = "2026-05-01T15:30:00.000Z";
    const newer = "2026-06-02T18:05:00.000Z";
    const notes = new Map([
      [
        priya.contactId,
        [
          {
            id: "note-new",
            text: "Later fact.",
            stageId: "priya-stage",
            createdAt: newer,
          },
          {
            id: "note-old",
            text: "Earlier fact.",
            stageId: "priya-stage",
            createdAt: older,
          },
          {
            id: "note-other",
            text: "Different interview.",
            stageId: "other-stage",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ],
    ]);
    await paint(
      root,
      createElement(InterviewStagesList, {
        campaignId: "camp",
        canEdit: true,
        roles: [{ id: "role-1", name: "Recruiter", suggestionKey: "recruiter" }],
        people: [priya],
        notesByContactId: notes,
        stages: [
          stage({
            id: "priya-stage",
            notesBefore: "Told to expect a forecast.",
            notesAfter: "We discussed margin.",
            outcome: "ADVANCED",
          }),
        ],
      }),
    );

    expect(host.querySelector("h2")?.textContent).toBe("Interview Notes");
    expect(host.querySelector("[data-testid=view-interview-prep-guide-priya]")).toBeNull();
    expect(host.textContent).toContain(interviewConfig.labels.sectionHelp);
    const addSection = host.querySelector("[data-testid=add-someone-youre-meeting]");
    expect(addSection?.getAttribute("data-open")).toBe("false");
    expect(host.querySelector("[data-testid=stage-create-start]")?.textContent).toBe(
      "Add someone you're meeting",
    );
    expect(host.querySelector("[data-testid=add-interview-stage]")).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();

    await click(host, "[data-testid=add-someone-youre-meeting-toggle]");
    expect(addSection?.getAttribute("data-open")).toBe("true");
    const interviewer = host.querySelector("[data-testid=add-someone-youre-meeting] select[name=contactId]");
    const addContact = host.querySelector("[data-testid=add-new-contact]");
    const type = host.querySelector("[data-testid=add-interview-stage] select[name=type]");
    const format = host.querySelector("[data-testid=add-interview-stage] select[name=format]");
    const when = host.querySelector("[data-testid=add-interview-stage] input[name=scheduledAt]");
    const addButton = host.querySelector("[data-testid=add-interview-stage] button[type=submit]");
    follows(interviewer, addContact);
    follows(addContact, type);
    follows(type, format);
    follows(format, when);
    follows(when, addButton);
    expect(interviewer?.parentElement?.textContent).toContain("Interviewer");
    expect((interviewer as HTMLSelectElement).options[0]?.textContent).toBe("Choose who you are meeting.");
    expect(addContact?.getAttribute("data-open")).toBe("false");
    expect(addContact?.textContent).toContain("Add a new contact");
    expect(host.querySelector("[data-testid=add-application-contact]")).toBeNull();
    expect(addButton?.textContent).toBe("Add interview");
    await click(host, "[data-testid=add-new-contact-toggle]");
    expect(addContact?.getAttribute("data-open")).toBe("true");
    for (const name of ["firstName", "lastName", "title", "email", "linkedinUrl", "linkedInProfileText", "personaId"]) {
      expect(host.querySelector(`[data-testid=add-application-contact] [name=${name}]`)).not.toBeNull();
    }

    await click(host, "[data-testid=person-section-priya-toggle]");
    const interview = host.querySelector("[data-testid=person-interview-priya-priya-stage]");
    const outcomeForm = host.querySelector("[data-testid=update-stage-priya-stage-priya]") as HTMLFormElement;
    const outcomeButton = outcomeForm.querySelector("button[type=submit]");
    expect(outcomeButton?.textContent).toBe("Save outcome");
    expect(outcomeForm.className).toContain("flex-col");
    expect(outcomeForm.className).toContain("gap-3");
    expect(outcomeForm.querySelector("label")?.contains(outcomeButton)).toBe(false);
    expect(interview?.textContent).toContain("Notes before");
    expect(interview?.textContent).toContain("Told to expect a forecast.");
    expect(interview?.textContent).toContain("Notes after");
    expect(interview?.textContent).toContain("We discussed margin.");

    const saved = [...host.querySelectorAll("[data-testid^=stored-gained-note-]")].filter((node) =>
      node.getAttribute("data-testid")?.startsWith("stored-gained-note-") &&
      !node.getAttribute("data-testid")?.includes("-when-"),
    );
    expect(saved.map((node) => node.getAttribute("data-testid"))).toEqual([
      "stored-gained-note-note-old",
      "stored-gained-note-note-new",
    ]);
    expect(host.querySelector("[data-testid=stored-gained-note-when-note-old]")?.textContent).toBe(
      formatSavedInterviewNoteAt(older),
    );
    expect(host.querySelector("[data-testid=stored-gained-note-when-note-new]")?.textContent).toBe(
      formatSavedInterviewNoteAt(newer),
    );
    expect(interview?.textContent).not.toContain("Different interview.");
    const noteBox = host.querySelector(
      "[data-testid=add-cheat-sheet-note-priya-stage-priya] textarea[name=note]",
    );
    follows(host.querySelector("[data-testid=saved-notes-priya-stage-priya]"), noteBox);
    expect(host.querySelector("[data-testid=add-cheat-sheet-note-priya-stage-priya] button[type=submit]")?.textContent).toBe(
      "Save and Add Note to Cheat Sheet",
    );

    const followUp = host.querySelector("[data-testid=add-follow-up-priya]");
    expect(followUp?.getAttribute("data-open")).toBe("false");
    expect(followUp?.textContent).toContain("Add Follow-up Interview");
    expect(host.querySelector("[data-testid=add-another-interview-priya]")).toBeNull();
    await click(host, "[data-testid=add-follow-up-priya-toggle]");
    expect(followUp?.getAttribute("data-open")).toBe("true");
    expect(host.querySelector("[data-testid=add-another-interview-priya] button[type=submit]")?.textContent).toBe(
      "Add follow-up interview",
    );
    expect(host.querySelector("[data-testid=add-another-interview-priya] input[name=contactId]")?.getAttribute("value")).toBe(
      "priya",
    );

    pathnameRef.value = "/campaigns/camp/interviews";
    const facts = { ...emptyApplicationStepFacts(), interviewStageCount: 1 };
    const tracker = {
      campaignId: "camp",
      campaignName: "Acme",
      currentStep: applicationStepFromPathname("/campaigns/camp/interviews"),
      steps: buildApplicationStepViews({
        campaignId: "camp",
        currentStep: "interviews",
        facts,
        jobs: [],
        seen: {},
      }),
    };
    const nav = document.createElement("div");
    document.body.appendChild(nav);
    const navRoot = createRoot(nav);
    await paint(navRoot, createElement(ApplicationTrackerList, { tracker, variant: "sidebar" }));
    const step = nav.querySelector("[data-testid=tracker-step-interviews]");
    expect(step?.textContent).toContain("Interview Notes");
    expect(step?.textContent).not.toContain("Interview stages");
    expect(nav.querySelector("[data-testid=tracker-new-interviews]")?.textContent).toBe(
      "New: interview stage",
    );
    act(() => navRoot.unmount());
    nav.remove();

    expect(interviewConfig.labels.sectionHelp).toBe(
      "Record each interview: who you're meeting, when, and how. After each one, add your Post Interview Notes.",
    );
    expect(applicationSummaryConfig.sections.interviewStages).toBe("Interview stages");
    expect(applicationStepCopy.newInterviewStage).toBe("New: interview stage");
    expect(outreachConfig.labels.sectionTitle).toBe("Send Outreach");
    expect(outreachConfig.labels.interviewStage).toBe("Interview stage");
    expect(outreachConfig.labels.remindersDueLine).toBe(
      "You may have {count} outbound due. Review Interview stages and Send Outreach to take action.",
    );
    const summary = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(summary).toContain("applicationSummaryConfig.sections.interviewStages");
    expect(summary).toContain("No interview stages yet.");
    expect(readFileSync("src/components/InterviewStagesSection.tsx", "utf8")).toContain("No stages yet.");
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasTestDatabase())("interview notes polish against postgres", { timeout: 120_000 }, () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(16).slice(2)}`;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let roleId = "";
  let root: Root;
  let host: HTMLDivElement;

  beforeAll(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const org = await prisma.organization.create({
      data: { name: `[TEST] Notes polish ${suffix}`, slug: `notes-polish-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `notes-polish-${suffix}@example.test`,
        emailNormalized: `notes-polish-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Notes polish ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Notes polish ${suffix}`,
        productId: product.id,
        icpId: icp.id,
        applicationProgress: "APPLIED",
      },
    });
    campaignId = campaign.id;
    const persona = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        name: "Recruiter",
        suggestionKey: "recruiter",
        targetTitles: ["Recruiter"],
      },
    });
    roleId = persona.id;
    session.userId = userId;
    session.organizationId = organizationId;
  });

  afterAll(async () => {
    act(() => root.unmount());
    host.remove();
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function renderPage() {
    const [stages, memberships] = await Promise.all([
      listInterviewStages({ organizationId, campaignId }),
      prisma.campaignContact.findMany({
        where: { campaignId },
        include: { contact: true, chosenPersona: true },
      }),
    ]);
    const people = memberships.map((row) => ({
      contactId: row.contactId,
      name: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim(),
      title: row.contact.title,
      personaId: row.chosenPersonaId,
      personaName: row.chosenPersona?.name ?? null,
    }));
    const notesByContactId = new Map(
      memberships.map((row) => [row.contactId, parseCheatSheetNotes(row.cheatSheetNotesJson)]),
    );
    await paint(
      root,
      createElement(InterviewStagesList, {
        campaignId,
        canEdit: true,
        roles: [{ id: roleId, name: "Recruiter", suggestionKey: "recruiter" }],
        people,
        stages,
        notesByContactId,
      }),
    );
    return { people, stages };
  }

  async function openPerson(contactId: string) {
    const section = host.querySelector(`[data-testid=person-section-${contactId}]`);
    if (section?.getAttribute("data-open") !== "true") {
      await click(host, `[data-testid=person-section-${contactId}-toggle]`);
    }
  }

  it("adds a contact, an interview, a dated note, a follow-up, and an outcome without a paid call on render", async () => {
    enqueue.mockClear();
    paidCall.mockClear();
    await renderPage();
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    expect(host.querySelector("[data-testid=add-someone-youre-meeting]")?.getAttribute("data-open")).toBe("false");

    await click(host, "[data-testid=add-someone-youre-meeting-toggle]");
    await click(host, "[data-testid=add-new-contact-toggle]");
    const contactForm = host.querySelector("[data-testid=add-application-contact]") as HTMLFormElement;
    (contactForm.querySelector("[name=firstName]") as HTMLInputElement).value = "Avery";
    (contactForm.querySelector("[name=lastName]") as HTMLInputElement).value = "Nguyen";
    (contactForm.querySelector("[name=title]") as HTMLInputElement).value = "Recruiter";
    (contactForm.querySelector("[name=personaId]") as HTMLSelectElement).value = roleId;
    await act(async () => {
      contactForm.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const added = await prisma.contact.findFirstOrThrow({
      where: { organizationId, firstName: "Avery", lastName: "Nguyen" },
    });
    await renderPage();
    expect(host.querySelector("[data-testid=add-someone-youre-meeting]")?.getAttribute("data-open")).toBe("true");
    const chooser = host.querySelector(
      "[data-testid=add-someone-youre-meeting] select[name=contactId]",
    ) as HTMLSelectElement;
    expect([...chooser.options].some((option) => option.textContent?.includes("Avery Nguyen"))).toBe(true);
    chooser.value = added.id;
    const createForm = host.querySelector("[data-testid=add-interview-stage]") as HTMLFormElement;
    (createForm.querySelector("[name=scheduledAt]") as HTMLInputElement).value = "2026-10-03T15:00";
    (createForm.querySelector("select[name=type]") as HTMLSelectElement).value = "HIRING_MANAGER";
    await act(async () => {
      createForm.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(host.querySelector("[data-testid=add-someone-youre-meeting]")?.getAttribute("data-open")).toBe("false");
    const created = await prisma.interviewStage.findFirstOrThrow({
      where: { campaignId, interviewers: { some: { contactId: added.id } } },
    });
    expect(created.type).toBe("HIRING_MANAGER");
    await renderPage();
    expect(host.querySelector("[data-testid=add-someone-youre-meeting]")?.getAttribute("data-open")).toBe("false");
    await openPerson(added.id);
    expect(host.querySelector(`[data-testid=person-interview-${added.id}-${created.id}]`)).not.toBeNull();

    const outcomeForm = host.querySelector(
      `[data-testid=update-stage-${created.id}-${added.id}]`,
    ) as HTMLFormElement;
    (outcomeForm.querySelector("select[name=outcome]") as HTMLSelectElement).value = "ADVANCED";
    await act(async () => {
      outcomeForm.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(
      (await prisma.interviewStage.findUniqueOrThrow({ where: { id: created.id } })).outcome,
    ).toBe("ADVANCED");

    const noteForm = host.querySelector(
      `[data-testid=add-cheat-sheet-note-${created.id}-${added.id}]`,
    ) as HTMLFormElement;
    const noteBox = noteForm.querySelector("textarea[name=note]") as HTMLTextAreaElement;
    noteBox.value = "They care about forecast hygiene.";
    await act(async () => {
      noteForm.requestSubmit();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const box = host.querySelector(
          `[data-testid=add-cheat-sheet-note-${created.id}-${added.id}] textarea[name=note]`,
        ) as HTMLTextAreaElement | null;
        if (box && box.value === "") break;
      }
    });
    const cleared = host.querySelector(
      `[data-testid=add-cheat-sheet-note-${created.id}-${added.id}] textarea[name=note]`,
    ) as HTMLTextAreaElement;
    const noteStatus = host.querySelector(
      `[data-testid=add-cheat-sheet-note-${created.id}-${added.id}-status]`,
    );
    expect(cleared.value, noteStatus?.textContent ?? "no status").toBe("");
    await renderPage();
    await openPerson(added.id);
    const shown = host.querySelector(`[data-testid^=stored-gained-note-]`);
    expect(shown?.textContent).toContain("They care about forecast hygiene.");
    const when = host.querySelector("[data-testid^=stored-gained-note-when-]");
    expect(when?.textContent?.trim().length).toBeGreaterThan(0);
    expect(when?.getAttribute("datetime")).toBeTruthy();
    const notes = parseCheatSheetNotes(
      (await prisma.campaignContact.findFirstOrThrow({
        where: { campaignId, contactId: added.id },
      })).cheatSheetNotesJson,
    );
    expect(when?.textContent).toBe(formatSavedInterviewNoteAt(notes[0]!.createdAt));
    expect(
      (host.querySelector(`[data-testid=add-cheat-sheet-note-${created.id}-${added.id}] textarea[name=note]`) as HTMLTextAreaElement).value,
    ).toBe("");

    await click(host, `[data-testid=add-follow-up-${added.id}-toggle]`);
    const followForm = host.querySelector(
      `[data-testid=add-another-interview-${added.id}]`,
    ) as HTMLFormElement;
    (followForm.querySelector("[name=scheduledAt]") as HTMLInputElement).value = "2026-10-10T16:00";
    (followForm.querySelector("select[name=type]") as HTMLSelectElement).value = "EXECUTIVE";
    await act(async () => {
      followForm.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(host.querySelector(`[data-testid=add-follow-up-${added.id}]`)?.getAttribute("data-open")).toBe(
      "false",
    );
    const interviews = await prisma.interviewStage.findMany({
      where: { campaignId, interviewers: { some: { contactId: added.id } } },
      orderBy: { scheduledAt: "asc" },
    });
    expect(interviews).toHaveLength(2);
    expect(interviews[1]?.type).toBe("EXECUTIVE");
    await renderPage();
    await openPerson(added.id);
    expect(host.querySelectorAll(`[data-testid^=person-interview-${added.id}-]`)).toHaveLength(2);
    expect(paidCall).not.toHaveBeenCalled();
  });
});
