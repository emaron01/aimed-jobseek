import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processApplicationJob } from "@/lib/application-jobs/process";
import { formatApplicationJobLog } from "@/lib/application-jobs/types";
import {
  normalizeResumePresentationPlan,
  resumePresentationPlanSchema,
} from "@/lib/application-assets/plan-contract";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import { planQuestionRound } from "@/lib/consultation/questions";
import {
  applicationResearchCopy,
  applicationStepList,
  consultationConversationCopy,
  hiringTeamConfig,
  workspaceJobCopy,
  workspaceProgressText,
  WORKSPACE_JOB_TYPES,
} from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";

describe("application job worker logging", () => {
  it("logs type, application id, duration, and outcome, never finished", () => {
    const success = formatApplicationJobLog({
      ok: true,
      jobId: "job_1",
      type: "CONSULTATION",
      campaignId: "camp_1",
      durationMs: 1200,
    });
    expect(success).toContain("type=CONSULTATION");
    expect(success).toContain("application=camp_1");
    expect(success).toContain("durationMs=1200");
    expect(success).toContain("outcome=succeeded");
    expect(success).not.toMatch(/finished/i);
    const failed = formatApplicationJobLog({
      ok: false,
      jobId: "job_2",
      type: "RESUME",
      campaignId: "camp_1",
      durationMs: 90,
      error: "Hiring Team role Responses API timed out after 90000ms.",
    });
    expect(failed).toContain("outcome=failed");
    expect(failed).toContain("timed out");
    expect(failed).not.toMatch(/finished/i);
  });

  it("processes every ApplicationJob type and prefers CONSULTATION", () => {
    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    const service = readFileSync("src/lib/application-jobs/service.ts", "utf8");
    const worker = readFileSync("scripts/research-worker.ts", "utf8");
    for (const type of WORKSPACE_JOB_TYPES) {
      expect(process).toContain(`case "${type}"`);
    }
    expect(service).toContain('type: "CONSULTATION"');
    expect(worker).toContain("getResearchWorkerConcurrency");
    expect(worker).toContain("formatApplicationJobLog");
    expect(worker).not.toContain("finished application job");
  });
});

describe("seeker-facing progress copy", () => {
  it("never uses queued wording", () => {
    expect(workspaceProgressText("CONSULTATION")).toMatch(/reading/i);
    expect(workspaceProgressText("CONSULTATION", null, "continue")).toMatch(/next question/i);
    expect(workspaceProgressText("CONSULTATION", null, "process_reply")).toMatch(/thinking/i);
    expect(workspaceProgressText("RESUME", null, "plan")).toMatch(/plan/i);
    expect(workspaceProgressText("RESUME")).toMatch(/Writing the Resume/i);
    expect(hiringTeamConfig.queuedBuild).not.toMatch(/queued/i);
    expect(consultationConversationCopy.starting).not.toMatch(/queued/i);
    expect(applicationResearchCopy.queued).not.toMatch(/queued/i);
    expect(workspaceJobCopy.typing).toMatch(/thinking/i);
    const actions = [
      readFileSync("src/app/actions/consultation.ts", "utf8"),
      readFileSync("src/app/actions/application-assets.ts", "utf8"),
      readFileSync("src/app/actions/application-outreach.ts", "utf8"),
      readFileSync("src/app/actions/interview.ts", "utf8"),
      readFileSync("src/app/actions/application-summary.ts", "utf8"),
      readFileSync("src/app/actions/hiring-team.ts", "utf8"),
    ].join("\n");
    expect(actions).not.toMatch(/was queued/i);
  });
});

describe("workspace order and Harper start", () => {
  it("keeps the required workspace order", () => {
    expect(applicationStepList.map((step) => step.key)).toEqual([
      "applied",
      "company",
      "job",
      "consultation",
      "assets",
      "hiring-team",
      "outreach",
      "interviews",
      "summary",
    ]);
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const chrome = readFileSync("src/components/ApplicationWorkspaceChrome.tsx", "utf8");
    const layout = readFileSync("src/app/(app)/campaigns/[id]/layout.tsx", "utf8");
    const consultationPage = readFileSync(
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
      "utf8",
    );
    const consultation = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(chrome).not.toContain("HarperDock");
    expect(layout).not.toContain("ConsultationSection");
    expect(consultationPage).toContain("ConsultationSection");
    expect(consultation).toContain("ConsultationThread");
    expect(consultation.indexOf("ConsultationThread")).toBeLessThan(
      consultation.indexOf("consultation-briefing"),
    );
    expect(workspace).not.toContain("<ConsultationSection");
    expect(workspace).toContain("addHiringTeamPersonAction");
    expect(workspace).toContain("HiringTeamRoleActions");
    expect(
      readFileSync("src/components/HiringTeamRoleActions.tsx", "utf8"),
    ).toContain("hiringTeamConfig.actions.edit");
    expect(workspace).not.toContain('name="reason"');
  });
});

describe("why this company", () => {
  it("asks the why-this-company target once before other gaps", () => {
    const planned = planQuestionRound({
      assessments: [
        {
          key: WHY_THIS_COMPANY_TARGET_KEY,
          kind: "MISSION",
          text: "Why you want to work at this company",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "ACKNOWLEDGE",
          explanation: "Not asked yet.",
          strategyText: "Ask once.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
        {
          key: "required:0",
          kind: "REQUIRED",
          text: "Ship reliable warehouse robots",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "PROVE_WITH_STORY",
          explanation: "Gap.",
          strategyText: "Prove it.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
      ],
      modelQuestions: [],
      hiringTeam: [{ id: "role_1", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(planned.questions).toHaveLength(1);
    expect(planned.questions[0]?.targetKey).toBe(WHY_THIS_COMPANY_TARGET_KEY);
    expect(planned.questions[0]?.text).toBe(
      consultationConversationCopy.whyThisCompanyQuestion,
    );
  });
});

describe("presentation plan normalization", () => {
  it("accepts a plan with omitted role ids and no featured stories", () => {
    const parsed = resumePresentationPlanSchema.parse(
      normalizeResumePresentationPlan({
        leadingRoleIds: ["role_1"],
        summaryAngle: "Lead with reliability work.",
        recommendations: [
          { text: "Lead with Northwind.", reason: "Closest to the role." },
        ],
      }),
    );
    expect(parsed.featuredStories).toEqual([]);
    expect(parsed.recommendations[0]?.roleId).toBeNull();
    expect(parsed.earlierExperienceHeading).toBeTruthy();
  });
});

describe("persona edit protection and add person", () => {
  it("keeps seeker edits through rebuild and adds a person action", () => {
    const build = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    expect(build).toContain("manuallyEditedFields: edited");
    expect(build).toContain("persona.manuallyEditedFields");
    expect(build).toContain("name: persona.name");
    const actions = readFileSync("src/app/actions/hiring-team.ts", "utf8");
    expect(actions).toContain("addHiringTeamPersonAction");
    expect(actions).toContain("queueIndividualProfileBuild");
    expect(actions).toContain("confirmRole: true");
  });
});

describe.skipIf(!hasTestDatabase())("application job failure marking", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let jobId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `app-job-fail-${suffix}@example.test`,
      name: "Job Fail Seeker",
    });
    organizationId = workspace.organization.id;
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
        ownerUserId: workspace.user.id,
        name: `Job fail ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    const job = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        type: "CONTACT_PROFILE",
        status: "IN_PROGRESS",
        payload: {},
      },
    });
    jobId = job.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("marks a thrown job Failed and logs the cause, never finished", async () => {
    const result = await processApplicationJob(jobId);
    expect(result.ok).toBe(false);
    expect(result.type).toBe("CONTACT_PROFILE");
    expect(result.error).toMatch(/missing a contact/i);
    const log = formatApplicationJobLog(result);
    expect(log).toContain("type=CONTACT_PROFILE");
    expect(log).toContain(`application=${result.campaignId}`);
    expect(log).toMatch(/durationMs=\d+/);
    expect(log).toContain("outcome=failed");
    expect(log).toMatch(/missing a contact/i);
    expect(log).not.toMatch(/finished/i);
    const stored = await prisma.applicationJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(stored.status).toBe("FAILED");
    expect(stored.error).toMatch(/missing a contact/i);
  });
});
