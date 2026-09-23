/**
 * Asserts the research worker import graph is free of `server-only` and loads
 * under plain Node/tsx (without Vitest's server-only stub).
 *
 * Also exercises the mid-run execution path (allowance → credits → research
 * service) so a lazy `import("@/lib/prisma")` cannot pass a startup-only probe.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

const CLI_ENTRY = "scripts/research-worker.ts";
const SERVICE_ENTRY = "src/lib/research/runs-service.ts";

const SERVER_ONLY_BOUNDARIES = [
  "src/lib/research/runs.ts",
  "src/lib/prisma.ts",
  "src/lib/tenant/companies.ts",
  "src/lib/tenant/getCurrentOrganization.ts",
  "src/lib/usage/quota.ts",
  "src/lib/usage/policy.ts",
  "src/lib/usage/events.ts",
  "src/lib/usage/active-companies.ts",
  "src/lib/usage/alerts.ts",
  "src/lib/auth/authz.ts",
  "src/lib/auth/session.ts",
];

function collectLocalImports(entryRelative: string): Set<string> {
  const visited = new Set<string>();
  const queue = [entryRelative.replace(/\\/g, "/")];

  while (queue.length > 0) {
    const rel = queue.pop()!;
    if (visited.has(rel)) continue;
    visited.add(rel);
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, "utf8");
    const importRe =
      /(?:import|export)\s+(?:type\s+)?(?:[^"'`]*from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(source))) {
      const spec = match[1] || match[2];
      if (!spec) continue;
      if (spec === "server-only") {
        throw new Error(
          `Worker import graph includes server-only via ${rel}`,
        );
      }
      let next: string | null = null;
      if (spec.startsWith("@/")) {
        next = `src/${spec.slice(2)}.ts`;
        if (!existsSync(join(ROOT, next))) {
          const asIndex = `src/${spec.slice(2)}/index.ts`;
          if (existsSync(join(ROOT, asIndex))) next = asIndex;
        }
      } else if (spec.startsWith(".")) {
        const base = resolve(dirname(abs), spec);
        const candidates = [
          `${base}.ts`,
          `${base}.tsx`,
          join(base, "index.ts"),
        ];
        const hit = candidates.find((c) => existsSync(c));
        if (hit) {
          next = hit.slice(ROOT.length + 1).replace(/\\/g, "/");
        }
      }
      if (next && next.startsWith("src/") && !visited.has(next)) {
        queue.push(next);
      }
    }
  }
  return visited;
}

function runTsxProbe(probe: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const env = { ...process.env };
  // Simulate the research worker: not a Next server runtime.
  delete env.NEXT_RUNTIME;
  // Force Prisma to fail fast if a probe touches the DB (no hang on missing local DB).
  env.DATABASE_URL =
    "postgresql://boundary:boundary@127.0.0.1:1/boundary?connect_timeout=1&pool_timeout=1&socket_timeout=1";

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", probe],
    {
      cwd: ROOT,
      encoding: "utf8",
      env,
      timeout: 45_000,
    },
  );

  if (result.status === 0 || result.status === null) {
    return {
      status: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  }

  const fallback = spawnSync("npx", ["tsx", "-e", probe], {
    cwd: ROOT,
    encoding: "utf8",
    env,
    timeout: 45_000,
    shell: true,
  });
  return {
    status: fallback.status,
    stdout: fallback.stdout || "",
    stderr: fallback.stderr || "",
  };
}

describe("research worker CLI Node boundary", () => {
  it("worker service import graph contains no server-only and avoids Next wrappers", () => {
    const graph = collectLocalImports(SERVICE_ENTRY);
    expect(graph.has(SERVICE_ENTRY)).toBe(true);
    expect(graph.has("src/lib/prisma-client.ts")).toBe(true);
    expect(graph.has("src/lib/tenant/company-research-service.ts")).toBe(true);
    expect(graph.has("src/lib/billing/company-research-credits.ts")).toBe(true);

    for (const boundary of SERVER_ONLY_BOUNDARIES) {
      expect(graph.has(boundary)).toBe(false);
    }

    for (const boundary of SERVER_ONLY_BOUNDARIES) {
      const abs = join(ROOT, boundary);
      expect(existsSync(abs)).toBe(true);
      expect(readFileSync(abs, "utf8")).toMatch(/import ["']server-only["']/);
    }

    const credits = readFileSync(
      join(ROOT, "src/lib/billing/company-research-credits.ts"),
      "utf8",
    );
    expect(credits).toContain("@/lib/prisma-client");
    expect(credits).not.toMatch(/["']@\/lib\/prisma["']/);
  });

  it("plain tsx can load the Node-safe worker service without server-only errors", () => {
    const probe = `
import { HEARTBEAT_STALE_MS, researchWorkerShutdown } from "./src/lib/research/runs-service.ts";
console.log("WORKER_SERVICE_OK", HEARTBEAT_STALE_MS, researchWorkerShutdown.requested);
`;
    const result = runTsxProbe(probe);
    expect(result.stderr).not.toMatch(/server-only/i);
    expect(result.stdout).toContain("WORKER_SERVICE_OK");
    expect(result.status).toBe(0);
  });

  it(
    "execution path (allowance + researchCompany) does not load server-only prisma",
    async () => {
      // Must spawn a real Node/tsx process and evaluate the worker graph —
      // Vitest's server-only stub would hide the failure. Prisma is pointed at
      // a refused port so queries fail fast; 15s covers compile + three calls.
      const probe = `
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PROBE_TIMEOUT")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function isBoundaryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /server-only|Client Component/i.test(message);
}

import { getEffectiveCompanyResearchAllowance } from "./src/lib/billing/company-research-credits.ts";
import { assertUsageAllowed } from "./src/lib/usage/quota-service.ts";
import { researchCompany } from "./src/lib/tenant/company-research-service.ts";
import { runWithTenantContext } from "./src/lib/tenant/request-context.ts";

async function main() {
  try {
    await withTimeout(
      getEffectiveCompanyResearchAllowance({
        organizationId: "org_boundary_probe",
        baseLimit: 25,
      }),
      400,
    );
  } catch (error) {
    if (isBoundaryError(error)) {
      console.error("BOUNDARY_FAIL_CREDITS", error);
      process.exit(2);
    }
  }

  try {
    await withTimeout(
      assertUsageAllowed({
        organizationId: "org_boundary_probe",
        userId: "user_boundary_probe",
        resource: "ACTIVE_RESEARCHED_COMPANY",
        wouldConsumeNewActiveCompanySlot: true,
      }),
      400,
    );
  } catch (error) {
    if (isBoundaryError(error)) {
      console.error("BOUNDARY_FAIL_QUOTA", error);
      process.exit(3);
    }
  }

  try {
    await withTimeout(
      runWithTenantContext(
        { organizationId: "org_boundary_probe", userId: "user_boundary_probe" },
        () => researchCompany("company_boundary_probe"),
      ),
      400,
    );
  } catch (error) {
    if (isBoundaryError(error)) {
      console.error("BOUNDARY_FAIL_RESEARCH", error);
      process.exit(4);
    }
  }

  console.log("WORKER_EXEC_PATH_OK");
}

main().catch((error) => {
  if (isBoundaryError(error)) {
    console.error("BOUNDARY_FAIL", error);
    process.exit(5);
  }
  console.log("WORKER_EXEC_PATH_OK");
});
`;
      const result = runTsxProbe(probe);
      expect(result.stderr).not.toMatch(/server-only|Client Component/i);
      expect(result.stdout).toContain("WORKER_EXEC_PATH_OK");
      expect(result.status).toBe(0);
    },
    15_000,
  );

  it("worker script source imports the service, not the server-only wrapper", () => {
    const script = readFileSync(join(ROOT, CLI_ENTRY), "utf8");
    expect(script).toContain("runs-service");
    expect(script).not.toMatch(/from ["']@\/lib\/research\/runs["']/);
  });
});
