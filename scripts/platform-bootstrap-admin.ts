/**
 * CLI: grant PlatformRole.SUPER_ADMIN to a linked authenticated User.
 * Does NOT change Organization ADMIN/OWNER membership.
 *
 * Usage:
 *   npm run platform:bootstrap-admin
 *
 * Required env:
 *   BOOTSTRAP_SUPER_ADMIN_EMAIL  (or BOOTSTRAP_ADMIN_EMAIL as fallback)
 *
 * Production:
 *   ALLOW_AUTH_BOOTSTRAP=true required
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const {
    assertBootstrapAllowed,
    bootstrapPlatformSuperAdmin,
    readPlatformBootstrapEmail,
    BootstrapError,
  } = await import("../src/lib/auth/bootstrap");

  try {
    const isProduction = process.env.NODE_ENV === "production";
    assertBootstrapAllowed({
      isProduction,
      allowInProduction: process.env.ALLOW_AUTH_BOOTSTRAP?.trim() === "true",
    });

    const email = readPlatformBootstrapEmail();
    const result = await bootstrapPlatformSuperAdmin({ email });

    console.log("[platform:bootstrap-admin] OK");
    console.log(`  status:       ${result.status}`);
    console.log(`  userId:       ${result.userId}`);
    console.log(`  email:        ${result.email}`);
    console.log(`  platformRole: ${result.platformRole}`);
    console.log(`  message:      ${result.message}`);
  } catch (error) {
    if (error instanceof BootstrapError) {
      console.error("[platform:bootstrap-admin] FAILED");
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error("[platform:bootstrap-admin] FAILED");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    const { prisma } = await import("../src/lib/prisma-client");
    await prisma.$disconnect();
  }
}

void main();
