import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function findPsql(): string | null {
  const where = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["psql"], {
    encoding: "utf8",
  });
  const first = where.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (first && existsSync(first)) return first;

  const prefixes = [process.env["ProgramFiles"], process.env["ProgramFiles(x86)"]].filter(
    (value): value is string => Boolean(value),
  );
  for (const prefix of prefixes) {
    for (const version of ["17", "16", "15", "14"]) {
      const bin = join(prefix, "PostgreSQL", version, "bin", "psql.exe");
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

function ensureShadowDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = url.pathname.replace(/^\//, "").split("?")[0] || "postgres";
  const shadowName = "aimedjobseek_migrate_shadow";
  if (database === shadowName) {
    throw new Error("DATABASE_URL must not already point at the migration shadow database.");
  }
  const psql = findPsql();
  if (!psql) {
    throw new Error(
      "psql is required to create the migration shadow database for the schema sync check.",
    );
  }
  const args = [
    "-h",
    url.hostname,
    "-p",
    url.port || "5432",
    "-U",
    user,
    "-d",
    database,
  ];
  const env = { ...process.env, PGPASSWORD: password };
  const exists = spawnSync(
    psql,
    [
      ...args,
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname = '${shadowName}'`,
    ],
    { encoding: "utf8", env },
  );
  if (exists.status !== 0) {
    throw new Error(
      exists.stderr || exists.stdout || "Could not query databases for the migration shadow check.",
    );
  }
  if (exists.stdout.trim() !== "1") {
    const created = spawnSync(
      psql,
      [...args, "-c", `CREATE DATABASE ${shadowName}`],
      { encoding: "utf8", env },
    );
    if (created.status !== 0) {
      throw new Error(
        created.stderr || created.stdout || "Could not create the migration shadow database.",
      );
    }
  }
  url.pathname = `/${shadowName}`;
  url.searchParams.delete("schema");
  return url.toString();
}

describe("prisma schema and migrations stay in sync", () => {
  it("fails when prisma/schema.prisma differs from prisma/migrations", () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for the migration sync check.");
    }
    const shadowUrl = ensureShadowDatabase(databaseUrl);
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "diff",
        "--from-migrations",
        "prisma/migrations",
        "--to-schema-datamodel",
        "prisma/schema.prisma",
        "--shadow-database-url",
        shadowUrl,
        "--exit-code",
      ],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(
      result.status,
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    ).toBe(0);
  }, 180000);
});
