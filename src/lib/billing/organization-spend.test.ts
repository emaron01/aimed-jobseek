/**
 * Account lifecycle B2 — organization spend guard on paid-call gate, workers, enqueue.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OrganizationReadOnlyError } from "@/lib/billing/account-read-only";
import {
  ACCOUNT_READ_ONLY_ACTION_MESSAGE,
  ORGANIZATION_MISSING_TERMINAL_REASON,
  OrganizationMissingError,
  assertOrganizationMaySpend,
  checkOrganizationMaySpend,
} from "@/lib/billing/organization-spend";
import { BILLING_PLAN_COMPED, BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("organization spend guard source seams", () => {
  it("paid-call gate asserts may-spend before provider work", () => {
    const src = readFileSync(resolve("src/lib/ai/paid-call-gate.ts"), "utf8");
    expect(src).toContain("assertOrganizationMaySpend");
    const assertIdx = src.indexOf("assertOrganizationMaySpend(input.organizationId)");
    const lockIdx = src.indexOf("withSubjectLock(");
    expect(assertIdx).toBeGreaterThan(0);
    expect(lockIdx).toBeGreaterThan(assertIdx);
  });

  it("application job process and enqueue call the shared guard", () => {
    const processSrc = readFileSync(
      resolve("src/lib/application-jobs/process.ts"),
      "utf8",
    );
    expect(processSrc).toContain("checkOrganizationMaySpend");
    const serviceSrc = readFileSync(
      resolve("src/lib/application-jobs/service.ts"),
      "utf8",
    );
    expect(serviceSrc).toContain("assertOrganizationMaySpend");
  });

  it("research process and enqueue call the shared guard", () => {
    const src = readFileSync(
      resolve("src/lib/research/runs-service.ts"),
      "utf8",
    );
    expect(src).toContain("checkOrganizationMaySpend");
    expect(src).toContain("assertOrganizationMaySpend");
  });
});

describe.skipIf(!hasDatabase)(
  "organization spend guard (Postgres)",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = `spend_${Date.now().toString(36)}`;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1 FROM "Organization" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "OrganizationBillingProfile" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping spend-guard DB tests: apply pending migrations.",
        );
        return;
      }
      ready = true;
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    async function createAuthUser(email: string, authId: string) {
      await prisma.authUser.create({
        data: {
          id: authId,
          name: "Spend Guard",
          email,
          emailVerified: true,
          firstName: "Spend",
          lastName: "Guard",
        },
      });
      await prisma.authAccount.create({
        data: {
          id: `acct_${authId}`,
          accountId: authId,
          providerId: "credential",
          issuer: "local:credential",
          userId: authId,
          password: "test-hash",
        },
      });
    }

    async function provisionOrg(tag: string) {
      const email = `spend-${tag}@example.test`;
      const authId = `auth_spend_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Spend",
        lastName: "Guard",
        companyName: `Spend ${tag}`,
      });
      return {
        orgId: provisioned.organization!.id,
        userId: provisioned.user.id,
        email,
        authId,
      };
    }

    async function setBilling(
      orgId: string,
      data: {
        planCode: string;
        billingStatus: string;
        stripeSubscriptionId?: string | null;
      },
    ) {
      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          planCode: data.planCode,
          billingStatus: data.billingStatus as never,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
        },
      });
    }

    async function seedCampaign(orgId: string, userId: string, tag: string) {
      const product = await prisma.product.create({
        data: { organizationId: orgId, name: `Product ${tag}` },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgId,
          ownerUserId: userId,
          name: `Campaign ${tag}`,
          productId: product.id,
        },
      });
      return { productId: product.id, campaignId: campaign.id };
    }

    it("checkOrganizationMaySpend allows FREE, COMPED, and ACTIVE; blocks CANCELED", async () => {
      if (!ready) return;
      const free = await provisionOrg(`${suffix}_free`);
      await setBilling(free.orgId, {
        planCode: "FREE",
        billingStatus: "FREE",
      });
      expect(await checkOrganizationMaySpend(free.orgId)).toEqual({
        allowed: true,
      });

      const comped = await provisionOrg(`${suffix}_comped`);
      await setBilling(comped.orgId, {
        planCode: BILLING_PLAN_COMPED,
        billingStatus: "FREE",
      });
      expect(await checkOrganizationMaySpend(comped.orgId)).toEqual({
        allowed: true,
      });

      const active = await provisionOrg(`${suffix}_active`);
      await setBilling(active.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "ACTIVE",
        stripeSubscriptionId: `sub_active_${suffix}`,
      });
      expect(await checkOrganizationMaySpend(active.orgId)).toEqual({
        allowed: true,
      });

      const blocked = await provisionOrg(`${suffix}_canceled`);
      await setBilling(blocked.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
        stripeSubscriptionId: `sub_canceled_${suffix}`,
      });
      const denied = await checkOrganizationMaySpend(blocked.orgId);
      expect(denied.allowed).toBe(false);
      if (!denied.allowed) {
        expect(denied.reason).toBe("READ_ONLY");
        expect(denied.message).toBe(ACCOUNT_READ_ONLY_ACTION_MESSAGE);
      }

      const missing = await checkOrganizationMaySpend(`missing_org_${suffix}`);
      expect(missing).toMatchObject({
        allowed: false,
        reason: "ORGANIZATION_MISSING",
        message: ORGANIZATION_MISSING_TERMINAL_REASON,
      });
    });

    it("runPaidStructuredCall refuses missing and spend-blocked orgs with no provider call or receipt", async () => {
      if (!ready) return;
      const { runPaidStructuredCall } = await import("@/lib/ai/paid-call-gate");

      let providerCalls = 0;
      const callProvider = async () => {
        providerCalls += 1;
        return { ok: true };
      };

      await expect(
        runPaidStructuredCall({
          organizationId: `gone_${suffix}`,
          operation: "COMPANY_RESEARCH",
          subjectKey: `missing-${suffix}`,
          inputFingerprint: `fp-missing-${suffix}`,
          parseStored: (json) => json as { ok: boolean },
          isResultUsable: () => true,
          callProvider,
        }),
      ).rejects.toBeInstanceOf(OrganizationMissingError);
      expect(providerCalls).toBe(0);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId: `gone_${suffix}` },
        }),
      ).toBe(0);

      const blocked = await provisionOrg(`${suffix}_paid_block`);
      await setBilling(blocked.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
        stripeSubscriptionId: `sub_paid_block_${suffix}`,
      });
      await expect(
        runPaidStructuredCall({
          organizationId: blocked.orgId,
          operation: "COMPANY_RESEARCH",
          subjectKey: `blocked-${suffix}`,
          inputFingerprint: `fp-blocked-${suffix}`,
          parseStored: (json) => json as { ok: boolean },
          isResultUsable: () => true,
          callProvider,
        }),
      ).rejects.toBeInstanceOf(OrganizationReadOnlyError);
      expect(providerCalls).toBe(0);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId: blocked.orgId },
        }),
      ).toBe(0);

      const free = await provisionOrg(`${suffix}_paid_ok`);
      await setBilling(free.orgId, {
        planCode: "FREE",
        billingStatus: "FREE",
      });
      const ok = await runPaidStructuredCall({
        organizationId: free.orgId,
        operation: "COMPANY_RESEARCH",
        subjectKey: `ok-${suffix}`,
        inputFingerprint: `fp-ok-${suffix}`,
        parseStored: (json) => json as { ok: boolean },
        isResultUsable: () => true,
        callProvider,
      });
      expect(ok.skipped).toBe(false);
      expect(providerCalls).toBe(1);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId: free.orgId },
        }),
      ).toBe(1);

      await expect(assertOrganizationMaySpend(free.orgId)).resolves.toBeUndefined();
      await expect(
        assertOrganizationMaySpend(`gone_${suffix}`),
      ).rejects.toBeInstanceOf(OrganizationMissingError);
    });

    it("processApplicationJob ends cleanly for spend-blocked and missing-org jobs", async () => {
      if (!ready) return;
      const { processApplicationJob } = await import(
        "@/lib/application-jobs/process"
      );
      const { enqueueApplicationJob } = await import(
        "@/lib/application-jobs/service"
      );

      const blocked = await provisionOrg(`${suffix}_job_block`);
      await setBilling(blocked.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "ACTIVE",
        stripeSubscriptionId: `sub_job_${suffix}`,
      });
      const { campaignId } = await seedCampaign(
        blocked.orgId,
        blocked.userId,
        `${suffix}_job`,
      );
      // Enqueue while allowed, then lock spend.
      const job = await enqueueApplicationJob({
        organizationId: blocked.orgId,
        campaignId,
        type: "NEXT_STEP",
      });
      await setBilling(blocked.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
        stripeSubscriptionId: `sub_job_${suffix}`,
      });

      const result = await processApplicationJob(job.id);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/canceled|Billing|subscription/i);
      const failed = await prisma.applicationJob.findUnique({
        where: { id: job.id },
      });
      expect(failed?.status).toBe("FAILED");
      expect(failed?.error).toBe(result.error);

      // Deleted org: wipe removes jobs; process of prior id ends cleanly.
      const doomed = await provisionOrg(`${suffix}_job_wipe`);
      const seeded = await seedCampaign(
        doomed.orgId,
        doomed.userId,
        `${suffix}_wipe_job`,
      );
      const doomedJob = await enqueueApplicationJob({
        organizationId: doomed.orgId,
        campaignId: seeded.campaignId,
        type: "NEXT_STEP",
      });
      const doomedJobId = doomedJob.id;
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      await wipeOrganizationAccount({
        organizationId: doomed.orgId,
        reason: "admin",
      });
      const wipedResult = await processApplicationJob(doomedJobId);
      expect(wipedResult.ok).toBe(false);
      expect(wipedResult.error).toMatch(/not found/i);
      expect(
        await prisma.applicationJob.count({
          where: { organizationId: doomed.orgId },
        }),
      ).toBe(0);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId: doomed.orgId },
        }),
      ).toBe(0);
    });

    it("processResearchRun ends cleanly for spend-blocked and wiped orgs", async () => {
      if (!ready) return;
      const { processResearchRun, enqueueApplicationResearch } = await import(
        "@/lib/research/runs-service"
      );

      const blocked = await provisionOrg(`${suffix}_run_block`);
      await setBilling(blocked.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "ACTIVE",
        stripeSubscriptionId: `sub_run_${suffix}`,
      });
      const { campaignId } = await seedCampaign(
        blocked.orgId,
        blocked.userId,
        `${suffix}_run`,
      );
      const company = await prisma.company.create({
        data: {
          organizationId: blocked.orgId,
          name: `Co ${suffix}`,
          normalizedName: `co ${suffix}`,
          normalizedDomain: `co-${suffix}.example.test`,
        },
      });
      const run = await enqueueApplicationResearch({
        organizationId: blocked.orgId,
        campaignId,
        companyId: company.id,
        initiatedByUserId: blocked.userId,
      });
      await prisma.researchRun.update({
        where: { id: run.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      await setBilling(blocked.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
        stripeSubscriptionId: `sub_run_${suffix}`,
      });

      await processResearchRun(run.id);
      const failed = await prisma.researchRun.findUnique({
        where: { id: run.id },
      });
      expect(failed?.status).toBe("FAILED");
      expect(failed?.lastError).toMatch(/canceled|Billing|subscription/i);

      const doomed = await provisionOrg(`${suffix}_run_wipe`);
      const seeded = await seedCampaign(
        doomed.orgId,
        doomed.userId,
        `${suffix}_wipe_run`,
      );
      const doomedCompany = await prisma.company.create({
        data: {
          organizationId: doomed.orgId,
          name: `Wipe Co ${suffix}`,
          normalizedName: `wipe co ${suffix}`,
          normalizedDomain: `wipe-co-${suffix}.example.test`,
        },
      });
      const doomedRun = await enqueueApplicationResearch({
        organizationId: doomed.orgId,
        campaignId: seeded.campaignId,
        companyId: doomedCompany.id,
      });
      const doomedRunId = doomedRun.id;
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      await wipeOrganizationAccount({
        organizationId: doomed.orgId,
        reason: "admin",
      });
      await processResearchRun(doomedRunId);
      expect(
        await prisma.researchRun.count({
          where: { organizationId: doomed.orgId },
        }),
      ).toBe(0);
    });

    it("enqueue refuses missing and spend-blocked organizations", async () => {
      if (!ready) return;
      const { enqueueApplicationJob } = await import(
        "@/lib/application-jobs/service"
      );
      const { createResearchRun, enqueueApplicationResearch } = await import(
        "@/lib/research/runs-service"
      );

      await expect(
        enqueueApplicationJob({
          organizationId: `missing_enq_${suffix}`,
          campaignId: `camp_${suffix}`,
          type: "NEXT_STEP",
        }),
      ).rejects.toBeInstanceOf(OrganizationMissingError);

      const blocked = await provisionOrg(`${suffix}_enq_block`);
      await setBilling(blocked.orgId, {
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
        stripeSubscriptionId: `sub_enq_${suffix}`,
      });
      const { campaignId } = await seedCampaign(
        blocked.orgId,
        blocked.userId,
        `${suffix}_enq`,
      );
      await expect(
        enqueueApplicationJob({
          organizationId: blocked.orgId,
          campaignId,
          type: "NEXT_STEP",
        }),
      ).rejects.toBeInstanceOf(OrganizationReadOnlyError);

      const list = await prisma.contactList.create({
        data: {
          organizationId: blocked.orgId,
          ownerUserId: blocked.userId,
          name: `List ${suffix}`,
        },
      });
      const research = await createResearchRun({
        organizationId: blocked.orgId,
        contactListId: list.id,
        initiatedByUserId: blocked.userId,
      });
      expect(research.ok).toBe(false);
      if (!research.ok) {
        expect(research.code).toBe("READ_ONLY");
        expect(research.message).toBe(ACCOUNT_READ_ONLY_ACTION_MESSAGE);
      }

      await expect(
        enqueueApplicationResearch({
          organizationId: blocked.orgId,
          campaignId,
          companyId: "nope",
        }),
      ).rejects.toBeInstanceOf(OrganizationReadOnlyError);
    });

    it("after full wipe, enqueue and paid call cannot recreate org data", async () => {
      if (!ready) return;
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      const { enqueueApplicationJob } = await import(
        "@/lib/application-jobs/service"
      );
      const { createResearchRun } = await import("@/lib/research/runs-service");
      const { runPaidStructuredCall } = await import("@/lib/ai/paid-call-gate");

      const seeded = await provisionOrg(`${suffix}_after_wipe`);
      const { campaignId } = await seedCampaign(
        seeded.orgId,
        seeded.userId,
        `${suffix}_after`,
      );
      const list = await prisma.contactList.create({
        data: {
          organizationId: seeded.orgId,
          ownerUserId: seeded.userId,
          name: `Wipe list ${suffix}`,
        },
      });
      const orgId = seeded.orgId;

      await wipeOrganizationAccount({ organizationId: orgId, reason: "admin" });

      await expect(
        enqueueApplicationJob({
          organizationId: orgId,
          campaignId,
          type: "RESUME",
        }),
      ).rejects.toBeInstanceOf(OrganizationMissingError);

      const research = await createResearchRun({
        organizationId: orgId,
        contactListId: list.id,
        initiatedByUserId: seeded.userId,
      });
      expect(research.ok).toBe(false);
      if (!research.ok) {
        expect(research.code).toBe("ORGANIZATION_MISSING");
      }

      let calls = 0;
      await expect(
        runPaidStructuredCall({
          organizationId: orgId,
          operation: "COMPANY_RESEARCH",
          subjectKey: `post-wipe-${suffix}`,
          inputFingerprint: `fp-post-wipe-${suffix}`,
          parseStored: (json) => json as { ok: boolean },
          isResultUsable: () => true,
          callProvider: async () => {
            calls += 1;
            return { ok: true };
          },
        }),
      ).rejects.toBeInstanceOf(OrganizationMissingError);
      expect(calls).toBe(0);
      expect(
        await prisma.applicationJob.count({ where: { organizationId: orgId } }),
      ).toBe(0);
      expect(
        await prisma.researchRun.count({ where: { organizationId: orgId } }),
      ).toBe(0);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId: orgId },
        }),
      ).toBe(0);
    });
  },
);
