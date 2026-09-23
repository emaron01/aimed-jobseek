/**
 * Production platform SUPER_ADMIN provisioning (distinct from local auth:bootstrap).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("platform provision confirmation (unit)", () => {
  it("requires exact PLATFORM_BOOTSTRAP_CONFIRM value", async () => {
    const {
      assertPlatformProvisionConfirmation,
      PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
      PlatformProvisionError,
      readPlatformProvisionEnv,
    } = await import("@/lib/auth/platform-provision-service");

    expect(() => assertPlatformProvisionConfirmation(null)).toThrow(
      PlatformProvisionError,
    );
    expect(() => assertPlatformProvisionConfirmation("yes")).toThrow(
      PlatformProvisionError,
    );
    expect(() =>
      assertPlatformProvisionConfirmation(PLATFORM_BOOTSTRAP_CONFIRM_VALUE),
    ).not.toThrow();

    process.env.PLATFORM_BOOTSTRAP_EMAIL = "ops@example.test";
    delete process.env.PLATFORM_BOOTSTRAP_CONFIRM;
    expect(() => readPlatformProvisionEnv()).not.toThrow();
    const env = readPlatformProvisionEnv();
    expect(env.confirm).toBeNull();
  });

  it("normal signup still requires email verification (config unchanged)", async () => {
    const src = await import("@/lib/auth/server");
    expect(src.auth).toBeTruthy();
    expect(
      Object.keys(process.env).some((k) =>
        k.includes("SKIP_EMAIL_VERIFICATION"),
      ),
    ).toBe(false);
    const betterAuth = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/auth/better-auth.ts", "utf8"),
    );
    expect(betterAuth).toContain("sendOnSignUp: true");
    expect(betterAuth).toContain("isPlatformSuperAdminProvisioningActive()");
    expect(betterAuth).toMatch(
      /sendVerificationEmail:[\s\S]*isPlatformSuperAdminProvisioningActive/,
    );
  });

  it("no public HTTP provisioning route exists", async () => {
    const { existsSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const appRoot = join(process.cwd(), "src", "app");
    const walk = (dir: string): boolean => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        if (
          name.name.includes("provision-super-admin") ||
          name.name === "platform-bootstrap"
        ) {
          return true;
        }
        if (name.isDirectory() && walk(join(dir, name.name))) return true;
      }
      return false;
    };
    expect(existsSync(join(appRoot, "api", "bootstrap"))).toBe(false);
    expect(walk(appRoot)).toBe(false);
  });
});

describe.skipIf(!hasDatabase)(
  "platform:provision-super-admin",
  { timeout: 90_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    const confirm = "PROVISION_INITIAL_SUPER_ADMIN";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "issuer" FROM "auth_account" LIMIT 0`;
        await prisma.adminAuditEvent.findFirst({
          where: { action: "PLATFORM_SUPER_ADMIN_PROVISIONED" },
        });
      } catch {
        console.warn(
          "Skipping platform provision DB tests: apply migrations (npm run db:deploy).",
        );
        return;
      }
      ready = true;
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    function mockSignUp(opts: {
      authId: string;
      email: string;
      password: string;
      linkUserId?: string;
      withCredential?: boolean;
    }) {
      return async (input: {
        email: string;
        password: string;
        name: string;
        firstName: string;
        lastName: string;
      }) => {
        expect(input.password).toBe(opts.password);
        expect(input.email).toBe(opts.email);
        await prisma.authUser.create({
          data: {
            id: opts.authId,
            name: input.name,
            email: input.email,
            emailVerified: false,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });
        if (opts.withCredential !== false) {
          await prisma.authAccount.create({
            data: {
              id: `acct_${opts.authId}`,
              accountId: opts.authId,
              providerId: "credential",
              issuer: "local:credential",
              userId: opts.authId,
              password: "better-auth-managed-hash-placeholder",
            },
          });
        }
        if (opts.linkUserId) {
          await prisma.user.update({
            where: { id: opts.linkUserId },
            data: { authUserId: opts.authId },
          });
        }
        return { userId: opts.authId };
      };
    }

    it("full identity → ALREADY_PROVISIONED; stale authUserId → REPAIRED; preserves memberships/role", async () => {
      if (!ready) return;
      const email = `platform-ops-${suffix}@example.test`;
      const password = "super-secret-platform-pass";

      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const existing = await createIndividualWorkspace({
        email,
        firstName: "Ops",
        lastName: "Owner",
      });
      await prisma.user.update({
        where: { id: existing.user.id },
        data: {
          authUserId: null,
          platformRole: "NONE",
          emailVerifiedAt: null,
        },
      });
      const orgIdsBefore = (
        await prisma.organizationMembership.findMany({
          where: { userId: existing.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);

      const {
        provisionPlatformSuperAdmin,
        PlatformProvisionError,
        PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
        assessPlatformIdentityConsistency,
      } = await import("@/lib/auth/platform-provision-service");

      await expect(
        provisionPlatformSuperAdmin({
          email,
          password,
          confirm: null,
          signUpEmail: async () => {
            throw new Error("must not call signUp without confirm");
          },
        }),
      ).rejects.toBeInstanceOf(PlatformProvisionError);

      const authId = `auth_platform_${suffix}`;
      let signUpCalls = 0;
      const first = await provisionPlatformSuperAdmin({
        email,
        password,
        confirm: PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
        signUpEmail: async (input) => {
          signUpCalls += 1;
          return mockSignUp({
            authId,
            email,
            password,
            linkUserId: existing.user.id,
          })(input);
        },
      });

      expect(signUpCalls).toBe(1);
      expect(first.status).toBe("CREATED");
      expect(first.platformRole).toBe("SUPER_ADMIN");
      expect(first.emailVerified).toBe(true);
      expect(first.userId).toBe(existing.user.id);
      expect(first.authUserId).toBe(authId);

      const orgIdsAfter = (
        await prisma.organizationMembership.findMany({
          where: { userId: existing.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);
      expect(orgIdsAfter.sort()).toEqual(orgIdsBefore.sort());

      const audit = await prisma.adminAuditEvent.findFirst({
        where: {
          action: "PLATFORM_SUPER_ADMIN_PROVISIONED",
          targetUserId: existing.user.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeTruthy();
      expect(JSON.stringify(audit)).not.toContain(password);
      expect(JSON.stringify(audit)).not.toContain(
        "better-auth-managed-hash-placeholder",
      );

      // Fully consistent → ALREADY_PROVISIONED (no signUp)
      const second = await provisionPlatformSuperAdmin({
        email,
        password: null,
        confirm,
        signUpEmail: async () => {
          throw new Error("signUp must not run when already provisioned");
        },
      });
      expect(second.status).toBe("ALREADY_PROVISIONED");
      expect(second.userId).toBe(existing.user.id);

      // Stale authUserId (points at missing AuthUser) → REPAIRED
      await prisma.authAccount.deleteMany({ where: { userId: authId } });
      await prisma.authUser.delete({ where: { id: authId } });
      await prisma.user.update({
        where: { id: existing.user.id },
        data: {
          authUserId: authId, // stale
          platformRole: "SUPER_ADMIN",
          emailVerifiedAt: new Date(),
        },
      });

      const repairedAuthId = `auth_repaired_${suffix}`;
      let repairSignUps = 0;
      const repaired = await provisionPlatformSuperAdmin({
        email,
        password,
        confirm,
        signUpEmail: async (input) => {
          repairSignUps += 1;
          return mockSignUp({
            authId: repairedAuthId,
            email,
            password,
            linkUserId: existing.user.id,
          })(input);
        },
      });
      expect(repairSignUps).toBe(1);
      expect(repaired.status).toBe("REPAIRED");
      expect(repaired.authUserId).toBe(repairedAuthId);
      expect(repaired.platformRole).toBe("SUPER_ADMIN");

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: existing.user.id },
      });
      expect(user.platformRole).toBe("SUPER_ADMIN");
      expect(user.authUserId).toBe(repairedAuthId);
      expect(await prisma.authUser.count({ where: { email } })).toBe(1);

      const consistency = await assessPlatformIdentityConsistency({
        appUser: user,
        email,
      });
      expect(consistency.ok).toBe(true);
      expect(consistency.discoverableByEmail).toBe(true);
      expect(consistency.credentialPresent).toBe(true);

      // Memberships still preserved
      expect(
        (
          await prisma.organizationMembership.findMany({
            where: { userId: existing.user.id },
            select: { organizationId: true },
          })
        )
          .map((m) => m.organizationId)
          .sort(),
      ).toEqual(orgIdsBefore.sort());

      // Repair idempotent
      const again = await provisionPlatformSuperAdmin({
        email,
        password: null,
        confirm,
        signUpEmail: async () => {
          throw new Error("no signup on idempotent repair");
        },
      });
      expect(again.status).toBe("ALREADY_PROVISIONED");
      expect(again.authUserId).toBe(repairedAuthId);
    });

    it("AuthUser by email with stale app authUserId reconciles without duplicate AuthUser", async () => {
      if (!ready) return;
      const email = `platform-reconcile-${suffix}@example.test`;
      const password = "reconcile-password-ok";
      const realAuthId = `auth_real_${suffix}`;
      const staleAuthId = `auth_stale_${suffix}`;

      const {
        provisionPlatformSuperAdmin,
        PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
      } = await import("@/lib/auth/platform-provision-service");

      const appUser = await prisma.user.create({
        data: {
          email,
          emailNormalized: email,
          firstName: "Rec",
          lastName: "Oncile",
          name: "Rec Oncile",
          platformRole: "SUPER_ADMIN",
          emailVerifiedAt: new Date(),
          authUserId: staleAuthId, // points nowhere
        },
      });

      await prisma.authUser.create({
        data: {
          id: realAuthId,
          name: "Rec Oncile",
          email,
          emailVerified: true,
          firstName: "Rec",
          lastName: "Oncile",
        },
      });
      await prisma.authAccount.create({
        data: {
          id: `acct_real_${suffix}`,
          accountId: realAuthId,
          providerId: "credential",
          issuer: "local:credential",
          userId: realAuthId,
          password: "better-auth-managed-hash-placeholder",
        },
      });

      const result = await provisionPlatformSuperAdmin({
        email,
        password,
        confirm: PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
        signUpEmail: async () => {
          throw new Error("must not create duplicate AuthUser");
        },
      });

      expect(result.status).toBe("REPAIRED");
      expect(result.authUserId).toBe(realAuthId);
      expect(await prisma.authUser.count({ where: { email } })).toBe(1);
      const linked = await prisma.user.findUniqueOrThrow({
        where: { id: appUser.id },
      });
      expect(linked.authUserId).toBe(realAuthId);
      expect(linked.platformRole).toBe("SUPER_ADMIN");
    });

    it("AuthUser exists but credential missing → repair via Better Auth signup", async () => {
      if (!ready) return;
      const email = `platform-nocred-${suffix}@example.test`;
      const password = "nocred-password-ok";
      const brokenAuthId = `auth_nocred_${suffix}`;
      const freshAuthId = `auth_fresh_${suffix}`;

      const {
        provisionPlatformSuperAdmin,
        PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
      } = await import("@/lib/auth/platform-provision-service");

      const appUser = await prisma.user.create({
        data: {
          email,
          emailNormalized: email,
          firstName: "No",
          lastName: "Cred",
          name: "No Cred",
          platformRole: "SUPER_ADMIN",
          emailVerifiedAt: new Date(),
          authUserId: brokenAuthId,
        },
      });
      await prisma.authUser.create({
        data: {
          id: brokenAuthId,
          name: "No Cred",
          email,
          emailVerified: true,
          firstName: "No",
          lastName: "Cred",
        },
      });
      // Intentionally no AuthAccount credential

      let signUps = 0;
      const result = await provisionPlatformSuperAdmin({
        email,
        password,
        confirm: PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
        signUpEmail: async (input) => {
          signUps += 1;
          return mockSignUp({
            authId: freshAuthId,
            email,
            password,
            linkUserId: appUser.id,
          })(input);
        },
      });

      expect(signUps).toBe(1);
      expect(result.status).toBe("REPAIRED");
      expect(result.authUserId).toBe(freshAuthId);
      expect(await prisma.authUser.findUnique({ where: { id: brokenAuthId } })).toBeNull();
      expect(await prisma.authUser.count({ where: { email } })).toBe(1);
      const cred = await prisma.authAccount.findFirst({
        where: {
          userId: freshAuthId,
          providerId: "credential",
          issuer: "local:credential",
        },
      });
      expect(cred?.password).toBeTruthy();
      expect(JSON.stringify(result)).not.toContain(password);
    });

    it("creates User without Organization; no duplicate AuthUsers", async () => {
      if (!ready) return;
      const email = `platform-solo-${suffix}@example.test`;
      const {
        provisionPlatformSuperAdmin,
        PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
      } = await import("@/lib/auth/platform-provision-service");

      const authId = `auth_solo_${suffix}`;

      await provisionPlatformSuperAdmin({
        email,
        password: "password-long-enough",
        confirm: PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
        signUpEmail: async (input) => {
          const user = await prisma.user.findUniqueOrThrow({
            where: { emailNormalized: email },
          });
          return mockSignUp({
            authId,
            email,
            password: "password-long-enough",
            linkUserId: user.id,
          })(input);
        },
      });

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: email },
      });
      expect(user.platformRole).toBe("SUPER_ADMIN");
      expect(
        await prisma.organizationMembership.count({ where: { userId: user.id } }),
      ).toBe(0);
      expect(await prisma.authUser.count({ where: { email } })).toBe(1);
    });
  },
);
