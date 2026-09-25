/**
 * Next.js server-only boundary for research runs.
 * Workers import `@/lib/research/runs-service` instead.
 */
import "server-only";

export type { ResearchRunView } from "@/lib/research/run-types";
export {
  isResearchRunPaused,
  isResearchRunStalled,
  isResearchRunQueuedUnstarted,
  RESEARCH_RUN_STALE_MS,
} from "@/lib/research/run-types";
export {
  HEARTBEAT_STALE_MS,
  RUN_ABANDON_MS,
  researchWorkerShutdown,
  abandonStaleResearchRuns,
  canRetryResearchRun,
  claimNextResearchRun,
  createResearchRun,
  enqueueApplicationResearch,
  getActiveResearchRunForContactList,
  getLatestResearchRunForContactList,
  getResearchRunForOrganization,
  processResearchRun,
  requireResearchRunInOrganization,
} from "@/lib/research/runs-service";
