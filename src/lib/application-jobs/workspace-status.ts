import { prisma } from "@/lib/prisma-client";
import type { ApplicationJob, ApplicationJobType } from "@prisma/client";
import { readJobPayload } from "@/lib/application-jobs/service";
import {
  isObsoleteWorkspaceFailure,
  sanitizeWorkspaceFailure,
  workspaceJobCopy,
  workspaceProgressText,
  workspaceReadyText,
  workspaceSectionId,
  workspaceWaitKind,
} from "@/lib/product-config";

export type WorkspaceJobStatusView = {
  id: string;
  type: ApplicationJobType;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  targetId: string | null;
  error: string | null;
  canRetry: boolean;
  progressText: string;
  waitKind: "stayAndWatch" | "longer";
  sectionId: string;
  readyText: string;
};

export type WorkspaceLiveView = {
  jobs: WorkspaceJobStatusView[];
  signature: string;
};

function toWorkspaceJobStatusView(
  job: ApplicationJob,
  roleNames: Map<string, string>,
): WorkspaceJobStatusView {
  const roleName = job.targetId ? roleNames.get(job.targetId) ?? null : null;
  const operation = readJobPayload(job.payload).operation ?? null;
  const obsolete = isObsoleteWorkspaceFailure(job.error);
  const status = job.status === "FAILED" && obsolete ? "COMPLETED" : job.status;
  return {
    id: job.id,
    type: job.type,
    status,
    targetId: job.targetId,
    error: sanitizeWorkspaceFailure(job.error),
    canRetry: status === "FAILED",
    progressText: workspaceProgressText(job.type, roleName, operation),
    waitKind: workspaceWaitKind(job.type),
    sectionId: workspaceSectionId(job.type),
    readyText: workspaceReadyText(job.type, operation),
  };
}

async function roleNamesForCampaign(input: {
  organizationId: string;
  campaignId: string;
}): Promise<Map<string, string>> {
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { id: true, name: true },
  });
  return new Map(roles.map((role) => [role.id, role.name]));
}

export async function getApplicationWorkspaceLive(input: {
  organizationId: string;
  campaignId: string;
}): Promise<WorkspaceLiveView> {
  const [jobs, names] = await Promise.all([
    prisma.applicationJob.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    roleNamesForCampaign(input),
  ]);
  const views = jobs.map((job) => toWorkspaceJobStatusView(job, names));
  const signature = views
    .map((job) => `${job.id}:${job.status}:${job.error ?? ""}`)
    .join("|");
  return { jobs: views, signature };
}

/** Read specific jobs by id. Does not enqueue work or call a model. */
export async function getWorkspaceJobsByIds(input: {
  organizationId: string;
  campaignId: string;
  jobIds: string[];
}): Promise<WorkspaceJobStatusView[]> {
  const ids = [...new Set(input.jobIds.map((id) => id.trim()).filter(Boolean))].slice(0, 40);
  if (ids.length === 0) return [];
  const [jobs, names] = await Promise.all([
    prisma.applicationJob.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        id: { in: ids },
      },
    }),
    roleNamesForCampaign(input),
  ]);
  return jobs.map((job) => toWorkspaceJobStatusView(job, names));
}

export function activeWorkspaceJobs(
  jobs: WorkspaceJobStatusView[],
): WorkspaceJobStatusView[] {
  return jobs.filter(
    (job) => job.status === "PENDING" || job.status === "IN_PROGRESS",
  );
}

export { workspaceJobCopy };
