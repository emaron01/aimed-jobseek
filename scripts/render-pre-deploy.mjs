import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Render web pre-deploy: safety check, ownership preflight (when schema exists),
 * then prisma migrate deploy.
 *
 * The research background worker never runs migrations — only this path does.
 *
 * A never-migrated database has no application tables yet, so the ownership
 * report is skipped. Detection reads information_schema / _prisma_migrations
 * only — missing ContactList/Campaign/Contact tables cannot fail that query.
 * Connection and permission errors still fail the deploy.
 */

export const OWNERSHIP_REPORT_SKIP_MESSAGE =
  "Skipping personal-work ownership report: this database has never been migrated, so there is no existing data to inspect.";

export class PreDeployCommandError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.name = "PreDeployCommandError";
    this.status = status;
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ spawn?: typeof spawnSync, stdio?: import("node:child_process").StdioOptions, encoding?: BufferEncoding, env?: NodeJS.ProcessEnv }} [options]
 */
export function runCommand(command, args, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const result = spawn(command, args, {
    stdio: options.stdio ?? "inherit",
    encoding: options.encoding,
    env: options.env ?? process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new PreDeployCommandError(
      `${command} ${args.join(" ")} exited with status ${result.status ?? 1}.`,
      result.status ?? 1,
    );
  }
  return result;
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "t" || value === "true" || value === 1n || value === 1) {
    return true;
  }
  if (value === "f" || value === "false" || value === 0n || value === 0) {
    return false;
  }
  return Boolean(value);
}

function asCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

/**
 * Confirm whether Prisma has ever applied a migration.
 * The first query uses information_schema only and cannot fail because
 * application tables are missing.
 *
 * @param {(strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>} queryRaw
 * @returns {Promise<{ status: "never_migrated" | "migrated", applied: number }>}
 */
export async function queryPrismaMigrationState(queryRaw) {
  const tableRows = await queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = '_prisma_migrations'
    ) AS "exists"
  `;

  if (
    !Array.isArray(tableRows) ||
    tableRows.length === 0 ||
    tableRows[0] == null ||
    !Object.prototype.hasOwnProperty.call(tableRows[0], "exists")
  ) {
    throw new Error(
      "Unable to determine whether _prisma_migrations exists. Read of information_schema.tables returned no usable result.",
    );
  }

  if (!asBoolean(tableRows[0].exists)) {
    return { status: "never_migrated", applied: 0 };
  }

  const countRows = await queryRaw`
    SELECT COUNT(*)::int AS "applied"
    FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL
  `;

  if (!Array.isArray(countRows) || countRows.length === 0 || countRows[0] == null) {
    throw new Error(
      "Unable to read applied Prisma migration count from _prisma_migrations.",
    );
  }

  const applied = asCount(countRows[0].applied);
  if (!Number.isFinite(applied)) {
    throw new Error(
      "Unable to read applied Prisma migration count from _prisma_migrations.",
    );
  }

  return applied > 0
    ? { status: "migrated", applied }
    : { status: "never_migrated", applied: 0 };
}

export async function inspectPrismaMigrationStateWithPrisma() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    return await queryPrismaMigrationState(prisma.$queryRaw.bind(prisma));
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Inspect in a child process so this process never loads Prisma before
 * `prisma migrate deploy` (avoids Windows libuv crashes).
 *
 * @param {{ spawn?: typeof spawnSync, scriptPath?: string }} [options]
 * @returns {"never_migrated" | "migrated"}
 */
export function inspectPrismaMigrationStateInChild(options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const scriptPath = options.scriptPath ?? fileURLToPath(import.meta.url);
  const result = spawn(
    process.execPath,
    [scriptPath, "--inspect-migration-state"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new PreDeployCommandError(
      "Unable to inspect Prisma migration state.",
      result.status ?? 1,
    );
  }
  const stdout = String(result.stdout ?? "").trim();
  const line = stdout.split(/\r?\n/).filter(Boolean).at(-1);
  let parsed;
  try {
    parsed = JSON.parse(line ?? "");
  } catch {
    throw new PreDeployCommandError(
      "Invalid migration-state inspector output.",
      1,
    );
  }
  if (
    parsed?.status !== "never_migrated" &&
    parsed?.status !== "migrated"
  ) {
    throw new PreDeployCommandError(
      "Invalid migration-state inspector status.",
      1,
    );
  }
  return parsed.status;
}

/**
 * @param {{
 *   run: (command: string, args: string[]) => void,
 *   inspectMigrationState: () => Promise<"never_migrated" | "migrated"> | "never_migrated" | "migrated",
 *   log?: (message: string) => void,
 *   logError?: (...args: unknown[]) => void,
 *   exit?: (code: number) => void,
 * }} deps
 */
export async function runRenderPreDeploy(deps) {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;
  const exit = deps.exit ?? ((code) => process.exit(code));

  try {
    deps.run("node", ["scripts/db-safety-check.mjs"]);
    const state = await deps.inspectMigrationState();
    if (state === "never_migrated") {
      log(OWNERSHIP_REPORT_SKIP_MESSAGE);
    } else if (state === "migrated") {
      deps.run("node", ["scripts/report-personal-work-ownership.mjs"]);
    } else {
      throw new PreDeployCommandError(
        `Unexpected Prisma migration state: ${state}`,
        1,
      );
    }
    deps.run("npx", ["prisma", "migrate", "deploy"]);
  } catch (error) {
    const rawStatus =
      error instanceof PreDeployCommandError
        ? error.status
        : Number(error && typeof error === "object" && "status" in error
            ? error.status
            : Number.NaN);
    const code =
      Number.isInteger(rawStatus) && rawStatus !== 0 ? rawStatus : 1;
    if (!(error instanceof PreDeployCommandError)) {
      logError("Render pre-deploy failed.", error);
    }
    exit(code);
  }
}

async function runInspectCli() {
  try {
    const result = await inspectPrismaMigrationStateWithPrisma();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error("Unable to inspect Prisma migration state.", error);
    process.exitCode = 1;
  }
}

function isDirectRun() {
  const argv1 = (process.argv[1] ?? "").replace(/\\/g, "/");
  return argv1.endsWith("render-pre-deploy.mjs");
}

if (isDirectRun()) {
  if (process.argv.includes("--inspect-migration-state")) {
    await runInspectCli();
  } else {
    await runRenderPreDeploy({
      run: (command, args) => {
        runCommand(command, args);
      },
      inspectMigrationState: () => inspectPrismaMigrationStateInChild(),
    });
  }
}
