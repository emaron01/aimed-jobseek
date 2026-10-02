// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { InterviewStagesList } from "@/components/InterviewStagesSection";
import InterviewStagePage from "@/app/(app)/campaigns/[id]/interviews/[stageId]/page";
import { addApplicationContact } from "@/lib/application/contacts";
import { compileNotesFromInterviewsWithPerson, notesFromInterviewsWithHeading } from "@/lib/application-summary/interview-notes";
import { appendCheatSheetNote } from "@/lib/application-summary/notes";
import { addCheatSheetInterviewNote } from "@/lib/application-summary/service";
import { learningsFingerprint } from "@/lib/consultation/learnings";
import { createInterviewStage, updateInterviewStage } from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import * as jobs from "@/lib/application-jobs/service";
import * as paid from "@/lib/ai/paid-call-gate";

const redirectTo = vi.hoisted(() => vi.fn());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectTo(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/campaigns/camp/interviews",
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

const enqueue = vi.spyOn(jobs, "enqueueApplicationJob").mockResolvedValue({ id: "job" } as never);
const paidCall = vi.spyOn(paid, "runPaidStructuredCall").mockResolvedValue({} as never);

function src(path: string): string {
  return readFileSync(path, "utf8");
}

async function paint(root: Root, node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

const person = {
  contactId: "contact-1",
  name: "Priya Shah",
  title: "Recruiter",
  personaId: "role-1",
  personaName: "Recruiter",
};

const secondPerson = {
  contactId: "contact-2",
  name: "Jordan Lee",
  title: "Hiring Manager",
  personaId: "role-2",
  personaName: "Hiring Manager",
};

function stage(overrides: Partial<{
  id: string;
  outcome: "ADVANCED" | null;
  interviewers: Array<{
    id: string;
    contactId: string;
    contact: { firstName: string | null; lastName: string | null; title: string | null };
  }>;
}> = {}) {
  return {
    id: overrides.id ?? "stage-1",
    type: "HIRING_MANAGER" as const,
    format: "VIDEO" as const,
    scheduledAt: new Date("2026-10-01T15:00:00.000Z"),
    outcome: overrides.outcome === undefined ? null : overrides.outcome,
    notesBefore: "Prep the forecast.",
    notesAfter: "They pushed on margin.",
    expectedDecisionAt: new Date("2026-10-20T00:00:00.000Z"),
    interviewers: overrides.interviewers ?? [
      {
        id: "row-1",
        contactId: person.contactId,
        contact: { firstName: "Priya", lastName: "Shah", title: "Recruiter" },
      },
    ],
  };
}

describe("interview stages batch 1", () => {
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

  it("renders interviewer sections, stored notes, and the create start without the removed controls", async () => {
    enqueue.mockClear();
    paidCall.mockClear();
    const notes = new Map([
      [
        person.contactId,
        appendCheatSheetNote({
          existing: [],
          text: "Board asked about margin.",
          stageId: "stage-open",
        }).concat(
          appendCheatSheetNote({
            existing: [],
            text: "This note belongs to another stage.",
            stageId: "stage-other",
          }),
        ),
      ],
    ]);
    await paint(
      root,
      createElement(InterviewStagesList, {
        campaignId: "camp",
        canEdit: true,
        roles: [{ id: "role-1", name: "Recruiter", suggestionKey: "recruiter" }],
        people: [person, secondPerson],
        notesByContactId: notes,
        stages: [
          stage({ id: "stage-open" }),
          stage({
            id: "stage-two",
            interviewers: [
              {
                id: "row-1",
                contactId: person.contactId,
                contact: { firstName: "Priya", lastName: "Shah", title: "Recruiter" },
              },
              {
                id: "row-2",
                contactId: secondPerson.contactId,
                contact: { firstName: "Jordan", lastName: "Lee", title: "Hiring Manager" },
              },
            ],
          }),
          stage({
            id: "stage-done",
            outcome: "ADVANCED",
          }),
          stage({ id: "stage-empty", interviewers: [] }),
        ],
      }),
    );

    expect(interviewConfig.labels.openGuide).toBe("Open stage");
    expect(host.textContent).not.toContain("Open stage");
    expect(host.querySelector("[data-testid=stage-create-start]")?.textContent).toBe(
      "Add someone you're meeting",
    );
    const contactForm = host.querySelector("[data-testid=add-application-contact]");
    expect(contactForm).not.toBeNull();
    for (const name of ["firstName", "lastName", "title", "email", "linkedinUrl", "linkedInProfileText", "personaId"]) {
      expect(contactForm?.querySelector(`[name=${name}]`)).not.toBeNull();
    }
    const stageForm = host.querySelector("[data-testid=add-interview-stage]");
    expect(stageForm?.querySelector("select[name=contactId]")?.hasAttribute("required")).toBe(true);
    expect((stageForm?.querySelector("select[name=type]") as HTMLSelectElement).value).toBe(
      "RECRUITER_SCREEN",
    );
    expect(stageForm?.textContent).toContain("Date and time");
    const format = stageForm?.querySelector("select[name=format]") as HTMLSelectElement;
    expect(format.required).toBe(true);
    expect(format.value).toBe("VIDEO");
    expect(stageForm?.querySelector("[name=notesBefore]")).toBeNull();
    expect(stageForm?.querySelector("[name=expectedDecisionAt]")).toBeNull();
    expect(host.textContent).not.toContain("Choose interviewer");
    expect(host.textContent).not.toContain("Use this interviewer");
    expect(host.textContent).not.toContain("Add new interviewer");

    const priya = host.querySelector("[data-testid=person-section-contact-1]");
    expect(priya?.getAttribute("data-open")).toBe("false");
    const jordan = host.querySelector("[data-testid=person-section-contact-2]");
    expect(jordan?.getAttribute("data-open")).toBe("true");
    expect(jordan?.textContent).toContain("Jordan Lee");
    expect(jordan?.querySelector("[data-cheat-sheet-indicator]")?.getAttribute("data-cheat-sheet-indicator")).toBe(
      "open",
    );
    expect(jordan?.querySelector("[data-testid=harper-contact-link-contact-2]")?.getAttribute("href")).toContain(
      "harper-contact",
    );

    await act(async () => {
      (host.querySelector("[data-testid=person-section-contact-1-toggle]") as HTMLButtonElement).click();
    });
    const opened = host.querySelector("[data-testid=person-section-contact-1]");
    expect(opened?.getAttribute("data-open")).toBe("true");
    const open = host.querySelector("[data-testid=person-interview-contact-1-stage-open]");
    expect(opened?.querySelector("[data-testid=harper-contact-link-contact-1]")?.getAttribute("href")).toContain(
      "harper-contact",
    );
    expect(open?.textContent).toContain("Post Interview Notes");
    expect(open?.textContent).toContain("Notes before");
    expect(open?.textContent).toContain("Prep the forecast.");
    expect(open?.textContent).toContain("Notes after");
    expect(open?.textContent).toContain("They pushed on margin.");
    expect(open?.textContent).toContain("Newly gained information");
    expect(open?.textContent).toContain("Board asked about margin.");
    expect(open?.textContent).not.toContain("This note belongs to another stage.");
    expect(open?.textContent).toContain("Expected decision date (saved earlier)");
    expect(open?.querySelector("[name=notesBefore]")).toBeNull();
    expect(open?.querySelector("[name=note]")).not.toBeNull();
    expect(host.querySelectorAll("[data-testid=person-interview-contact-1-stage-two], [data-testid=person-interview-contact-2-stage-two]")).toHaveLength(2);

    const empty = host.querySelector("[data-testid=unlinked-interview-stage-empty]");
    expect(host.textContent).toContain("Not linked to anyone");
    expect(host.textContent).not.toContain("No interviewer was added to this stage.");
    expect(empty?.querySelectorAll("[data-testid=stored-notes-before-stage-empty-stage]")).toHaveLength(1);
    expect(empty?.textContent).toContain("Prep the forecast.");
    expect(empty?.textContent).toContain("Expected decision date (saved earlier)");

    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();

    const summary = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    const section = src("src/components/InterviewStagesSection.tsx");
    const panel = src("src/components/InterviewStagePanel.tsx");
    const stagePage = src("src/app/(app)/campaigns/[id]/interviews/[stageId]/page.tsx");
    expect(summary).not.toContain("openGuide");
    expect(summary).not.toContain("/interviews/${");
    expect(section).not.toContain("InterviewStageOpenActions");
    expect(section).not.toContain("InterviewStageSetupInterviewers");
    expect(panel).not.toContain("assignExistingInterviewerAction");
    expect(stagePage).toContain("redirect(`/campaigns/${id}/interviews`)");
    expect(section).not.toContain("enqueueApplicationJob");
    expect(section).not.toContain("runPaidStructuredCall");
    expect(panel).not.toContain("runPaidStructuredCall");
  });

  it("redirects the old stage URL to the interview list", async () => {
    redirectTo.mockClear();
    await expect(
      InterviewStagePage({
        params: Promise.resolve({ id: "camp", stageId: "stage-1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/campaigns/camp/interviews");
    expect(redirectTo).toHaveBeenCalledWith("/campaigns/camp/interviews");
  });

  it("puts a new note into the learnings fingerprint and the cheat sheet notes heading", () => {
    const before = learningsFingerprint({
      seekerLearnedNotes: null,
      stages: [{ id: "stage-1", notesBefore: "Prep the forecast.", notesAfter: "They pushed on margin." }],
      newlyGained: [],
    });
    const gained = appendCheatSheetNote({
      existing: [],
      text: "Board asked about margin.",
      stageId: "stage-1",
    });
    const after = learningsFingerprint({
      seekerLearnedNotes: null,
      stages: [{ id: "stage-1", notesBefore: "Prep the forecast.", notesAfter: "They pushed on margin." }],
      newlyGained: gained.map((note) => ({
        contactId: person.contactId,
        id: note.id,
        text: note.text,
        stageId: note.stageId,
        createdAt: note.createdAt,
      })),
    });
    expect(after).not.toBe(before);
    const compiled = compileNotesFromInterviewsWithPerson({
      contactId: person.contactId,
      gainedNotes: gained,
      stages: [
        {
          id: "stage-1",
          type: "HIRING_MANAGER",
          scheduledAt: "2026-10-01T15:00:00.000Z",
          notesBefore: "Prep the forecast.",
          notesAfter: "They pushed on margin.",
          interviewerContactIds: [person.contactId],
        },
      ],
    });
    expect(compiled.map((entry) => entry.text)).toEqual(
      expect.arrayContaining([
        "Prep the forecast.",
        "They pushed on margin.",
        "Board asked about margin.",
      ]),
    );
    expect(notesFromInterviewsWithHeading("Priya Shah")).toBe(
      "Notes From Interviews With Priya Shah",
    );
  });
});

describe.skipIf(!hasTestDatabase())("interview stages batch 1 stored values", { timeout: 60_000 }, () => {
  const suffix = Date.now().toString(36);
  let organizationId = "";
  let userId = "";
  let campaignId = "";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `[TEST] Stages batch 1 ${suffix}`, slug: `stages-b1-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `stages-b1-${suffix}@example.test`,
        emailNormalized: `stages-b1-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Stages ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Stages ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
  });

  it("requires one contact, appends a note, and does not clear stored stage values", async () => {
    await expect(
      createInterviewStage({
        organizationId,
        campaignId,
        userId,
        type: "RECRUITER_SCREEN",
        scheduledAt: new Date("2026-11-01T15:00:00.000Z"),
        format: "VIDEO",
      }),
    ).rejects.toThrow(/Choose who you are meeting/);
    expect(await prisma.interviewStage.count({ where: { campaignId } })).toBe(0);

    const persona = await prisma.persona.create({
      data: {
        organizationId,
        productId: (await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).productId,
        campaignId,
        name: "Recruiter",
        suggestionKey: "recruiter",
        targetTitles: ["Recruiter"],
      },
    });
    const interviewer = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Priya",
      lastName: "Shah",
      title: "Recruiter",
      personaId: persona.id,
      confirmRole: true,
    });
    const created = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-11-02T15:00:00.000Z"),
      format: "VIDEO",
      interviewerContactIds: [interviewer.contactId],
      notesBefore: "This create input must not be stored.",
      expectedDecisionAt: new Date("2026-12-01T00:00:00.000Z"),
    });
    const fresh = await prisma.interviewStage.findUniqueOrThrow({ where: { id: created.id } });
    expect(fresh.notesBefore).toBeNull();
    expect(fresh.expectedDecisionAt).toBeNull();

    await prisma.interviewStage.update({
      where: { id: created.id },
      data: {
        notesBefore: "Prep the forecast.",
        notesAfter: "They pushed on margin.",
        expectedDecisionAt: new Date("2026-12-15T00:00:00.000Z"),
      },
    });
    enqueue.mockClear();
    const notes = await addCheatSheetInterviewNote({
      organizationId,
      campaignId,
      userId,
      contactId: interviewer.contactId,
      stageId: created.id,
      text: "Board asked about margin.",
    });
    expect(notes.map((note) => note.text)).toContain("Board asked about margin.");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CONSULTATION", targetId: "reassess" }),
    );
    const stored = await prisma.campaignContact.findFirstOrThrow({
      where: { campaignId, contactId: interviewer.contactId },
    });
    const compiled = compileNotesFromInterviewsWithPerson({
      contactId: interviewer.contactId,
      gainedNotes: notes,
      stages: [
        {
          id: created.id,
          type: "RECRUITER_SCREEN",
          scheduledAt: fresh.scheduledAt,
          notesBefore: "Prep the forecast.",
          notesAfter: "They pushed on margin.",
          interviewerContactIds: [interviewer.contactId],
        },
      ],
    });
    expect(compiled.map((entry) => entry.text)).toEqual(
      expect.arrayContaining(["Prep the forecast.", "Board asked about margin."]),
    );
    expect(notesFromInterviewsWithHeading("Priya Shah")).toContain("Priya Shah");
    expect(stored.cheatSheetNotesJson).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "Board asked about margin.", stageId: created.id }),
    ]));

    await updateInterviewStage({
      organizationId,
      campaignId,
      userId,
      stageId: created.id,
      outcome: "ADVANCED",
    });
    const kept = await prisma.interviewStage.findUniqueOrThrow({ where: { id: created.id } });
    expect(kept.notesBefore).toBe("Prep the forecast.");
    expect(kept.notesAfter).toBe("They pushed on margin.");
    expect(kept.expectedDecisionAt?.toISOString()).toBe("2026-12-15T00:00:00.000Z");
    expect(paidCall).not.toHaveBeenCalled();
  });
});
