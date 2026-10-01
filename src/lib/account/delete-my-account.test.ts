/**
 * Account lifecycle B4 — self-serve "Delete my account".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETED_LOGIN_MESSAGE,
  ACCOUNT_DELETED_LOGIN_QUERY,
  DELETE_MY_ACCOUNT_BUTTON_LABEL,
  DELETE_MY_ACCOUNT_CONFIRM_BODY,
  DELETE_MY_ACCOUNT_CONFIRM_PHRASE,
  DELETE_MY_ACCOUNT_FAILURE_MESSAGE,
  DELETE_MY_ACCOUNT_MENU_LABEL,
  DELETE_MY_ACCOUNT_OWNER_ONLY_MESSAGE,
} from "@/lib/account/delete-my-account";
import { buildUserMenuModel } from "@/lib/auth/user-menu";
import { enterOrganizationReadOnly } from "@/lib/billing/enter-read-only";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("account lifecycle B4 — account settings delete placement", () => {
  it("menu does not include Delete my account", () => {
    const owner = buildUserMenuModel({
      email: "owner@example.test",
      platformRole: "NONE",
      organizationName: "Mine",
      membershipRole: "OWNER",
    });
    expect(owner.links.map((l) => l.id)).toEqual([
      "account_settings",
      "organization_settings",
      "support",
      "log_out",
    ]);
    expect(owner.links.some((l) => l.label === DELETE_MY_ACCOUNT_MENU_LABEL)).toBe(
      false,
    );
  });

  it("Account settings hosts OWNER-only delete panel with exact confirmation", () => {
    const page = readFileSync(
      resolve("src/app/(app)/settings/account/page.tsx"),
      "utf8",
    );
    expect(page).toContain("AccountSettingsDeleteSection");
    expect(page).toContain('"OWNER"');
    expect(page).toContain("isOwner={isOwner}");

    const panel = readFileSync(
      resolve("src/components/DeleteMyAccountPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("DELETE_MY_ACCOUNT_CONFIRM_BODY");
    expect(panel).toContain("DELETE_MY_ACCOUNT_CONFIRM_PHRASE");
    expect(panel).toContain("DELETE_MY_ACCOUNT_BUTTON_LABEL");
    expect(panel).toContain("deleteMyAccountAction");
    expect(panel).toContain('data-testid="delete-my-account-confirm"');
    expect(panel).toContain('data-testid="delete-my-account-confirm-input"');
    expect(panel).toContain('data-testid="delete-my-account-submit"');
    expect(panel).toContain('data-testid="delete-my-account-cancel"');
    expect(panel).toContain("disabled={!matches || pending}");
    expect(panel).toContain('setOpen(false)');

    const menu = readFileSync(resolve("src/components/UserMenu.tsx"), "utf8");
    expect(menu).not.toContain("deleteMyAccountAction");
    expect(menu).not.toContain("DeleteMyAccount");
    expect(menu).toContain('action="/api/account/logout"');

    const copy = readFileSync(
      resolve("src/lib/account/delete-my-account.ts"),
      "utf8",
    );
    expect(copy).toContain(DELETE_MY_ACCOUNT_CONFIRM_BODY);
    expect(DELETE_MY_ACCOUNT_CONFIRM_BODY).toBe(
      "This permanently deletes your account and everything in it: your profile, applications, Harper coaching, cheat sheets, resumes, and messages. This can't be undone.",
    );
    expect(DELETE_MY_ACCOUNT_CONFIRM_PHRASE).toBe("DELETE");
    expect(DELETE_MY_ACCOUNT_BUTTON_LABEL).toBe(
      "Permanently delete my account",
    );
  });

  it("login shows exact post-delete message", () => {
    const login = readFileSync(
      resolve("src/app/(auth)/login/page.tsx"),
      "utf8",
    );
    expect(login).toContain("ACCOUNT_DELETED_LOGIN_MESSAGE");
    expect(login).toContain("ACCOUNT_DELETED_LOGIN_QUERY");
    expect(login).toContain('data-testid="account-deleted-notice"');
    expect(ACCOUNT_DELETED_LOGIN_MESSAGE).toBe(
      "Your account has been permanently deleted.",
    );
    expect(ACCOUNT_DELETED_LOGIN_QUERY).toBe("accountDeleted");
  });

  it("action uses shared wipe with self_serve and does not call requireOrganization", () => {
    const action = readFileSync(
      resolve("src/app/actions/account.ts"),
      "utf8",
    );
    expect(action).toContain("deleteMyAccountAction");
    expect(action).toContain("wipeOrganizationAccount");
    expect(action).toContain('reason: "self_serve"');
    expect(action).toContain("auth.api.signOut");
    expect(action).toContain(`ACCOUNT_DELETED_LOGIN_QUERY`);
    expect(action).toContain("membership.role !== \"OWNER\"");
    expect(action).toContain(
      "Does not call requireOrganization — must work while the account is read-only.",
    );
    expect(action).not.toMatch(/\brequireOrganization\s*\(/);
    expect(action).toContain("DELETE_MY_ACCOUNT_FAILURE_MESSAGE");
    expect(DELETE_MY_ACCOUNT_FAILURE_MESSAGE).toBe(
      "We couldn't delete your account. Nothing was deleted. Please contact support.",
    );
  });

  it("restores the read-only layout block and exempts account settings and Log Out", () => {
    const gate = readFileSync(
      resolve("src/lib/billing/payment-lock-gate.ts"),
      "utf8",
    );
    expect(gate).toContain("throw new OrganizationReadOnlyError");
    expect(gate).toContain("/api/account/logout");
    expect(gate).toContain("/settings/account");
    const route = readFileSync(
      resolve("src/app/api/account/logout/route.ts"),
      "utf8",
    );
    expect(route).toContain("logoutAction");
    expect(route).not.toMatch(/\brequireOrganization\s*\(/);
    expect(route).not.toContain("enforcePaymentLockGate");
    const accountPage = readFileSync(
      resolve("src/app/(app)/settings/account/page.tsx"),
      "utf8",
    );
    expect(accountPage).toContain("logoutAction");
    const org = readFileSync(
      resolve("src/lib/tenant/getCurrentOrganization.ts"),
      "utf8",
    );
    expect(org).toContain("assertOrganizationWritable");
  });
});

describe("deleteMyAccountAction (unit)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("OWNER confirmed delete runs wipe self_serve, signs out, redirects to login notice", async () => {
    const wipeOrganizationAccount = vi.fn(async () => ({
      organizationId: "org_1",
      organizationName: "Mine",
      alreadyWiped: false,
      purgedUserIds: ["user_1"],
    }));
    const signOut = vi.fn(async () => ({ success: true }));
    const redirect = vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });

    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/lib/auth/server", () => ({
      auth: { api: { signOut } },
    }));
    vi.doMock("@/lib/auth/authz", () => ({
      requireCurrentUser: async () => ({
        id: "user_1",
        activeOrganizationId: "org_1",
      }),
    }));
    vi.doMock("@/lib/auth/session", () => ({
      resolveActiveOrganization: async () => ({
        organization: { id: "org_1" },
        membership: { role: "OWNER" },
      }),
    }));
    vi.doMock("@/lib/account/wipe-organization", () => ({
      wipeOrganizationAccount,
    }));
    vi.doMock("@/lib/auth/audit", () => ({
      recordAdminAuditEvent: vi.fn(),
    }));
    vi.doMock("@/lib/transactional-email/send", () => ({
      sendTransactionalEmail: vi.fn(),
    }));
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
    vi.doMock("@/lib/auth/rate-limit", () => ({
      assertRateLimit: vi.fn(),
      RateLimitError: class RateLimitError extends Error {},
    }));

    const { deleteMyAccountAction } = await import("@/app/actions/account");
    const fd = new FormData();
    fd.set("confirmation", "DELETE");
    await expect(deleteMyAccountAction(null, fd)).rejects.toThrow(
      `NEXT_REDIRECT:/login?${ACCOUNT_DELETED_LOGIN_QUERY}=1`,
    );
    expect(wipeOrganizationAccount).toHaveBeenCalledWith({
      organizationId: "org_1",
      reason: "self_serve",
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("non-OWNER cannot run the action (server-side)", async () => {
    const wipeOrganizationAccount = vi.fn();
    const signOut = vi.fn();

    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
    }));
    vi.doMock("@/lib/auth/server", () => ({
      auth: { api: { signOut } },
    }));
    vi.doMock("@/lib/auth/authz", () => ({
      requireCurrentUser: async () => ({
        id: "user_member",
        activeOrganizationId: "org_1",
      }),
    }));
    vi.doMock("@/lib/auth/session", () => ({
      resolveActiveOrganization: async () => ({
        organization: { id: "org_1" },
        membership: { role: "MEMBER" },
      }),
    }));
    vi.doMock("@/lib/account/wipe-organization", () => ({
      wipeOrganizationAccount,
    }));
    vi.doMock("@/lib/auth/audit", () => ({
      recordAdminAuditEvent: vi.fn(),
    }));
    vi.doMock("@/lib/transactional-email/send", () => ({
      sendTransactionalEmail: vi.fn(),
    }));
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
    vi.doMock("@/lib/auth/rate-limit", () => ({
      assertRateLimit: vi.fn(),
      RateLimitError: class RateLimitError extends Error {},
    }));

    const { deleteMyAccountAction } = await import("@/app/actions/account");
    const fd = new FormData();
    fd.set("confirmation", "DELETE");
    const result = await deleteMyAccountAction(null, fd);
    expect(result).toEqual({
      ok: false,
      message: DELETE_MY_ACCOUNT_OWNER_ONLY_MESSAGE,
    });
    expect(wipeOrganizationAccount).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refused wipe deletes nothing and keeps the seeker signed in", async () => {
    const wipeOrganizationAccount = vi.fn(async () => {
      throw new Error(
        "Cannot delete this organization: a Stripe subscription is linked but STRIPE_SECRET_KEY is not configured. Configure Stripe (or cancel the subscription in the Stripe Dashboard) before deleting.",
      );
    });
    const signOut = vi.fn();

    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
    }));
    vi.doMock("@/lib/auth/server", () => ({
      auth: { api: { signOut } },
    }));
    vi.doMock("@/lib/auth/authz", () => ({
      requireCurrentUser: async () => ({
        id: "user_1",
        activeOrganizationId: "org_1",
      }),
    }));
    vi.doMock("@/lib/auth/session", () => ({
      resolveActiveOrganization: async () => ({
        organization: { id: "org_1" },
        membership: { role: "OWNER" },
      }),
    }));
    vi.doMock("@/lib/account/wipe-organization", () => ({
      wipeOrganizationAccount,
    }));
    vi.doMock("@/lib/auth/audit", () => ({
      recordAdminAuditEvent: vi.fn(),
    }));
    vi.doMock("@/lib/transactional-email/send", () => ({
      sendTransactionalEmail: vi.fn(),
    }));
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
    vi.doMock("@/lib/auth/rate-limit", () => ({
      assertRateLimit: vi.fn(),
      RateLimitError: class RateLimitError extends Error {},
    }));

    const { deleteMyAccountAction } = await import("@/app/actions/account");
    const fd = new FormData();
    fd.set("confirmation", "DELETE");
    const result = await deleteMyAccountAction(null, fd);
    expect(result).toEqual({
      ok: false,
      message: DELETE_MY_ACCOUNT_FAILURE_MESSAGE,
    });
    expect(wipeOrganizationAccount).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasDatabase)(
  "account lifecycle B4 (Postgres)",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = `b4_${Date.now().toString(36)}`;

    beforeAll(async () => {
      // Unit tests above mock wipe / auth modules — clear before real DB work.
      vi.resetModules();
      vi.doUnmock("@/lib/account/wipe-organization");
      vi.doUnmock("@/lib/auth/provision");
      vi.doUnmock("@/lib/billing/enter-read-only");
      vi.doUnmock("@/lib/prisma");
      vi.doUnmock("next/headers");
      vi.doUnmock("next/navigation");
      vi.doUnmock("@/lib/auth/server");
      vi.doUnmock("@/lib/auth/authz");
      vi.doUnmock("@/lib/auth/session");

      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1 FROM "Organization" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "auth_user" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping B4 DB tests: apply pending migrations (npm run db:deploy).",
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
          name: "B4 Test",
          email,
          emailVerified: true,
          firstName: "B4",
          lastName: "Owner",
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

    it("OWNER wipe via shared path leaves email free for a fresh signup", async () => {
      if (!ready) return;
      const email = `b4-fresh-${suffix}@example.test`;
      const authId = `auth_b4_fresh_${suffix}`;
      await createAuthUser(email, authId);

      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const first = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "B4",
        lastName: "Owner",
        companyName: `B4 Fresh ${suffix}`,
      });
      const orgId = first.organization!.id;
      const userId = first.user.id;

      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: { stripeSubscriptionId: null },
      });

      await prisma.product.create({
        data: {
          organizationId: orgId,
          name: `Profile ${suffix}`,
          profileJson: { tag: suffix },
        },
      });

      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      const wiped = await wipeOrganizationAccount({
        organizationId: orgId,
        reason: "self_serve",
      });
      expect(wiped.alreadyWiped).toBe(false);
      expect(wiped.purgedUserIds).toContain(userId);

      expect(
        await prisma.organization.findUnique({ where: { id: orgId } }),
      ).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
      expect(
        await prisma.authUser.findUnique({ where: { id: authId } }),
      ).toBeNull();

      const newAuthId = `auth_b4_again_${suffix}`;
      await createAuthUser(email, newAuthId);
      const again = await provisionIndividualWorkspace({
        authUserId: newAuthId,
        email,
        firstName: "B4",
        lastName: "Again",
        companyName: `B4 Again ${suffix}`,
      });
      expect(again.organization!.id).not.toBe(orgId);
      expect(again.user.id).not.toBe(userId);
      expect(
        await prisma.product.count({
          where: { organizationId: again.organization!.id },
        }),
      ).toBe(0);
    });

    it("works while the account is read-only (wipe self_serve succeeds)", async () => {
      if (!ready) return;
      const email = `b4-ro-${suffix}@example.test`;
      const authId = `auth_b4_ro_${suffix}`;
      await createAuthUser(email, authId);

      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "B4",
        lastName: "RO",
        companyName: `B4 RO ${suffix}`,
      });
      const orgId = provisioned.organization!.id;

      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "ACTIVE",
          stripeSubscriptionId: null,
        },
      });
      await enterOrganizationReadOnly({ organizationId: orgId });

      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      const result = await wipeOrganizationAccount({
        organizationId: orgId,
        reason: "self_serve",
      });
      expect(result.alreadyWiped).toBe(false);
      expect(
        await prisma.organization.findUnique({ where: { id: orgId } }),
      ).toBeNull();
    });

    it("refused wipe (Stripe linked, not configured) deletes nothing", async () => {
      if (!ready) return;
      const email = `b4-refuse-${suffix}@example.test`;
      const authId = `auth_b4_refuse_${suffix}`;
      await createAuthUser(email, authId);

      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "B4",
        lastName: "Refuse",
        companyName: `B4 Refuse ${suffix}`,
      });
      const orgId = provisioned.organization!.id;
      const userId = provisioned.user.id;

      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "ACTIVE",
          stripeSubscriptionId: `sub_b4_refuse_${suffix}`,
        },
      });

      const prevKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      try {
        const { wipeOrganizationAccount } = await import(
          "@/lib/account/wipe-organization"
        );
        await expect(
          wipeOrganizationAccount({
            organizationId: orgId,
            reason: "self_serve",
          }),
        ).rejects.toThrow(/STRIPE_SECRET_KEY is not configured/);

        expect(
          await prisma.organization.findUnique({ where: { id: orgId } }),
        ).not.toBeNull();
        expect(
          await prisma.user.findUnique({ where: { id: userId } }),
        ).not.toBeNull();
      } finally {
        if (prevKey === undefined) {
          delete process.env.STRIPE_SECRET_KEY;
        } else {
          process.env.STRIPE_SECRET_KEY = prevKey;
        }
      }
    });
  },
);
