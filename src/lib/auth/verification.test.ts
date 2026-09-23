/**
 * Email verification URL preservation + production tenant fallback contracts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decodeHtmlAttrEntities,
  extractFirstHref,
  renderedVerificationHrefMatchesSupplied,
  VERIFICATION_CALLBACK_PATH,
} from "@/lib/auth/verification";
import { renderTransactionalTemplate } from "@/lib/transactional-email/render-service";
import { createEmailVerificationToken } from "better-auth/api";
import { jwtVerify } from "jose";
import { brand } from "@/lib/product-config";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("verification URL helpers", () => {
  it("decodes href entities so semantic URL matches Better Auth supplied url", () => {
    const supplied =
      "https://app.example/api/auth/verify-email?token=abc.def.ghi&callbackURL=%2Fpost-verify";
    const html = `<p><a href="${supplied.replace(/&/g, "&amp;")}">Verify</a></p>`;
    const result = renderedVerificationHrefMatchesSupplied(supplied, html);
    expect(result.ok).toBe(true);
    expect(result.renderedHref).toBe(supplied);
    expect(decodeHtmlAttrEntities(extractFirstHref(html)!)).toBe(supplied);
  });

  it("production TenantMissing copy never mentions DEV_ORGANIZATION_ID", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/components/ui.tsx", "utf8"),
    );
    expect(src).toContain("No workspace is associated with this account.");
    expect(src).toContain('NODE_ENV !== "production"');
    expect(src).toContain("ALLOW_DEV_TENANT_BYPASS");
    // Production branch must not be the unconditional default message
    expect(src).not.toMatch(
      /export function TenantMissing\(\) \{\s*return \(\s*<EmptyState\s*title="Organization not configured"/,
    );
  });

  it("signup verifies back to an invite, otherwise /post-verify; verify-email is public", async () => {
    const signup = await import("node:fs").then((fs) =>
      fs.readFileSync("src/components/auth/SignupForm.tsx", "utf8"),
    );
    const mw = await import("node:fs").then((fs) =>
      fs.readFileSync("src/middleware.ts", "utf8"),
    );
    expect(signup).toContain(
      'inviteMode && next.startsWith("/invite/accept")',
    );
    expect(signup).toMatch(
      /const callbackURL =[\s\S]*\? next[\s\S]*: "\/post-verify"/,
    );
    expect(signup).toContain("callbackURL,");
    expect(mw).toContain('"/post-verify"');
    expect(mw).toContain('"/verify-email"');
    expect(VERIFICATION_CALLBACK_PATH).toBe("/post-verify");
  });
});

describe.skipIf(!hasDatabase)(
  "EMAIL_VERIFICATION renders Better Auth URL exactly",
  { timeout: 90_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1 FROM "auth_user" LIMIT 0`;
        ready = true;
      } catch {
        console.warn("Skipping verification integration tests: DB unavailable.");
      }
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    it("rendered EMAIL_VERIFICATION href matches supplied Better Auth url; secret rotation invalidates tokens", async () => {
      if (!ready) return;

      const secret =
        process.env.BETTER_AUTH_SECRET?.trim() ||
        process.env.AUTH_SECRET?.trim() ||
        "dev-only-insecure-secret-change-me-32chars";
      const email = `verify-url-${suffix}@example.test`;
      const baseURL =
        process.env.BETTER_AUTH_URL?.trim() ||
        process.env.APP_URL?.trim() ||
        "http://localhost:3000";
      // Mirror Better Auth construction (baseURL includes /api/auth in BA context).
      // Our betterAuth({ baseURL: authEnv.baseUrl }) uses app origin; BA appends /api/auth internally.
      const authBase = `${baseURL.replace(/\/$/, "")}/api/auth`;

      const token = await createEmailVerificationToken(secret, email, undefined, 3600);
      const callbackURL = encodeURIComponent(VERIFICATION_CALLBACK_PATH);
      const suppliedUrl = `${authBase}/verify-email?token=${token}&callbackURL=${callbackURL}`;

      const rendered = await renderTransactionalTemplate({
        templateKey: "EMAIL_VERIFICATION",
        variables: {
          firstName: "Test",
          verificationUrl: suppliedUrl,
          expirationTime: "24 hours",
          appName: brand.appName,
          supportEmail: "support@example.test",
        },
      });

      const match = renderedVerificationHrefMatchesSupplied(
        suppliedUrl,
        rendered.html,
      );
      expect(match.ok).toBe(true);
      expect(match.renderedHref).toBe(suppliedUrl);
      // Text body must also carry the exact URL (no reconstruction)
      expect(rendered.text).toContain(suppliedUrl);

      // Token verifies with the same secret
      const ok = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
      );
      expect(ok.payload.email).toBe(email.toLowerCase());

      // Rotating BETTER_AUTH_SECRET invalidates outstanding verification tokens
      await expect(
        jwtVerify(token, new TextEncoder().encode(`${secret}-rotated-different`)),
      ).rejects.toThrow();
    });

    it("resend verification action is rate limited", async () => {
      if (!ready) return;
      const email = `resend-rl-${suffix}@example.test`;
      const { resendVerificationEmailAction } = await import(
        "@/app/actions/verify-email"
      );

      let hitLimit = false;
      for (let i = 0; i < 8; i++) {
        const fd = new FormData();
        fd.set("email", email);
        const result = await resendVerificationEmailAction(fd);
        if (!result.ok && result.rateLimited) {
          hitLimit = true;
          break;
        }
      }
      expect(hitLimit).toBe(true);
    });
  },
);
