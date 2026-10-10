// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addCheatSheetInterviewNoteAction,
  removeInterviewAction,
  updateInterviewStageAction,
} from "@/app/actions/interview";
import { saveApplicationJobLearnedNotes } from "@/lib/application/service";
import { CheatSheetInterviewNotes } from "@/components/CheatSheetInterviewNotes";
import { CheatSheetSection } from "@/components/CheatSheetCollapsible";
import {
  CheatSheetFilterProvider,
  CheatSheetPersonSection,
} from "@/components/CheatSheetPeopleFilter";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import { ConsultationSection } from "@/components/ConsultationSection";
import { InterviewStagesList } from "@/components/InterviewStagesSection";
import { addApplicationContact } from "@/lib/application/contacts";
import { workspaceHarperContactHref } from "@/lib/application/workspace-links";
import {
  compileApplicationInterviewNotes,
  compileNotesFromInterviewsWithPerson,
} from "@/lib/application-summary/interview-notes";
import { parseCheatSheetNotes } from "@/lib/application-summary/notes";
import { createInterviewStage, listInterviewStages } from "@/lib/interview/stages";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import {
  applicationSummaryConfig,
  interviewConfig,
} from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import * as jobs from "@/lib/application-jobs/service";
import * as paid from "@/lib/ai/paid-call-gate";

const session = vi.hoisted(() => ({ userId: "", organizationId: "" }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/campaigns/camp/summary",
  useSearchParams: () => new URLSearchParams(window.location.search),
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

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function paint(root: Root, node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

describe("notes never reassess Harper, and the cheat sheet lists them once", () => {
  const suffix = `notes-section-${Date.now()}`;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let contactId = "";
  let otherContactId = "";
  let stageId = "";
  let sharedStageId = "";
  let root: Root;
  let host: HTMLDivElement;

  beforeAll(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    if (!hasTestDatabase()) return;
    const org = await prisma.organization.create({
      data: { name: `[TEST] Notes section ${suffix}`, slug: `notes-section-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `notes-section-${suffix}@example.test`,
        emailNormalized: `notes-section-${suffix}@example.test`,
      },
    });
    userId = user.id;
    session.userId = userId;
    session.organizationId = organizationId;
    const product = await prisma.product.create({
      data: { organizationId, name: `Notes ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Notes ${suffix}`,
        productId: product.id,
        icpId: icp.id,
        applicationProgress: "APPLIED",
        appliedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    campaignId = campaign.id;
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Acme ${suffix}`,
        normalizedName: `acme-notes-${suffix}`,
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        companyId: company.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        responsibilities: parsed.responsibilities,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
        identityConfirmation: "CONFIRMED",
      },
    });
    const persona = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        name: "Recruiter",
        suggestionKey: `recruiter-${suffix}`,
        targetTitles: ["Recruiter"],
      },
    });
    const ada = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Ada",
      lastName: "Lovelace",
      title: "Recruiter",
      personaId: persona.id,
      confirmRole: true,
    });
    const grace = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Grace",
      lastName: "Hopper",
      title: "Recruiter",
      personaId: persona.id,
      confirmRole: true,
    });
    contactId = ada.contactId;
    otherContactId = grace.contactId;
    const stage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-03-01T15:00:00.000Z"),
      format: "VIDEO",
      interviewerContactIds: [contactId],
    });
    stageId = stage.id;
    const shared = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "HIRING_MANAGER",
      scheduledAt: new Date("2026-04-02T16:30:00.000Z"),
      format: "PHONE",
      interviewerContactIds: [contactId],
    });
    sharedStageId = shared.id;
    await prisma.interviewStageInterviewer.create({
      data: { organizationId, stageId: sharedStageId, contactId: otherContactId },
    });
    const consultation = await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId,
        productId: product.id,
        promptVersion: "test",
        briefingJson: {
          overall: "You are close on the core work.",
          strongestAngles: ["Delivery", "Customers"],
          importantGaps: ["Domain depth"],
          storyPlan: [],
        },
      },
    });
    await prisma.consultationAssessment.create({
      data: {
        organizationId,
        sessionId: consultation.id,
        targetKey: "required:forecast",
        kind: "REQUIRED",
        text: "Own the forecast",
        strength: "PARTIAL",
        supportingFactIds: [],
      },
    });
  }, 60_000);

  afterAll(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("saves notes and removing an interview without a learnings reassess or a paid call", async () => {
    if (!hasTestDatabase()) return;
    enqueue.mockClear();
    paidCall.mockClear();

    const stageNotes = await updateInterviewStageAction(null, formData({
      campaignId,
      stageId,
      notesBefore: "Ask about the team.",
    }));
    expect(stageNotes.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();

    const cheatSheet = await addCheatSheetInterviewNoteAction(null, formData({
      campaignId,
      stageId,
      contactId,
      note: "They care about forecast hygiene.",
    }));
    expect(cheatSheet.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();

    enqueue.mockClear();
    await saveApplicationJobLearnedNotes({
      organizationId,
      campaignId,
      userId,
      notes: "The role wants security sales.",
    });
    expect(paidCall).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();

    enqueue.mockClear();
    paidCall.mockClear();
    const removed = await removeInterviewAction(null, formData({
      campaignId,
      stageId: sharedStageId,
      contactId,
    }));
    expect(removed.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();

    const storedStage = await prisma.interviewStage.findUniqueOrThrow({ where: { id: stageId } });
    expect(storedStage.notesBefore).toBe("Ask about the team.");
    const membership = await prisma.campaignContact.findFirstOrThrow({
      where: { campaignId, contactId },
    });
    const savedNotes = parseCheatSheetNotes(membership.cheatSheetNotesJson);
    expect(savedNotes.map((note) => note.text)).toContain("They care about forecast hygiene.");
    const requirement = await prisma.jobRequirement.findUniqueOrThrow({ where: { campaignId } });
    expect(requirement.seekerLearnedNotes).toBe("The role wants security sales.");
    expect(await prisma.interviewStage.findUnique({ where: { id: sharedStageId } })).not.toBeNull();
    const remaining = await prisma.interviewStageInterviewer.findMany({
      where: { stageId: sharedStageId },
    });
    expect(remaining.map((row) => row.contactId)).toEqual([otherContactId]);

    const stages = await listInterviewStages({ organizationId, campaignId });
    const personNotes = compileNotesFromInterviewsWithPerson({
      contactId,
      gainedNotes: savedNotes,
      stages: stages.map((stage) => ({
        id: stage.id,
        type: stage.type,
        scheduledAt: stage.scheduledAt,
        notesBefore: stage.notesBefore,
        notesAfter: stage.notesAfter,
        interviewerContactIds: stage.interviewers.map((row) => row.contactId),
      })),
    });
    expect(personNotes.map((note) => note.text)).toContain("They care about forecast hygiene.");
    expect(personNotes.map((note) => note.text)).toContain("Ask about the team.");
  });

  it("renders Interview Notes after General Questions, once, newest first, including under a person filter", async () => {
    if (!hasTestDatabase()) return;
    enqueue.mockClear();
    paidCall.mockClear();
    const stages = await listInterviewStages({ organizationId, campaignId });
    const memberships = await prisma.campaignContact.findMany({
      where: { campaignId },
      include: { contact: true },
    });
    const people = memberships.map((row) => ({
      contactId: row.contactId,
      name: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" "),
      notes: parseCheatSheetNotes(row.cheatSheetNotesJson),
    }));
    const notes = compileApplicationInterviewNotes({
      people,
      stages: stages.map((stage) => ({
        id: stage.id,
        type: stage.type,
        scheduledAt: stage.scheduledAt,
        notesBefore: stage.notesBefore,
        notesAfter: stage.notesAfter,
        interviewerNames: stage.interviewers.map((row) =>
          [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" "),
        ),
      })),
    });
    const texts = notes.map((note) => note.text);
    expect(texts.filter((text) => text === "Ask about the team.")).toHaveLength(1);
    expect(texts.filter((text) => text === "They care about forecast hygiene.")).toHaveLength(1);
    const hygiene = notes.find((note) => note.text === "They care about forecast hygiene.");
    const prep = notes.find((note) => note.text === "Ask about the team.");
    expect(notes.indexOf(hygiene!)).toBeLessThan(notes.indexOf(prep!));
    expect(hygiene?.personName).toBe("Ada Lovelace");
    expect(hygiene?.interviewLabel).toContain("Recruiter");
    expect(hygiene?.atLabel).toMatch(/\d{4}/);
    expect(prep?.interviewLabel).toContain("Recruiter");

    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(page.indexOf("{group.people.map")).toBeLessThan(page.indexOf('id="general-questions"'));
    expect(page.indexOf('id="general-questions"')).toBeLessThan(page.indexOf('id="interview-notes"'));
    const printCss = readFileSync("src/app/globals.css", "utf8");
    expect(printCss).toContain(".application-summary .cheat-sheet-collapsible-body.hidden");

    window.history.pushState({}, "", "/campaigns/camp/summary#interview-notes");
    const adaKey = `contact:${contactId}`;
    const graceKey = `contact:${otherContactId}`;
    const filterOptions = [
      {
        sectionKey: adaKey,
        heading: "Ada Lovelace",
        personName: "Ada Lovelace",
        personaName: "Recruiter",
        titles: ["Recruiter"],
      },
      {
        sectionKey: graceKey,
        heading: "Grace Hopper",
        personName: "Grace Hopper",
        personaName: "Recruiter",
        titles: ["Recruiter"],
      },
    ];
    const Filter = CheatSheetFilterProvider as ComponentType<{
      options: typeof filterOptions;
      initialPersonKey: string | null;
    }>;
    const PersonSection = CheatSheetPersonSection as ComponentType<{ sectionKey: string }>;
    await paint(
      root,
      createElement(
        Filter,
        { options: filterOptions, initialPersonKey: null },
        createElement(
          "main",
          { className: "application-summary" },
          createElement(
            CheatSheetSection,
            { id: "general-questions", title: "General Questions" },
            "General question text",
          ),
          createElement(
            CheatSheetSection,
            {
              id: "interview-notes",
              title: applicationSummaryConfig.sections.interviewNotes,
            },
            createElement(CheatSheetInterviewNotes, { notes }),
          ),
          createElement(
            PersonSection,
            { sectionKey: adaKey },
            createElement(CheatSheetPersonBody, {
              campaignId,
              canEdit: false,
              sectionKey: adaKey,
              section: null,
              notes: people.find((person) => person.contactId === contactId)?.notes ?? [],
              personaBuilt: false,
              personaId: "role",
              interviewNotes: compileNotesFromInterviewsWithPerson({
                contactId,
                gainedNotes: people.find((person) => person.contactId === contactId)?.notes ?? [],
                stages: stages.map((stage) => ({
                  id: stage.id,
                  type: stage.type,
                  scheduledAt: stage.scheduledAt,
                  notesBefore: stage.notesBefore,
                  notesAfter: stage.notesAfter,
                  interviewerContactIds: stage.interviewers.map((row) => row.contactId),
                })),
              }),
              interviewNotesPersonName: "Ada Lovelace",
            }),
          ),
          createElement(
            PersonSection,
            { sectionKey: graceKey },
            createElement(
              CheatSheetSection,
              { id: graceKey, title: "Grace Hopper" },
              "Grace section",
            ),
          ),
        ),
      ),
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    const general = host.querySelector("#general-questions");
    const interviewNotes = host.querySelector("#interview-notes");
    expect(general).not.toBeNull();
    expect(interviewNotes).not.toBeNull();
    expect(general!.compareDocumentPosition(interviewNotes!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(interviewNotes?.getAttribute("data-cheat-sheet-open")).toBe("true");
    expect(interviewNotes?.textContent).toContain("Interview Notes");
    expect(interviewNotes?.textContent).toContain("They care about forecast hygiene.");
    expect(interviewNotes?.textContent).toContain("Ada Lovelace");
    expect(interviewNotes?.querySelector("[data-testid=interview-notes-list] button")).toBeNull();
    expect(interviewNotes?.querySelector(".cheat-sheet-collapsible-body")).not.toBeNull();
    expect(host.textContent).toContain("Notes From Interviews With Ada Lovelace");
    expect(host.textContent).toContain("They care about forecast hygiene.");

    window.history.pushState({}, "", `/campaigns/camp/summary?person=${encodeURIComponent(adaKey)}`);
    await paint(
      root,
      createElement(
        Filter,
        { key: "ada-filter", options: filterOptions, initialPersonKey: adaKey },
        createElement(
          "main",
          { className: "application-summary" },
          createElement(CheatSheetSection, { id: "general-questions", title: "General Questions" }, "General"),
          createElement(
            CheatSheetSection,
            { id: "interview-notes", title: "Interview Notes" },
            createElement(CheatSheetInterviewNotes, { notes }),
          ),
          createElement(
            PersonSection,
            { sectionKey: graceKey },
            createElement("p", null, "Grace only"),
          ),
        ),
      ),
    );
    expect(host.querySelector("#interview-notes")).not.toBeNull();
    expect(host.textContent).not.toContain("Grace only");
    expect(host.querySelector("#interview-notes")?.getAttribute("data-cheat-sheet-open")).toBe("false");
  });

  it("renders Harper without interviewer sections and keeps the three standing sections", async () => {
    if (!hasTestDatabase()) return;
    enqueue.mockClear();
    paidCall.mockClear();
    const page = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await paint(root, page);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Where you stand");
    expect(host.textContent).toContain("Questions that need more information");
    expect(host.textContent).toContain("Best-practice");
    expect(host.querySelector("[data-testid=harper-people-filter]")).toBeNull();
    expect(host.querySelector("[data-testid=harper-person-view]")).toBeNull();
    expect(host.querySelector("[data-testid=harper-interviewer-section]")).toBeNull();
    expect(host.textContent).not.toContain("Add Interview Contact");
    expect(workspaceHarperContactHref(campaignId, contactId)).toContain("/summary");
    expect(workspaceHarperContactHref(campaignId, contactId)).toContain(
      encodeURIComponent(`contact:${contactId}`),
    );
    expect(workspaceHarperContactHref(campaignId, contactId)).not.toContain("harper-contact");
    expect(workspaceHarperContactHref(campaignId, contactId)).not.toContain("/consultation");
  });

  it("labels the saved outcome and the notes block with the exact copy", async () => {
    if (!hasTestDatabase()) return;
    enqueue.mockClear();
    paidCall.mockClear();
    const stages = await listInterviewStages({ organizationId, campaignId });
    const stage = stages.find((item) => item.id === stageId);
    expect(stage).toBeTruthy();
    const people = [
      {
        contactId,
        name: "Ada Lovelace",
        title: "Recruiter",
        personaId: null,
        personaName: "Recruiter",
      },
    ];
    const notes = new Map([
      [
        contactId,
        parseCheatSheetNotes(
          (
            await prisma.campaignContact.findFirstOrThrow({
              where: { campaignId, contactId },
            })
          ).cheatSheetNotesJson,
        ),
      ],
    ]);
    await paint(
      root,
      createElement(InterviewStagesList, {
        campaignId,
        canEdit: true,
        stages: stages.filter((item) => item.id === stageId),
        people,
        notesByContactId: notes,
        roles: [],
      }),
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    const interview = host.querySelector(`[data-testid=person-interview-${contactId}-${stageId}]`);
    expect(interview?.textContent).not.toContain("Saved outcome");
    expect(interview?.textContent).not.toContain("Save outcome");
    expect(interview?.textContent).toContain(interviewConfig.labels.interviewNotes);
    expect(interview?.textContent).not.toContain("Post Interview Notes");
    expect(interview?.textContent).not.toContain("Newly gained information");
    expect(interview?.textContent).toContain("They care about forecast hygiene.");
    expect(interview?.textContent).toContain("Save and Add Note to Interview Preparation Guides");
    const form = host.querySelector(
      `[data-testid=add-cheat-sheet-note-${stageId}-${contactId}]`,
    ) as HTMLFormElement;
    (form.querySelector("select[name=outcome]") as HTMLSelectElement).value = "ADVANCED";
    await act(async () => {
      form.requestSubmit();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (host.textContent?.includes("Outcome saved.")) break;
      }
    });
    expect(host.textContent).toContain("Outcome saved.");
    expect(
      (await prisma.interviewStage.findUniqueOrThrow({ where: { id: stageId } })).outcome,
    ).toBe("ADVANCED");
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
  });
});
