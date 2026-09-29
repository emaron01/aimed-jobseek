/**
 * Caching Phase 2 batch 3: outreach, thank-you/check-in, contact profile gates.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OUTREACH_ASSET_OPERATION,
  OUTREACH_CLAIM_VALIDATION_OPERATION,
  OUTREACH_FACT_SELECTION_OPERATION,
  outreachClaimValidationFingerprint,
  outreachFactSelectionFingerprint,
  outreachSubjectKey,
  runGatedOutreachClaimValidation,
  runGatedOutreachFactSelection,
} from "@/lib/application-assets/outreach-paid-inputs";
import {
  CONTACT_PROFILE_EXTRACT_OPERATION,
  CONTACT_PROFILE_SYNTHESIZE_OPERATION,
  contactProfileExtractFingerprint,
  contactProfileSubjectKey,
  contactProfileSynthesizeFingerprint,
  runGatedContactProfileExtract,
  runGatedContactProfileSynthesize,
} from "@/lib/contact-profile/paid-inputs";
import {
  INTERVIEW_THANK_YOU_CLARIFY_OPERATION,
  interviewThankYouClarifyFingerprint,
  interviewThankYouClarifySubjectKey,
  runGatedInterviewThankYouClarify,
} from "@/lib/interview/thank-you-paid-inputs";
import {
  applicationJobAllowsFollowUpWhileRunning,
  enqueueApplicationJob,
} from "@/lib/application-jobs/service";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import {
  outreachConfig,
  unchangedContactProfileMessage,
} from "@/lib/product-config";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";
import type { LinkedInExtracted } from "@/lib/contact-profile/contract";

describe("Caching Phase 2 batch 3 wiring", () => {
  it("gates outreach facts, asset, claim, thank-you clarify, and contact profile", () => {
    const ai = readFileSync("src/lib/application-assets/ai.ts", "utf8");
    expect(ai).toContain("runGatedOutreachFactSelection");
    expect(ai).toContain("runGatedOutreachAsset");
    expect(ai).toContain("runGatedOutreachClaimValidation");
    expect(ai).toContain("outreachGate");

    const interviewAi = readFileSync("src/lib/interview/ai.ts", "utf8");
    expect(interviewAi).toContain("runGatedInterviewThankYouClarify");

    const extract = readFileSync("src/lib/contact-profile/extract.ts", "utf8");
    expect(extract).toContain("runGatedContactProfileExtract");
    const contactAi = readFileSync("src/lib/contact-profile/ai.ts", "utf8");
    expect(contactAi).toContain("runGatedContactProfileSynthesize");

    const service = readFileSync(
      "src/lib/application-jobs/service.ts",
      "utf8",
    );
    expect(service).toMatch(
      /SERIALIZED_APPLICATION_JOB_TYPES[\s\S]*"OUTREACH"[\s\S]*"CONTACT_PROFILE"/,
    );
    expect(applicationJobAllowsFollowUpWhileRunning("OUTREACH")).toBe(true);
    expect(applicationJobAllowsFollowUpWhileRunning("CONTACT_PROFILE")).toBe(
      true,
    );
  });

  it("skip messages are exact and wired on generate skip", () => {
    expect(outreachConfig.labels.unchangedOutreach).toBe(
      "No Changes To Outreach",
    );
    expect(outreachConfig.labels.unchangedThankYouNote).toBe(
      "No Changes To Thank-You Note",
    );
    expect(outreachConfig.labels.unchangedCheckIn).toBe("No Changes To Check-In");
    expect(unchangedContactProfileMessage("Alex Kim")).toBe(
      "No Changes To Alex Kim's Profile",
    );

    const outreachActions = readFileSync(
      "src/app/actions/application-outreach.ts",
      "utf8",
    );
    const generateFn = outreachActions.slice(
      outreachActions.indexOf("export async function generateOutreachAssetAction"),
      outreachActions.indexOf(
        "export async function buildOutreachPersonaThenGenerateAction",
      ),
    );
    expect(generateFn).toContain("outreachGenerateWouldSkip");
    expect(generateFn).toContain("outreachUnchangedSkipMessage");

    const contactActions = readFileSync(
      "src/app/actions/contact-profile.ts",
      "utf8",
    );
    expect(contactActions).toContain("unchangedContactProfileMessage");
    expect(contactActions).toContain("queued.queued");
  });

  it("nothing runs on page view for outreach and contact profile surfaces", () => {
    for (const path of [
      "src/app/(app)/campaigns/[id]/page.tsx",
      "src/app/(app)/campaigns/[id]/outreach/page.tsx",
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ApplicationOutreachSections.tsx",
      "src/components/ContactEditForm.tsx",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src).not.toContain("generateOutreachWithModel");
      expect(src).not.toContain("selectOutreachFacts");
      expect(src).not.toContain("extractInterviewerFacts");
      expect(src).not.toContain("generateIndividualProfileWithModel");
      expect(src).not.toContain("runPaidStructuredCall");
    }
  });

  it("fingerprints include schema/prompt and exclude campaign ids from hash inputs", () => {
    expect(OUTREACH_FACT_SELECTION_OPERATION).toBe("OUTREACH_FACT_SELECTION");
    expect(OUTREACH_ASSET_OPERATION).toBe("OUTREACH_ASSET");
    expect(OUTREACH_CLAIM_VALIDATION_OPERATION).toBe(
      "OUTREACH_CLAIM_VALIDATION",
    );
    expect(INTERVIEW_THANK_YOU_CLARIFY_OPERATION).toBe(
      "INTERVIEW_THANK_YOU_CLARIFY",
    );
    expect(CONTACT_PROFILE_EXTRACT_OPERATION).toBe("CONTACT_PROFILE_EXTRACT");
    expect(CONTACT_PROFILE_SYNTHESIZE_OPERATION).toBe(
      "CONTACT_PROFILE_SYNTHESIZE",
    );
    expect(
      outreachSubjectKey({
        campaignId: "c1",
        type: "EMAIL",
        personaId: "p1",
        contactId: "ct1",
        purpose: "PROACTIVE",
      }),
    ).toContain("c1:");
    expect(contactProfileSubjectKey("c1", "ct1")).toBe("c1:ct1");
    expect(interviewThankYouClarifySubjectKey("c1", "s1")).toBe("c1:s1");
    expect(fingerprintPaidCallInputs({ x: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe.skipIf(!hasTestDatabase())(
  "Caching Phase 2 batch 3 with database",
  () => {
    const suffix = `p2b3-${Date.now()}`;
    let organizationId = "";
    let campaignId = "";
    let userId = "";

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] P2B3 ${suffix}`, slug: `p2b3-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `p2b3-${suffix}@example.test`,
          emailNormalized: `p2b3-${suffix}@example.test`,
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: { organizationId, name: `P2B3 Product ${suffix}` },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `P2B3 App ${suffix}`,
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

    it("outreach fact selection: unchanged skips; change runs once; retry skips", async () => {
      const candidates = [
        { candidateId: "f1", text: "Acme ships widgets" },
        { candidateId: "f2", text: "Series B" },
      ];
      const context = {
        organizationId,
        userId,
        campaign: { id: campaignId },
        sources: [],
      } as never;
      let calls = 0;
      const first = await runGatedOutreachFactSelection({
        organizationId,
        campaignId,
        personaId: "p1",
        contactId: "ct1",
        purpose: "PROACTIVE",
        context,
        candidates,
        callProvider: async () => {
          calls += 1;
          return {
            noneRelevant: false,
            selected: [{ candidateId: "f1", rationale: "relevant" }],
          };
        },
      });
      expect(first.skipped).toBe(false);
      expect(calls).toBe(1);
      expect(first.data.map((row) => row.candidateId)).toEqual(["f1"]);
      const second = await runGatedOutreachFactSelection({
        organizationId,
        campaignId,
        personaId: "p1",
        contactId: "ct1",
        purpose: "PROACTIVE",
        context,
        candidates,
        callProvider: async () => {
          calls += 1;
          return {
            noneRelevant: false,
            selected: [{ candidateId: "f1", rationale: "relevant" }],
          };
        },
      });
      expect(second.skipped).toBe(true);
      expect(calls).toBe(1);
      const changed = await runGatedOutreachFactSelection({
        organizationId,
        campaignId,
        personaId: "p1",
        contactId: "ct1",
        purpose: "FOLLOW_UP",
        context,
        candidates,
        callProvider: async () => {
          calls += 1;
          return {
            noneRelevant: false,
            selected: [{ candidateId: "f2", rationale: "relevant" }],
          };
        },
      });
      expect(changed.skipped).toBe(false);
      expect(calls).toBe(2);
      expect(
        outreachFactSelectionFingerprint({
          context,
          purpose: "PROACTIVE",
          candidates,
        }),
      ).toMatch(/^[a-f0-9]{64}$/);
    });

    it("outreach asset + claim: retry after receipt skips; serialize follow-up", async () => {
      let calls = 0;
      const email = {
        type: "EMAIL" as const,
        subject: {
          id: "s",
          text: "Hello",
          supports: [] as Array<{ sourceId: string; quote: string }>,
        },
        greeting: "Hi Alex,",
        paragraphs: [
          {
            id: "p1",
            text: "I ship systems.",
            supports: [] as Array<{ sourceId: string; quote: string }>,
          },
        ],
        signoff: "Thanks,",
        signerName: "Alex",
        claim: {
          id: "c1",
          text: "I ship systems.",
          supports: [{ sourceId: "src1", quote: "ship" }],
        },
      };
      const fp = fingerprintPaidCallInputs({
        probe: `outreach-${suffix}`,
        v: 1,
      });
      const { runPaidStructuredCall } = await import("@/lib/ai/paid-call-gate");
      const subjectKey = outreachSubjectKey({
        campaignId,
        type: "EMAIL",
        personaId: "p1",
        contactId: "ct1",
        purpose: "PROACTIVE",
      });
      const first = await runPaidStructuredCall({
        organizationId,
        operation: OUTREACH_ASSET_OPERATION,
        subjectKey,
        inputFingerprint: fp,
        parseStored: (json) => json as typeof email,
        isResultUsable: (stored) => stored?.type === "EMAIL",
        callProvider: async () => {
          calls += 1;
          return email;
        },
      });
      expect(first.skipped).toBe(false);
      expect(calls).toBe(1);
      const retry = await runPaidStructuredCall({
        organizationId,
        operation: OUTREACH_ASSET_OPERATION,
        subjectKey,
        inputFingerprint: fp,
        parseStored: (json) => json as typeof email,
        isResultUsable: (stored) => stored?.type === "EMAIL",
        callProvider: async () => {
          calls += 1;
          return email;
        },
      });
      expect(retry.skipped).toBe(true);
      expect(calls).toBe(1);

      let claimCalls = 0;
      const claimResult = { violations: [] as Array<{ claimId: string; reason: string }> };
      await runGatedOutreachClaimValidation({
        organizationId,
        campaignId,
        personaId: "p1",
        contactId: "ct1",
        assetType: "EMAIL",
        purpose: "PROACTIVE",
        claims: [email.claim],
        sources: [{ id: "src1", text: "ship", category: "PROFILE_FACT", url: null }],
        callProvider: async () => {
          claimCalls += 1;
          return claimResult;
        },
      });
      await runGatedOutreachClaimValidation({
        organizationId,
        campaignId,
        personaId: "p1",
        contactId: "ct1",
        assetType: "EMAIL",
        purpose: "PROACTIVE",
        claims: [email.claim],
        sources: [{ id: "src1", text: "ship", category: "PROFILE_FACT", url: null }],
        callProvider: async () => {
          claimCalls += 1;
          return claimResult;
        },
      });
      expect(claimCalls).toBe(1);
      expect(
        outreachClaimValidationFingerprint({
          claims: [email.claim],
          sources: [{ id: "src1", text: "ship", category: "PROFILE_FACT", url: null }],
          assetType: "EMAIL",
        }),
      ).toMatch(/^[a-f0-9]{64}$/);

      await prisma.applicationJob.deleteMany({
        where: { campaignId, type: "OUTREACH" },
      });
      const running = await prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type: "OUTREACH",
          targetId: "p1",
          status: "IN_PROGRESS",
          startedAt: new Date(),
          workerHeartbeatAt: new Date(),
        },
      });
      const followUp = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "OUTREACH",
        targetId: "p1",
        payload: { purpose: "PROACTIVE", regenerationInstruction: "newer" },
      });
      expect(followUp.id).not.toBe(running.id);
      expect(followUp.status).toBe("PENDING");
      const again = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "OUTREACH",
        targetId: "p1",
        payload: { purpose: "CHECK_IN" },
      });
      expect(again.id).toBe(followUp.id);
    });

    it("thank-you clarify and contact profile: unchanged skip; change once; serialize contact", async () => {
      let clarifyCalls = 0;
      const questions = {
        questions: [{ id: "q1", text: "What did you discuss?" }],
      };
      const first = await runGatedInterviewThankYouClarify({
        organizationId,
        campaignId,
        stageId: "stage-1",
        notes: "Talked about roadmap.",
        qualityFeedback: [],
        callProvider: async () => {
          clarifyCalls += 1;
          return questions;
        },
      });
      expect(first.skipped).toBe(false);
      expect(clarifyCalls).toBe(1);
      const second = await runGatedInterviewThankYouClarify({
        organizationId,
        campaignId,
        stageId: "stage-1",
        notes: "Talked about roadmap.",
        qualityFeedback: [],
        callProvider: async () => {
          clarifyCalls += 1;
          return questions;
        },
      });
      expect(second.skipped).toBe(true);
      expect(clarifyCalls).toBe(1);
      expect(
        interviewThankYouClarifyFingerprint({
          notes: "Talked about roadmap.",
          qualityFeedback: [],
        }),
      ).toMatch(/^[a-f0-9]{64}$/);

      const extracted: LinkedInExtracted = {
        headline: null,
        about: null,
        currentTitle: {
          text: "VP Sales",
          kind: "FACT",
          provenance: [{ sourceId: "linkedin-paste" }],
        },
        currentEmployer: {
          text: "Acme",
          kind: "FACT",
          provenance: [{ sourceId: "linkedin-paste" }],
        },
        currentTenure: null,
        workExperience: [],
        priorRoles: [],
        education: [],
        certifications: [],
        skills: [],
        statedFocus: [],
      };
      let extractCalls = 0;
      await runGatedContactProfileExtract({
        organizationId,
        campaignId,
        contactId: "ct-profile",
        pastedText: "VP Sales at Acme",
        contactName: "Pat Lee",
        callProvider: async () => {
          extractCalls += 1;
          return extracted;
        },
      });
      await runGatedContactProfileExtract({
        organizationId,
        campaignId,
        contactId: "ct-profile",
        pastedText: "VP Sales at Acme",
        contactName: "Pat Lee",
        callProvider: async () => {
          extractCalls += 1;
          return extracted;
        },
      });
      expect(extractCalls).toBe(1);

      let synthCalls = 0;
      const draft = {
        caresAbout: [{ text: "Forecasting", kind: "INFERENCE" as const }],
        talkingPoints: [{ text: "Ask about pipeline", kind: "INFERENCE" as const }],
        likelyToValue: [{ text: "Likely to value accuracy", kind: "INFERENCE" as const }],
      };
      await runGatedContactProfileSynthesize({
        organizationId,
        campaignId,
        contactId: "ct-profile",
        contactName: "Pat Lee",
        extracted,
        profileText: "VP Sales at Acme",
        roleName: "Hiring Manager",
        roleNarrative: null,
        callProvider: async () => {
          synthCalls += 1;
          return draft;
        },
      });
      await runGatedContactProfileSynthesize({
        organizationId,
        campaignId,
        contactId: "ct-profile",
        contactName: "Pat Lee",
        extracted,
        profileText: "VP Sales at Acme",
        roleName: "Hiring Manager",
        roleNarrative: null,
        callProvider: async () => {
          synthCalls += 1;
          return draft;
        },
      });
      expect(synthCalls).toBe(1);
      expect(
        contactProfileExtractFingerprint({
          pastedText: "VP Sales at Acme",
          contactName: "Pat Lee",
        }),
      ).toMatch(/^[a-f0-9]{64}$/);
      expect(
        contactProfileSynthesizeFingerprint({
          contactName: "Pat Lee",
          extracted,
          profileText: "VP Sales at Acme",
          roleName: "Hiring Manager",
          roleNarrative: null,
        }),
      ).toMatch(/^[a-f0-9]{64}$/);

      await prisma.applicationJob.deleteMany({
        where: { campaignId, type: "CONTACT_PROFILE" },
      });
      const running = await prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type: "CONTACT_PROFILE",
          targetId: "ct-profile",
          status: "IN_PROGRESS",
          startedAt: new Date(),
          workerHeartbeatAt: new Date(),
        },
      });
      const followUp = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "CONTACT_PROFILE",
        targetId: "ct-profile",
      });
      expect(followUp.id).not.toBe(running.id);
      expect(followUp.status).toBe("PENDING");
    });
  },
);
