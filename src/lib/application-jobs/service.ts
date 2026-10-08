import type { ApplicationJob, ApplicationJobType, Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { assertOrganizationMaySpend } from "@/lib/billing/organization-spend";
import { prisma } from "@/lib/prisma-client";
import { hiringTeamConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import {
  isRetryableProviderMessage,
  isTimeoutMessage,
  type ApplicationJobPayload,
  type ApplicationJobView,
} from "@/lib/application-jobs/types";

/** Heartbeat older than this is stale. A missing heartbeat uses startedAt (claim time) as the same grace. */
export const HEARTBEAT_STALE_MS = 15 * 60 * 1000;

function applicationJobStaleWhere(
  staleBefore: Date,
): PrismaNamespace.ApplicationJobWhereInput {
  return {
    status: "IN_PROGRESS",
    OR: [
      { workerHeartbeatAt: { lt: staleBefore } },
      {
        workerHeartbeatAt: null,
        OR: [{ startedAt: null }, { startedAt: { lt: staleBefore } }],
      },
    ],
  };
}

/** Types that allow one PENDING successor while a same-key job is IN_PROGRESS. */
const SERIALIZED_APPLICATION_JOB_TYPES = new Set<ApplicationJobType>([
  "CONSULTATION",
  "HIRING_TEAM_IDENTIFY",
  "HIRING_TEAM_BUILD",
  "APPLICATION_SUMMARY",
  "NEXT_STEP",
  "RESUME",
  "COVER_LETTER",
  "OUTREACH",
  "CONTACT_PROFILE",
]);

export function applicationJobAllowsFollowUpWhileRunning(
  type: ApplicationJobType,
): boolean {
  return SERIALIZED_APPLICATION_JOB_TYPES.has(type);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function toApplicationJobView(job: ApplicationJob): ApplicationJobView {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    targetId: job.targetId,
    error: job.error,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    canRetry: job.status === "FAILED",
  };
}

export function jobStatusLabel(status: ApplicationJob["status"]): string {
  if (status === "PENDING") return hiringTeamConfig.status.queued;
  if (status === "IN_PROGRESS") return hiringTeamConfig.status.building;
  if (status === "COMPLETED") return hiringTeamConfig.status.built;
  return hiringTeamConfig.status.failed;
}

async function findJobByStatus(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationJobType;
  targetId?: string | null;
  status: "PENDING" | "IN_PROGRESS";
}): Promise<ApplicationJob | null> {
  return prisma.applicationJob.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: input.type,
      targetId: input.targetId ?? null,
      status: input.status,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findActiveJob(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationJobType;
  targetId?: string | null;
}): Promise<ApplicationJob | null> {
  return prisma.applicationJob.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: input.type,
      targetId: input.targetId ?? null,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Merge non-input flags that must survive PENDING reuse. No seeker input fields. */
export function isConsultationDrainOnlyOperation(operation: string): boolean {
  const op = operation.trim();
  return (
    op === "process_reply" ||
    op === "answer" ||
    op === "reply" ||
    op === "edit_answer"
  );
}

/**
 * Ordered unique planning ops from a payload.
 * Includes legacy single `operation` when it is not drain-only.
 * Duplicates of the same op collapse to the first occurrence.
 */
export function consultationPlanningOperationsFromPayload(
  payload: ApplicationJobPayload,
): string[] {
  const ops: string[] = [];
  const append = (raw: string) => {
    const op = raw.trim();
    if (!op || isConsultationDrainOnlyOperation(op)) return;
    if (ops.includes(op)) return;
    ops.push(op);
  };
  if (Array.isArray(payload.operations)) {
    for (const item of payload.operations) {
      if (typeof item === "string") append(item);
    }
  }
  if (typeof payload.operation === "string") append(payload.operation);
  return ops;
}

function withConsultationPlanningOperations(
  payload: ApplicationJobPayload,
  operations: string[],
): ApplicationJobPayload {
  if (operations.length === 0) {
    const next = { ...payload };
    delete next.operations;
    // Keep drain-only operation if that was the only flag; otherwise clear planning op.
    if (next.operation && !isConsultationDrainOnlyOperation(next.operation)) {
      delete next.operation;
    }
    return next;
  }
  return {
    ...payload,
    operations,
    // First queued planning op for progress copy / older readers.
    operation: operations[0],
  };
}

/** Merge non-input flags that must survive PENDING reuse. No seeker input fields. */
export function mergeApplicationJobPayload(
  existing: ApplicationJobPayload,
  incoming: ApplicationJobPayload,
): ApplicationJobPayload {
  const merged: ApplicationJobPayload = { ...existing };
  if (incoming.userId !== undefined) merged.userId = incoming.userId;
  if (incoming.sectionKey !== undefined) merged.sectionKey = incoming.sectionKey;
  if (incoming.contactId !== undefined) merged.contactId = incoming.contactId;
  if (incoming.personaId !== undefined) merged.personaId = incoming.personaId;
  if (incoming.stageId !== undefined) merged.stageId = incoming.stageId;
  if (incoming.assetType !== undefined) merged.assetType = incoming.assetType;
  if (incoming.purpose !== undefined) merged.purpose = incoming.purpose;
  if (incoming.planType !== undefined) merged.planType = incoming.planType;
  if (incoming.gate !== undefined) merged.gate = incoming.gate;
  if (incoming.fingerprint !== undefined) merged.fingerprint = incoming.fingerprint;

  const existingOps = consultationPlanningOperationsFromPayload(existing);
  const incomingOps = consultationPlanningOperationsFromPayload(incoming);
  const operations = [...existingOps];
  for (const op of incomingOps) {
    if (!operations.includes(op)) operations.push(op);
  }

  const incomingDrain =
    typeof incoming.operation === "string" &&
    isConsultationDrainOnlyOperation(incoming.operation)
      ? incoming.operation.trim()
      : null;

  if (operations.length > 0) {
    return withConsultationPlanningOperations(merged, operations);
  }
  if (incomingDrain) {
    return { ...merged, operation: incomingDrain };
  }
  return withConsultationPlanningOperations(merged, []);
}

async function reusePendingJob(
  pending: ApplicationJob,
  payload?: ApplicationJobPayload,
): Promise<ApplicationJob> {
  if (!payload || Object.keys(payload).length === 0) return pending;
  const merged = mergeApplicationJobPayload(readJobPayload(pending.payload), payload);
  return prisma.applicationJob.update({
    where: { id: pending.id },
    data: { payload: merged as Prisma.InputJsonValue },
  });
}

export async function enqueueApplicationJob(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationJobType;
  targetId?: string | null;
  payload?: ApplicationJobPayload;
  initiatedByUserId?: string | null;
  maxAttempts?: number;
}): Promise<ApplicationJobView> {
  await assertOrganizationMaySpend(input.organizationId);

  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!campaign) {
    throw new TenantError("That application was not found.");
  }

  const key = {
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: input.type,
    targetId: input.targetId ?? null,
  };

  if (!applicationJobAllowsFollowUpWhileRunning(input.type)) {
    const existing = await findActiveJob(key);
    if (existing) return toApplicationJobView(existing);
    try {
      const created = await prisma.applicationJob.create({
        data: {
          organizationId: key.organizationId,
          campaignId: key.campaignId,
          type: key.type,
          targetId: key.targetId,
          payload: (input.payload ?? null) as Prisma.InputJsonValue,
          initiatedByUserId: input.initiatedByUserId ?? null,
          maxAttempts: input.maxAttempts ?? hiringTeamConfig.maxBuildAttempts,
          status: "PENDING",
        },
      });
      return toApplicationJobView(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await findActiveJob(key);
      if (raced) return toApplicationJobView(raced);
      throw error;
    }
  }

  const pending = await findJobByStatus({ ...key, status: "PENDING" });
  if (pending) {
    const reused = await reusePendingJob(pending, input.payload);
    return toApplicationJobView(reused);
  }

  try {
    const created = await prisma.applicationJob.create({
      data: {
        organizationId: key.organizationId,
        campaignId: key.campaignId,
        type: key.type,
        targetId: key.targetId,
        payload: (input.payload ?? null) as Prisma.InputJsonValue,
        initiatedByUserId: input.initiatedByUserId ?? null,
        maxAttempts: input.maxAttempts ?? hiringTeamConfig.maxBuildAttempts,
        status: "PENDING",
      },
    });
    return toApplicationJobView(created);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findJobByStatus({ ...key, status: "PENDING" });
    if (raced) {
      const reused = await reusePendingJob(raced, input.payload);
      return toApplicationJobView(reused);
    }
    throw error;
  }
}

export async function retryApplicationJob(input: {
  organizationId: string;
  campaignId: string;
  jobId: string;
}): Promise<ApplicationJobView> {
  const job = await prisma.applicationJob.findFirst({
    where: {
      id: input.jobId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
  });
  if (!job) throw new TenantError("That job was not found.");
  if (job.status !== "FAILED") return toApplicationJobView(job);

  const pending = await findJobByStatus({
    organizationId: job.organizationId,
    campaignId: job.campaignId,
    type: job.type,
    targetId: job.targetId,
    status: "PENDING",
  });
  if (pending) return toApplicationJobView(pending);

  const updated = await prisma.applicationJob.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      error: null,
      attempt: 0,
      workerHeartbeatAt: null,
      startedAt: null,
      completedAt: null,
    },
  });
  return toApplicationJobView(updated);
}

/** The pending or running job for this key: the row same-key enqueue returns. */
export async function activeApplicationJob(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationJobType;
  targetId?: string | null;
}): Promise<ApplicationJobView | null> {
  const job = await findActiveJob(input);
  return job ? toApplicationJobView(job) : null;
}

export async function latestApplicationJob(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationJobType;
  targetId?: string | null;
}): Promise<ApplicationJobView | null> {
  const job = await prisma.applicationJob.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: input.type,
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return job ? toApplicationJobView(job) : null;
}

export async function claimNextApplicationJob(): Promise<string | null> {
  const staleBefore = new Date(Date.now() - HEARTBEAT_STALE_MS);
  return prisma.$transaction(async (tx) => {
    const claimRows = async (consultationOnly: boolean) => {
      if (consultationOnly) {
        return tx.$queryRaw<{ id: string; startedAt: Date | null }[]>`
          SELECT j.id, j."startedAt"
          FROM "ApplicationJob" j
          WHERE j.type = 'CONSULTATION'::"ApplicationJobType"
            AND (
              (
                j.status = 'PENDING'::"ApplicationJobStatus"
                AND NOT EXISTS (
                  SELECT 1 FROM "ApplicationJob" r
                  WHERE r."organizationId" = j."organizationId"
                    AND r."campaignId" = j."campaignId"
                    AND r.type = j.type
                    AND COALESCE(r."targetId", '') = COALESCE(j."targetId", '')
                    AND r.status = 'IN_PROGRESS'::"ApplicationJobStatus"
                )
              )
              OR (
                j.status = 'IN_PROGRESS'::"ApplicationJobStatus"
                AND (
                  (
                    j."workerHeartbeatAt" IS NOT NULL
                    AND j."workerHeartbeatAt" < ${staleBefore}
                  )
                  OR (
                    j."workerHeartbeatAt" IS NULL
                    AND (
                      j."startedAt" IS NULL
                      OR j."startedAt" < ${staleBefore}
                    )
                  )
                )
                AND NOT EXISTS (
                  SELECT 1 FROM "ApplicationJob" p
                  WHERE p."organizationId" = j."organizationId"
                    AND p."campaignId" = j."campaignId"
                    AND p.type = j.type
                    AND COALESCE(p."targetId", '') = COALESCE(j."targetId", '')
                    AND p.status = 'PENDING'::"ApplicationJobStatus"
                )
              )
            )
          ORDER BY j."createdAt" ASC
          FOR UPDATE OF j SKIP LOCKED
          LIMIT 1
        `;
      }
      return tx.$queryRaw<{ id: string; startedAt: Date | null }[]>`
        SELECT j.id, j."startedAt"
        FROM "ApplicationJob" j
        WHERE (
          (
            j.status = 'PENDING'::"ApplicationJobStatus"
            AND NOT EXISTS (
              SELECT 1 FROM "ApplicationJob" r
              WHERE r."organizationId" = j."organizationId"
                AND r."campaignId" = j."campaignId"
                AND r.type = j.type
                AND COALESCE(r."targetId", '') = COALESCE(j."targetId", '')
                AND r.status = 'IN_PROGRESS'::"ApplicationJobStatus"
            )
          )
          OR (
            j.status = 'IN_PROGRESS'::"ApplicationJobStatus"
            AND (
              (
                j."workerHeartbeatAt" IS NOT NULL
                AND j."workerHeartbeatAt" < ${staleBefore}
              )
              OR (
                j."workerHeartbeatAt" IS NULL
                AND (
                  j."startedAt" IS NULL
                  OR j."startedAt" < ${staleBefore}
                )
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM "ApplicationJob" p
              WHERE p."organizationId" = j."organizationId"
                AND p."campaignId" = j."campaignId"
                AND p.type = j.type
                AND COALESCE(p."targetId", '') = COALESCE(j."targetId", '')
                AND p.status = 'PENDING'::"ApplicationJobStatus"
            )
          )
        )
        ORDER BY j."createdAt" ASC
        FOR UPDATE OF j SKIP LOCKED
        LIMIT 1
      `;
    };
    const consultation = await claimRows(true);
    const next = consultation[0] ?? (await claimRows(false))[0];
    if (!next) return null;
    await tx.applicationJob.update({
      where: { id: next.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: next.startedAt ?? new Date(),
        workerHeartbeatAt: new Date(),
      },
    });
    return next.id;
  });
}

export async function abandonStaleApplicationJobs(): Promise<number> {
  const staleBefore = new Date(Date.now() - HEARTBEAT_STALE_MS);
  const staleWhere = applicationJobStaleWhere(staleBefore);
  const stale = await prisma.applicationJob.findMany({
    where: staleWhere,
  });
  let reset = 0;
  for (const job of stale) {
    const pending = await findJobByStatus({
      organizationId: job.organizationId,
      campaignId: job.campaignId,
      type: job.type,
      targetId: job.targetId,
      status: "PENDING",
    });
    const updated = await prisma.applicationJob.updateMany({
      where: { id: job.id, ...staleWhere },
      data: pending
        ? {
            status: "FAILED",
            error:
              "Worker heartbeat went stale. A queued job will continue the work.",
            completedAt: new Date(),
            workerHeartbeatAt: new Date(),
          }
        : {
            status: "PENDING",
            error: "Worker heartbeat went stale. The job was requeued.",
          },
    });
    reset += updated.count;
  }
  return reset;
}

export async function completeApplicationJob(jobId: string): Promise<void> {
  await prisma.applicationJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      error: null,
      completedAt: new Date(),
      workerHeartbeatAt: new Date(),
    },
  });
}

export async function failApplicationJob(input: {
  jobId: string;
  message: string;
}): Promise<void> {
  const job = await prisma.applicationJob.findFirst({
    where: { id: input.jobId },
  });
  if (!job) return;
  const attempt = job.attempt + 1;
  // Timeouts remain explicitly retryable; other temporary provider failures share the path.
  const retryable =
    (isTimeoutMessage(input.message) ||
      isRetryableProviderMessage(input.message)) &&
    attempt < job.maxAttempts;
  if (retryable) {
    const pending = await findJobByStatus({
      organizationId: job.organizationId,
      campaignId: job.campaignId,
      type: job.type,
      targetId: job.targetId,
      status: "PENDING",
    });
    if (pending) {
      await prisma.applicationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: input.message,
          attempt,
          completedAt: new Date(),
          workerHeartbeatAt: new Date(),
        },
      });
      return;
    }
    await prisma.applicationJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        error: input.message,
        attempt,
        workerHeartbeatAt: null,
        startedAt: null,
      },
    });
    return;
  }
  await prisma.applicationJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      error: input.message,
      attempt,
      completedAt: new Date(),
      workerHeartbeatAt: new Date(),
    },
  });
}

export function readJobPayload(value: unknown): ApplicationJobPayload {
  if (!value || typeof value !== "object") return {};
  return value as ApplicationJobPayload;
}
