/**
 * CLI: link existing app User + Organization to a Better Auth email/password identity.
 *
 * Usage (from repo root, with .env.local loaded via npm script):
 *   npm run auth:bootstrap
 *
 * Required env:
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD   (only when creating a new AuthUser)
 *
 * Optional:
 *   BOOTSTRAP_EXISTING_USER_ID      — retarget this unlinked User's email to BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_MARK_EMAIL_VERIFIED   — local emergency only (never production)
 *   ALLOW_AUTH_BOOTSTRAP=true       — required when NODE_ENV=production
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const {
    assertBootstrapAllowed,
    bootstrapAdminAccount,
    readBootstrapEnv,
    signUpEmailViaBetterAuth,
    BootstrapError,
  } = await import("../src/lib/auth/bootstrap");

  try {
    const env = readBootstrapEnv();
    assertBootstrapAllowed(env);

    const result = await bootstrapAdminAccount({
      email: env.email,
      password: env.password,
      existingUserId: env.existingUserId,
      markEmailVerified: env.markEmailVerified,
      isProduction: env.isProduction,
      signUpEmail: signUpEmailViaBetterAuth,
    });

    // Safe status only — never print passwords, hashes, or session tokens.
    console.log("[auth:bootstrap] OK");
    console.log(`  status:            ${result.status}`);
    console.log(`  userId:            ${result.userId}`);
    console.log(`  authUserId:        ${result.authUserId}`);
    console.log(`  organizationId:    ${result.organizationId}`);
    console.log(`  organizationName:  ${result.organizationName}`);
    console.log(`  membershipRole:    ${result.membershipRole}`);
    console.log(`  emailVerified:     ${result.emailVerified}`);
    console.log(
      `  orgCountUnchanged: ${result.organizationCountUnchanged}`,
    );
    console.log(`  message:           ${result.message}`);
    console.log("");
    console.log("Next:");
    if (!result.emailVerified) {
      console.log("  1. Check your inbox for the verification email (SMTP/console).");
      console.log("  2. Open the verification link.");
    }
    console.log("  3. npm run dev");
    console.log("  4. Visit http://localhost:3000/login and sign in.");
    console.log(
      "  5. Optional: npm run platform:bootstrap-admin for SUPER_ADMIN.",
    );
    console.log(
      "  6. After login works, set ALLOW_DEV_TENANT_BYPASS=false and remove DEV_* ids.",
    );
  } catch (error) {
    if (error instanceof BootstrapError) {
      console.error("[auth:bootstrap] FAILED");
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error("[auth:bootstrap] FAILED");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    const { prisma } = await import("../src/lib/prisma-client");
    await prisma.$disconnect();
  }
}

void main();
