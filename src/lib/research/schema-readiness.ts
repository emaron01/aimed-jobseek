/**
 * Schema readiness polling for the research worker (Node-safe).
 */
import { prisma } from "@/lib/prisma-client";

function isMissingApplicationJobTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code === "P2021" ||
    code === "42P01" ||
    /relation "ApplicationJob" does not exist/i.test(message)
  );
}

function isMissingResearchRunTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code === "P2021" ||
    code === "42P01" ||
    /relation "ResearchRun" does not exist/i.test(message)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Background workers must never run `prisma migrate deploy`. Web pre-deploy owns
 * migrations; workers poll until the ResearchRun table exists.
 */
export async function waitForResearchRunSchema(options?: {
  maxWaitMs?: number;
  pollMs?: number;
}): Promise<void> {
  const maxWaitMs = options?.maxWaitMs ?? 10 * 60 * 1000;
  const pollMs = options?.pollMs ?? 5_000;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    try {
      await prisma.$queryRaw`SELECT "id" FROM "ResearchRun" LIMIT 0`;
      await prisma.$queryRaw`SELECT "id" FROM "ApplicationJob" LIMIT 0`;
      return;
    } catch (error) {
      if (!isMissingResearchRunTable(error) && !isMissingApplicationJobTable(error)) {
        throw error;
      }
      const waitedSec = Math.round((Date.now() - started) / 1000);
      console.log(
        `[research-worker] ResearchRun table not ready (${waitedSec}s) — waiting for web migrations…`,
      );
      await sleep(pollMs);
    }
  }

  throw new Error(
    "ResearchRun schema not available after waiting. " +
      "Ensure the web service pre-deploy runs `npm run render:pre-deploy` (prisma migrate deploy). " +
      "The research worker never runs migrations.",
  );
}
