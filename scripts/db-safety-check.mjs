/**
 * Database safety check before Prisma migrations.
 * Prints host + database name only (never passwords).
 *
 * Default (app/dev migrate): loads `.env.local`, blocks a legacy database name,
 * warns if the host looks like hosted production.
 *
 * `--test`: loads `.env.test` / `.env.test.example` only, never `.env.local`,
 * and refuses Render / other production hosts. Test migrations should use
 * `npm run db:test:migrate` instead of this script's default mode.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const testMode = process.argv.includes("--test");

function loadEnvFile(filename, { override = false } = {}) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || !(key in process.env)) {
      process.env[key] = value;
    }
  }
  return true;
}

function isLoopbackHost(hostname) {
  const host = hostname.trim().toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "host.docker.internal"
  );
}

function isRemoteProductionHost(hostname) {
  const host = hostname.trim().toLowerCase();
  if (!host || isLoopbackHost(host)) return false;
  return (
    host.endsWith(".render.com") ||
    host.endsWith(".onrender.com") ||
    host.endsWith(".neon.tech") ||
    host.endsWith(".supabase.co") ||
    host.endsWith(".amazonaws.com") ||
    host.endsWith(".rds.amazonaws.com")
  );
}

if (testMode) {
  loadEnvFile(".env.test.example");
  loadEnvFile(".env.test");
  if (process.env.TEST_DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL.trim();
  }
} else {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !databaseUrl.trim()) {
  console.error(
    testMode
      ? "TEST_DATABASE_URL is not set. See .env.test.example."
      : "DATABASE_URL is not set. Add it to .env.local before migrating.",
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error("DATABASE_URL is not a valid URL.");
  process.exit(1);
}

const host = parsed.hostname || "(unknown host)";
const port = parsed.port || "(default)";
const databaseName = decodeURIComponent(
  parsed.pathname.replace(/^\//, "") || "(unknown)",
);
const schemaParam = parsed.searchParams.get("schema") || "public";

console.log(
  testMode
    ? "TEST Prisma connection target (credentials redacted):"
    : "Prisma connection target (credentials redacted):",
);
console.log(`  Host:     ${host}`);
console.log(`  Port:     ${port}`);
console.log(`  Database: ${databaseName}`);
console.log(`  Schema:   ${schemaParam}`);

const blockedLegacyBrand = ["sales", "forecaster"].join("");
const blockedLegacyPattern = new RegExp(
  `${blockedLegacyBrand}|sales[_-]?forecaster`,
  "i",
);
if (
  blockedLegacyPattern.test(databaseName) ||
  blockedLegacyPattern.test(host) ||
  blockedLegacyPattern.test(databaseUrl)
) {
  console.error("");
  console.error("SAFETY STOP: Target appears associated with a blocked legacy database.");
  console.error("This project must never modify that database.");
  process.exit(1);
}

if (testMode) {
  if (isRemoteProductionHost(host) && process.env.ALLOW_PROD_DB_TESTS !== "1") {
    console.error("");
    console.error(
      `SAFETY STOP: Test migrations refuse production host "${host}".`,
    );
    console.error(
      "Use npm run db:test:up (Docker or the dedicated local TEST cluster) and TEST_DATABASE_URL.",
    );
    console.error("Do not run test migrations against Render.");
    process.exit(1);
  }
  console.log("");
  console.log("Test-database safety check passed.");
  console.log("Apply migrations with: npm run db:test:migrate");
  process.exit(0);
}

if (isRemoteProductionHost(host)) {
  console.log("");
  console.log(
    `WARNING: Host "${host}" looks like hosted production. ` +
      "npm test and npm run db:test:migrate must never use this URL.",
  );
  console.log(
    "This default check is for intentional app/dev migrations only.",
  );
}

const looksLikeThisProject =
  /aimed[_-]?jobseek|email[_-]?platform|outbound|emailapp/i.test(databaseName) ||
  databaseName === "postgres" ||
  databaseName === "neondb";

console.log("");
if (!looksLikeThisProject) {
  console.log(
    "NOTE: Database name does not clearly match aimed-jobseek naming.",
  );
  console.log(
    "Confirm manually that this is the dedicated aimed-jobseek database",
  );
  console.log("and that it does not contain tables from a blocked legacy database.");
} else {
  console.log("Database name looks plausible for this project.");
}

console.log("");
console.log("Safety check passed (no blocked legacy database name match).");
console.log("Before migrating, optionally inspect tables for leftovers:");
console.log(
  "  SELECT tablename FROM pg_tables WHERE schemaname = 'public';",
);
console.log("");
console.log("Then run:");
console.log("  npx prisma migrate deploy");
console.log("  # or for local iterative development:");
console.log("  npx prisma migrate dev");
console.log("");
console.log("Test database (never Render):");
console.log("  npm run db:test:up");
console.log("  npm run db:test:migrate");
