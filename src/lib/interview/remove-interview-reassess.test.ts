// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { removeInterviewAction, updateInterviewStageAction } from "@/app/actions/interview";
import { InterviewStagesList } from "@/components/InterviewStagesSection";
import { addApplicationContact } from "@/lib/application/contacts";
import { addCheatSheetInterviewNote } from "@/lib/application-summary/service";
import {
  enqueueLearningsReassessIfChanged,
  LEARNINGS_REASSESS_OPERATION,
  learningsFingerprint,
  learningsFingerprintWithStageIds,
  loadApplicationLearnings,
  recordLearningsReassessFingerprint,
} from "@/lib/consultation/learnings";
import { createInterviewStage } from "@/lib/interview/stages";
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

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const stageNotes = {
  seekerLearnedNotes: "They want security sales.",
  stages: [
    { id: "empty", notesBefore: null, notesAfter: "   " },
    { id: "noted", notesBefore: "Prep the forecast.", notesAfter: null },
    { id: "same-text", notesBefore: "Prep the forecast.", notesAfter: null },
  ],
  newlyGained: [
    {
      contactId: "c1",
      id: "n1",
      text: "Board asked about margin.",
      stageId: "noted",
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ],
};

describe("learnings fingerprint tracks learned text", () => {
  it("ignores stage ids, empty notes, and keeps a change when note text changes", () => {
    const hashed = learningsFingerprint(stageNotes);
    expect(hashed).toBe(
      learningsFingerprint({
        ...stageNotes,
        stages: [
          { id: "other-empty", notesBefore: null, notesAfter: null },
          { id: "renamed", notesBefore: "Prep the forecast.", notesAfter: null },
          { id: "renamed-too", notesBefore: "Prep the forecast.", notesAfter: null },
        ],
      }),
    );
    expect(hashed).not.toBe(
      learningsFingerprint({
        ...stageNotes,
        stages: stageNotes.stages.filter((stage) => stage.id !== "same-text"),
      }),
    );
    expect(hashed).not.toBe(
      learningsFingerprint({
        ...stageNotes,
        stages: stageNotes.stages.map((stage) =>
          stage.id === "noted" ? { ...stage, notesBefore: "Prep the forecast differently." } : stage,
        ),
      }),
    );
    expect(hashed).not.toBe(
      learningsFingerprint({
        ...stageNotes,
        seekerLearnedNotes: "They want security sales and hygiene.",
      }),
    );
    expect(hashed).not.toBe(
      learningsFingerprint({
        ...stageNotes,
        newlyGained: stageNotes.newlyGained.map((note) => ({ ...note, text: "A different fact." })),
      }),
    );
    expect(learningsFingerprintWithStageIds(stageNotes)).not.toBe(
      learningsFingerprintWithStageIds({
        ...stageNotes,
        stages: stageNotes.stages.map((stage) =>
          stage.id === "empty" ? { ...stage, id: "empty-2" } : stage,
        ),
      }),
    );
  });
});

describe("interview rendering makes no paid call", () => {
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

  it("renders the interview list without enqueueing a job or calling the provider", async () => {
    enqueue.mockClear();
    paidCall.mockClear();
    await act(async () => {
      root.render(
        createElement(InterviewStagesList, {
          campaignId: "camp",
          canEdit: true,
          roles: [],
          people: [],
          notesByContactId: new Map(),
          stages: [
            {
              id: "empty-stage",
              type: "OTHER" as InterviewStageType,
              format: "VIDEO" as InterviewFormat,
              scheduledAt: new Date("2026-06-01T15:00:00.000Z"),
              outcome: null as InterviewStageOutcome | null,
              notesBefore: null,
              notesAfter: null,
              expectedDecisionAt: null,
              interviewers: [],
            },
          ],
        }),
      );
    });
    expect(host.textContent).toContain("Not linked to anyone");
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasTestDatabase())("remove interview reassess against postgres", { timeout: 120_000 }, () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(16).slice(2)}`;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let contactA = "";
  let contactB = "";
  let sharedId = "";
  let notedId = "";
  let emptyId = "";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `[TEST] Remove reassess ${suffix}`, slug: `remove-reassess-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `remove-reassess-${suffix}@example.test`,
        emailNormalized: `remove-reassess-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Remove reassess ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Remove reassess ${suffix}`,
        productId: product.id,
        icpId: icp.id,
        applicationProgress: "APPLIED",
      },
    });
    campaignId = campaign.id;
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: "Engineer posting",
        scorecardJson: {},
        seekerLearnedNotes: "They want security sales.",
      },
    });
    session.userId = userId;
    session.organizationId = organizationId;
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
    const first = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Priya",
      lastName: "Shah",
      title: "Recruiter",
      personaId: persona.id,
      confirmRole: true,
    });
    const second = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Jordan",
      lastName: "Lee",
      title: "Recruiter",
      personaId: persona.id,
      confirmRole: true,
    });
    contactA = first.contactId;
    contactB = second.contactId;
    const shared = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "PANEL_COMPETENCY",
      scheduledAt: new Date("2026-08-01T15:00:00.000Z"),
      format: "ONSITE",
      interviewerContactIds: [contactA],
    });
    sharedId = shared.id;
    await prisma.interviewStageInterviewer.create({
      data: { organizationId, stageId: sharedId, contactId: contactB },
    });
    await prisma.interviewStage.update({
      where: { id: sharedId },
      data: { notesBefore: "Shared prep.", notesAfter: "Shared debrief." },
    });
    const noted = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "HIRING_MANAGER",
      scheduledAt: new Date("2026-09-01T15:00:00.000Z"),
      format: "VIDEO",
      interviewerContactIds: [contactA],
    });
    notedId = noted.id;
    await prisma.interviewStage.update({
      where: { id: notedId },
      data: { notesBefore: "Priya prep.", outcome: "ADVANCED" },
    });
    const latest = await prisma.interviewStage.aggregate({
      where: { campaignId },
      _max: { sortOrder: true },
    });
    const empty = await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        sortOrder: (latest._max.sortOrder ?? 0) + 1,
        type: "OTHER",
        scheduledAt: new Date("2026-06-01T15:00:00.000Z"),
        format: "PHONE",
      },
    });
    emptyId = empty.id;
    await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        sortOrder: (latest._max.sortOrder ?? 0) + 2,
        type: "OTHER",
        scheduledAt: new Date("2026-05-01T15:00:00.000Z"),
        format: "PHONE",
        notesBefore: "   ",
        notesAfter: "",
      },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("enqueues a learnings reassess only when learned text changed", async () => {
    const blank = await prisma.interviewStage.findFirstOrThrow({
      where: { campaignId, notesBefore: "   " },
    });
    enqueue.mockClear();
    paidCall.mockClear();
    const removedBlank = await removeInterviewAction(null, formData({
      campaignId,
      stageId: blank.id,
    }));
    expect(removedBlank.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    expect(
      await prisma.paidCallReceipt.findUnique({
        where: {
          organizationId_operation_subjectKey: {
            organizationId,
            operation: LEARNINGS_REASSESS_OPERATION,
            subjectKey: campaignId,
          },
        },
      }),
    ).toBeNull();

    const current = await loadApplicationLearnings(organizationId, campaignId);
    await prisma.paidCallReceipt.create({
      data: {
        organizationId,
        operation: LEARNINGS_REASSESS_OPERATION,
        subjectKey: campaignId,
        inputHash: learningsFingerprintWithStageIds(current),
        resultJson: { recordedAt: "2026-09-01T00:00:00.000Z" },
      },
    });
    enqueue.mockClear();
    expect(
      await enqueueLearningsReassessIfChanged({ organizationId, campaignId, userId }),
    ).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();

    await prisma.jobRequirement.update({
      where: { campaignId },
      data: { seekerLearnedNotes: "They want security sales and hygiene." },
    });
    expect(
      await enqueueLearningsReassessIfChanged({ organizationId, campaignId, userId }),
    ).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CONSULTATION", targetId: "reassess", campaignId }),
    );
    await prisma.jobRequirement.update({
      where: { campaignId },
      data: { seekerLearnedNotes: "They want security sales." },
    });
    enqueue.mockClear();
    expect(
      await enqueueLearningsReassessIfChanged({ organizationId, campaignId, userId }),
    ).toBe(false);

    const outcomeOnly = await updateInterviewStageAction(null, formData({
      campaignId,
      stageId: notedId,
      outcome: "ADVANCED",
    }));
    expect(outcomeOnly.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();

    const notesChanged = await updateInterviewStageAction(null, formData({
      campaignId,
      stageId: notedId,
      notesBefore: "Priya prep revised.",
    }));
    expect(notesChanged.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    await recordLearningsReassessFingerprint({ organizationId, campaignId });
    enqueue.mockClear();
    expect(
      await enqueueLearningsReassessIfChanged({ organizationId, campaignId, userId }),
    ).toBe(false);

    await addCheatSheetInterviewNote({
      organizationId,
      campaignId,
      userId,
      contactId: contactA,
      stageId: notedId,
      text: "Priya gained this.",
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    await recordLearningsReassessFingerprint({ organizationId, campaignId });
    enqueue.mockClear();
    expect(
      await enqueueLearningsReassessIfChanged({ organizationId, campaignId, userId }),
    ).toBe(false);

    const unlink = await removeInterviewAction(null, formData({
      campaignId,
      stageId: sharedId,
      contactId: contactB,
    }));
    expect(unlink.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    const sharedAfter = await prisma.interviewStage.findUniqueOrThrow({
      where: { id: sharedId },
      include: { interviewers: true },
    });
    expect(sharedAfter.notesBefore).toBe("Shared prep.");
    expect(sharedAfter.interviewers.map((row) => row.contactId)).toEqual([contactA]);

    const removedEmpty = await removeInterviewAction(null, formData({
      campaignId,
      stageId: emptyId,
    }));
    expect(removedEmpty.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    expect(
      await enqueueLearningsReassessIfChanged({ organizationId, campaignId, userId }),
    ).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();

    const removedNoted = await removeInterviewAction(null, formData({
      campaignId,
      stageId: notedId,
      contactId: contactA,
    }));
    expect(removedNoted.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(paidCall).not.toHaveBeenCalled();
    expect(await prisma.interviewStage.findUnique({ where: { id: notedId } })).toBeNull();
  });
});
