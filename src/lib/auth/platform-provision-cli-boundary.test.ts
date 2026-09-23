/**
 * Asserts the production CLI import graph is free of `server-only` and loads
 * under plain Node/tsx (without Vitest's server-only stub).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

const CLI_ENTRY = "scripts/platform-provision-super-admin.ts";
const SERVICE_ENTRY = "src/lib/auth/platform-provision-service.ts";

/** Modules that intentionally keep server-only and must NOT be reachable from the CLI graph. */
const SERVER_ONLY_BOUNDARIES = [
  "src/lib/auth/platform-provision.ts",
  "src/lib/auth/server.ts",
  "src/lib/auth/config.ts",
  "src/lib/auth/audit.ts",
  "src/lib/auth/provision.ts",
  "src/lib/transactional-email/config.ts",
  "src/lib/transactional-email/send.ts",
  "src/lib/transactional-email/render.ts",
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
          `CLI import graph includes server-only via ${rel}`,
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

describe("platform provision CLI Node boundary", () => {
  it("CLI service import graph contains no server-only and avoids Next wrappers", () => {
    const graph = collectLocalImports(SERVICE_ENTRY);
    expect(graph.has(SERVICE_ENTRY)).toBe(true);
    expect(graph.has("src/lib/auth/better-auth.ts")).toBe(true);
    expect(graph.has("src/lib/auth/config-core.ts")).toBe(true);
    expect(graph.has("src/lib/auth/audit-service.ts")).toBe(true);
    expect(graph.has("src/lib/auth/provision-service.ts")).toBe(true);

    for (const boundary of SERVER_ONLY_BOUNDARIES) {
      expect(graph.has(boundary)).toBe(false);
    }

    // Wrappers still exist for Next.js app imports.
    for (const boundary of SERVER_ONLY_BOUNDARIES) {
      const abs = join(ROOT, boundary);
      expect(existsSync(abs)).toBe(true);
      expect(readFileSync(abs, "utf8")).toMatch(/import ["']server-only["']/);
    }
  });

  it("plain tsx can load the Node-safe service without server-only errors", () => {
    const probe = `
import { PLATFORM_BOOTSTRAP_CONFIRM_VALUE, assertPlatformProvisionConfirmation, PlatformProvisionError } from "./src/lib/auth/platform-provision-service.ts";
assertPlatformProvisionConfirmation(PLATFORM_BOOTSTRAP_CONFIRM_VALUE);
try {
  assertPlatformProvisionConfirmation(null);
  console.log("UNEXPECTED_PASS");
  process.exit(2);
} catch (e) {
  if (!(e instanceof PlatformProvisionError)) {
    console.log("WRONG_ERROR", e);
    process.exit(3);
  }
}
console.log("CLI_SERVICE_OK", PLATFORM_BOOTSTRAP_CONFIRM_VALUE);
`;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        probe,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          // Ensure Vitest's alias does not apply; this is plain Node.
        },
        timeout: 60_000,
      },
    );

    if (result.status !== 0) {
      // Fallback: npx tsx if --import tsx unavailable
      const fallback = spawnSync(
        "npx",
        ["tsx", "-e", probe],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: process.env,
          timeout: 60_000,
          shell: true,
        },
      );
      expect(fallback.stderr || "").not.toMatch(/server-only/i);
      expect(fallback.stdout || "").toContain("CLI_SERVICE_OK");
      expect(fallback.status).toBe(0);
      return;
    }

    expect(result.stderr || "").not.toMatch(/server-only/i);
    expect(result.stdout || "").toContain("CLI_SERVICE_OK");
    expect(result.stdout || "").toContain("PROVISION_INITIAL_SUPER_ADMIN");
    expect(result.status).toBe(0);
  });

  it("CLI script source imports the service, not the server-only wrapper", () => {
    const script = readFileSync(join(ROOT, CLI_ENTRY), "utf8");
    expect(script).toContain("platform-provision-service");
    expect(script).toContain("prisma-client");
    expect(script).not.toContain('platform-provision"');
    expect(script).not.toContain("platform-provision'");
    expect(script).not.toMatch(/from ["']\.\.\/src\/lib\/prisma["']/);
    expect(script).not.toMatch(/import\(["']\.\.\/src\/lib\/prisma["']\)/);
  });

  it("CLI entry import graph never reaches server-only prisma", () => {
    const graph = collectLocalImports(CLI_ENTRY);
    expect(graph.has("src/lib/prisma-client.ts")).toBe(true);
    expect(graph.has("src/lib/prisma.ts")).toBe(false);
    expect(graph.has("src/lib/auth/platform-provision-service.ts")).toBe(true);
  });

  it("npm script uses react-server conditions and does not require env files", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      prisma?: unknown;
    };
    const script = pkg.scripts["platform:provision-super-admin"];
    expect(script).toContain("--conditions=react-server");
    expect(script).toContain("scripts/platform-provision-super-admin.ts");
    expect(script).not.toMatch(/dotenv/);
    expect(script).not.toMatch(/\.env\.local/);
    expect(pkg.prisma).toBeUndefined();
  });
});
