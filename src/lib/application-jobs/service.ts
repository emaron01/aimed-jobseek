import type { ApplicationJob, ApplicationJobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";
import { hiringTeamConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import {
  isTimeoutMessage,
  type ApplicationJobPayload,
  type ApplicationJobView,
} from "@/lib/application-jobs/types";

const HEARTBEAT_STALE_MS = 15 * 60 * 1000;

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

export async function enqueueApplicationJob(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationJobType;
  targetId?: string | null;
  payload?: ApplicationJobPayload;
  initiatedByUserId?: string | null;
  maxAttempts?: number;
}): Promise<ApplicationJobView> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!campaign) {
    throw new TenantError("That application was not found.");
  }
  const existing = await findActiveJob(input);
  if (existing) return toApplicationJobView(existing);
  const created = await prisma.applicationJob.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: input.type,
      targetId: input.targetId ?? null,
      payload: (input.payload ?? null) as Prisma.InputJsonValue,
      initiatedByUserId: input.initiatedByUserId ?? null,
      maxAttempts: input.maxAttempts ?? hiringTeamConfig.maxBuildAttempts,
      status: "PENDING",
    },
  });
  return toApplicationJobView(created);
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
  const claimable = {
    OR: [
      { status: "PENDING" as const },
      {
        status: "IN_PROGRESS" as const,
        OR: [
          { workerHeartbeatAt: null },
          { workerHeartbeatAt: { lt: staleBefore } },
        ],
      },
    ],
  };
  const claimed = await prisma.$transaction(async (tx) => {
    const consultation = await tx.applicationJob.findFirst({
      where: { ...claimable, type: "CONSULTATION" },
      orderBy: { createdAt: "asc" },
    });
    const next =
      consultation ??
      (await tx.applicationJob.findFirst({
        where: claimable,
        orderBy: { createdAt: "asc" },
      }));
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
  return claimed;
}

export async function abandonStaleApplicationJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - HEARTBEAT_STALE_MS);
  await prisma.applicationJob.updateMany({
    where: {
      status: "IN_PROGRESS",
      workerHeartbeatAt: { lt: staleBefore },
    },
    data: {
      status: "PENDING",
      error: "Worker heartbeat went stale. The job was requeued.",
    },
  });
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
  const retryable = isTimeoutMessage(input.message) && attempt < job.maxAttempts;
  await prisma.applicationJob.update({
    where: { id: job.id },
    data: retryable
      ? {
          status: "PENDING",
          error: input.message,
          attempt,
          workerHeartbeatAt: null,
          startedAt: null,
        }
      : {
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
