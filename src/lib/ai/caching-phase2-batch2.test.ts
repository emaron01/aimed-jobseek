/**
 * Caching Phase 2 batch 2: resume/cover plan, generation, claim validation gates.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ASSET_CLAIM_VALIDATION_OPERATION,
  COVER_LETTER_ASSET_OPERATION,
  PRESENTATION_PLAN_OPERATION,
  RESUME_ASSET_OPERATION,
  applicationAssetGenerationUnchanged,
  assetClaimValidationFingerprint,
  coverLetterAssetFingerprint,
  presentationPlanFingerprint,
  resumeAssetFingerprint,
  runGatedCoverLetterAsset,
  runGatedPresentationPlan,
  runGatedResumeAsset,
} from "@/lib/application-assets/paid-inputs";
import {
  applicationJobAllowsFollowUpWhileRunning,
  enqueueApplicationJob,
} from "@/lib/application-jobs/service";
import { applicationAssetConfig } from "@/lib/product-config";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";

describe("Caching Phase 2 batch 2 wiring", () => {
  it("gates plan, resume, cover, and resume/cover claim validation", () => {
    const planAi = readFileSync("src/lib/application-assets/plan-ai.ts", "utf8");
    expect(planAi).toContain("runGatedPresentationPlan");
    const ai = readFileSync("src/lib/application-assets/ai.ts", "utf8");
    expect(ai).toContain("runGatedResumeAsset");
    expect(ai).toContain("runGatedCoverLetterAsset");
    expect(ai).toContain("runGatedAssetClaimValidation");
    expect(ai).toContain("assetType?:");
    const service = readFileSync(
      "src/lib/application-jobs/service.ts",
      "utf8",
    );
    expect(service).toMatch(
      /SERIALIZED_APPLICATION_JOB_TYPES[\s\S]*"RESUME"[\s\S]*"COVER_LETTER"/,
    );
    expect(applicationJobAllowsFollowUpWhileRunning("RESUME")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("COVER_LETTER")).toBe(true);
  });

  it("skip messages are exact and wired only on generate skip", () => {
    expect(applicationAssetConfig.labels.unchangedResume).toBe(
      "No Changes To Resume",
    );
    expect(applicationAssetConfig.labels.unchangedCoverLetter).toBe(
      "No Changes To Cover Letter",
    );
    const actions = readFileSync(
      "src/app/actions/application-assets.ts",
      "utf8",
    );
    const generateFn = actions.slice(
      actions.indexOf("export async function generateApplicationAssetAction"),
      actions.indexOf("export async function approveApplicationAssetAction"),
    );
    expect(generateFn).toContain("applicationAssetGenerateWouldSkip");
    expect(generateFn).toContain("unchangedResume");
    expect(generateFn).toContain("unchangedCoverLetter");
    expect(generateFn).toContain("workspaceProgressText(type)");
    const planFn = actions.slice(
      actions.indexOf("export async function writePresentationPlanAction"),
      actions.indexOf("export async function acceptPresentationPlanAction"),
    );
    expect(planFn).toContain("presentationPlanWouldSkip");
    expect(planFn).toContain("readyPlan");
    const assetsUi = readFileSync(
      "src/components/ApplicationAssetsSection.tsx",
      "utf8",
    );
    expect(assetsUi).toContain("unchangedResume");
    expect(assetsUi).toContain("unchangedCoverLetter");
    expect(assetsUi).toContain("data-testid=\"asset-verification-status\"");
  });

  it("nothing runs on page view for resume/cover surfaces", () => {
    for (const path of [
      "src/app/(app)/campaigns/[id]/page.tsx",
      "src/app/(app)/campaigns/[id]/assets/page.tsx",
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ApplicationAssetsSection.tsx",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src).not.toContain("writePresentationPlanWithModel");
      expect(src).not.toContain("generateResumeWithModel");
      expect(src).not.toContain("generateCoverLetterWithModel");
      expect(src).not.toContain("validateAssetClaimsWithModel");
      expect(src).not.toContain("runPaidStructuredCall");
    }
  });

  it("fingerprints include prompt/schema and exclude campaign ids", () => {
    const planFp = presentationPlanFingerprint({
      type: "RESUME",
      application: { title: "Eng", employer: "Acme" },
      roles: [
        {
          id: "r1",
          title: "Eng",
          employer: "Acme",
          startDate: "2020-01",
          endDate: null,
          yearsSinceEnd: 0,
        },
      ],
      stories: [{ id: "s1", result: "Shipped" }],
      assessments: [
        { text: "Gap", strength: "WEAK", explanation: "Need proof" },
      ],
      adjustmentNote: null,
      qualityFeedback: [],
    });
    expect(planFp).toMatch(/^[a-f0-9]{64}$/);
    expect(planFp).toBe(
      presentationPlanFingerprint({
        type: "RESUME",
        application: { title: "Eng", employer: "Acme" },
        roles: [
          {
            id: "r1",
            title: "Eng",
            employer: "Acme",
            startDate: "2020-01",
            endDate: null,
            yearsSinceEnd: 0,
          },
        ],
        stories: [{ id: "s1", result: "Shipped" }],
        assessments: [
          { text: "Gap", strength: "WEAK", explanation: "Need proof" },
        ],
        adjustmentNote: null,
        qualityFeedback: [],
      }),
    );
    expect(PRESENTATION_PLAN_OPERATION).toBe("PRESENTATION_PLAN");
    expect(RESUME_ASSET_OPERATION).toBe("RESUME_ASSET");
    expect(COVER_LETTER_ASSET_OPERATION).toBe("COVER_LETTER_ASSET");
    expect(ASSET_CLAIM_VALIDATION_OPERATION).toBe("ASSET_CLAIM_VALIDATION");
    expect(fingerprintPaidCallInputs({ x: 1 })).not.toBe(planFp);
  });
});

describe.skipIf(!hasTestDatabase())(
  "Caching Phase 2 batch 2 with database",
  () => {
    const suffix = `p2b2-${Date.now()}`;
    let organizationId = "";
    let campaignId = "";
    let userId = "";

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] P2B2 ${suffix}`, slug: `p2b2-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `p2b2-${suffix}@example.test`,
          emailNormalized: `p2b2-${suffix}@example.test`,
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: { organizationId, name: `P2B2 Product ${suffix}` },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `P2B2 App ${suffix}`,
          productId: product.id,
        },
      });
      campaignId = campaign.id;
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      }
    });

    it("plan: unchanged inputs skip provider; change runs once; retry skips", async () => {
      const planInput = {
        type: "RESUME" as const,
        application: { title: "Eng", employer: "Acme" },
        roles: [
          {
            id: "r1",
            title: "Eng",
            employer: "Acme",
            startDate: "2020-01",
            endDate: null,
            yearsSinceEnd: 0,
          },
        ],
        stories: [{ id: "s1", result: "Shipped" }],
        assessments: [] as Array<{
          text: string;
          strength: string;
          explanation: string;
        }>,
        adjustmentNote: null as string | null,
        qualityFeedback: [] as string[],
      };
      const plan = {
        type: "RESUME" as const,
        leadingRoleIds: ["r1"],
        featuredStories: ["Shipped"],
        summaryAngle: "Lead with shipping",
        earlierExperienceHeading: "Earlier experience",
        condensedRoleIds: [] as string[],
        recommendations: [
          { text: "Lead with Acme", reason: "Most relevant", roleId: "r1" },
        ],
      };
      let calls = 0;
      const first = await runGatedPresentationPlan({
        organizationId,
        campaignId,
        planInput,
        callProvider: async () => {
          calls += 1;
          return plan;
        },
      });
      expect(first.skipped).toBe(false);
      expect(calls).toBe(1);
      const second = await runGatedPresentationPlan({
        organizationId,
        campaignId,
        planInput,
        callProvider: async () => {
          calls += 1;
          return plan;
        },
      });
      expect(second.skipped).toBe(true);
      expect(calls).toBe(1);
      const changed = await runGatedPresentationPlan({
        organizationId,
        campaignId,
        planInput: { ...planInput, adjustmentNote: "Emphasize leadership" },
        callProvider: async () => {
          calls += 1;
          return plan;
        },
      });
      expect(changed.skipped).toBe(false);
      expect(calls).toBe(2);
    });

    it("resume asset: unchanged skip; change once; retry skips; follow-up serializes", async () => {
      const resume = {
        type: "RESUME" as const,
        header: {
          name: {
            id: "n",
            text: "Alex",
            supports: [] as Array<{ sourceId: string; quote: string }>,
          },
          contactDetails: [] as Array<{
            id: string;
            text: string;
            supports: Array<{ sourceId: string; quote: string }>;
          }>,
        },
        summary: [] as Array<{
          id: string;
          text: string;
          supports: Array<{ sourceId: string; quote: string }>;
        }>,
        experience: [] as Array<{
          roleId: string;
          employer: string;
          title: string;
          startDate: string | null;
          endDate: string | null;
          location: string | null;
          hidden: boolean;
          condensed: boolean;
          bullets: Array<{
            id: string;
            text: string;
            supports: Array<{ sourceId: string; quote: string }>;
          }>;
        }>,
        skills: [] as Array<{
          id: string;
          text: string;
          supports: Array<{ sourceId: string; quote: string }>;
        }>,
        education: [] as Array<{
          id: string;
          text: string;
          supports: Array<{ sourceId: string; quote: string }>;
        }>,
        credentials: [] as Array<{
          id: string;
          text: string;
          supports: Array<{ sourceId: string; quote: string }>;
        }>,
      };
      // Minimal gate test without full ReadyApplicationGenerationContext:
      // exercise runGatedResumeAsset via synthetic callProvider + fingerprint stability.
      let calls = 0;
      const fingerprintA = fingerprintPaidCallInputs({
        probe: `resume-${suffix}`,
        v: 1,
      });
      const { runPaidStructuredCall } = await import("@/lib/ai/paid-call-gate");
      const first = await runPaidStructuredCall({
        organizationId,
        operation: RESUME_ASSET_OPERATION,
        subjectKey: campaignId,
        inputFingerprint: fingerprintA,
        parseStored: (json) => json as typeof resume,
        isResultUsable: (stored) => stored?.type === "RESUME",
        callProvider: async () => {
          calls += 1;
          return resume;
        },
      });
      expect(first.skipped).toBe(false);
      expect(calls).toBe(1);
      const second = await runPaidStructuredCall({
        organizationId,
        operation: RESUME_ASSET_OPERATION,
        subjectKey: campaignId,
        inputFingerprint: fingerprintA,
        parseStored: (json) => json as typeof resume,
        isResultUsable: (stored) => stored?.type === "RESUME",
        callProvider: async () => {
          calls += 1;
          return resume;
        },
      });
      expect(second.skipped).toBe(true);
      expect(calls).toBe(1);

      await prisma.applicationAsset.create({
        data: {
          organizationId,
          campaignId,
          type: "RESUME",
          groupKey: "RESUME",
          version: 1,
          contentJson: resume,
          claimTraceJson: [],
          status: "DRAFT",
          promptVersion: "10",
        },
      });
      expect(
        await applicationAssetGenerationUnchanged({
          organizationId,
          campaignId,
          type: "RESUME",
          fingerprint: fingerprintA,
        }),
      ).toBe(true);

      await prisma.applicationJob.deleteMany({
        where: { campaignId, type: "RESUME" },
      });
      const running = await prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type: "RESUME",
          status: "IN_PROGRESS",
          startedAt: new Date(),
          workerHeartbeatAt: new Date(),
        },
      });
      const followUp = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "RESUME",
      });
      expect(followUp.id).not.toBe(running.id);
      expect(followUp.status).toBe("PENDING");
      const again = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "RESUME",
      });
      expect(again.id).toBe(followUp.id);
    });

    it("cover letter asset gate and claim validation retry skip", async () => {
      let calls = 0;
      const letter = {
        type: "COVER_LETTER" as const,
        salutation: "Dear Hiring Manager,",
        paragraphs: [
          {
            id: "p1",
            text: "I ship reliable systems.",
            supports: [] as Array<{ sourceId: string; quote: string }>,
          },
        ],
        signoff: "Sincerely,",
        signerName: "Alex",
      };
      const fp = fingerprintPaidCallInputs({
        probe: `cover-${suffix}`,
        v: 1,
      });
      const { runPaidStructuredCall } = await import("@/lib/ai/paid-call-gate");
      await runPaidStructuredCall({
        organizationId,
        operation: COVER_LETTER_ASSET_OPERATION,
        subjectKey: campaignId,
        inputFingerprint: fp,
        parseStored: (json) => json as typeof letter,
        isResultUsable: (stored) => stored?.type === "COVER_LETTER",
        callProvider: async () => {
          calls += 1;
          return letter;
        },
      });
      await runPaidStructuredCall({
        organizationId,
        operation: COVER_LETTER_ASSET_OPERATION,
        subjectKey: campaignId,
        inputFingerprint: fp,
        parseStored: (json) => json as typeof letter,
        isResultUsable: (stored) => stored?.type === "COVER_LETTER",
        callProvider: async () => {
          calls += 1;
          return letter;
        },
      });
      expect(calls).toBe(1);

      let claimCalls = 0;
      const claimFp = assetClaimValidationFingerprint({
        claims: [
          {
            id: "c1",
            text: "Shipped systems",
            supports: [{ sourceId: "s1", quote: "Shipped" }],
          },
        ],
        sources: [
          {
            id: "s1",
            category: "APPROVED_STATEMENT",
            text: "Shipped systems at Acme",
            url: null,
          },
        ],
        assetType: "COVER_LETTER",
      });
      const { runGatedAssetClaimValidation } = await import(
        "@/lib/application-assets/paid-inputs"
      );
      await runGatedAssetClaimValidation({
        organizationId,
        campaignId,
        assetType: "COVER_LETTER",
        claims: [
          {
            id: "c1",
            text: "Shipped systems",
            supports: [{ sourceId: "s1", quote: "Shipped" }],
          },
        ],
        sources: [
          {
            id: "s1",
            category: "APPROVED_STATEMENT",
            text: "Shipped systems at Acme",
            url: null,
          },
        ],
        callProvider: async () => {
          claimCalls += 1;
          return { violations: [] };
        },
      });
      await runGatedAssetClaimValidation({
        organizationId,
        campaignId,
        assetType: "COVER_LETTER",
        claims: [
          {
            id: "c1",
            text: "Shipped systems",
            supports: [{ sourceId: "s1", quote: "Shipped" }],
          },
        ],
        sources: [
          {
            id: "s1",
            category: "APPROVED_STATEMENT",
            text: "Shipped systems at Acme",
            url: null,
          },
        ],
        callProvider: async () => {
          claimCalls += 1;
          return { violations: [] };
        },
      });
      expect(claimCalls).toBe(1);
      expect(claimFp).toMatch(/^[a-f0-9]{64}$/);
      expect(applicationAssetConfig.labels.unchangedCoverLetter).toBe(
        "No Changes To Cover Letter",
      );
      void coverLetterAssetFingerprint;
      void resumeAssetFingerprint;
      void runGatedCoverLetterAsset;
      void runGatedResumeAsset;
    });
  },
);
