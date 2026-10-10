import { RESEARCH_RUN_QUEUED_STALE_MS_DEFAULT } from "@/lib/research/run-types";

/**
 * Research AI prompt versioning (application constant — not env).
 * v10: cite outside news for funding, ownership, and recent events; one leadership timeline; keep real source titles; hiring and growth is the company's, not the posting.
 * v9: clean citation markers, label anchor and sister pages as the company website, fetch the homepage and its leadership, about, and careers pages, and drop job-demand employer risks. The brief text is unchanged.
 * v8: read leadership, about, and careers pages, and keep a sister site only when its domain shares the company name.
 * v7: stop only when job-focus coverage is met, and read longer page excerpts.
 * v6: tailored research per application, using the approved brief.
 * v5: capture products and services in depth for What they do.
 * v3: job-seeker employer research. Hiring signals are separate from buyingSignals.
 * v2: OpenAI Responses + web_search production research prompt.
 */
export const RESEARCH_PROMPT_VERSION = "10";

/** Default when RESEARCH_CONCURRENCY is unset. Tuned for Starter web (512 MB). */
export const RESEARCH_CONCURRENCY_DEFAULT = 5;

const RESEARCH_CONCURRENCY_MAX = 50;

/**
 * Concurrent automated company research jobs per batch.
 * Override with RESEARCH_CONCURRENCY (1–50). Read at call time so ops can tune
 * without a code deploy (process restart still required on Render).
 */
export function getResearchConcurrency(): number {
  const raw = process.env.RESEARCH_CONCURRENCY?.trim();
  if (!raw) return RESEARCH_CONCURRENCY_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `Invalid RESEARCH_CONCURRENCY "${raw}". Use an integer from 1 to ${RESEARCH_CONCURRENCY_MAX}.`,
    );
  }
  return Math.min(parsed, RESEARCH_CONCURRENCY_MAX);
}

/** Default when RESEARCH_WORKER_CONCURRENCY is unset (Render worker Starter). */
export const RESEARCH_WORKER_CONCURRENCY_DEFAULT = 5;

/**
 * Concurrent company research jobs per background worker process.
 * Separate from web RESEARCH_CONCURRENCY (single-company refresh on web).
 */
export function getResearchWorkerConcurrency(): number {
  const raw = process.env.RESEARCH_WORKER_CONCURRENCY?.trim();
  if (!raw) return RESEARCH_WORKER_CONCURRENCY_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `Invalid RESEARCH_WORKER_CONCURRENCY "${raw}". Use an integer from 1 to ${RESEARCH_CONCURRENCY_MAX}.`,
    );
  }
  return Math.min(parsed, RESEARCH_CONCURRENCY_MAX);
}

const RESEARCH_QUEUED_STALE_MS_MIN = 15_000;
const RESEARCH_QUEUED_STALE_MS_MAX = 60 * 60 * 1000;

/**
 * How long a PENDING run may sit unclaimed before the application shows
 * that research has not started. Override with RESEARCH_QUEUED_STALE_MS.
 */
export function getResearchQueuedStaleMs(): number {
  const raw = process.env.RESEARCH_QUEUED_STALE_MS?.trim();
  if (!raw) return RESEARCH_RUN_QUEUED_STALE_MS_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (
    !Number.isFinite(parsed) ||
    parsed < RESEARCH_QUEUED_STALE_MS_MIN ||
    parsed > RESEARCH_QUEUED_STALE_MS_MAX
  ) {
    throw new Error(
      `Invalid RESEARCH_QUEUED_STALE_MS "${raw}". Use an integer from ${RESEARCH_QUEUED_STALE_MS_MIN} to ${RESEARCH_QUEUED_STALE_MS_MAX}.`,
    );
  }
  return parsed;
}
