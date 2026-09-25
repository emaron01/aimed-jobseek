/**
 * Application employer-research status for the workspace UI.
 * Node-safe so tests can map phases without the Next.js server boundary.
 */

import { prisma } from "@/lib/prisma-client";
import {
  applicationResearchCopy,
  employerIdentityCopy,
} from "@/lib/product-config";
import { getResearchQueuedStaleMs } from "@/lib/research/config";
import {
  isResearchRunQueuedUnstarted,
  RESEARCH_RUN_QUEUED_UNSTARTED_MARKER,
  type ResearchRunStatus,
} from "@/lib/research/run-types";

export type ApplicationResearchPhase =
  | "idle"
  | "queued"
  | "researching"
  | "done"
  | "failed"
  | "not_started";

export type ApplicationResearchStatusView = {
  phase: ApplicationResearchPhase;
  label: string;
  detail: string;
  canRetry: boolean;
  runId: string | null;
};

const PHASE_COPY: Record<
  ApplicationResearchPhase,
  { label: string; detail: string; canRetry: boolean }
> = {
  idle: {
    label: applicationResearchCopy.idle,
    detail: applicationResearchCopy.idleDetail,
    canRetry: false,
  },
  queued: {
    label: applicationResearchCopy.queued,
    detail: applicationResearchCopy.queuedDetail,
    canRetry: false,
  },
  researching: {
    label: applicationResearchCopy.researching,
    detail: applicationResearchCopy.researchingDetail,
    canRetry: false,
  },
  done: {
    label: applicationResearchCopy.done,
    detail: applicationResearchCopy.doneDetail,
    canRetry: false,
  },
  failed: {
    label: applicationResearchCopy.failed,
    detail: applicationResearchCopy.failedDetail,
    canRetry: true,
  },
  not_started: {
    label: applicationResearchCopy.notStarted,
    detail: applicationResearchCopy.notStartedDetail,
    canRetry: true,
  },
};

export function applicationResearchPhase(input: {
  run: {
    status: ResearchRunStatus;
    createdAt: string;
    workerHeartbeatAt: string | null;
  } | null;
  researchStatus: string | null;
  nowMs?: number;
  queuedStaleMs?: number;
}): ApplicationResearchPhase {
  const nowMs = input.nowMs ?? Date.now();
  const queuedStaleMs = input.queuedStaleMs ?? getResearchQueuedStaleMs();
  const run = input.run;

  if (run) {
    if (
      isResearchRunQueuedUnstarted(
        {
          status: run.status,
          createdAt: run.createdAt,
          workerHeartbeatAt: run.workerHeartbeatAt,
        },
        nowMs,
        queuedStaleMs,
      )
    ) {
      return "not_started";
    }
    if (run.status === "PENDING") return "queued";
    if (run.status === "IN_PROGRESS") return "researching";
    if (run.status === "FAILED" || run.status === "CANCELLED") return "failed";
    if (run.status === "COMPLETED" || run.status === "PARTIAL") return "done";
  }

  if (input.researchStatus === "IN_PROGRESS") return "researching";
  if (input.researchStatus === "FAILED") return "failed";
  if (input.researchStatus === "COMPLETED" || input.researchStatus === "PARTIAL") {
    return "done";
  }
  if (input.researchStatus === "NOT_STARTED") return "queued";
  return "idle";
}

export function toApplicationResearchStatusView(
  phase: ApplicationResearchPhase,
  runId: string | null,
): ApplicationResearchStatusView {
  const copy = PHASE_COPY[phase];
  return {
    phase,
    label: copy.label,
    detail: copy.detail,
    canRetry: copy.canRetry,
    runId,
  };
}

export async function noteQueuedResearchUnstarted(input: {
  runId: string;
  campaignId: string;
  organizationId: string;
  queuedMs: number;
  alreadyNoted: boolean;
}): Promise<void> {
  if (input.alreadyNoted) return;
  console.error(
    JSON.stringify({
      event: "research_run_queued_unstarted",
      severity: "operational",
      runId: input.runId,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
      queuedMs: input.queuedMs,
      message:
        "Application research stayed PENDING with no worker claim. The research worker is not processing jobs.",
    }),
  );
  await prisma.researchRun.update({
    where: { id: input.runId },
    data: { lastError: RESEARCH_RUN_QUEUED_UNSTARTED_MARKER },
  });
}

export async function getApplicationResearchStatus(input: {
  organizationId: string;
  campaignId: string;
  now?: Date;
}): Promise<ApplicationResearchStatusView> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    select: {
      companyId: true,
      employerDisposition: true,
      company: {
        select: {
          research: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { status: true },
          },
        },
      },
    },
  });

  if (!requirement?.companyId || requirement.employerDisposition !== "IDENTIFIED") {
    return toApplicationResearchStatusView("idle", null);
  }

  const run = await prisma.researchRun.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      workerHeartbeatAt: true,
      lastError: true,
    },
  });

  const now = input.now ?? new Date();
  const queuedStaleMs = getResearchQueuedStaleMs();
  const phase = applicationResearchPhase({
    run: run
      ? {
          status: run.status,
          createdAt: run.createdAt.toISOString(),
          workerHeartbeatAt: run.workerHeartbeatAt?.toISOString() ?? null,
        }
      : null,
    researchStatus: requirement.company?.research[0]?.status ?? null,
    nowMs: now.getTime(),
    queuedStaleMs,
  });

  if (phase === "not_started" && run) {
    await noteQueuedResearchUnstarted({
      runId: run.id,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
      queuedMs: now.getTime() - run.createdAt.getTime(),
      alreadyNoted: run.lastError === RESEARCH_RUN_QUEUED_UNSTARTED_MARKER,
    });
  }

  return toApplicationResearchStatusView(phase, run?.id ?? null);
}

export function applicationResearchRetryLabel(): string {
  return employerIdentityCopy.retry;
}
