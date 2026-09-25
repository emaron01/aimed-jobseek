/**
 * Render Background Worker entrypoint for durable ResearchRun batches
 * (list research and application employer research).
 *
 * Migration ownership: web service runs `npm run render:pre-deploy` before deploy.
 * This process never runs prisma migrate — it waits for the ResearchRun table.
 *
 * On Render, start with `tsx scripts/research-worker.ts` — env vars come from the
 * dashboard. Do not rely on .env.local (not present on Render).
 */
import { isResearchAiConfigured } from "@/lib/ai/config";
import { waitForResearchRunSchema } from "@/lib/research/schema-readiness";
import {
  abandonStaleResearchRuns,
  claimNextResearchRun,
  processResearchRun,
  researchWorkerShutdown,
} from "@/lib/research/runs-service";

const IDLE_POLL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let inFlight: Promise<void> | null = null;

process.on("SIGTERM", () => {
  console.log(
    "[research-worker] SIGTERM received — finishing in-flight work, not dequeuing new companies",
  );
  researchWorkerShutdown.requested = true;
});

async function main(): Promise<void> {
  console.log("[research-worker] starting (migrations owned by web pre-deploy)");
  console.log(
    `[research-worker] research AI configured: ${isResearchAiConfigured()}`,
  );
  await waitForResearchRunSchema();
  console.log("[research-worker] schema ready");

  while (!researchWorkerShutdown.requested) {
    await abandonStaleResearchRuns();

    const runId = await claimNextResearchRun();
    if (!runId) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    console.log(`[research-worker] processing run ${runId}`);
    inFlight = processResearchRun(runId)
      .then(() => {
        console.log(`[research-worker] finished run ${runId}`);
      })
      .catch((error) => {
        console.error(`[research-worker] run ${runId} failed`, error);
        throw error;
      });
    try {
      await inFlight;
    } catch {
      // Logged above; keep polling so one bad run does not exit the worker.
    }
    inFlight = null;
  }

  if (inFlight) {
    await inFlight.catch((error) => {
      console.error("[research-worker] in-flight run failed during shutdown", error);
    });
  }

  console.log(
    "[research-worker] shutdown complete (active runs left IN_PROGRESS for resume)",
  );
}

main().catch((error) => {
  console.error("[research-worker] fatal error", error);
  process.exit(1);
});
