import { beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "auth phase 4 foundations",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "authUserId" FROM "User" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "auth_user" LIMIT 0`;
        await prisma.$queryRaw`SELECT "templateKey" FROM "TransactionalEmailTemplateBaseline" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping auth DB tests: apply pending migrations (npm run db:deploy).",
        );
        return;
      }
      ready = true;
    });

    it("DEV bypass cannot enable in production", async () => {
      const { getAuthEnv } = await import("@/lib/auth/config");
      const prevNode = process.env.NODE_ENV;
      const prevBypass = process.env.ALLOW_DEV_TENANT_BYPASS;
      const prevSecret = process.env.BETTER_AUTH_SECRET;
      try {
        Object.assign(process.env, {
          NODE_ENV: "production",
          ALLOW_DEV_TENANT_BYPASS: "true",
          BETTER_AUTH_SECRET: "x".repeat(40),
        });
        expect(() => getAuthEnv()).toThrow(/ALLOW_DEV_TENANT_BYPASS/);
      } finally {
        Object.assign(process.env, {
          NODE_ENV: prevNode,
          ALLOW_DEV_TENANT_BYPASS: prevBypass,
          BETTER_AUTH_SECRET: prevSecret,
        });
      }
    });

    it("signup provisioning creates OWNER + policies + billing; is idempotent", async () => {
      if (!ready) return;
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const authUserId = `auth_${suffix}_idem`;
      const email = `auth-idem-${suffix}@example.test`;

      const first = await provisionIndividualWorkspace({
        authUserId,
        email,
        firstName: "Ada",
        lastName: "Lovelace",
      });
      expect(first.created).toBe(true);
      expect(first.membershipRole).toBe("OWNER");
      expect(first.organization).toBeTruthy();

      const billing = await prisma.organizationBillingProfile.findUnique({
        where: { organizationId: first.organization!.id },
      });
      expect(billing).toBeTruthy();

      const second = await provisionIndividualWorkspace({
        authUserId,
        email,
        firstName: "Ada",
        lastName: "Lovelace",
      });
      expect(second.created).toBe(false);
      expect(second.organization).toBeTruthy();
      expect(second.organization!.id).toBe(first.organization!.id);
      expect(second.user.id).toBe(first.user.id);
    });

    it("provisions a workspace for an existing User with no membership", async () => {
      if (!ready) return;
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const authUserId = `auth_${suffix}_orphan`;
      const email = `auth-orphan-${suffix}@example.test`;

      const orphan = await prisma.user.create({
        data: {
          authUserId,
          email,
          emailNormalized: email,
          firstName: "Orphan",
          lastName: "User",
          name: "Orphan User",
          emailVerifiedAt: new Date(),
          platformRole: "NONE",
        },
      });

      const repaired = await provisionIndividualWorkspace({
        authUserId,
        email,
        firstName: "Orphan",
        lastName: "User",
      });
      expect(repaired.created).toBe(true);
      expect(repaired.user.id).toBe(orphan.id);
      expect(repaired.organization).toBeTruthy();
      expect(repaired.membershipRole).toBe("OWNER");

      const billing = await prisma.organizationBillingProfile.findUnique({
        where: { organizationId: repaired.organization!.id },
      });
      expect(billing).toBeTruthy();

      const again = await provisionIndividualWorkspace({
        authUserId,
        email,
        firstName: "Orphan",
        lastName: "User",
      });
      expect(again.created).toBe(false);
      expect(again.organization!.id).toBe(repaired.organization!.id);
    });

    it("client-supplied organizationId cannot bypass membership", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const { resolveActiveOrganization } = await import("@/lib/auth/session");
      const { TenantError } = await import("@/lib/tenant/errors");

      const a = await createIndividualWorkspace({
        email: `auth-a-${suffix}@example.test`,
        name: "A User",
      });
      const b = await createIndividualWorkspace({
        email: `auth-b-${suffix}@example.test`,
        name: "B User",
      });

      await expect(
        resolveActiveOrganization(a.user, b.organization.id),
      ).rejects.toBeInstanceOf(TenantError);
    });

    it("template variables are allowlisted; missing required fails", async () => {
      if (!ready) return;
      const { renderTransactionalTemplate, TemplateRenderError } =
        await import("@/lib/transactional-email/render");

      await expect(
        renderTransactionalTemplate({
          templateKey: "EMAIL_VERIFICATION",
          variables: {
            firstName: "Ada",
            // missing verificationUrl
          },
        }),
      ).rejects.toBeInstanceOf(TemplateRenderError);

      await expect(
        renderTransactionalTemplate({
          templateKey: "EMAIL_VERIFICATION",
          variables: {
            firstName: "Ada",
            verificationUrl: "https://example.test/v",
            expirationTime: "1h",
            evil: "nope",
          },
        }),
      ).rejects.toBeInstanceOf(TemplateRenderError);
    });

    it("unsafe template HTML is rejected on save validation", async () => {
      if (!ready) return;
      const { validateTemplateContent, TemplateRenderError } = await import(
        "@/lib/transactional-email/render"
      );
      expect(() =>
        validateTemplateContent({
          templateKey: "WELCOME",
          subjectTemplate: "Hi {{firstName}}",
          htmlTemplate: "<script>alert(1)</script><p>{{workspaceName}}</p>",
          textTemplate: "{{firstName}} {{workspaceName}}",
        }),
      ).toThrow(TemplateRenderError);
    });

    it("transactional send logs do not store live tokens", async () => {
      if (!ready) return;
      process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
      const { sendTransactionalEmail } = await import(
        "@/lib/transactional-email/send"
      );
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const { organization, user } = await createIndividualWorkspace({
        email: `auth-mail-${suffix}@example.test`,
        name: "Mail User",
      });

      const token = "super-secret-live-token-abc";
      const { eventId } = await sendTransactionalEmail({
        templateKey: "PASSWORD_RESET",
        to: user.email,
        userId: user.id,
        organizationId: organization.id,
        variables: {
          firstName: "Mail",
          resetUrl: `https://example.test/reset?token=${token}`,
          expirationTime: "1 hour",
        },
      });

      const event = await prisma.transactionalEmailEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(JSON.stringify(event)).not.toContain(token);
      expect(event.recipientEmailNormalized).toBe(user.email.toLowerCase());
      expect(event.status).toBe("SENT");
    });

    it("welcome email is idempotent", async () => {
      if (!ready) return;
      process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
      const { sendTransactionalEmail } = await import(
        "@/lib/transactional-email/send"
      );
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const { user, organization } = await createIndividualWorkspace({
        email: `auth-welcome-${suffix}@example.test`,
        name: "Welcome User",
      });
      const key = `welcome:${user.id}`;
      await sendTransactionalEmail({
        templateKey: "WELCOME",
        to: user.email,
        userId: user.id,
        organizationId: organization.id,
        idempotencyKey: key,
        variables: {
          firstName: "Welcome",
          workspaceName: organization.name,
        },
      });
      await sendTransactionalEmail({
        templateKey: "WELCOME",
        to: user.email,
        userId: user.id,
        organizationId: organization.id,
        idempotencyKey: key,
        variables: {
          firstName: "Welcome",
          workspaceName: organization.name,
        },
      });
      const count = await prisma.transactionalEmailEvent.count({
        where: { idempotencyKey: key, status: "SENT" },
      });
      expect(count).toBe(1);
    });

    it("rate limiter blocks after limit", async () => {
      if (!ready) return;
      const { assertRateLimit, RateLimitError } = await import(
        "@/lib/auth/rate-limit"
      );
      const windowMs = 60_000;
      const key = `test-rl-${crypto.randomUUID()}`;
      // Buckets are fixed wall-clock windows. A call that crosses the
      // boundary starts a new count, so the third call would not reject.
      // Wait out a short remainder so these three calls share one window.
      const remainingMs = windowMs - (Date.now() % windowMs);
      if (remainingMs < 5_000) {
        await new Promise((resolve) => setTimeout(resolve, remainingMs + 25));
      }
      await assertRateLimit({ key, limit: 2, windowMs });
      await assertRateLimit({ key, limit: 2, windowMs });
      await expect(
        assertRateLimit({ key, limit: 2, windowMs }),
      ).rejects.toBeInstanceOf(RateLimitError);
    });

    it("account policy gates AI spend until verified", async () => {
      if (!ready) return;
      const { canPerform } = await import("@/lib/auth/account-policy");
      expect(
        canPerform({ emailVerifiedAt: null }, "AI_SPEND"),
      ).toBe(false);
      expect(
        canPerform({ emailVerifiedAt: new Date() }, "AI_SPEND"),
      ).toBe(true);
      expect(canPerform({ emailVerifiedAt: null }, "VIEW_APP")).toBe(true);
    });

    it("SUPPORT cannot edit transactional templates; SUPER_ADMIN can", async () => {
      if (!ready) return;
      const { canEditTransactionalTemplates } = await import(
        "@/lib/auth/authz"
      );
      expect(canEditTransactionalTemplates("SUPPORT")).toBe(false);
      expect(canEditTransactionalTemplates("NONE")).toBe(false);
      expect(canEditTransactionalTemplates("SUPER_ADMIN")).toBe(true);
    });

    it("suspended organization is blocked for normal requireOrganization", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const { TenantError } = await import("@/lib/tenant/errors");
      const prev = process.env.ALLOW_DEV_TENANT_BYPASS;
      const prevOrg = process.env.DEV_ORGANIZATION_ID;
      try {
        const { organization } = await createIndividualWorkspace({
          email: `auth-susp-${suffix}@example.test`,
          name: "Susp",
        });
        await prisma.organization.update({
          where: { id: organization.id },
          data: { status: "SUSPENDED" },
        });
        process.env.ALLOW_DEV_TENANT_BYPASS = "true";
        process.env.DEV_ORGANIZATION_ID = organization.id;
        // Re-import module with bypass pointing at suspended org
        const { requireOrganization } = await import(
          "@/lib/tenant/getCurrentOrganization"
        );
        await expect(requireOrganization()).rejects.toBeInstanceOf(TenantError);
      } finally {
        process.env.ALLOW_DEV_TENANT_BYPASS = prev;
        process.env.DEV_ORGANIZATION_ID = prevOrg;
      }
    });
  },
);
