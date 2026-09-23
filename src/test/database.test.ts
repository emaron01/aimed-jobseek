import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeTestDatabaseUrl,
  configureVitestDatabase,
  isLoopbackHost,
  isRemoteProductionHost,
  testEntityName,
} from "@/test/database";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("test database guard", () => {
  it("treats Render / Neon / RDS hosts as production", () => {
    expect(
      isRemoteProductionHost("dpg-abc123-a.oregon-postgres.render.com"),
    ).toBe(true);
    expect(isRemoteProductionHost("ep-cool-name.us-east-2.aws.neon.tech")).toBe(
      true,
    );
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isRemoteProductionHost("127.0.0.1")).toBe(false);
    expect(isRemoteProductionHost("localhost")).toBe(false);
    expect(isRemoteProductionHost("postgres")).toBe(false);
  });

  it("fails loudly when the test URL is a Render host", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://u:p@dpg-abc123-a.oregon-postgres.render.com/email_platform",
        { productionHost: null },
      ),
    ).toThrow(/dpg-abc123-a\.oregon-postgres\.render\.com/);
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://u:p@dpg-abc123-a.oregon-postgres.render.com/email_platform",
        { productionHost: null },
      ),
    ).toThrow(/ALLOW_PROD_DB_TESTS=1/);
  });

  it("fails when the URL host matches .env.local production host", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@prod.example.net:5432/app", {
        productionHost: "prod.example.net",
      }),
    ).toThrow(/prod\.example\.net/);
  });

  it("allows loopback even when .env.local also names localhost", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://aimedjobseek_test:aimedjobseek_test@127.0.0.1:5435/aimedjobseek_test",
        { productionHost: "localhost" },
      ),
    ).not.toThrow();
  });

  it("allows ALLOW_PROD_DB_TESTS=1 as an explicit escape hatch", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://u:p@dpg-abc123-a.oregon-postgres.render.com/email_platform",
        { allowProdTests: true, productionHost: null },
      ),
    ).not.toThrow();
  });

  it("overrides an inherited production DATABASE_URL with TEST_DATABASE_URL", () => {
    const env = {
      DATABASE_URL:
        "postgresql://u:p@dpg-abc123-a.oregon-postgres.render.com/email_platform",
      TEST_DATABASE_URL:
        "postgresql://aimedjobseek_test:aimedjobseek_test@127.0.0.1:5435/aimedjobseek_test",
    };
    configureVitestDatabase(env);
    expect(env.DATABASE_URL).toContain("127.0.0.1:5435");
  });

  it("hard-fails configure when TEST_DATABASE_URL is a Render host", () => {
    const env = {
      TEST_DATABASE_URL:
        "postgresql://u:p@dpg-abc123-a.oregon-postgres.render.com/email_platform",
    };
    expect(() => configureVitestDatabase(env)).toThrow(
      /oregon-postgres\.render\.com/,
    );
  });

  it("prefixes test entity names once", () => {
    expect(testEntityName("CampDel A")).toBe("[TEST] CampDel A");
    expect(testEntityName("[TEST] Org A")).toBe("[TEST] Org A");
  });

  it("db:test:up starts a dedicated 5435 cluster and migrates", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const script = readFileSync("scripts/start-test-postgres.mjs", "utf8");
    expect(pkg.scripts["db:test:up"]).toBe(
      "node scripts/start-test-postgres.mjs",
    );
    expect(script).toContain('PORT = "5435"');
    expect(script).toContain(".local-postgres-test");
    expect(script).toContain("aimedjobseek_test");
    expect(script).toContain("migrate-test-db.ts");
    expect(script).toContain("dockerAvailable");
  });
});
