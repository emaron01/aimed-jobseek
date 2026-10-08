// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { removeInterviewAction } from "@/app/actions/interview";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import { InterviewStagesList } from "@/components/InterviewStagesSection";
import { addApplicationContact } from "@/lib/application/contacts";
import {
  resolveApplicationStepState,
  type ApplicationStepFactInput,
} from "@/lib/application/step-progress";
import { compileNotesFromInterviewsWithPerson } from "@/lib/application-summary/interview-notes";
import { appendCheatSheetNote, parseCheatSheetNotes } from "@/lib/application-summary/notes";
import { getDueApplicationReminders } from "@/lib/cadence/application-reminders";
import { recordLearningsReassessFingerprint } from "@/lib/consultation/learnings";
import { createInterviewStage, listInterviewStages } from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import * as jobs from "@/lib/application-jobs/service";
import * as paid from "@/lib/ai/paid-call-gate";
import type { InterviewFormat, InterviewStageOutcome, InterviewStageType } from "@prisma/client";

const session = vi.hoisted(() => ({ userId: "", organizationId: "" }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/campaigns/camp/interviews",
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

const sharedPersona = { personaId: "role-shared", personaName: "Recruiter" };

const priya: Person = {
  contactId: "priya",
  name: "Priya Shah",
  title: "Recruiter",
  ...sharedPersona,
};

const jordan: Person = {
  contactId: "jordan",
  name: "Jordan Lee",
  title: "Recruiter",
  ...sharedPersona,
};

const sam: Person = {
  contactId: "sam",
  name: "Sam Ortiz",
  title: "Hiring manager",
  personaId: "role-hm",
  personaName: "Hiring manager",
};

function interviewer(person: Person, id: string) {
  const [firstName, lastName] = person.name.split(" ");
  return {
    id,
    contactId: person.contactId,
    contact: { firstName: firstName ?? null, lastName: lastName ?? null, title: person.title },
  };
}

function stage(overrides: Partial<Stage> & Pick<Stage, "id" | "scheduledAt" | "interviewers">): Stage {
  return {
    type: "HIRING_MANAGER",
    format: "VIDEO",
    outcome: null,
    notesBefore: null,
    notesAfter: null,
    expectedDecisionAt: null,
    ...overrides,
  };
}

function facts(interviewStageCount: number): ApplicationStepFactInput {
  return {
    researchDone: false,
    researchFailed: false,
    researchInProgress: false,
    hasJobTitle: false,
    jobReprocessing: false,
    hiringTeamRoleCount: 0,
    hiringTeamBuiltCount: 0,
    hasResumeVersion: false,
    latestResumeApproved: false,
    hasUnapprovedAssetDraft: false,
    latestResumeVersion: null,
    latestCoverLetterVersion: null,
    latestAssetKind: null,
    hasApprovedResume: false,
    hasApprovedCoverLetter: false,
    contactCount: 1,
    latestOutreachContactName: null,
    outreachMessageCount: 0,
    interviewStageCount,
    cheatSheetReady: false,
    appliedAt: null,
    consultationStarted: false,
    consultationComplete: false,
    consultationUnanswered: false,
    consultationUnansweredCount: 0,
    consultationFirstUnansweredTurnId: null,
    interviewersWithoutGuideCount: 0,
    firstInterviewerWithoutGuideId: null,
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

describe("interview page organized by person", () => {
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

  it("lists each person once, newest first, with their interviews and stored notes", async () => {
    expect(interviewConfig.labels.addSomeoneYoureMeeting).toBe("Add someone you're meeting");
    expect(interviewConfig.labels.addAnotherInterview).toBe("Add another interview");
    expect(interviewConfig.labels.notLinkedToAnyone).toBe("Not linked to anyone");
    expect(interviewConfig.labels.removeInterviewConfirmPlain).toBe(
      "Remove this interview? This can't be undone.",
    );
    expect(interviewConfig.labels.removeInterviewConfirmWithNotes).toBe(
      "Remove this interview? Notes saved on this interview will be deleted. Notes saved for this person and any messages you created stay.",
    );
    enqueue.mockClear();
    paidCall.mockClear();
    const shared = stage({
      id: "shared",
      type: "PANEL_COMPETENCY",
      format: "ONSITE",
      scheduledAt: new Date("2026-08-01T15:00:00.000Z"),
      notesBefore: "Shared prep.",
      notesAfter: "Shared debrief.",
      expectedDecisionAt: new Date("2026-08-20T00:00:00.000Z"),
      interviewers: [interviewer(priya, "link-priya"), interviewer(jordan, "link-jordan")],
    });
    const priyaLatest = stage({
      id: "priya-latest",
      type: "RECRUITER_SCREEN",
      format: "PHONE",
      scheduledAt: new Date("2026-10-05T15:00:00.000Z"),
      outcome: "ADVANCED",
      notesBefore: "Priya prep.",
      interviewers: [interviewer(priya, "link-priya-2")],
    });
    const jordanMiddle = stage({
      id: "jordan-middle",
      scheduledAt: new Date("2026-09-01T15:00:00.000Z"),
      notesAfter: "Jordan debrief.",
      interviewers: [interviewer(jordan, "link-jordan-2")],
    });
    const samOnly = stage({
      id: "sam-only",
      type: "EXECUTIVE",
      format: "VIDEO",
      scheduledAt: new Date("2026-07-01T15:00:00.000Z"),
      interviewers: [interviewer(sam, "link-sam")],
    });
    const unlinked = stage({
      id: "unlinked",
      scheduledAt: new Date("2026-06-01T15:00:00.000Z"),
      notesBefore: "Unlinked prep.",
      expectedDecisionAt: new Date("2026-06-20T00:00:00.000Z"),
      interviewers: [],
    });
    const notes = new Map([
      [
        priya.contactId,
        appendCheatSheetNote({
          existing: [],
          text: "Priya gained this.",
          stageId: "priya-latest",
        }).concat(
          appendCheatSheetNote({
            existing: [],
            text: "Priya note on the shared interview.",
            stageId: "shared",
          }),
        ),
      ],
      [
        jordan.contactId,
        appendCheatSheetNote({
          existing: [],
          text: "Jordan gained this.",
          stageId: "jordan-middle",
        }),
      ],
    ]);

    await paint(
      root,
      createElement(InterviewStagesList, {
        campaignId: "camp",
        canEdit: true,
        roles: [{ id: "role-shared", name: "Recruiter", suggestionKey: "recruiter" }],
        people: [priya, jordan, sam],
        notesByContactId: notes,
        stages: [unlinked, jordanMiddle, shared, samOnly, priyaLatest],
      }),
    );

    expect(host.querySelector("[data-testid=stage-create-start]")?.textContent).toBe(
      "Add someone you're meeting",
    );
    await click(host, "[data-testid=add-someone-youre-meeting-toggle]");
    const createForm = host.querySelector("[data-testid=add-interview-stage]");
    const contactSelect = host.querySelector("[data-testid=add-someone-youre-meeting] select[name=contactId]");
    expect(contactSelect?.hasAttribute("required")).toBe(true);
    expect(createForm?.textContent).toContain("Type");
    expect(createForm?.textContent).toContain("Date and time");
    const format = createForm?.querySelector("select[name=format]") as HTMLSelectElement;
    expect(format.required).toBe(true);
    expect(format.value).toBe("VIDEO");
    expect(host.querySelector("[data-testid^=interview-stage-]") ).toBeNull();

    const sections = [...host.querySelectorAll("[data-testid^=person-section-][data-open]")];
    expect(sections.map((node) => node.getAttribute("data-testid"))).toEqual([
      "person-section-priya",
      "person-section-jordan",
      "person-section-sam",
    ]);
    expect(sections[0]?.getAttribute("data-open")).toBe("false");
    expect(sections[1]?.getAttribute("data-open")).toBe("false");
    expect(sections[2]?.getAttribute("data-open")).toBe("true");
    expect(sections[0]?.textContent).toContain("Priya Shah");
    expect(sections[1]?.textContent).toContain("Jordan Lee");
    expect(sections[0]?.textContent).toContain("Recruiter");
    expect(sections[1]?.textContent).toContain("Recruiter");
    expect(sections[0]?.querySelector("[data-testid=harper-contact-link-priya]")?.getAttribute("href")).toContain(
      "/summary",
    );
    expect(sections[1]?.querySelector("[data-testid=harper-contact-link-jordan]")?.getAttribute("href")).toContain(
      "/summary",
    );

    await click(host, "[data-testid=person-section-priya-toggle]");
    await click(host, "[data-testid=person-section-jordan-toggle]");

    const priyaSection = host.querySelector("[data-testid=person-section-priya]");
    const jordanSection = host.querySelector("[data-testid=person-section-jordan]");
    const priyaInterviews = [...(priyaSection?.querySelectorAll("[data-testid^=person-interview-priya-]") ?? [])];
    const jordanInterviews = [...(jordanSection?.querySelectorAll("[data-testid^=person-interview-jordan-]") ?? [])];
    expect(priyaInterviews.map((node) => node.getAttribute("data-testid"))).toEqual([
      "person-interview-priya-priya-latest",
      "person-interview-priya-shared",
    ]);
    expect(jordanInterviews.map((node) => node.getAttribute("data-testid"))).toEqual([
      "person-interview-jordan-jordan-middle",
      "person-interview-jordan-shared",
    ]);
    expect(host.querySelectorAll("[data-testid=person-interview-priya-shared]")).toHaveLength(1);
    expect(host.querySelectorAll("[data-testid=person-interview-jordan-shared]")).toHaveLength(1);

    const priyaLatestNode = host.querySelector("[data-testid=person-interview-priya-priya-latest]");
    expect(priyaLatestNode?.textContent).toContain("Recruiter screen");
    expect(priyaLatestNode?.textContent).toContain("Phone");
    expect(priyaLatestNode?.textContent).toContain("Date and time");
    expect(priyaLatestNode?.textContent).toContain("Outcome");
    expect(priyaLatestNode?.textContent).toContain("Advanced");
    expect(priyaLatestNode?.querySelector("[name=outcome]")).not.toBeNull();
    expect(priyaLatestNode?.textContent).toContain("Save outcome");
    expect(priyaLatestNode?.textContent).toContain("Interview Notes");
    expect(priyaLatestNode?.textContent).not.toContain("Newly gained information");
    expect(priyaLatestNode?.textContent).toContain("Notes before");
    expect(priyaLatestNode?.textContent).toContain("Priya prep.");
    expect(priyaLatestNode?.textContent).toContain("Priya gained this.");
    expect(priyaLatestNode?.textContent).not.toContain("Jordan gained this.");
    expect(priyaLatestNode?.textContent).toContain("Remove");

    const priyaShared = host.querySelector("[data-testid=person-interview-priya-shared]");
    const jordanShared = host.querySelector("[data-testid=person-interview-jordan-shared]");
    expect(priyaShared?.textContent).toContain("Shared prep.");
    expect(priyaShared?.textContent).toContain("Shared debrief.");
    expect(priyaShared?.textContent).toContain("Expected decision date (saved earlier)");
    expect(priyaShared?.textContent).toContain("Priya note on the shared interview.");
    expect(jordanShared?.textContent).toContain("Shared prep.");
    expect(jordanShared?.textContent).toContain("Shared debrief.");
    expect(jordanShared?.textContent).not.toContain("Priya note on the shared interview.");
    expect(jordanShared?.textContent).not.toContain("Priya gained this.");
    expect(priyaSection?.textContent).not.toContain("Jordan gained this.");
    expect(host.querySelector("[data-testid=person-interview-jordan-jordan-middle]")?.textContent).toContain(
      "Jordan gained this.",
    );

    await click(host, "[data-testid=add-follow-up-sam-toggle]");
    const another = host.querySelector("[data-testid=add-another-interview-sam]") as HTMLFormElement;
    expect(another?.textContent).toContain("Add follow-up interview");
    expect((another.querySelector("[name=contactId]") as HTMLInputElement).value).toBe("sam");
    expect(another.querySelector("[name=contactId]")?.getAttribute("type")).toBe("hidden");
    expect((another.querySelector("select[name=format]") as HTMLSelectElement).required).toBe(true);
    expect(another.textContent).toContain("Type");
    expect(another.textContent).toContain("Date and time");

    const unlinkedNode = host.querySelector("[data-testid=unlinked-interview-unlinked]");
    expect(host.querySelector("[data-testid=interviews-not-linked]")?.textContent).toContain(
      "Not linked to anyone",
    );
    expect(unlinkedNode?.textContent).toContain("Unlinked prep.");
    expect(unlinkedNode?.textContent).toContain("Expected decision date (saved earlier)");
    expect(unlinkedNode?.querySelector("[name=outcome]")).not.toBeNull();
    expect(unlinkedNode?.textContent).toContain("Remove");
    expect(host.querySelectorAll("[data-testid=stored-notes-before-unlinked-stage]")).toHaveLength(1);

    await click(host, "[data-testid=remove-interview-sam-only-sam]");
    expect(host.querySelector("[data-testid=remove-interview-sam-only-sam-message]")?.textContent).toBe(
      "Remove this interview? This can't be undone.",
    );
    await click(host, "[data-testid=remove-interview-sam-only-sam-cancel]");
    expect(host.querySelector("[data-testid=remove-interview-sam-only-sam-message]")).toBeNull();
    expect(host.querySelector("[data-testid=person-interview-sam-sam-only]")).not.toBeNull();

    await click(host, "[data-testid=remove-interview-shared-priya]");
    expect(host.querySelector("[data-testid=remove-interview-shared-priya-message]")?.textContent).toBe(
      "Remove this interview? Notes saved on this interview will be deleted. Notes saved for this person and any messages you created stay.",
    );
    await click(host, "[data-testid=remove-interview-shared-priya-cancel]");
    expect(host.querySelector("[data-testid=person-interview-priya-shared]")).not.toBeNull();
    expect(host.querySelector("[data-testid=person-interview-jordan-shared]")).not.toBeNull();

    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    expect(readFileSync("src/components/InterviewStagesSection.tsx", "utf8")).not.toContain(
      "enqueueApplicationJob",
    );
    expect(readFileSync("src/components/ApplicationSidebarTracker.tsx", "utf8")).toContain(
      'return "bg-success text-on-ink"',
    );
  });
});

describe.skipIf(!hasTestDatabase())("remove interview against postgres", { timeout: 120_000 }, () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(16).slice(2)}`;
  let organizationId = "";
  let userId = "";
  let otherOrganizationId = "";
  let otherUserId = "";
  let campaignId = "";
  let productId = "";
  let priyaId = "";
  let jordanId = "";
  let samId = "";
  let sharedId = "";
  let priyaStageId = "";
  let jordanStageId = "";
  let samStageId = "";
  let unlinkedNotesId = "";
  let unlinkedEmptyId = "";
  let assetId = "";
  let turnId = "";
  let root: Root;
  let host: HTMLDivElement;

  beforeAll(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const org = await prisma.organization.create({
      data: { name: `[TEST] Notes by person ${suffix}`, slug: `notes-person-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `notes-person-${suffix}@example.test`,
        emailNormalized: `notes-person-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const otherOrg = await prisma.organization.create({
      data: { name: `[TEST] Notes other ${suffix}`, slug: `notes-other-${suffix}` },
    });
    otherOrganizationId = otherOrg.id;
    const otherUser = await prisma.user.create({
      data: {
        email: `notes-other-${suffix}@example.test`,
        emailNormalized: `notes-other-${suffix}@example.test`,
      },
    });
    otherUserId = otherUser.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Notes ${suffix}` },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Notes ${suffix}`,
        productId,
        icpId: icp.id,
        applicationProgress: "APPLIED",
        appliedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    campaignId = campaign.id;
    session.userId = userId;
    session.organizationId = organizationId;

    const persona = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId,
        name: "Recruiter",
        suggestionKey: "recruiter",
        targetTitles: ["Recruiter"],
      },
    });
    const hiring = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId,
        name: "Hiring manager",
        suggestionKey: "hiring_manager",
        targetTitles: ["Hiring manager"],
      },
    });
    const priyaContact = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Priya",
      lastName: "Shah",
      title: "Recruiter",
      personaId: persona.id,
      confirmRole: true,
    });
    const jordanContact = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Jordan",
      lastName: "Lee",
      title: "Recruiter",
      personaId: persona.id,
      confirmRole: true,
    });
    const samContact = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Sam",
      lastName: "Ortiz",
      title: "Hiring manager",
      personaId: hiring.id,
      confirmRole: true,
    });
    priyaId = priyaContact.contactId;
    jordanId = jordanContact.contactId;
    samId = samContact.contactId;

    const shared = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "PANEL_COMPETENCY",
      scheduledAt: new Date("2026-08-01T15:00:00.000Z"),
      format: "ONSITE",
      interviewerContactIds: [priyaId],
    });
    sharedId = shared.id;
    await prisma.interviewStageInterviewer.create({
      data: { organizationId, stageId: sharedId, contactId: jordanId },
    });
    await prisma.interviewStage.update({
      where: { id: sharedId },
      data: {
        notesBefore: "Shared prep.",
        notesAfter: "Shared debrief.",
        expectedDecisionAt: new Date("2026-08-20T00:00:00.000Z"),
      },
    });

    const priyaStage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-01-15T15:00:00.000Z"),
      format: "PHONE",
      interviewerContactIds: [priyaId],
    });
    priyaStageId = priyaStage.id;
    await prisma.interviewStage.update({
      where: { id: priyaStageId },
      data: { notesBefore: "Priya prep.", notesAfter: "Priya debrief." },
    });
    const gained = appendCheatSheetNote({
      existing: [],
      text: "Priya gained this.",
      stageId: priyaStageId,
    });
    await prisma.campaignContact.update({
      where: { id: priyaContact.campaignContactId },
      data: {
        cheatSheetNotesJson: gained,
        personPrepStatus: "READY",
        personPrepOpening: "Prep stays.",
      },
    });
    await prisma.interviewStageGuide.create({
      data: {
        organizationId,
        stageId: priyaStageId,
        promptVersion: "test",
        status: "READY",
        contentJson: { sections: [] },
      },
    });
    const asset = await prisma.applicationAsset.create({
      data: {
        organizationId,
        campaignId,
        type: "EMAIL",
        contactId: priyaId,
        interviewStageId: priyaStageId,
        groupKey: `EMAIL:none:${priyaId}:THANK_YOU`,
        version: 1,
        contentJson: { subject: "Thank you Priya" },
        claimTraceJson: [],
        promptVersion: "test",
      },
    });
    assetId = asset.id;

    const jordanStage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "HIRING_MANAGER",
      scheduledAt: new Date("2026-09-01T15:00:00.000Z"),
      format: "VIDEO",
      interviewerContactIds: [jordanId],
    });
    jordanStageId = jordanStage.id;

    const samStage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "EXECUTIVE",
      scheduledAt: new Date("2026-11-01T16:00:00.000Z"),
      format: "VIDEO",
      interviewerContactIds: [samId],
    });
    samStageId = samStage.id;

    const latest = await prisma.interviewStage.aggregate({
      where: { campaignId },
      _max: { sortOrder: true },
    });
    const unlinkedNotes = await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        sortOrder: (latest._max.sortOrder ?? 0) + 1,
        type: "OTHER",
        scheduledAt: new Date("2026-06-01T15:00:00.000Z"),
        format: "PHONE",
        notesAfter: "Unlinked debrief.",
      },
    });
    unlinkedNotesId = unlinkedNotes.id;
    const unlinkedEmpty = await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        sortOrder: (latest._max.sortOrder ?? 0) + 2,
        type: "OTHER",
        scheduledAt: new Date("2026-05-01T15:00:00.000Z"),
        format: "VIDEO",
      },
    });
    unlinkedEmptyId = unlinkedEmpty.id;

    const consultation = await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId,
        productId,
        promptVersion: "test",
      },
    });
    const turn = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: consultation.id,
        sequence: 1,
        speaker: "SEEKER",
        body: "Harper answer stays.",
        seekerAuthored: true,
      },
    });
    turnId = turn.id;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { applicationProgress: "APPLIED" },
    });
  });

  afterAll(async () => {
    act(() => root.unmount());
    host.remove();
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (otherOrganizationId) {
      await prisma.organization.delete({ where: { id: otherOrganizationId } }).catch(() => undefined);
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });

  it("creates another interview for the same person and removes only what was confirmed", async () => {
    enqueue.mockClear();
    paidCall.mockClear();
    const sortBefore = await prisma.interviewStage.findMany({
      where: { campaignId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    const remindersBefore = await getDueApplicationReminders({
      organizationId,
      userId,
      now: new Date("2026-12-01T00:00:00.000Z"),
    });
    expect(
      remindersBefore.some(
        (row) => row.campaignId === campaignId && row.stageId === priyaStageId && row.kind === "INTERVIEW_THANK_YOU",
      ),
    ).toBe(true);

    const stages = await listInterviewStages({ organizationId, campaignId });
    const memberships = await prisma.campaignContact.findMany({
      where: { campaignId },
      select: { contactId: true, cheatSheetNotesJson: true },
    });
    const people = [
      { contactId: priyaId, name: "Priya Shah", title: "Recruiter", personaId: "shared", personaName: "Recruiter" },
      { contactId: jordanId, name: "Jordan Lee", title: "Recruiter", personaId: "shared", personaName: "Recruiter" },
      { contactId: samId, name: "Sam Ortiz", title: "Hiring manager", personaId: "hm", personaName: "Hiring manager" },
    ];
    const notesByContactId = new Map(
      memberships.map((row) => [row.contactId, parseCheatSheetNotes(row.cheatSheetNotesJson)]),
    );
    await paint(
      root,
      createElement(InterviewStagesList, {
        campaignId,
        canEdit: true,
        roles: [{ id: "role", name: "Recruiter", suggestionKey: "recruiter" }],
        people,
        stages,
        notesByContactId,
      }),
    );
    expect(host.querySelector("[data-testid=stage-create-start]")?.textContent).toBe(
      "Add someone you're meeting",
    );
    const personSections = [...host.querySelectorAll("[data-testid^=person-section-][data-open]")];
    expect(personSections.map((node) => node.getAttribute("data-testid"))).toEqual([
      `person-section-${samId}`,
      `person-section-${jordanId}`,
      `person-section-${priyaId}`,
    ]);

    await click(host, `[data-testid=add-follow-up-${samId}-toggle]`);
    const samForm = host.querySelector(
      `[data-testid=add-another-interview-${samId}]`,
    ) as HTMLFormElement;
    const when = samForm.querySelector("[name=scheduledAt]") as HTMLInputElement;
    const type = samForm.querySelector("select[name=type]") as HTMLSelectElement;
    when.value = "2026-12-02T18:30";
    type.value = "EXECUTIVE";
    await act(async () => {
      samForm.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const samStages = await prisma.interviewStage.findMany({
      where: { campaignId, interviewers: { some: { contactId: samId } } },
      include: { interviewers: true },
      orderBy: { scheduledAt: "asc" },
    });
    expect(samStages).toHaveLength(2);
    expect(samStages.every((row) => row.interviewers.every((link) => link.contactId === samId))).toBe(true);
    expect(samStages[1]?.type).toBe("EXECUTIVE");
    expect(samStages[1]?.notesBefore).toBeNull();
    expect(samStages[1]?.expectedDecisionAt).toBeNull();
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { applicationProgress: "APPLIED" },
    });

    await click(host, `[data-testid=remove-interview-${unlinkedEmptyId}-unlinked]`);
    expect(host.querySelector(`[data-testid=remove-interview-${unlinkedEmptyId}-unlinked-message]`)?.textContent).toBe(
      "Remove this interview? This can't be undone.",
    );
    await click(host, `[data-testid=remove-interview-${unlinkedEmptyId}-unlinked-cancel]`);
    expect(await prisma.interviewStage.findUnique({ where: { id: unlinkedEmptyId } })).not.toBeNull();

    await click(host, `[data-testid=person-section-${priyaId}-toggle]`);
    await click(host, `[data-testid=remove-interview-${priyaStageId}-${priyaId}]`);
    expect(
      host.querySelector(`[data-testid=remove-interview-${priyaStageId}-${priyaId}-message]`)?.textContent,
    ).toBe(
      "Remove this interview? Notes saved on this interview will be deleted. Notes saved for this person and any messages you created stay.",
    );
    await click(host, `[data-testid=remove-interview-${priyaStageId}-${priyaId}-cancel]`);
    expect(await prisma.interviewStage.findUnique({ where: { id: priyaStageId } })).not.toBeNull();

    await recordLearningsReassessFingerprint({ organizationId, campaignId });
    enqueue.mockClear();
    const unlink = await removeInterviewAction(null, formData({
      campaignId,
      stageId: sharedId,
      contactId: jordanId,
    }));
    expect(unlink.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    const sharedAfter = await prisma.interviewStage.findUniqueOrThrow({
      where: { id: sharedId },
      include: { interviewers: true },
    });
    expect(sharedAfter.notesBefore).toBe("Shared prep.");
    expect(sharedAfter.notesAfter).toBe("Shared debrief.");
    expect(sharedAfter.interviewers.map((row) => row.contactId)).toEqual([priyaId]);
    expect(sharedAfter.sortOrder).toBe(sortBefore.find((row) => row.id === sharedId)?.sortOrder);

    const removedEmpty = await removeInterviewAction(null, formData({
      campaignId,
      stageId: unlinkedEmptyId,
    }));
    expect(removedEmpty.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(await prisma.interviewStage.findUnique({ where: { id: unlinkedEmptyId } })).toBeNull();

    enqueue.mockClear();
    await recordLearningsReassessFingerprint({ organizationId, campaignId });
    const removedPriya = await removeInterviewAction(null, formData({
      campaignId,
      stageId: priyaStageId,
      contactId: priyaId,
    }));
    expect(removedPriya.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(await prisma.interviewStage.findUnique({ where: { id: priyaStageId } })).toBeNull();
    expect(await prisma.interviewStageGuide.findUnique({ where: { stageId: priyaStageId } })).toBeNull();
    expect(await prisma.interviewStageInterviewer.findMany({ where: { stageId: priyaStageId } })).toEqual([]);
    const message = await prisma.applicationAsset.findUniqueOrThrow({ where: { id: assetId } });
    expect(message.interviewStageId).toBeNull();
    expect(message.contentJson).toEqual({ subject: "Thank you Priya" });
    const priyaContact = await prisma.contact.findUniqueOrThrow({ where: { id: priyaId } });
    expect(priyaContact.firstName).toBe("Priya");
    const priyaMembership = await prisma.campaignContact.findFirstOrThrow({
      where: { campaignId, contactId: priyaId },
    });
    expect(priyaMembership.personPrepStatus).toBe("READY");
    expect(priyaMembership.personPrepOpening).toBe("Prep stays.");
    const keptNotes = parseCheatSheetNotes(priyaMembership.cheatSheetNotesJson);
    expect(keptNotes.map((note) => note.text)).toContain("Priya gained this.");
    expect(keptNotes.find((note) => note.text === "Priya gained this.")?.stageId).toBe(priyaStageId);
    const turn = await prisma.consultationTurn.findUniqueOrThrow({ where: { id: turnId } });
    expect(turn.body).toBe("Harper answer stays.");

    const remainingStages = await prisma.interviewStage.findMany({
      where: { campaignId },
      include: { interviewers: true },
    });
    const compiled = compileNotesFromInterviewsWithPerson({
      contactId: priyaId,
      gainedNotes: keptNotes,
      stages: remainingStages.map((row) => ({
        id: row.id,
        type: row.type,
        scheduledAt: row.scheduledAt,
        notesBefore: row.notesBefore,
        notesAfter: row.notesAfter,
        interviewerContactIds: row.interviewers.map((link) => link.contactId),
      })),
    });
    expect(compiled.map((entry) => entry.text)).toContain("Priya gained this.");
    expect(compiled.map((entry) => entry.text)).not.toContain("Priya prep.");
    await paint(
      root,
      createElement(CheatSheetPersonBody, {
        campaignId,
        canEdit: false,
        sectionKey: `contact:${priyaId}`,
        section: null,
        notes: keptNotes,
        personaBuilt: false,
        personaId: "role",
        interviewNotes: compiled,
        interviewNotesPersonName: "Priya Shah",
      }),
    );
    expect(host.textContent).toContain("Notes From Interviews With Priya Shah");
    expect(host.textContent).toContain("Priya gained this.");

    const removedUnlinkedNotes = await removeInterviewAction(null, formData({
      campaignId,
      stageId: unlinkedNotesId,
    }));
    expect(removedUnlinkedNotes.ok).toBe(true);
    expect(await prisma.interviewStage.findUnique({ where: { id: unlinkedNotesId } })).toBeNull();

    const sortAfter = await prisma.interviewStage.findMany({
      where: { campaignId },
      select: { id: true, sortOrder: true },
    });
    for (const row of sortAfter) {
      const before = sortBefore.find((item) => item.id === row.id);
      if (!before) continue;
      expect(row.sortOrder).toBe(before.sortOrder);
    }
    const progress = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(progress.applicationProgress).toBe("APPLIED");
    expect(await prisma.contact.count({ where: { id: { in: [priyaId, jordanId, samId] } } })).toBe(3);
    expect(await prisma.interviewStage.findUnique({ where: { id: jordanStageId } })).not.toBeNull();

    const remindersAfter = await getDueApplicationReminders({
      organizationId,
      userId,
      now: new Date("2026-12-01T00:00:00.000Z"),
    });
    expect(remindersAfter.some((row) => row.stageId === priyaStageId)).toBe(false);

    const countWhileOneRemains = await prisma.interviewStage.count({ where: { campaignId } });
    expect(countWhileOneRemains).toBeGreaterThan(0);
    expect(await prisma.interviewStage.findUnique({ where: { id: samStageId } })).not.toBeNull();
    expect(resolveApplicationStepState("interviews", facts(countWhileOneRemains), [])).toBe("done");

    session.organizationId = otherOrganizationId;
    session.userId = otherUserId;
    const denied = await removeInterviewAction(null, formData({
      campaignId,
      stageId: jordanStageId,
      contactId: jordanId,
    }));
    expect(denied.ok).toBe(false);
    expect(await prisma.interviewStage.findUnique({ where: { id: jordanStageId } })).not.toBeNull();
    session.organizationId = organizationId;
    session.userId = userId;

    const survivors = await prisma.interviewStage.findMany({ where: { campaignId }, select: { id: true } });
    for (const row of survivors) {
      await removeInterviewAction(null, formData({ campaignId, stageId: row.id, contactId: "" }));
    }
    const stillLinked = await prisma.interviewStage.findMany({
      where: { campaignId },
      include: { interviewers: true },
    });
    for (const row of stillLinked) {
      const contactId = row.interviewers[0]?.contactId;
      if (!contactId) continue;
      await removeInterviewAction(null, formData({ campaignId, stageId: row.id, contactId }));
    }
    expect(await prisma.interviewStage.count({ where: { campaignId } })).toBe(0);
    expect(resolveApplicationStepState("interviews", facts(0), [])).toBe("not_started");
    expect(paidCall).not.toHaveBeenCalled();
  });
});

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value) data.set(key, value);
  }
  return data;
}
