/**
 * Account lifecycle B3 — read-only, cancel-at-period-end, restore.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_READ_ONLY_ACTION_MESSAGE,
  ACCOUNT_READ_ONLY_BANNER_MESSAGE,
  OrganizationReadOnlyError,
  accountCancelScheduledMessage,
} from "@/lib/billing/account-read-only";
import {
  clearOrganizationReadOnly,
  enterOrganizationReadOnly,
} from "@/lib/billing/enter-read-only";
import {
  assertOrganizationMaySpend,
  assertOrganizationWritable,
  checkOrganizationMaySpend,
} from "@/lib/billing/organization-spend";
import {
  getOrganizationPaymentLockState,
  isOrganizationReadOnly,
  isPaymentLocked,
  isSpendBlocked,
} from "@/lib/billing/payment-lock";
import { mirrorCancelAtPeriodEndLocally } from "@/lib/billing/schedule-cancel-at-period-end";
import { formatBillingDate } from "@/lib/billing/billing-state";
import { BILLING_PLAN_COMPED, BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import { buildSidebarNavItems } from "@/lib/auth/user-menu";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("account lifecycle B3 source seams", () => {
  it("exposes exact seeker messages", () => {
    expect(ACCOUNT_READ_ONLY_BANNER_MESSAGE).toBe(
      "Your subscription has ended, so your account is read-only. Renew within 30 days to keep everything. After that, your account and data are permanently deleted.",
    );
    expect(ACCOUNT_READ_ONLY_ACTION_MESSAGE).toBe(
      "Your account is read-only. Renew your subscription to make changes.",
    );
    const end = new Date("2026-11-01T15:00:00.000Z");
    expect(accountCancelScheduledMessage(end)).toBe(
      `Your subscription ends on ${formatBillingDate(end)}. You'll keep full access until then.`,
    );
  });

  it("billing page shows cancel-scheduled and read-only banner copy", () => {
    const billing = readFileSync(
      "src/app/(app)/settings/billing/page.tsx",
      "utf8",
    );
    expect(billing).toContain("accountCancelScheduledMessage");
    expect(billing).toContain("ACCOUNT_READ_ONLY_BANNER_MESSAGE");
    expect(billing).toContain("billing-cancel-at-period-end");
  });

  it("OrganizationReadOnlyError extends TenantError for action catch sites", async () => {
    const err = new OrganizationReadOnlyError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(ACCOUNT_READ_ONLY_ACTION_MESSAGE);
    const { TenantError } = await import("@/lib/tenant/errors");
    expect(err).toBeInstanceOf(TenantError);
  });

  it("read-only keeps full nav (applications, settings) — no billing-only shell", () => {
    const items = buildSidebarNavItems({
      hasOrganization: true,
      isPlatformOperator: false,
      paymentLocked: false,
    });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/campaigns");
    expect(hrefs).toContain("/settings");
    expect(hrefs).not.toEqual(["/settings/billing"]);
  });

  it("main application step pages remain routable while read-only (view-all)", () => {
    const steps = [
      "src/app/(app)/campaigns/page.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
      "src/app/(app)/campaigns/[id]/assets/page.tsx",
      "src/app/(app)/campaigns/[id]/interviews/[stageId]/page.tsx",
      "src/app/(app)/campaigns/[id]/outreach/page.tsx",
      "src/app/(app)/settings/page.tsx",
    ];
    for (const rel of steps) {
      expect(existsSync(resolve(rel)), rel).toBe(true);
    }
    const gate = readFileSync("src/lib/billing/payment-lock-gate.ts", "utf8");
    expect(gate).not.toContain('redirect("/settings/billing")');
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain("ACCOUNT_READ_ONLY_BANNER_MESSAGE");
    expect(shell).toContain("account-readonly-banner");
  });

  it("digest prefs are not exempt; billing/support/account are", () => {
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");
    expect(lock).toContain('"/settings/billing"');
    expect(lock).toContain('"/support"');
    expect(lock).toContain('"/settings/account"');
    expect(lock).not.toContain('"/settings/cadence"');
    const cadence = readFileSync("src/app/actions/cadence.ts", "utf8");
    expect(cadence).toContain("requireOrganization");
    expect(cadence).toContain("digestEnabled");
  });

  it("webhook handles cancel-at-period-end sync and invoice payment failure", () => {
    const webhook = readFileSync(
      "src/lib/billing/handle-stripe-webhook.ts",
      "utf8",
    );
    expect(webhook).toContain("customer.subscription.updated");
    expect(webhook).toContain("customer.subscription.deleted");
    expect(webhook).toContain("invoice.payment_failed");
    expect(webhook).toContain("invoice.paid");
    expect(webhook).toContain("markSubscriptionCanceled");
    expect(webhook).toContain("syncSubscriptionById");
  });

  it("self-serve cancel schedules CAPE; wipe keeps immediate cancel", () => {
    const workspace = readFileSync("src/app/actions/workspace.ts", "utf8");
    expect(workspace).toContain("scheduleSubscriptionCancelAtPeriodEnd");
    expect(workspace).not.toContain("cancelStripeSubscriptionForOrgDelete");
    const wipe = readFileSync("src/lib/account/wipe-organization.ts", "utf8");
    expect(wipe).toContain("cancelStripeSubscriptionForOrgDelete");
  });
});

describe.skipIf(!hasDatabase)(
  "account lifecycle B3 (Postgres)",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = `b3_${Date.now().toString(36)}`;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1 FROM "OrganizationBillingProfile" LIMIT 0`;
        await prisma.$queryRaw`SELECT "readOnlyStartedAt" FROM "OrganizationBillingProfile" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping B3 DB tests: apply pending migrations (readOnlyStartedAt).",
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
          name: "B3 Test",
          email,
          emailVerified: true,
          firstName: "B3",
          lastName: "Test",
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
      const email = `b3-${tag}@example.test`;
      const authId = `auth_b3_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "B3",
        lastName: "Test",
        companyName: `B3 ${tag}`,
      });
      return {
        orgId: provisioned.organization!.id,
        userId: provisioned.user.id,
      };
    }

    it("cancel-at-period-end keeps full access until period end, then read-only", async () => {
      if (!ready) return;
      const { orgId } = await provisionOrg(`${suffix}_cape`);
      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "ACTIVE",
          stripeSubscriptionId: `sub_cape_${suffix}`,
        },
      });
      const periodEnd = new Date("2026-10-20T12:00:00.000Z");

      await mirrorCancelAtPeriodEndLocally({
        organizationId: orgId,
        currentPeriodEnd: periodEnd,
      });

      const scheduled = await prisma.organizationBillingProfile.findUniqueOrThrow(
        {
          where: { organizationId: orgId },
        },
      );
      expect(scheduled.cancelAtPeriodEnd).toBe(true);
      expect(scheduled.readOnlyStartedAt).toBeNull();
      expect(scheduled.billingStatus).toBe("ACTIVE");
      expect(isSpendBlocked(scheduled)).toBe(false);
      expect(isPaymentLocked(scheduled)).toBe(false);
      await expect(assertOrganizationMaySpend(orgId)).resolves.toBeUndefined();
      await expect(assertOrganizationWritable(orgId)).resolves.toBeUndefined();

      const entered = await enterOrganizationReadOnly({
        organizationId: orgId,
        now: periodEnd,
      });
      expect(entered.entered).toBe(true);

      const after = await prisma.organizationBillingProfile.findUniqueOrThrow({
        where: { organizationId: orgId },
      });
      expect(after.readOnlyStartedAt?.getTime()).toBe(periodEnd.getTime());
      expect(after.billingStatus).toBe("CANCELED");
      expect(after.cancelAtPeriodEnd).toBe(false);
      expect(isOrganizationReadOnly(after)).toBe(true);
      expect(isSpendBlocked(after)).toBe(true);
      expect(isPaymentLocked(after)).toBe(false);

      await expect(assertOrganizationMaySpend(orgId)).rejects.toBeInstanceOf(
        OrganizationReadOnlyError,
      );
      await expect(assertOrganizationWritable(orgId)).rejects.toMatchObject({
        message: ACCOUNT_READ_ONLY_ACTION_MESSAGE,
      });
    });

    it("renewal payment failure at period end enters read-only", async () => {
      if (!ready) return;
      const { orgId } = await provisionOrg(`${suffix}_fail`);
      const periodEnd = new Date("2026-09-01T00:00:00.000Z");
      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "PAST_DUE",
          stripeSubscriptionId: `sub_fail_${suffix}`,
          currentPeriodEnd: periodEnd,
        },
      });

      await enterOrganizationReadOnly({
        organizationId: orgId,
        billingStatus: "PAST_DUE",
        now: new Date("2026-09-02T00:00:00.000Z"),
      });

      const profile = await prisma.organizationBillingProfile.findUniqueOrThrow({
        where: { organizationId: orgId },
      });
      expect(profile.readOnlyStartedAt).not.toBeNull();
      expect(profile.billingStatus).toBe("PAST_DUE");
      const check = await checkOrganizationMaySpend(orgId);
      expect(check.allowed).toBe(false);
      if (!check.allowed) {
        expect(check.message).toBe(ACCOUNT_READ_ONLY_ACTION_MESSAGE);
      }
    });

    it("blocked spend/write returns exact read-only message; paid call does not run", async () => {
      if (!ready) return;
      const { orgId } = await provisionOrg(`${suffix}_block`);
      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "ACTIVE",
          stripeSubscriptionId: `sub_block_${suffix}`,
        },
      });
      await enterOrganizationReadOnly({ organizationId: orgId });

      await expect(assertOrganizationMaySpend(orgId)).rejects.toThrow(
        ACCOUNT_READ_ONLY_ACTION_MESSAGE,
      );
      await expect(assertOrganizationWritable(orgId)).rejects.toThrow(
        ACCOUNT_READ_ONLY_ACTION_MESSAGE,
      );

      const { runPaidStructuredCall } = await import("@/lib/ai/paid-call-gate");
      let providerCalls = 0;
      await expect(
        runPaidStructuredCall({
          organizationId: orgId,
          operation: "COMPANY_RESEARCH",
          subjectKey: `b3-${suffix}`,
          inputFingerprint: `fp-b3-${suffix}`,
          parseStored: (json) => json as { ok: boolean },
          isResultUsable: () => true,
          callProvider: async () => {
            providerCalls += 1;
            return { ok: true };
          },
        }),
      ).rejects.toBeInstanceOf(OrganizationReadOnlyError);
      expect(providerCalls).toBe(0);
    });

    it("paying/resubscribing within 30 days clears read-only and keeps data", async () => {
      if (!ready) return;
      const { orgId, userId } = await provisionOrg(`${suffix}_restore`);
      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "ACTIVE",
          stripeSubscriptionId: `sub_restore_${suffix}`,
        },
      });
      const product = await prisma.product.create({
        data: { organizationId: orgId, name: `Keep ${suffix}` },
      });
      await enterOrganizationReadOnly({
        organizationId: orgId,
        now: new Date("2026-09-10T00:00:00.000Z"),
      });

      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: { billingStatus: "ACTIVE" },
      });
      await clearOrganizationReadOnly({ organizationId: orgId });

      const profile = await prisma.organizationBillingProfile.findUniqueOrThrow({
        where: { organizationId: orgId },
      });
      expect(profile.readOnlyStartedAt).toBeNull();
      expect(isSpendBlocked(profile)).toBe(false);
      await expect(assertOrganizationMaySpend(orgId)).resolves.toBeUndefined();

      const stillThere = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(stillThere?.name).toBe(`Keep ${suffix}`);
      expect(stillThere?.organizationId).toBe(orgId);
      void userId;
    });

    it("FREE and COMPED never become read-only", async () => {
      if (!ready) return;
      const free = await provisionOrg(`${suffix}_free`);
      await prisma.organizationBillingProfile.update({
        where: { organizationId: free.orgId },
        data: {
          planCode: "FREE",
          billingStatus: "FREE",
          stripeSubscriptionId: null,
        },
      });
      expect(
        await enterOrganizationReadOnly({ organizationId: free.orgId }),
      ).toEqual({ entered: false });
      const freeProfile =
        await prisma.organizationBillingProfile.findUniqueOrThrow({
          where: { organizationId: free.orgId },
        });
      expect(freeProfile.readOnlyStartedAt).toBeNull();
      expect(isOrganizationReadOnly(freeProfile)).toBe(false);

      const comped = await provisionOrg(`${suffix}_comped`);
      await prisma.organizationBillingProfile.update({
        where: { organizationId: comped.orgId },
        data: {
          planCode: BILLING_PLAN_COMPED,
          billingStatus: "FREE",
          stripeSubscriptionId: null,
        },
      });
      expect(
        await enterOrganizationReadOnly({ organizationId: comped.orgId }),
      ).toEqual({ entered: false });
      const state = await getOrganizationPaymentLockState(comped.orgId);
      expect(state.readOnly).toBe(false);
      expect(state.spendBlocked).toBe(false);
    });

    it("cancel-scheduled message uses period end date formatting", async () => {
      if (!ready) return;
      const periodEnd = new Date("2026-12-25T18:00:00.000Z");
      expect(accountCancelScheduledMessage(periodEnd)).toBe(
        `Your subscription ends on ${formatBillingDate(periodEnd)}. You'll keep full access until then.`,
      );
    });
  },
);
