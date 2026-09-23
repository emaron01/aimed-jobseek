/**
 * Test database resolution. Never load `.env.local` from this module.
 * Vitest setup calls `configureVitestDatabase()` before any test file.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const TEST_ENTITY_PREFIX = "[TEST]";

export function testEntityName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith(TEST_ENTITY_PREFIX)) return trimmed;
  return `${TEST_ENTITY_PREFIX} ${trimmed}`;
}

export function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

export function hasTestDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function parseDatabaseUrlHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname || null;
  } catch {
    return null;
  }
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "host.docker.internal"
  );
}

export function isRemoteProductionHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (isLoopbackHost(host)) return false;
  return (
    host.endsWith(".render.com") ||
    host.endsWith(".onrender.com") ||
    host.endsWith(".neon.tech") ||
    host.endsWith(".supabase.co") ||
    host.endsWith(".amazonaws.com") ||
    host.endsWith(".rds.amazonaws.com")
  );
}

function parseEnvFile(filename: string): Record<string, string> {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
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
    values[key] = value;
  }
  return values;
}

/** Read `.env.local` DATABASE_URL host for comparison only — never connect with it. */
export function productionHostFromEnvLocal(): string | null {
  const url = parseEnvFile(".env.local").DATABASE_URL?.trim();
  if (!url) return null;
  return parseDatabaseUrlHost(url);
}

export type DatabaseGuardOptions = {
  allowProdTests?: boolean;
  productionHost?: string | null;
  purpose?: string;
};

export function allowProdDatabaseTests(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.ALLOW_PROD_DB_TESTS === "1";
}

export function assertSafeTestDatabaseUrl(
  databaseUrl: string,
  options: DatabaseGuardOptions = {},
): void {
  const purpose = options.purpose ?? "tests";
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      `Invalid database URL for ${purpose}. Check TEST_DATABASE_URL.`,
    );
  }
  const host = parsed.hostname || "(unknown host)";
  const allow =
    options.allowProdTests ?? allowProdDatabaseTests();
  if (allow) return;

  const productionHost = (
    options.productionHost === undefined
      ? productionHostFromEnvLocal()
      : options.productionHost
  )
    ?.trim()
    .toLowerCase();

  const matchesKnownProd = isRemoteProductionHost(host);
  const matchesEnvLocal =
    Boolean(productionHost) &&
    !isLoopbackHost(productionHost!) &&
    host.toLowerCase() === productionHost;

  if (!matchesKnownProd && !matchesEnvLocal) return;

  throw new Error(
    `REFUSING to run ${purpose} against production database host "${host}". ` +
      `Set TEST_DATABASE_URL to the dedicated test database in .env.test.example ` +
      `(npm run db:test:up). ` +
      `Override only with ALLOW_PROD_DB_TESTS=1 — never against customer data.`,
  );
}

/**
 * Load `.env.test` / `.env.test.example` (never `.env.local`).
 * TEST_DATABASE_URL always wins over an inherited DATABASE_URL.
 */
export function configureVitestDatabase(
  env: Record<string, string | undefined> = process.env,
): void {
  const example = parseEnvFile(".env.test.example");
  const localTest = parseEnvFile(".env.test");
  for (const [key, value] of Object.entries({ ...example, ...localTest })) {
    if (key === "DATABASE_URL") continue;
    if (!env[key]?.trim()) env[key] = value;
  }

  const testUrl =
    env.TEST_DATABASE_URL?.trim() ||
    localTest.TEST_DATABASE_URL?.trim() ||
    example.TEST_DATABASE_URL?.trim() ||
    "";

  if (testUrl) {
    env.TEST_DATABASE_URL = testUrl;
    env.DATABASE_URL = testUrl;
  }

  const resolved = env.DATABASE_URL?.trim();
  if (!resolved) return;
  assertSafeTestDatabaseUrl(resolved, {
    purpose: "tests",
    allowProdTests: allowProdDatabaseTests(env),
  });
}

export function resolveTestDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const example = parseEnvFile(".env.test.example");
  const localTest = parseEnvFile(".env.test");
  const url =
    env.TEST_DATABASE_URL?.trim() ||
    localTest.TEST_DATABASE_URL?.trim() ||
    localTest.DATABASE_URL?.trim() ||
    example.TEST_DATABASE_URL?.trim() ||
    example.DATABASE_URL?.trim() ||
    "";
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy .env.test.example to .env.test " +
        "or run npm run db:test:up.",
    );
  }
  return url;
}
