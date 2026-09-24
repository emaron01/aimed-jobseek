/**
 * Production / Render CLI: one-time platform SUPER_ADMIN provisioning.
 *
 *   npm run platform:provision-super-admin
 *
 * Render injects environment variables — `.env` / `.env.local` are optional
 * (loaded here when present for local runs).
 *
 * Required env (temporary — remove after success):
 *   PLATFORM_BOOTSTRAP_EMAIL
 *   PLATFORM_BOOTSTRAP_PASSWORD
 *   PLATFORM_BOOTSTRAP_CONFIRM=PROVISION_INITIAL_SUPER_ADMIN
 *
 * Distinct from local `npm run auth:bootstrap` (dev linking).
 * Imports the Node-safe service only (never Next.js server-only wrappers).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const {
    provisionPlatformSuperAdmin,
    readPlatformProvisionEnv,
    signUpEmailViaBetterAuth,
  } = await import("../src/lib/auth/platform-provision-service");

  try {
    const env = readPlatformProvisionEnv();
    const result = await provisionPlatformSuperAdmin({
      email: env.email,
      password: env.password,
      confirm: env.confirm,
      signUpEmail: signUpEmailViaBetterAuth,
    });

    // Safe status only — never print password, hashes, or tokens.
    console.log("[platform:provision-super-admin] OK");
    console.log(`  status:         ${result.status}`);
    console.log(`  userId:         ${result.userId}`);
    console.log(`  authUserId:     ${result.authUserId}`);
    console.log(`  email:          ${result.email}`);
    console.log(`  platformRole:   ${result.platformRole}`);
    console.log(`  emailVerified:  ${result.emailVerified}`);
    console.log(`  organizationId: ${result.organizationId ?? "(none)"}`);
    console.log(`  message:        ${result.message}`);
    console.log("");
    console.log("Next:");
    console.log("  1. Log in at /login with PLATFORM_BOOTSTRAP_EMAIL + password.");
    console.log("  2. Remove PLATFORM_BOOTSTRAP_EMAIL, PLATFORM_BOOTSTRAP_PASSWORD,");
    console.log("     and PLATFORM_BOOTSTRAP_CONFIRM from Render.");
  } catch (error) {
    console.error("[platform:provision-super-admin] FAILED");
    const { formatSafeErrorForLog } = await import(
      "../src/lib/auth/safe-error"
    );
    const { PlatformProvisionError } = await import(
      "../src/lib/auth/platform-provision-service"
    );
    if (error instanceof PlatformProvisionError) {
      console.error(formatSafeErrorForLog(error));
    } else {
      console.error(formatSafeErrorForLog(error));
    }
    process.exitCode = 1;
  } finally {
    const { prisma } = await import("../src/lib/prisma-client");
    await prisma.$disconnect();
  }
}

void main();
