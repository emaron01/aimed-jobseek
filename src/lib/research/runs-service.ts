/**
 * Node-safe research run worker logic (no server-only).
 * Next.js entry: `@/lib/research/runs` re-exports behind server-only.
 */

import type { Prisma, ResearchRun, ResearchRunStatus } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";
import {
  getCompaniesNeedingResearchForContactList,
  researchCompany,
  type ResearchPlanItem,
} from "@/lib/tenant/company-research-service";
import { runWithTenantContext } from "@/lib/tenant/request-context";
import { TenantError } from "@/lib/tenant/errors";
import { getResearchWorkerConcurrency } from "@/lib/research/config";
import { isProviderLevelFailure } from "@/lib/research/failure-classification";
import {
  isResearchRunQueuedUnstarted,
  type ResearchRunView,
} from "@/lib/research/run-types";
import { vocab } from "@/lib/product-config";

export type { ResearchRunView } from "@/lib/research/run-types";
export {
  isResearchRunPaused,
  isResearchRunStalled,
  isResearchRunQueuedUnstarted,
  RESEARCH_RUN_STALE_MS,
} from "@/lib/research/run-types";

/** Align with RESEARCH_RUN_STALE_MS — reclaim / UI stalled clock. */
export const HEARTBEAT_STALE_MS = 15 * 60 * 1000;
/** Mark IN_PROGRESS runs FAILED after this long without progress. */
export const RUN_ABANDON_MS = 30 * 60 * 1000;

export const researchWorkerShutdown = {
  requested: false,
};

const TERMINAL_STATUSES: ResearchRunStatus[] = [
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
];

function parseStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toResearchRunView(run: ResearchRun): ResearchRunView {
  return {
    id: run.id,
    contactListId: run.contactListId,
    campaignId: run.campaignId,
    scoringRunId: run.scoringRunId,
    status: run.status,
    forceRefresh: run.forceRefresh,
    failuresOnly: run.failuresOnly,
    retryOfRunId: run.retryOfRunId,
    totalCompanies: run.totalCompanies,
    completedCount: run.completedCount,
    failedCount: run.failedCount,
    skippedFreshCount: run.skippedFreshCount,
    quotaBlockedCount: run.quotaBlockedCount,
    currentCompanyName: run.currentCompanyName,
    lastError: run.lastError,
    failedCompanyIds: parseStringArray(run.failedCompanyIds),
    quotaBlockedCompanyNames: parseStringArray(run.quotaBlockedCompanyNames),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    pausedAt: run.pausedAt?.toISOString() ?? null,
    workerHeartbeatAt: run.workerHeartbeatAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

function isTerminalStatus(status: ResearchRunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function lastActivityAt(run: Pick<
  ResearchRun,
  "workerHeartbeatAt" | "startedAt" | "createdAt"
>): Date {
  return run.workerHeartbeatAt ?? run.startedAt ?? run.createdAt;
}

function isAbandoned(run: ResearchRun, now = new Date()): boolean {
  if (run.status !== "IN_PROGRESS") return false;
  const last = lastActivityAt(run);
  return now.getTime() - last.getTime() > RUN_ABANDON_MS;
}

function finalizeStatus(input: {
  total: number;
  completed: number;
  failed: number;
  skippedFresh: number;
  quotaBlocked: number;
}): ResearchRunStatus {
  const { total, completed, failed, skippedFresh, quotaBlocked } = input;
  if (total === 0) return "COMPLETED";
  if (failed === total) return "FAILED";
  if (completed > 0 || skippedFresh > 0) {
    if (failed > 0 || quotaBlocked > 0) return "PARTIAL";
    return "COMPLETED";
  }
  if (quotaBlocked > 0) return "PARTIAL";
  if (failed > 0) return "FAILED";
  return "COMPLETED";
}

async function findActiveRunForList(
  contactListId: string,
  organizationId: string,
): Promise<ResearchRun | null> {
  return prisma.researchRun.findFirst({
    where: {
      organizationId,
      contactListId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findActiveRunForCampaign(
  campaignId: string,
  organizationId: string,
): Promise<ResearchRun | null> {
  return prisma.researchRun.findFirst({
    where: {
      organizationId,
      campaignId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function enqueueApplicationResearch(input: {
  organizationId: string;
  campaignId: string;
  companyId: string;
  forceRefresh?: boolean;
  initiatedByUserId?: string | null;
}): Promise<ResearchRunView> {
  const existing = await findActiveRunForCampaign(
    input.campaignId,
    input.organizationId,
  );
  if (existing) {
    if (isHeartbeatStale(existing) || isQueuedUnstartedRun(existing)) {
      await failStaleResearchRun(
        existing.id,
        new Date(),
        "Replaced by a new research request.",
      );
    } else {
      return toResearchRunView(existing);
    }
  }

  const company = await prisma.company.findFirst({
    where: { id: input.companyId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new TenantError("That employer was not found.");
  }

  try {
    const run = await prisma.researchRun.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        contactListId: null,
        initiatedByUserId: input.initiatedByUserId ?? null,
        forceRefresh: Boolean(input.forceRefresh),
        totalCompanies: 1,
        status: "PENDING",
        currentCompanyId: company.id,
        currentCompanyName: company.name,
      },
    });
    return toResearchRunView(run);
  } catch (error) {
    if (
      error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const active = await findActiveRunForCampaign(
        input.campaignId,
        input.organizationId,
      );
      if (active) return toResearchRunView(active);
    }
    throw error;
  }
}

function isQueuedUnstartedRun(
  run: Pick<ResearchRun, "status" | "createdAt" | "workerHeartbeatAt">,
  now = new Date(),
): boolean {
  return isResearchRunQueuedUnstarted(
    {
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      workerHeartbeatAt: run.workerHeartbeatAt?.toISOString() ?? null,
    },
    now.getTime(),
  );
}

function buildTargetItems(
  plan: Awaited<ReturnType<typeof getCompaniesNeedingResearchForContactList>>,
  options: {
    forceRefresh: boolean;
    failuresOnly: boolean;
    failureTargetIds: string[];
  },
): ResearchPlanItem[] {
  let items = options.forceRefresh
    ? plan.items
    : plan.items.filter(
        (item) =>
          item.reason !== "fresh" && item.reason !== "no_usable_fields",
      );

  if (options.failuresOnly) {
    const allowed = new Set(options.failureTargetIds);
    items = items.filter((item) => allowed.has(item.companyId));
  }

  return items;
}

export async function getResearchRunForOrganization(
  runId: string,
  organizationId: string,
): Promise<ResearchRunView | null> {
  const run = await prisma.researchRun.findFirst({
    where: { id: runId, organizationId },
  });
  return run ? toResearchRunView(run) : null;
}

export async function getActiveResearchRunForContactList(
  contactListId: string,
  organizationId: string,
): Promise<ResearchRunView | null> {
  const run = await findActiveRunForList(contactListId, organizationId);
  return run ? toResearchRunView(run) : null;
}

export async function getLatestResearchRunForContactList(
  contactListId: string,
  organizationId: string,
): Promise<ResearchRunView | null> {
  const run = await prisma.researchRun.findFirst({
    where: { organizationId, contactListId },
    orderBy: { createdAt: "desc" },
  });
  return run ? toResearchRunView(run) : null;
}

export type CreateResearchRunInput = {
  organizationId: string;
  contactListId: string;
  initiatedByUserId: string;
  forceRefresh?: boolean;
  scoringRunId?: string;
  failuresOnly?: boolean;
  retryOfRunId?: string;
};

export type CreateResearchRunResult =
  | { ok: true; run: ResearchRunView }
  | { ok: false; code: "ACTIVE_RUN"; activeRunId: string; message: string }
  | { ok: false; code: "NOTHING_TO_DO"; message: string }
  | { ok: false; code: "INVALID_RETRY"; message: string };

function isHeartbeatStale(
  run: Pick<ResearchRun, "workerHeartbeatAt" | "startedAt" | "createdAt">,
  now = new Date(),
): boolean {
  const last = lastActivityAt(run);
  return now.getTime() - last.getTime() > HEARTBEAT_STALE_MS;
}

async function failStaleResearchRun(
  runId: string,
  now = new Date(),
  reason = "Research stopped — no worker progress.",
): Promise<void> {
  await prisma.researchRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      lastError: reason,
      completedAt: now,
      currentCompanyId: null,
      currentCompanyName: null,
      workerHeartbeatAt: now,
      pausedAt: null,
    },
  });
}

export async function createResearchRun(
  input: CreateResearchRunInput,
): Promise<CreateResearchRunResult> {
  const existing = await findActiveRunForList(
    input.contactListId,
    input.organizationId,
  );
  if (existing) {
    if (isHeartbeatStale(existing)) {
      await failStaleResearchRun(existing.id);
    } else {
      return {
        ok: false,
        code: "ACTIVE_RUN",
        activeRunId: existing.id,
        message: `A research run is already in progress for this ${vocab.list.singular}.`,
      };
    }
  }

  let failureTargetIds: string[] = [];
  if (input.failuresOnly) {
    if (!input.retryOfRunId) {
      return {
        ok: false,
        code: "INVALID_RETRY",
        message: "Retry requires a prior run id.",
      };
    }
    let parent = await prisma.researchRun.findFirst({
      where: {
        id: input.retryOfRunId,
        organizationId: input.organizationId,
        contactListId: input.contactListId,
      },
    });
    if (
      parent &&
      parent.status === "IN_PROGRESS" &&
      isHeartbeatStale(parent)
    ) {
      await failStaleResearchRun(parent.id);
      parent = await prisma.researchRun.findFirst({
        where: {
          id: input.retryOfRunId,
          organizationId: input.organizationId,
          contactListId: input.contactListId,
        },
      });
    }
    if (!parent || !isTerminalStatus(parent.status)) {
      return {
        ok: false,
        code: "INVALID_RETRY",
        message: "Retry is only available after the prior run has finished.",
      };
    }
    failureTargetIds = [
      ...new Set([
        ...parseStringArray(parent.failedCompanyIds),
        ...parseStringArray(parent.quotaBlockedCompanyIds),
      ]),
    ];
    if (failureTargetIds.length === 0) {
      return {
        ok: false,
        code: "NOTHING_TO_DO",
        message: "No failed or quota-blocked companies to retry.",
      };
    }
  }

  const plan = await runWithTenantContext(
    {
      organizationId: input.organizationId,
      userId: input.initiatedByUserId,
    },
    () => getCompaniesNeedingResearchForContactList(input.contactListId),
  );

  const targets = buildTargetItems(plan, {
    forceRefresh: Boolean(input.forceRefresh),
    failuresOnly: Boolean(input.failuresOnly),
    failureTargetIds,
  });

  if (!input.forceRefresh && !input.failuresOnly && plan.needingResearch === 0) {
    return {
      ok: false,
      code: "NOTHING_TO_DO",
      message: `All ${plan.uniqueCompanies} unique companies already have fresh research.`,
    };
  }

  if (targets.length === 0) {
    return {
      ok: false,
      code: "NOTHING_TO_DO",
      message: "No companies match this research request.",
    };
  }

  try {
    const run = await prisma.researchRun.create({
      data: {
        organizationId: input.organizationId,
        contactListId: input.contactListId,
        scoringRunId: input.scoringRunId ?? null,
        initiatedByUserId: input.initiatedByUserId,
        forceRefresh: Boolean(input.forceRefresh),
        failuresOnly: Boolean(input.failuresOnly),
        retryOfRunId: input.retryOfRunId ?? null,
        totalCompanies: targets.length,
        status: "PENDING",
        ...(input.failuresOnly
          ? {
              failedCompanyIds: failureTargetIds,
              quotaBlockedCompanyIds: [],
            }
          : {}),
      },
    });
    return { ok: true, run: toResearchRunView(run) };
  } catch (error) {
    if (
      error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const active = await findActiveRunForList(
        input.contactListId,
        input.organizationId,
      );
      return {
        ok: false,
        code: "ACTIVE_RUN",
        activeRunId: active?.id ?? "",
        message: `A research run is already in progress for this ${vocab.list.singular}.`,
      };
    }
    throw error;
  }
}

export async function abandonStaleResearchRuns(now = new Date()): Promise<number> {
  const inProgress = await prisma.researchRun.findMany({
    where: { status: "IN_PROGRESS" },
    select: {
      id: true,
      workerHeartbeatAt: true,
      startedAt: true,
      createdAt: true,
    },
  });

  let abandoned = 0;
  for (const run of inProgress) {
    if (!isAbandoned(run as ResearchRun, now)) continue;
    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        lastError: "Run abandoned after 30 minutes without progress.",
        completedAt: now,
        currentCompanyId: null,
        currentCompanyName: null,
      },
    });
    abandoned += 1;
  }
  return abandoned;
}

export async function claimNextResearchRun(now = new Date()): Promise<string | null> {
  const staleCutoff = new Date(now.getTime() - HEARTBEAT_STALE_MS);

  const staleInProgress = {
    status: "IN_PROGRESS" as const,
    pausedAt: null,
    OR: [
      { workerHeartbeatAt: { lt: staleCutoff } },
      { workerHeartbeatAt: null, startedAt: { lt: staleCutoff } },
      { workerHeartbeatAt: null, startedAt: null, createdAt: { lt: staleCutoff } },
    ],
  };

  const candidate = await prisma.researchRun.findFirst({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "IN_PROGRESS", pausedAt: { not: null } },
        staleInProgress,
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!candidate) return null;

  const claimed = await prisma.researchRun.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: "PENDING" },
        { status: "IN_PROGRESS", pausedAt: { not: null } },
        staleInProgress,
      ],
    },
    data: {
      status: "IN_PROGRESS",
      startedAt: candidate.startedAt ?? now,
      workerHeartbeatAt: now,
      pausedAt: null,
      lastError: null,
    },
  });

  if (claimed.count === 0) return null;
  console.log(
    `[research-worker] claimed run ${candidate.id} (` +
      `${candidate.campaignId ? `application ${candidate.campaignId}` : `list ${candidate.contactListId}`}, ` +
      `status was ${candidate.status})`,
  );
  return candidate.id;
}

async function mapPoolWithShutdown<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (!researchWorkerShutdown.requested && !shouldStop?.()) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current]!, current);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

function createUpdateLock() {
  let chain = Promise.resolve();
  return function withUpdateLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

function isResearchCompanyFailure(
  result: Awaited<ReturnType<typeof researchCompany>>,
): boolean {
  return Boolean(
    result.researchFailed ||
      result.refreshFailed ||
      result.research?.status === "FAILED",
  );
}

async function failApplicationResearchRun(
  runId: string,
  lastError: string,
): Promise<void> {
  await prisma.researchRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      lastError,
      failedCount: 1,
      completedAt: new Date(),
      currentCompanyId: null,
      currentCompanyName: null,
      workerHeartbeatAt: new Date(),
      pausedAt: null,
    },
  });
}

async function processApplicationResearchRun(run: ResearchRun): Promise<void> {
  if (!run.campaignId || !run.currentCompanyId) {
    await failApplicationResearchRun(
      run.id,
      "Application research run is missing campaign or company.",
    );
    return;
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: run.campaignId, organizationId: run.organizationId },
    select: { icpId: true },
  });
  if (!campaign) {
    await failApplicationResearchRun(
      run.id,
      `This ${vocab.campaign.singular} was not found.`,
    );
    return;
  }

  console.log(
    `[research-run ${run.id}] processing application ${run.campaignId} ` +
      `(org ${run.organizationId}, company ${run.currentCompanyId}, ` +
      `forceRefresh=${run.forceRefresh})`,
  );

  try {
    await runWithTenantContext(
      {
        organizationId: run.organizationId,
        userId: run.initiatedByUserId,
      },
      async () => {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: { workerHeartbeatAt: new Date() },
        });

        const result = await researchCompany(run.currentCompanyId!, {
          force: run.forceRefresh,
        });

        const { finishApplicationAfterResearch } = await import(
          "@/lib/application/research-finish"
        );
        await finishApplicationAfterResearch({
          organizationId: run.organizationId,
          campaignId: run.campaignId!,
          icpId: campaign.icpId,
          companyId: run.currentCompanyId!,
          result,
        });

        const failed = isResearchCompanyFailure(result);
        const skippedFresh = Boolean(result.skipped && result.reason === "fresh");
        const lastError = failed
          ? result.failure?.userMessage ??
            result.reason ??
            "Employer research failed."
          : null;

        await prisma.researchRun.update({
          where: { id: run.id },
          data: {
            status: failed ? "FAILED" : "COMPLETED",
            completedCount: failed ? 0 : 1,
            failedCount: failed ? 1 : 0,
            skippedFreshCount: skippedFresh ? 1 : 0,
            lastError,
            completedAt: new Date(),
            currentCompanyId: null,
            currentCompanyName: null,
            workerHeartbeatAt: new Date(),
            pausedAt: null,
            processedCompanyIds: [run.currentCompanyId!],
          },
        });

        console.log(
          `[research-run ${run.id}] application research ` +
            `${failed ? "FAILED" : "COMPLETED"}` +
            (lastError ? ` lastError=${lastError}` : ""),
        );
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Research worker crashed.";
    console.error(`[research-run ${run.id}] application research crashed`, message);
    await failApplicationResearchRun(run.id, message);
    throw error;
  }
}

export async function processResearchRun(runId: string): Promise<void> {
  const run = await prisma.researchRun.findUnique({ where: { id: runId } });
  if (!run) {
    console.warn(`[research-run ${runId}] skipped: run not found`);
    return;
  }
  if (run.status !== "IN_PROGRESS") {
    console.warn(
      `[research-run ${runId}] skipped: status is ${run.status}, expected IN_PROGRESS`,
    );
    return;
  }

  if (run.campaignId) {
    await processApplicationResearchRun(run);
    return;
  }

  const contactListId = run.contactListId;
  if (!contactListId) {
    console.error(
      `[research-run ${runId}] skipped: run has neither campaignId nor contactListId`,
    );
    await prisma.researchRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        lastError: "Research run is missing a list or application scope.",
        completedAt: new Date(),
        currentCompanyId: null,
        currentCompanyName: null,
        workerHeartbeatAt: new Date(),
        pausedAt: null,
      },
    });
    return;
  }

  console.log(
    `[research-run ${runId}] processing list ${contactListId} ` +
      `(org ${run.organizationId}, totalCompanies ${run.totalCompanies}, ` +
      `forceRefresh=${run.forceRefresh})`,
  );

  const failureTargetIds = run.failuresOnly
    ? [...new Set(parseStringArray(run.failedCompanyIds))]
    : [];

  try {
    await runWithTenantContext(
      {
        organizationId: run.organizationId,
        userId: run.initiatedByUserId,
      },
      async () => {
      const plan = await getCompaniesNeedingResearchForContactList(contactListId);
      const targets = buildTargetItems(plan, {
        forceRefresh: run.forceRefresh,
        failuresOnly: run.failuresOnly,
        failureTargetIds,
      });

      if (targets.length !== run.totalCompanies) {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: { totalCompanies: targets.length },
        });
      }

      const { companyHasActiveResearchSlot } = await import(
        "@/lib/usage/active-companies-service"
      );
      const { getActiveResearchedCompanyUsage } = await import(
        "@/lib/usage/quota-service"
      );

      const refreshTargets: ResearchPlanItem[] = [];
      const newSlotTargets: ResearchPlanItem[] = [];
      for (const item of targets) {
        const hasSlot = await companyHasActiveResearchSlot(
          run.organizationId,
          item.companyId,
        );
        if (hasSlot) refreshTargets.push(item);
        else newSlotTargets.push(item);
      }

      let remainingSlots = Number.POSITIVE_INFINITY;
      if (run.initiatedByUserId) {
        const usage = await getActiveResearchedCompanyUsage({
          organizationId: run.organizationId,
          userId: run.initiatedByUserId,
        });
        remainingSlots = usage.remaining;
      }

      const allowedNew = newSlotTargets.slice(0, Math.max(0, remainingSlots));
      const blockedNew = newSlotTargets.slice(Math.max(0, remainingSlots));

      let completedCount = run.completedCount;
      let failedCount = run.failedCount;
      let skippedFreshCount = run.skippedFreshCount;
      let quotaBlockedCount = run.quotaBlockedCount;
      const processedCompanyIds = new Set(
        parseStringArray(run.processedCompanyIds),
      );
      const failedCompanyIds = new Set(
        run.failuresOnly ? [] : parseStringArray(run.failedCompanyIds),
      );
      const quotaBlockedCompanyIds = new Set(
        parseStringArray(run.quotaBlockedCompanyIds),
      );
      const quotaBlockedCompanyNames = new Set(
        parseStringArray(run.quotaBlockedCompanyNames),
      );

      const workQueue = [...refreshTargets, ...allowedNew].filter(
        (item) => !processedCompanyIds.has(item.companyId),
      );

      console.log(
        `[research-run ${run.id}] plan: ${plan.uniqueCompanies} companies on list, ` +
          `${plan.needingResearch} needing research, ${targets.length} run targets, ` +
          `${workQueue.length} queued (${refreshTargets.length} refresh, ` +
          `${allowedNew.length} new slots, ${blockedNew.length} quota-blocked)`,
      );

      const pendingBlockedNew = blockedNew.filter(
        (item) => !processedCompanyIds.has(item.companyId),
      );

      for (const item of pendingBlockedNew) {
        if (!quotaBlockedCompanyIds.has(item.companyId)) {
          quotaBlockedCount += 1;
        }
        quotaBlockedCompanyIds.add(item.companyId);
        quotaBlockedCompanyNames.add(item.companyName);
        processedCompanyIds.add(item.companyId);
      }

      if (pendingBlockedNew.length > 0) {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: {
            quotaBlockedCount,
            quotaBlockedCompanyIds: [...quotaBlockedCompanyIds],
            quotaBlockedCompanyNames: [...quotaBlockedCompanyNames],
            processedCompanyIds: [...processedCompanyIds],
            workerHeartbeatAt: new Date(),
          },
        });
      }

      if (workQueue.length === 0) {
        console.warn(
          `[research-run ${run.id}] no companies queued — nothing to research this pass`,
        );
      }

      const runAbort = { requested: false };
      const withUpdateLock = createUpdateLock();
      let runLastError: string | null = run.lastError;

      function queueUnprocessedForRetry(exceptCompanyId?: string): void {
        for (const pending of workQueue) {
          if (pending.companyId === exceptCompanyId) continue;
          if (processedCompanyIds.has(pending.companyId)) continue;
          if (failedCompanyIds.has(pending.companyId)) continue;
          failedCompanyIds.add(pending.companyId);
          failedCount += 1;
        }
      }

      await mapPoolWithShutdown(
        workQueue,
        getResearchWorkerConcurrency(),
        async (item) => {
          if (researchWorkerShutdown.requested || runAbort.requested) return;

          await prisma.researchRun.update({
            where: { id: run.id },
            data: {
              currentCompanyId: item.companyId,
              currentCompanyName: item.companyName,
              workerHeartbeatAt: new Date(),
              pausedAt: null,
            },
          });

          console.log(
            `[research-run ${run.id}] started ${item.companyName} (${item.companyId})`,
          );

          const result = await researchCompany(item.companyId, {
            force: run.forceRefresh,
          });

          if (researchWorkerShutdown.requested || runAbort.requested) return;

          console.log(
            `[research-run ${run.id}] finished ${item.companyName} (${item.companyId}): ` +
              `skipped=${result.skipped} quotaBlocked=${Boolean(result.quotaBlocked)} ` +
              `researchFailed=${Boolean(result.researchFailed)} ` +
              `status=${result.research?.status ?? "none"}` +
              (result.failure?.kind ? ` failure=${result.failure.kind}` : "") +
              (result.reason ? ` reason=${result.reason}` : ""),
          );

          await withUpdateLock(async () => {
            if (processedCompanyIds.has(item.companyId)) return;

            if (result.verificationRequired) {
              failedCount += 1;
              failedCompanyIds.add(item.companyId);
              runLastError =
                result.reason ??
                "Verify your email address to continue with this action.";
            } else if (result.quotaBlocked) {
              quotaBlockedCount += 1;
              quotaBlockedCompanyIds.add(item.companyId);
              quotaBlockedCompanyNames.add(item.companyName);
            } else if (result.skipped) {
              skippedFreshCount += 1;
            } else if (isResearchCompanyFailure(result)) {
              failedCount += 1;
              failedCompanyIds.add(item.companyId);
              runLastError =
                result.failure?.userMessage ??
                result.reason ??
                "Research failed.";

              if (isProviderLevelFailure(result.failure)) {
                runAbort.requested = true;
                queueUnprocessedForRetry(item.companyId);
                console.warn(
                  `[research-run ${run.id}] provider-level failure — pausing batch: ` +
                    `${runLastError}`,
                );
              }
            } else if (
              result.research?.status === "COMPLETED" ||
              result.research?.status === "PARTIAL"
            ) {
              completedCount += 1;
            }

            processedCompanyIds.add(item.companyId);

            await prisma.researchRun.update({
              where: { id: run.id },
              data: {
                completedCount,
                failedCount,
                skippedFreshCount,
                quotaBlockedCount,
                failedCompanyIds: [...failedCompanyIds],
                processedCompanyIds: [...processedCompanyIds],
                quotaBlockedCompanyIds: [...quotaBlockedCompanyIds],
                quotaBlockedCompanyNames: [...quotaBlockedCompanyNames],
                workerHeartbeatAt: new Date(),
                lastError: runLastError,
              },
            });
          });
        },
        () => runAbort.requested,
      );

      if (researchWorkerShutdown.requested) {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: {
            currentCompanyId: null,
            currentCompanyName: null,
            pausedAt: new Date(),
            workerHeartbeatAt: new Date(),
          },
        });
        return;
      }

      const total = targets.length;
      const status = finalizeStatus({
        total,
        completed: completedCount,
        failed: failedCount,
        skippedFresh: skippedFreshCount,
        quotaBlocked: quotaBlockedCount,
      });

      await prisma.researchRun.update({
        where: { id: run.id },
        data: {
          status,
          completedAt: new Date(),
          currentCompanyId: null,
          currentCompanyName: null,
          workerHeartbeatAt: new Date(),
          totalCompanies: total,
          lastError: runLastError,
        },
      });

      console.log(
        `[research-run ${run.id}] completed with status ${status}: ` +
          `${completedCount} completed, ${failedCount} failed, ` +
          `${skippedFreshCount} skipped, ${quotaBlockedCount} quota-blocked` +
          (runLastError ? ` lastError=${runLastError}` : ""),
      );
    },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Research worker crashed.";
    console.error(`[research-run ${runId}] crashed — marking FAILED`, message);
    await prisma.researchRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        lastError: message,
        completedAt: new Date(),
        currentCompanyId: null,
        currentCompanyName: null,
        workerHeartbeatAt: new Date(),
        pausedAt: null,
      },
    });
    throw error;
  }
}

export async function requireResearchRunInOrganization(
  runId: string,
  organizationId: string,
): Promise<ResearchRun> {
  const run = await prisma.researchRun.findFirst({
    where: { id: runId, organizationId },
  });
  if (!run) {
    throw new TenantError("Research run not found in the active organization.");
  }
  return run;
}

export function canRetryResearchRun(run: ResearchRun): boolean {
  if (!isTerminalStatus(run.status)) return false;
  const failed = parseStringArray(run.failedCompanyIds);
  const quotaBlocked = parseStringArray(run.quotaBlockedCompanyIds);
  return (
    failed.length > 0 ||
    quotaBlocked.length > 0 ||
    run.failedCount > 0 ||
    run.quotaBlockedCount > 0
  );
}
