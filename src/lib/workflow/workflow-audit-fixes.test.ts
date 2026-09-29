import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCampaignFormData } from "@/lib/campaign/save";
import { buildSidebarNavItems } from "@/lib/auth/user-menu";
import { buildHomeSetupRail } from "@/lib/workflow/home-setup-rail";
import { getProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";
import {
  emptyApplicationStepFacts,
  resolveApplicationStepState,
} from "@/lib/application/step-progress";
import { buildConsultationPolishMessages } from "@/lib/consultation/prompt";
import { voiceReadiness } from "@/lib/voice/types";
import {
  applicationAssetConfig,
  consultationConfig,
  vocab,
} from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { runWithTenantContext } from "@/lib/tenant/request-context";

function formFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("workflow audit fixes", () => {
  it("creates an application from a Personal Profile and a posting only", () => {
    const parsed = parseCampaignFormData(
      formFrom({
        name: "Northline engineer",
        postingText: NORMAL_JOB_POSTING,
        productId: "prod_1",
      }),
    );
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields.productId).toBe("prod_1");
    expect(parsed.fields.icpId).toBe("");
    expect(
      getProductCampaignReadiness({
        approvalStatus: "APPROVED",
        icps: [],
        personas: [],
      }).ready,
    ).toBe(true);
  });

  it("hides Target Employers from navigation, the setup rail, and the new-application form", () => {
    const nav = buildSidebarNavItems({
      hasOrganization: true,
      isPlatformOperator: false,
    });
    expect(nav.some((item) => item.href === "/icps")).toBe(false);
    expect(nav.some((item) => item.label === vocab.icp.nav)).toBe(false);

    const rail = buildHomeSetupRail({
      voice: voiceReadiness(3),
      productTotal: 1,
      productApprovedCount: 1,
      productIncomplete: [],
      icpCount: 2,
      emailConnected: false,
      emailReconnectRequired: false,
    });
    expect(rail.some((step) => step.href === "/icps")).toBe(false);

    const form = readFileSync("src/components/NewCampaignForm.tsx", "utf8");
    expect(form).not.toContain("icps");
    expect(form).not.toContain("icpId");
    expect(form).not.toContain(vocab.icp.nav);
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(
      /icpId\s+String\?/,
    );
  });

  it("does not rewrite Harper text after the model call", () => {
    const voice = readFileSync("src/lib/consultation/voice.ts", "utf8");
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(voice).not.toContain("rewriteHarperCoachingVoice");
    expect(service).not.toContain("rewriteHarperCoachingVoice");
    expect(service).not.toContain("applyHarperVoiceToText");
    expect(section).not.toContain("rewriteHarperCoachingVoice");
  });

  it("continues Harper after a result is used", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const actions = readFileSync("src/app/actions/consultation.ts", "utf8");
    expect(service).toContain("export async function continueConsultationPlanning");
    expect(service).toContain("planAndStoreRound");
    expect(service).toContain("consultationHasUnansweredQuestions");
    expect(actions).toContain('operation: "continue"');
    expect(actions).toContain("approveConsultationQaResultAction");
    expect(actions).toContain("useConsultationResultAction");
  });

  it("queues Harper reassessment from interview notes without job regenerate", () => {
    const application = readFileSync("src/lib/application/service.ts", "utf8");
    const interview = readFileSync("src/app/actions/interview.ts", "utf8");
    expect(application).toContain("saveApplicationJobLearnedNotes");
    expect(application).toContain("interpretJobPosting");
    expect(application).toContain('operation: "reassess"');
    expect(interview).not.toContain("regenerateApplicationJobRequirement");
    expect(interview).toContain('operation: "reassess"');
  });

  it("creates resume and cover letter plans when Harper ends", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const plans = readFileSync("src/lib/application-assets/plan-service.ts", "utf8");
    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    const assets = readFileSync(
      "src/components/ApplicationAssetsSection.tsx",
      "utf8",
    );
    expect(service).toContain("queueAssetsWhenConsultationEnds");
    expect(service).toContain("queueAssetsForCampaign");
    expect(plans).toContain("plan_accept_generate");
    expect(process).toContain("plan_accept_generate");
    expect(process).toContain("acceptPresentationPlan");
    expect(plans).toContain("ensureAcceptedPresentationPlan");
    expect(assets).not.toContain("applicationAssetConfig.labels.adjustPlan");
    expect(assets).toContain("applicationAssetConfig.labels.regenerate");
    expect(assets).toContain("applicationAssetConfig.labels.changeInstruction");
    expect(assets).toContain("applicationAssetConfig.labels.downloadDocx");
    expect(applicationAssetConfig.labels.adjustPlan).toMatch(/Adjust/);
    expect(applicationAssetConfig.labels.regenerate).toBe("Regenerate");
    expect(applicationAssetConfig.labels.changeInstruction).toBe(
      `What should ${consultationConfig.displayName} change?`,
    );
    expect(applicationAssetConfig.labels.downloadDocx).toBe("Download DOCX");
  });

  it("sends voice samples to resume, cover letter, Harper talk tracks, and outreach", () => {
    const polish = JSON.parse(
      buildConsultationPolishMessages({
        answer: "I led the rollout.",
        story: { situation: null, task: null, action: null, result: null },
        declinedFollowUp: false,
        strengtheningNeeds: [],
        careerStage: "early_career",
        profileItems: [],
        voiceSamples: [{ label: "Email", sampleText: "I keep the ask short." }],
      })[1]!.content,
    );
    expect(polish.voiceSamples[0]?.sampleText).toContain("ask short");
    const resumePrompt = readFileSync(
      "src/lib/application-assets/prompt.ts",
      "utf8",
    );
    expect(resumePrompt).toContain("voiceSamples: input.context.voiceSamples");
    expect(
      resumePrompt.match(/voiceSamples: input.context.voiceSamples/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(readFileSync("src/lib/email-generation/prompt.ts", "utf8")).toContain(
      "voiceSamples",
    );
    expect(readFileSync("src/lib/consultation/service.ts", "utf8")).toContain(
      "voiceSamplesForUsage",
    );
  });

  it("removes leftover new-application and profile fields", () => {
    const form = readFileSync("src/components/NewCampaignForm.tsx", "utf8");
    const catalog = readFileSync("src/components/ProductCatalogPanel.tsx", "utf8");
    expect(form).not.toContain('name="emailLength"');
    expect(form).not.toContain("personaIds");
    expect(form).not.toContain("allPersonas");
    const listingStart = catalog.indexOf("approvalStatus");
    const listing = catalog.slice(
      listingStart,
      catalog.indexOf("ConfirmDeleteForm", listingStart),
    );
    expect(listing).not.toContain("_count.personas");
    expect(listing).toContain("_count.icps");
  });

  it("maps INTERVIEW_GUIDE jobs onto the interview stages step", () => {
    const idle = emptyApplicationStepFacts();
    expect(
      resolveApplicationStepState("interviews", idle, [
        {
          id: "guide_1",
          type: "INTERVIEW_GUIDE",
          status: "PENDING",
          targetId: "stage_1",
          error: null,
          canRetry: false,
          progressText: "Writing",
          waitKind: "longer",
          sectionId: "interviews",
          readyText: "Guide is ready.",
        },
      ]),
    ).toBe("in_progress");
    expect(
      resolveApplicationStepState(
        "interviews",
        { ...idle, interviewStageCount: 1 },
        [],
      ),
    ).toBe("done");
  });

  it("queues research automatically for a named employer without worker startup backfill", () => {
    const service = readFileSync("src/lib/application/service.ts", "utf8");
    const worker = readFileSync("scripts/research-worker.ts", "utf8");
    expect(service).toContain("ensureNamedEmployerResearch");
    expect(service).toContain("queueApplicationResearch");
    expect(service).toMatch(
      /export async function attachParsedPosting[\s\S]*queueApplicationResearch/,
    );
    expect(service).toMatch(
      /persistInterpretedJobRequirement[\s\S]*ensureNamedEmployerResearch/,
    );
    expect(worker).not.toContain("queueMissingNamedEmployerResearch");
    expect(worker).toContain("abandonStaleResearchRuns");
    expect(worker).toContain("abandonStaleApplicationJobs");
  });
});

describe.skipIf(!hasTestDatabase())("workflow audit database behavior", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `workflow-audit-${suffix}@example.test`,
      name: "Workflow Audit Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
        profileJson: fixtureAlexChenProfile() as object,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("creates a campaign without a Target Employer and keeps existing ICP data", async () => {
    const icp = await prisma.icp.create({
      data: {
        organizationId,
        productId,
        name: `Kept ${suffix}`,
      },
    });
    const created = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `No ICP ${suffix}`,
        productId,
      },
    });
    expect(created.icpId).toBeNull();
    const kept = await prisma.icp.findUnique({ where: { id: icp.id } });
    expect(kept?.name).toBe(`Kept ${suffix}`);
  });

  it("queues research when creating or updating an application with a named employer", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Research ${suffix}`,
        productId,
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    const { attachParsedPosting, ensureNamedEmployerResearch } =
      await import("@/lib/application/service");
    await runWithTenantContext({ organizationId, userId }, async () => {
      await attachParsedPosting({
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        postingUrl: null,
        parsed,
        icpId: null,
      });
    });
    const afterAttach = await prisma.researchRun.count({
      where: {
        organizationId,
        campaignId: campaign.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    expect(afterAttach).toBeGreaterThan(0);

    const leftover = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Update research ${suffix}`,
        productId,
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: leftover.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        scorecardJson: parsed.scorecard,
      },
    });
    await runWithTenantContext({ organizationId, userId }, async () => {
      await ensureNamedEmployerResearch({
        organizationId,
        campaignId: leftover.id,
      });
    });
    const leftoverRuns = await prisma.researchRun.count({
      where: {
        organizationId,
        campaignId: leftover.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    expect(leftoverRuns).toBeGreaterThan(0);
  });

  it("queues resume and cover letter generation when Harper is skipped", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Harper end ${suffix}`,
        productId,
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        scorecardJson: parsed.scorecard,
      },
    });
    const { skipConsultation } = await import("@/lib/consultation/service");
    await skipConsultation({ organizationId, campaignId: campaign.id });
    const jobs = await prisma.applicationJob.findMany({
      where: {
        organizationId,
        campaignId: campaign.id,
        type: { in: ["RESUME", "COVER_LETTER"] },
      },
    });
    expect(jobs.map((job) => job.type).sort()).toEqual([
      "COVER_LETTER",
      "RESUME",
    ]);
    expect(
      jobs.every((job) => {
        const payload = job.payload as { operation?: string };
        return payload.operation === "plan_accept_generate";
      }),
    ).toBe(true);
  });
});
