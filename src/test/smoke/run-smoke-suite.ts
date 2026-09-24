import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertSafeTestDatabaseUrl,
  configureVitestDatabase,
  resolveTestDatabaseUrl,
} from "@/test/database";
import {
  discoverExpandedSmokeRoutes,
  discoverAppRoutePatterns,
} from "@/test/smoke/discover-routes";
import {
  isPublicSmokeRoute,
  smokeExpectationForPath,
} from "@/test/smoke/expectations";
import {
  seedSmokeFixture,
  signInSmokeSession,
  smokeServerEnv,
} from "@/test/smoke/seed-fixture";

const SMOKE_PORT = Number(process.env.SMOKE_PORT || "38477");
const START_TIMEOUT_MS = 120_000;
const FETCH_TIMEOUT_MS = 120_000;

export type SmokeRouteResult = {
  path: string;
  status: number;
  finalUrl: string;
  durationMs: number;
  ok: boolean;
  error?: string;
};

export type SmokeSuiteReport = {
  routePatterns: number;
  routes: number;
  passed: number;
  failed: number;
  totalDurationMs: number;
  serverStartMs: number;
  fetchTotalMs: number;
  results: SmokeRouteResult[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl: string): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < START_TIMEOUT_MS) {
    try {
      const res = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (res.status >= 200 && res.status < 500) {
        return Date.now() - started;
      }
    } catch {
      // server not ready
    }
    await sleep(500);
  }
  throw new Error(`Smoke server did not become ready within ${START_TIMEOUT_MS}ms`);
}

function spawnSmokeServer(port: number, databaseUrl: string): ChildProcess {
  const nextBin = join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  return spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    env: smokeServerEnv({ port, databaseUrl }),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function fetchRoute(input: {
  baseUrl: string;
  path: string;
  cookie?: string;
}): Promise<{ status: number; finalUrl: string; body: string; durationMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${input.baseUrl}${input.path}`, {
      redirect: "follow",
      headers: input.cookie ? { cookie: input.cookie } : undefined,
      signal: controller.signal,
    });
    const body = await res.text();
    return {
      status: res.status,
      finalUrl: res.url,
      body,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runSmokeSuite(): Promise<SmokeSuiteReport> {
  configureVitestDatabase();
  const databaseUrl = resolveTestDatabaseUrl();
  assertSafeTestDatabaseUrl(databaseUrl, { purpose: "route smoke tests" });

  const buildIdPath = join(process.cwd(), ".next", "BUILD_ID");
  if (!existsSync(buildIdPath)) {
    throw new Error(
      "Production build missing (.next/BUILD_ID). Run `npm run build` before `npm run test:smoke`.",
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suiteStarted = Date.now();
  let server: ChildProcess | null = null;

  try {
    const fixture = await seedSmokeFixture(prisma);
    const routePatterns = discoverAppRoutePatterns();
    const routes = discoverExpandedSmokeRoutes(fixture);

    if (routes.length < routePatterns.length) {
      throw new Error(
        `Smoke route expansion produced fewer URLs (${routes.length}) than page patterns (${routePatterns.length}).`,
      );
    }

    const baseUrl = `http://127.0.0.1:${SMOKE_PORT}`;
    server = spawnSmokeServer(SMOKE_PORT, databaseUrl);
    const serverStartMs = await waitForServer(baseUrl);

    const cookie = await signInSmokeSession({
      baseUrl,
      email: fixture.email,
      password: fixture.password,
    });

    const results: SmokeRouteResult[] = [];
    let fetchTotalMs = 0;

    for (const path of routes) {
      const expectation = smokeExpectationForPath(path);
      const useCookie = !(expectation.public ?? isPublicSmokeRoute(path));
      try {
        const fetched = await fetchRoute({
          baseUrl,
          path,
          cookie: useCookie ? cookie : undefined,
        });
        fetchTotalMs += fetched.durationMs;

        const markers = Array.isArray(expectation.mustInclude)
          ? expectation.mustInclude
          : [expectation.mustInclude];
        const expectedStatus = expectation.status ?? 200;
        const ok =
          fetched.status === expectedStatus &&
          markers.some((marker) => fetched.body.includes(marker));
        results.push({
          path,
          status: fetched.status,
          finalUrl: fetched.finalUrl,
          durationMs: fetched.durationMs,
          ok,
          error: ok
            ? undefined
            : `Expected HTTP ${expectedStatus} with one of ${JSON.stringify(markers)}; got ${fetched.status}`,
        });
      } catch (error) {
        results.push({
          path,
          status: 0,
          finalUrl: baseUrl + path,
          durationMs: 0,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const failed = results.filter((r) => !r.ok);
    return {
      routePatterns: routePatterns.length,
      routes: routes.length,
      passed: results.length - failed.length,
      failed: failed.length,
      totalDurationMs: Date.now() - suiteStarted,
      serverStartMs,
      fetchTotalMs,
      results,
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    if (server && !server.killed) {
      server.kill("SIGTERM");
      await sleep(300);
      if (!server.killed) server.kill("SIGKILL");
    }
  }
}

export function printSmokeReport(report: SmokeSuiteReport): void {
  console.log(
    `Smoke routes: ${report.passed}/${report.routes} passed (${report.routePatterns} page patterns)`,
  );
  console.log(
    `Timing: total ${(report.totalDurationMs / 1000).toFixed(1)}s | server ready ${(report.serverStartMs / 1000).toFixed(1)}s | fetches ${(report.fetchTotalMs / 1000).toFixed(1)}s`,
  );

  const failures = report.results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error("\nFailed routes:");
    for (const failure of failures) {
      console.error(
        `  ${failure.path} → ${failure.error} (status ${failure.status}, final ${failure.finalUrl})`,
      );
    }
  }
}
