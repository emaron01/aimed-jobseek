import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import {
  addInterviewStageInterviewer,
  createInterviewStage,
  updateInterviewStage,
} from "@/lib/interview/stages";
import { addApplicationContact } from "@/lib/application/contacts";
import { hasTestDatabase } from "@/test/database";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Harper Batch D0 — remove unused notes-after gap check", () => {
  it("updateInterviewStageAction no longer offers a consultation gap from notes", () => {
    const action = src("src/app/actions/interview.ts");
    const updateFn = action.slice(
      action.indexOf("export async function updateInterviewStageAction"),
      action.indexOf("export async function addInterviewInterviewerAction"),
    );
    expect(updateFn).not.toContain("refreshConsultationOffer");
    expect(updateFn).not.toContain("detectInterviewNoteGap");
    expect(updateFn).not.toContain("consultationOfferJson");
    expect(action).not.toContain("refreshConsultationOffer");
    expect(updateFn).not.toContain("enqueueLearningsReassessIfChanged");
  });

  it("removes refreshConsultationOffer, detectInterviewNoteGap, and offer copy", () => {
    const stages = src("src/lib/interview/stages.ts");
    const interviewConfig = src("src/lib/product-config/interview.ts");

    expect(stages).not.toContain("detectInterviewNoteGap");
    expect(stages).not.toContain("consultationOfferJson");
    expect(interviewConfig).not.toContain("consultationOffer");

    expect(stages).toContain("enqueueInterviewerCheatSheetSection");
    expect(stages).toContain("notesTextChanged");
  });

  it("nothing in src reads consultationOfferJson", () => {
    const paths = [
      "src/app/actions/interview.ts",
      "src/lib/interview/stages.ts",
      "src/lib/product-config/interview.ts",
      "src/components/InterviewStagesSection.tsx",
      "src/components/InterviewStagePanel.tsx",
      "src/components/StageInterviewerSection.tsx",
    ];
    for (const path of paths) {
      expect(src(path)).not.toContain("consultationOfferJson");
    }
  });
});

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("Harper Batch D0 — notes save without consultationOfferJson", { timeout: 60_000 }, () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let stageId = "";
  let contactId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `harper-d0-${suffix}@example.test`,
      name: "Harper D0 Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
      },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Harper D0 ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    const recruiter = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        suggestionKey: "recruiter",
        name: "Recruiter",
        targetTitles: ["Recruiter"],
      },
    });
    const interviewer = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Casey",
      lastName: "Ng",
      title: "Recruiter",
      personaId: recruiter.id,
      confirmRole: true,
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: "Staff Nurse\nCity Hospital",
        title: "Staff Nurse",
        companyName: "City Hospital",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
    const stage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-10-01T15:00:00.000Z"),
      format: "VIDEO",
      interviewerContactIds: [interviewer.contactId],
    });
    stageId = stage.id;
    const added = await addInterviewStageInterviewer({
      organizationId,
      campaignId,
      userId,
      stageId,
      firstName: "Alex",
      lastName: "Lee",
      title: "Recruiter",
      email: `alex-d0-${suffix}@hospital.example`,
    });
    contactId = added.contactId;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("saves notes before/after without a person-section job, and enqueues consultation reassess", async () => {
    await prisma.applicationJob.deleteMany({
      where: {
        campaignId,
        type: { in: ["APPLICATION_SUMMARY", "CONSULTATION"] },
      },
    });

    const before = await updateInterviewStage({
      organizationId,
      campaignId,
      userId,
      stageId,
      notesBefore: "Prepare examples of bedside handoffs.",
    });
    expect(before.notesTextChanged).toBe(true);
    if (before.notesTextChanged) {
      await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "CONSULTATION",
        payload: { operation: "reassess" },
      });
    }

    const after = await updateInterviewStage({
      organizationId,
      campaignId,
      userId,
      stageId,
      notesAfter:
        "They asked about incident leadership and patient safety under pressure.",
    });
    expect(after.notesTextChanged).toBe(true);
    if (after.notesTextChanged) {
      await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "CONSULTATION",
        payload: { operation: "reassess" },
      });
    }

    const stage = await prisma.interviewStage.findUniqueOrThrow({
      where: { id: stageId },
    });
    expect(stage.notesBefore).toContain("bedside handoffs");
    expect(stage.notesAfter).toContain("incident leadership");
    expect(stage.consultationOfferJson).toBeNull();

    const cheatSheetJobs = await prisma.applicationJob.findMany({
      where: {
        campaignId,
        type: "APPLICATION_SUMMARY",
        targetId: `contact:${contactId}`,
      },
    });
    expect(cheatSheetJobs).toHaveLength(0);

    const consultationJobs = await prisma.applicationJob.findMany({
      where: { campaignId, type: "CONSULTATION" },
    });
    expect(consultationJobs.length).toBeGreaterThan(0);
    expect(
      consultationJobs.some((job) => {
        const payload = job.payload as {
          operation?: string;
          operations?: string[];
        } | null;
        return (
          payload?.operation === "reassess" ||
          payload?.operations?.includes("reassess") === true
        );
      }),
    ).toBe(true);
  });
});
