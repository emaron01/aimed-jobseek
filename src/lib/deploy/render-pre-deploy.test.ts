import { describe, expect, it, vi } from "vitest";
import {
  OWNERSHIP_REPORT_SKIP_MESSAGE,
  PreDeployCommandError,
  queryPrismaMigrationState,
  runRenderPreDeploy,
} from "../../../scripts/render-pre-deploy.mjs";

type QueryRaw = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

function sqlOf(strings: TemplateStringsArray): string {
  return strings.join(" ");
}

function queryRawFrom(handlers: {
  informationSchema: () => Promise<unknown>;
  appliedCount?: () => Promise<unknown>;
}): QueryRaw {
  return async (strings) => {
    const sql = sqlOf(strings);
    if (sql.includes("information_schema.tables")) {
      return handlers.informationSchema();
    }
    if (sql.includes("_prisma_migrations")) {
      if (!handlers.appliedCount) {
        throw new Error("applied-count query should not run");
      }
      return handlers.appliedCount();
    }
    throw new Error(`unexpected query: ${sql}`);
  };
}

async function collectPreDeploy(input: {
  inspectMigrationState: () => Promise<"never_migrated" | "migrated">;
  reportStatus?: number;
}) {
  const calls: Array<[string, string[]]> = [];
  const logs: string[] = [];
  const errors: unknown[] = [];
  let exitCode: number | null = null;

  await runRenderPreDeploy({
    run: (command, args) => {
      calls.push([command, args]);
      if (
        args.includes("scripts/report-personal-work-ownership.mjs") &&
        input.reportStatus &&
        input.reportStatus !== 0
      ) {
        throw new PreDeployCommandError(
          "ownership report blocked",
          input.reportStatus,
        );
      }
    },
    inspectMigrationState: input.inspectMigrationState,
    log: (message) => {
      logs.push(message);
    },
    logError: (...args) => {
      errors.push(args);
    },
    exit: (code) => {
      exitCode = code;
    },
  });

  return { calls, logs, errors, exitCode };
}

describe("queryPrismaMigrationState", () => {
  it("treats a missing _prisma_migrations table as never migrated", async () => {
    const appliedCount = vi.fn();
    const state = await queryPrismaMigrationState(
      queryRawFrom({
        informationSchema: async () => [{ exists: false }],
        appliedCount,
      }),
    );
    expect(state).toEqual({ status: "never_migrated", applied: 0 });
    expect(appliedCount).not.toHaveBeenCalled();
  });

  it("treats an empty _prisma_migrations table as never migrated", async () => {
    const state = await queryPrismaMigrationState(
      queryRawFrom({
        informationSchema: async () => [{ exists: true }],
        appliedCount: async () => [{ applied: 0 }],
      }),
    );
    expect(state).toEqual({ status: "never_migrated", applied: 0 });
  });

  it("treats applied rows as an existing database", async () => {
    const state = await queryPrismaMigrationState(
      queryRawFrom({
        informationSchema: async () => [{ exists: true }],
        appliedCount: async () => [{ applied: 4 }],
      }),
    );
    expect(state).toEqual({ status: "migrated", applied: 4 });
  });

  it("fails closed on a connection error from information_schema", async () => {
    await expect(
      queryPrismaMigrationState(
        queryRawFrom({
          informationSchema: async () => {
            throw new Error("P1001: Can't reach database server");
          },
        }),
      ),
    ).rejects.toThrow(/Can't reach database server/);
  });

  it("fails closed on a permission error reading _prisma_migrations", async () => {
    await expect(
      queryPrismaMigrationState(
        queryRawFrom({
          informationSchema: async () => [{ exists: true }],
          appliedCount: async () => {
            throw new Error("permission denied for table _prisma_migrations");
          },
        }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("runRenderPreDeploy", () => {
  it("fresh database skips the report and migrates", async () => {
    const result = await collectPreDeploy({
      inspectMigrationState: async () => "never_migrated",
    });

    expect(result.exitCode).toBeNull();
    expect(result.logs).toContain(OWNERSHIP_REPORT_SKIP_MESSAGE);
    expect(result.calls).toEqual([
      ["node", ["scripts/db-safety-check.mjs"]],
      ["npx", ["prisma", "migrate", "deploy"]],
    ]);
    expect(result.calls.flat(2).join(" ")).not.toContain(
      "report-personal-work-ownership",
    );
  });

  it("existing database with no ambiguity migrates", async () => {
    const result = await collectPreDeploy({
      inspectMigrationState: async () => "migrated",
    });

    expect(result.exitCode).toBeNull();
    expect(result.logs).not.toContain(OWNERSHIP_REPORT_SKIP_MESSAGE);
    expect(result.calls).toEqual([
      ["node", ["scripts/db-safety-check.mjs"]],
      ["node", ["scripts/report-personal-work-ownership.mjs"]],
      ["npx", ["prisma", "migrate", "deploy"]],
    ]);
  });

  it("existing database with ambiguous rows blocks", async () => {
    const result = await collectPreDeploy({
      inspectMigrationState: async () => "migrated",
      reportStatus: 2,
    });

    expect(result.exitCode).toBe(2);
    expect(result.calls).toEqual([
      ["node", ["scripts/db-safety-check.mjs"]],
      ["node", ["scripts/report-personal-work-ownership.mjs"]],
    ]);
    expect(result.calls.flat(2).join(" ")).not.toContain("migrate");
  });

  it("connection error fails", async () => {
    const result = await collectPreDeploy({
      inspectMigrationState: async () => {
        throw new Error("P1001: Can't reach database server");
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.calls).toEqual([
      ["node", ["scripts/db-safety-check.mjs"]],
    ]);
    expect(result.calls.flat(2).join(" ")).not.toContain(
      "report-personal-work-ownership",
    );
    expect(result.calls.flat(2).join(" ")).not.toContain("migrate");
  });
});
