/**
 * EULA accept loop — trusted origins + acceptance recording.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RENDER_LEGACY_APP_HOST,
  authTrustedOrigins,
  expandHostVariants,
  hostFromAbsoluteUrl,
  serverActionAllowedOrigins,
} from "@/lib/auth/trusted-origins";

describe("server action allowed origins (custom domain cutover)", () => {
  it("parses hosts from absolute app URLs", () => {
    expect(hostFromAbsoluteUrl("https://www.myaimedjobseeker.com")).toBe(
      "www.myaimedjobseeker.com",
    );
    expect(hostFromAbsoluteUrl("https://aimed-jobseek.onrender.com/")).toBe(
      "aimed-jobseek.onrender.com",
    );
    expect(hostFromAbsoluteUrl("not-a-url")).toBeNull();
  });

  it("expands www and bare host twins", () => {
    expect(expandHostVariants("www.myaimedjobseeker.com").sort()).toEqual([
      "myaimedjobseeker.com",
      "www.myaimedjobseeker.com",
    ]);
    expect(expandHostVariants("myaimedjobseeker.com").sort()).toEqual([
      "myaimedjobseeker.com",
      "www.myaimedjobseeker.com",
    ]);
  });

  it("includes custom-domain Origin host when Render still forwards onrender host", () => {
    const origins = serverActionAllowedOrigins({
      APP_URL: "https://www.myaimedjobseeker.com",
      NEXT_PUBLIC_APP_URL: "https://www.myaimedjobseeker.com",
      BETTER_AUTH_URL: "https://www.myaimedjobseeker.com",
    });
    expect(origins).toContain("www.myaimedjobseeker.com");
    expect(origins).toContain("myaimedjobseeker.com");
    expect(origins).toContain(RENDER_LEGACY_APP_HOST);
  });

  it("auth trusted origins use https for the custom domain and legacy Render host", () => {
    const trusted = authTrustedOrigins({
      APP_URL: "https://www.myaimedjobseeker.com",
      BETTER_AUTH_URL: "https://www.myaimedjobseeker.com",
    });
    expect(trusted).toContain("https://www.myaimedjobseeker.com");
    expect(trusted).toContain("https://myaimedjobseeker.com");
    expect(trusted).toContain(`https://${RENDER_LEGACY_APP_HOST}`);
  });

  it("next.config wires experimental.serverActions.allowedOrigins", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("serverActionAllowedOrigins");
    expect(config).toContain("allowedOrigins");
    expect(config).toContain("experimental");
    expect(config).toContain("serverActions");
  });

  it("Better Auth trustedOrigins use the shared helper", () => {
    const src = readFileSync("src/lib/auth/better-auth.ts", "utf8");
    expect(src).toContain("authTrustedOrigins");
    expect(src).not.toContain("trustedOrigins: [authEnv.appUrl, authEnv.baseUrl]");
  });
});

describe("eula accept path wiring", () => {
  it("accept action records UserEulaAcceptance then redirects via resolvePostEulaDestination", () => {
    const action = readFileSync("src/app/actions/eula.ts", "utf8");
    expect(action).toContain("recordEulaAcceptance");
    expect(action).toContain("userId: user.id");
    expect(action).toContain("eulaVersionId: version.id");
    expect(action).toContain("redirect(await resolvePostEulaDestination())");
    expect(action).not.toContain("aimed-jobseek.onrender.com");
    expect(action).not.toContain("myaimedjobseeker.com");
  });

  it("gate re-checks published version for the signed-in application user", () => {
    const gate = readFileSync("src/lib/legal/eula-gate.ts", "utf8");
    const eula = readFileSync("src/lib/legal/eula.ts", "utf8");
    expect(gate).toContain("userNeedsEulaAcceptance(user.id)");
    expect(gate).toContain("ONBOARDING_EULA_PATH");
    expect(eula).toContain("userId_eulaVersionId");
    expect(eula).toContain("getPublishedEulaVersion");
  });

  it("onboarding EULA is exempt from payment-lock and checkout gates", () => {
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");
    const checkout = readFileSync("src/lib/billing/checkout-gate.ts", "utf8");
    expect(lock).toContain("/onboarding/eula");
    expect(checkout).toContain("ONBOARDING_EULA_PATH");
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "eula acceptance (Postgres)",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = `eula_${Date.now().toString(36)}`;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1 FROM "UserEulaAcceptance" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "EulaVersion" LIMIT 0`;
      } catch {
        console.warn("Skipping EULA DB tests: apply pending migrations.");
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
          name: "Eula Test",
          email,
          emailVerified: true,
          firstName: "Eula",
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

    async function provisionSeeker(tag: string) {
      const email = `eula-${tag}@example.test`;
      const authId = `auth_eula_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Eula",
        lastName: "Seeker",
        companyName: `Eula Org ${tag}`,
      });
      return {
        orgId: provisioned.organization!.id,
        userId: provisioned.user.id,
        email,
        authId,
      };
    }

    it("accepting terms records acceptance for the signed-in user and active version", async () => {
      if (!ready) return;
      const {
        getPublishedEulaVersion,
        recordEulaAcceptance,
        userHasAcceptedEulaVersion,
        userNeedsEulaAcceptance,
      } = await import("@/lib/legal/eula");

      const seeker = await provisionSeeker(`${suffix}_accept`);
      const version = await getPublishedEulaVersion();
      expect(version).not.toBeNull();
      if (!version) return;

      expect(await userNeedsEulaAcceptance(seeker.userId)).toMatchObject({
        needs: true,
      });

      await recordEulaAcceptance({
        userId: seeker.userId,
        eulaVersionId: version.id,
        ipAddress: "203.0.113.10",
        userAgent: "vitest",
      });

      expect(
        await userHasAcceptedEulaVersion(seeker.userId, version.id),
      ).toBe(true);
      expect(await userNeedsEulaAcceptance(seeker.userId)).toEqual({
        needs: false,
      });

      const row = await prisma.userEulaAcceptance.findUnique({
        where: {
          userId_eulaVersionId: {
            userId: seeker.userId,
            eulaVersionId: version.id,
          },
        },
      });
      expect(row?.userId).toBe(seeker.userId);
      expect(row?.eulaVersionId).toBe(version.id);
    });

    it("after accepting, gate does not send the seeker back to terms", async () => {
      if (!ready) return;
      const {
        getPublishedEulaVersion,
        recordEulaAcceptance,
        userNeedsEulaAcceptance,
      } = await import("@/lib/legal/eula");
      const { ONBOARDING_EULA_PATH } = await import("@/lib/billing/paths");

      const seeker = await provisionSeeker(`${suffix}_gate`);
      const version = await getPublishedEulaVersion();
      if (!version) return;

      await recordEulaAcceptance({
        userId: seeker.userId,
        eulaVersionId: version.id,
      });

      const status = await userNeedsEulaAcceptance(seeker.userId);
      expect(status.needs).toBe(false);
      // Destination after accept is "/" or subscribe — never EULA when accepted.
      expect(ONBOARDING_EULA_PATH).toBe("/onboarding/eula");
      const action = readFileSync("src/app/actions/eula.ts", "utf8");
      expect(action).toContain('return "/"');
      expect(action).toContain("ONBOARDING_SUBSCRIBE_PATH");
    });

    it("acceptance works for invite-then-signup style identity (authUser linked after invite email)", async () => {
      if (!ready) return;
      const {
        getPublishedEulaVersion,
        recordEulaAcceptance,
        userNeedsEulaAcceptance,
      } = await import("@/lib/legal/eula");

      // Simulate: invitation emailed before AuthUser existed; signup creates AuthUser
      // then provision links application User — same path as invite→signup→verify.
      const seeker = await provisionSeeker(`${suffix}_invite`);
      const version = await getPublishedEulaVersion();
      if (!version) return;

      const linked = await prisma.user.findUniqueOrThrow({
        where: { id: seeker.userId },
        select: { id: true, authUserId: true, email: true },
      });
      expect(linked.authUserId).toBe(seeker.authId);

      await recordEulaAcceptance({
        userId: linked.id,
        eulaVersionId: version.id,
      });
      expect(await userNeedsEulaAcceptance(linked.id)).toEqual({ needs: false });
    });

    it("acceptance works after prior workspace wipe when the same auth user gets a new org", async () => {
      if (!ready) return;
      const {
        getPublishedEulaVersion,
        recordEulaAcceptance,
        userNeedsEulaAcceptance,
      } = await import("@/lib/legal/eula");
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );

      const first = await provisionSeeker(`${suffix}_wipe1`);
      const version = await getPublishedEulaVersion();
      if (!version) return;

      // Super Admin wipe of the workspace; application user identity may remain
      // depending on wipe policy — use wipe then re-provision like a fresh org.
      await wipeOrganizationAccount({
        organizationId: first.orgId,
        reason: "admin",
      });

      const stillUser = await prisma.user.findUnique({
        where: { id: first.userId },
      });
      // Whether user row survives wipe, acceptance is keyed to application userId.
      if (stillUser) {
        await recordEulaAcceptance({
          userId: stillUser.id,
          eulaVersionId: version.id,
        });
        expect(await userNeedsEulaAcceptance(stillUser.id)).toEqual({
          needs: false,
        });
      } else {
        // Orphan-user purge removed the user — new signup gets a new userId and
        // must accept again (expected; not a cross-user leak).
        const second = await provisionSeeker(`${suffix}_wipe2`);
        expect(await userNeedsEulaAcceptance(second.userId)).toMatchObject({
          needs: true,
        });
        await recordEulaAcceptance({
          userId: second.userId,
          eulaVersionId: version.id,
        });
        expect(await userNeedsEulaAcceptance(second.userId)).toEqual({
          needs: false,
        });
      }
    });
  },
);
