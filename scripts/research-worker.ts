/**
 * Render Background Worker entrypoint for durable ResearchRun batches
 * (list research and application employer research) and ApplicationJob work.
 *
 * Migration ownership: web service runs `npm run render:pre-deploy` before deploy.
 * This process never runs prisma migrate — it waits for the ResearchRun table.
 *
 * On Render, start with `tsx scripts/research-worker.ts` — env vars come from the
 * dashboard. Do not rely on .env.local (not present on Render).
 *
 * Concurrency: RESEARCH_WORKER_CONCURRENCY applies to application jobs and
 * research runs together. CONSULTATION jobs are claimed first.
 */
import { isResearchAiConfigured } from "@/lib/ai/config";
import { waitForResearchRunSchema } from "@/lib/research/schema-readiness";
import { getResearchWorkerConcurrency } from "@/lib/research/config";
import {
  abandonStaleApplicationJobs,
  claimNextApplicationJob,
} from "@/lib/application-jobs/service";
import { formatApplicationJobLog } from "@/lib/application-jobs/types";
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

const inFlight = new Set<Promise<void>>();

process.on("SIGTERM", () => {
  console.log(
    "[research-worker] SIGTERM received — finishing in-flight work, not dequeuing new companies",
  );
  researchWorkerShutdown.requested = true;
});

function track(work: Promise<void>): void {
  inFlight.add(work);
  void work.finally(() => {
    inFlight.delete(work);
  });
}

async function runApplicationJob(jobId: string): Promise<void> {
  const { processApplicationJob } = await import(
    "@/lib/application-jobs/process"
  );
  const result = await processApplicationJob(jobId);
  if (result.ok) {
    console.log(formatApplicationJobLog(result));
    return;
  }
  console.error(formatApplicationJobLog(result));
}

async function runResearch(runId: string): Promise<void> {
  const started = Date.now();
  console.log(`[research-worker] processing run ${runId}`);
  try {
    await processResearchRun(runId);
    console.log(
      `[research-worker] research run ${runId} durationMs=${Date.now() - started} outcome=succeeded`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[research-worker] research run ${runId} durationMs=${Date.now() - started} outcome=failed error=${message}`,
    );
  }
}

async function main(): Promise<void> {
  const concurrency = getResearchWorkerConcurrency();
  console.log("[research-worker] starting (migrations owned by web pre-deploy)");
  console.log(
    `[research-worker] research AI configured: ${isResearchAiConfigured()}`,
  );
  console.log(`[research-worker] concurrency: ${concurrency}`);
  await waitForResearchRunSchema();
  console.log("[research-worker] schema ready");

  while (!researchWorkerShutdown.requested) {
    await abandonStaleResearchRuns();
    await abandonStaleApplicationJobs();

    while (!researchWorkerShutdown.requested && inFlight.size < concurrency) {
      const jobId = await claimNextApplicationJob();
      if (jobId) {
        track(runApplicationJob(jobId));
        continue;
      }
      const runId = await claimNextResearchRun();
      if (!runId) break;
      track(runResearch(runId));
    }

    if (inFlight.size === 0) {
      await sleep(IDLE_POLL_MS);
      continue;
    }
    await Promise.race(inFlight);
  }

  if (inFlight.size > 0) {
    await Promise.allSettled([...inFlight]);
  }

  console.log(
    "[research-worker] shutdown complete (active runs left IN_PROGRESS for resume)",
  );
}

main().catch((error) => {
  console.error("[research-worker] fatal error", error);
  process.exit(1);
});
