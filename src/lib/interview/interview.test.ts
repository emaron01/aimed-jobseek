import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addBusinessDays,
  checkInDueAt,
  thankYouDueAt,
} from "@/lib/cadence/application-reminders";
import { addApplicationContact } from "@/lib/application/contacts";
import { addCheatSheetInterviewNote } from "@/lib/application-summary/service";
import {
  addInterviewStageInterviewer,
  assignExistingInterviewStageInterviewer,
  createInterviewStage,
  updateInterviewStage,
} from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { redirectLineErrors, thankYouNotesErrors } from "@/lib/application-assets/outreach";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import { validateRepetitionAndMetaLanguage } from "@/lib/consultation/output-quality";

describe("interview thank-you and stages (guide removed)", () => {
  it("keeps thank-you note quality rules", () => {
    const notes = "The hiring manager will focus on incident leadership.";
    expect(
      thankYouNotesErrors({
        text: "Thank you for your time yesterday.",
        notes,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      thankYouNotesErrors({
        text: "I appreciated that the hiring manager will focus on incident leadership. Would a brief follow-up help?",
        notes,
      }),
    ).toEqual([]);
    expect(
      redirectLineErrors({
        text: "If you're not the right person, I'd appreciate a pointer to who is.",
        includeRedirect: false,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("computes thank-you and check-in timing and treats an outcome as cleared", () => {
    const scheduled = new Date("2026-10-01T15:00:00.000Z");
    const thankYou = thankYouDueAt(
      scheduled,
      interviewConfig.reminders.defaultThankYouHours,
    );
    expect(thankYou.toISOString()).toBe("2026-10-02T15:00:00.000Z");
    const withDecision = checkInDueAt({
      expectedDecisionAt: new Date("2026-10-08T00:00:00.000Z"),
      scheduledAt: scheduled,
      businessDays: interviewConfig.reminders.defaultCheckInBusinessDays,
    });
    expect(withDecision.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    const withoutDecision = checkInDueAt({
      expectedDecisionAt: null,
      scheduledAt: scheduled,
      businessDays: interviewConfig.reminders.defaultCheckInBusinessDays,
    });
    expect(withoutDecision.toISOString()).toBe(
      addBusinessDays(
        scheduled,
        interviewConfig.reminders.defaultCheckInBusinessDays,
      ).toISOString(),
    );
  });

  it("repetition quality helper still rejects repeated metrics in one field", () => {
    const repeatedInside =
      "Lead with the 2 production incidents. Repeat the 2 production incidents without adding information.";
    expect(
      validateRepetitionAndMetaLanguage({
        text: repeatedInside,
        field: "talkingPoints",
      }).some((issue) => issue.message.includes("repeated the same number")),
    ).toBe(true);
  });

  it("removes guide generation, view, parse, and action wiring", () => {
    expect(() => readFileSync("src/lib/interview/guide.ts", "utf8")).toThrow();
    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(process).toContain('case "INTERVIEW_GUIDE"');
    expect(process).not.toContain("requestInterviewGuide");
    expect(process).toContain("Guide generation was removed");
    const action = readFileSync("src/app/actions/interview.ts", "utf8");
    expect(action).not.toContain("generateInterviewGuideAction");
    expect(action).not.toContain('type: "INTERVIEW_GUIDE"');
    const ai = readFileSync("src/lib/interview/ai.ts", "utf8");
    expect(ai).toContain("generateInterviewThankYouClarifyingQuestions");
    expect(ai).not.toContain("generateInterviewGuideWithModel");
    expect(ai).not.toContain("generateInterviewClarifyingQuestions");
    const prompt = readFileSync("src/lib/interview/prompt.ts", "utf8");
    expect(prompt).toContain("buildInterviewThankYouClarifyingMessages");
    expect(prompt).not.toContain("buildInterviewGuideMessages");
    const schemas = readFileSync(
      "src/lib/ai/structured-output-schemas.ts",
      "utf8",
    );
    expect(schemas).toContain("interviewThankYouClarifyingQuestions");
    expect(schemas).not.toContain("interviewGuide:");
    expect(schemas).not.toContain("interviewClarifyingQuestions:");
    const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
    expect(prismaSchema).toContain("INTERVIEW_GUIDE");
    expect(prismaSchema).toContain("model InterviewStageGuide");
    for (const path of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/ConsultationSection.tsx",
      "src/components/HarperPersonView.tsx",
      "src/app/actions/interview.ts",
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toContain("getInterviewGuideView");
      expect(text).not.toContain("parseGuideContent");
      expect(text).not.toContain("generateInterviewGuideAction");
      expect(text).not.toContain("requestInterviewGuide");
    }
  });
});

describe.skipIf(!hasTestDatabase())("interview stages without guide", { timeout: 60_000 }, () => {
  const suffix = Date.now().toString(36);
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let recruiterRoleId = "";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `[TEST] Interview ${suffix}`,
        slug: `interview-${suffix}`,
      },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `interview-${suffix}@example.test`,
        emailNormalized: `interview-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Interview Product ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: {
        organizationId,
        productId: product.id,
        name: `Interview ICP ${suffix}`,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Interview App ${suffix}`,
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
        targetTitles: ["Recruiter", "Technical Recruiter"],
      },
    });
    recruiterRoleId = recruiter.id;
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: "Senior Product Engineer\nAcme Robotics",
        title: "Senior Product Engineer",
        companyName: "Acme Robotics",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("sets Interviewing on first stage and confirms interviewer roles", async () => {
    const stage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-10-01T15:00:00.000Z"),
      format: "VIDEO",
    });
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    expect(campaign?.applicationProgress).toBe("INTERVIEWING");
    const added = await addInterviewStageInterviewer({
      organizationId,
      campaignId,
      userId,
      stageId: stage.id,
      firstName: "Priya",
      lastName: "Shah",
      title: "Technical Recruiter",
      email: `priya-int-${suffix}@acme.example`,
    });
    expect(added.personaId).toBe(recruiterRoleId);
    const membership = await prisma.campaignContact.findFirst({
      where: { campaignId, contactId: added.contactId },
    });
    expect(membership?.roleConfirmed).toBe(true);
    expect(membership?.personPrepOfferedAt).not.toBeNull();
    expect(membership?.personPrepStatus).toBe("OFFERED");
    await updateInterviewStage({
      organizationId,
      campaignId,
      userId,
      stageId: stage.id,
      outcome: "ADVANCED",
    });
    const updated = await prisma.interviewStage.findUnique({
      where: { id: stage.id },
    });
    expect(updated?.outcome).toBe("ADVANCED");
  });

  it("assigns interviewers and cheat-sheet notes without creating a guide job", async () => {
    const existing = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Avery",
      lastName: "Ng",
      title: "Technical Recruiter",
      personaId: recruiterRoleId,
      confirmRole: true,
    });
    const existingStage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-10-02T15:00:00.000Z"),
      format: "PHONE",
    });
    await assignExistingInterviewStageInterviewer({
      organizationId,
      campaignId,
      userId,
      stageId: existingStage.id,
      contactId: existing.contactId,
      personaId: recruiterRoleId,
    });
    const assigned = await prisma.interviewStageInterviewer.findMany({
      where: { stageId: existingStage.id },
    });
    expect(assigned.map((row) => row.contactId)).toEqual([existing.contactId]);

    const newStage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "HIRING_MANAGER",
      scheduledAt: new Date("2026-10-03T15:00:00.000Z"),
      format: "VIDEO",
    });
    const linkedInText = Array.from({ length: 90 }, () => "experience").join(" ");
    const added = await addInterviewStageInterviewer({
      organizationId,
      campaignId,
      userId,
      stageId: newStage.id,
      firstName: "Jordan",
      lastName: "Lee",
      title: "VP Sales",
      personaId: recruiterRoleId,
      linkedInProfileText: linkedInText,
    });
    await addCheatSheetInterviewNote({
      organizationId,
      campaignId,
      userId,
      contactId: added.contactId,
      stageId: newStage.id,
      text: "Invitation: they want to hear about enterprise motion.",
    });
    expect(
      await prisma.interviewStageGuide.count({
        where: { stageId: { in: [existingStage.id, newStage.id] } },
      }),
    ).toBe(0);
    expect(
      await prisma.applicationJob.count({
        where: { campaignId, type: "INTERVIEW_GUIDE" },
      }),
    ).toBe(0);
  });

  it("assigns optional interviewers during stage creation without starting prep", async () => {
    const existing = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Jordan",
      lastName: "Lee",
      title: "Technical Recruiter",
      email: `jordan-setup-${suffix}@acme.example`,
      personaId: recruiterRoleId,
      confirmRole: true,
    });
    const stage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "HIRING_MANAGER",
      scheduledAt: new Date("2026-10-05T15:00:00.000Z"),
      format: "VIDEO",
      interviewerContactIds: [existing.contactId],
      newInterviewers: [
        {
          firstName: "Mina",
          lastName: "Ortiz",
          title: "Technical Recruiter",
          email: `mina-setup-${suffix}@acme.example`,
          personaId: recruiterRoleId,
          linkedInProfileText: "Mina Ortiz, technical recruiter.",
        },
      ],
    });
    const rows = await prisma.interviewStageInterviewer.findMany({
      where: { stageId: stage.id },
      select: { contactId: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.contactId)).toContain(existing.contactId);
    const memberships = await prisma.campaignContact.findMany({
      where: { campaignId, contactId: { in: rows.map((row) => row.contactId) } },
    });
    expect(memberships).toHaveLength(2);
    for (const membership of memberships) {
      expect(membership.personPrepOfferedAt).toBeNull();
      expect(membership.personPrepStatus).toBeNull();
    }
    const mina = memberships.find(
      (membership) => membership.contactId !== existing.contactId,
    );
    expect(mina?.linkedInProfileText).toBe("Mina Ortiz, technical recruiter.");
    expect(
      await prisma.applicationJob.count({
        where: {
          campaignId,
          targetId: { in: rows.map((row) => row.contactId) },
        },
      }),
    ).toBe(0);

    await assignExistingInterviewStageInterviewer({
      organizationId,
      campaignId,
      userId,
      stageId: stage.id,
      contactId: existing.contactId,
      personaId: recruiterRoleId,
    });
    const afterSave = await prisma.interviewStageInterviewer.findMany({
      where: { stageId: stage.id },
    });
    expect(afterSave.map((row) => row.contactId)).toEqual([existing.contactId]);
    const afterPrep = await prisma.campaignContact.findFirst({
      where: { campaignId, contactId: existing.contactId },
    });
    expect(afterPrep?.personPrepOfferedAt).toBeNull();
  });

  it("terminal INTERVIEW_GUIDE handler completes orphan jobs without a paid call", async () => {
    const stage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-10-04T15:00:00.000Z"),
      format: "VIDEO",
    });
    const job = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "INTERVIEW_GUIDE",
        status: "PENDING",
        targetId: stage.id,
        payload: { userId, stageId: stage.id },
      },
    });
    await prisma.applicationJob.update({
      where: { id: job.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
      },
    });
    const { processApplicationJob } = await import(
      "@/lib/application-jobs/process"
    );
    const result = await processApplicationJob(job.id);
    expect(result.ok).toBe(true);
    const finished = await prisma.applicationJob.findUnique({
      where: { id: job.id },
    });
    expect(finished?.status).toBe("COMPLETED");
    expect(
      await prisma.interviewStageGuide.count({ where: { stageId: stage.id } }),
    ).toBe(0);
  });
});
