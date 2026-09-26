import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { getApplicationResearchStatus } from "@/lib/application/research-status";
import { readApplicationFitStale } from "@/lib/application/service";
import { prisma } from "@/lib/prisma-client";
import {
  applicationStepFromPathname,
  type ApplicationStepKey,
} from "@/lib/product-config/application-steps";
import {
  buildApplicationStepViews,
  initialWorkspaceSeen,
  parseWorkspaceSeenJson,
  type ApplicationStepFactInput,
  type ApplicationStepView,
} from "@/lib/application/step-progress";

export type ApplicationTrackerView = {
  campaignId: string;
  campaignName: string;
  currentStep: ApplicationStepKey | "overview" | null;
  steps: ApplicationStepView[];
};

export async function loadApplicationStepFacts(input: {
  organizationId: string;
  campaignId: string;
}): Promise<ApplicationStepFactInput | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      appliedAt: true,
      icp: {
        select: { updatedAt: true, interpretationPromptVersion: true },
      },
      applicationFit: {
        select: {
          stale: true,
          staleReason: true,
          computedAt: true,
          icpUpdatedAt: true,
          companyResearchUpdatedAt: true,
          interpretationPromptVersion: true,
        },
      },
      hiringTeamRoles: {
        where: { archivedAt: null },
        select: { id: true },
      },
      applicationAssets: {
        where: { status: "APPROVED", type: { in: ["RESUME", "COVER_LETTER"] } },
        select: { type: true },
      },
      contacts: { select: { id: true } },
      interviewStages: { select: { id: true } },
      applicationSummary: { select: { status: true } },
      jobRequirement: {
        select: {
          title: true,
          company: {
            select: {
              research: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: { updatedAt: true },
              },
            },
          },
        },
      },
    },
  });
  if (!campaign) return null;
  const research = await getApplicationResearchStatus({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  const researchRow = campaign.jobRequirement?.company?.research[0] ?? null;
  const fit = campaign.applicationFit;
  const stale = fit
    ? readApplicationFitStale({
        stale: fit.stale,
        staleReason: fit.staleReason,
        computedAt: fit.computedAt,
        icpUpdatedAt: fit.icpUpdatedAt,
        companyResearchUpdatedAt: fit.companyResearchUpdatedAt,
        interpretationPromptVersion: fit.interpretationPromptVersion,
        currentIcpUpdatedAt: campaign.icp.updatedAt,
        currentResearchUpdatedAt: researchRow?.updatedAt ?? null,
        currentPromptVersion: campaign.icp.interpretationPromptVersion,
      })
    : null;
  return {
    researchDone: research.phase === "done",
    researchFailed: research.phase === "failed",
    researchInProgress:
      research.phase === "queued" || research.phase === "researching",
    hasJobTitle: Boolean(campaign.jobRequirement?.title?.trim()),
    fitNeedsRescore: Boolean(stale?.stale),
    hiringTeamRoleCount: campaign.hiringTeamRoles.length,
    hasApprovedResume: campaign.applicationAssets.some((asset) => asset.type === "RESUME"),
    hasApprovedCoverLetter: campaign.applicationAssets.some(
      (asset) => asset.type === "COVER_LETTER",
    ),
    contactCount: campaign.contacts.length,
    interviewStageCount: campaign.interviewStages.length,
    cheatSheetReady: campaign.applicationSummary?.status === "READY",
    appliedAt: campaign.appliedAt?.toISOString() ?? null,
  };
}

export async function getApplicationTracker(input: {
  organizationId: string;
  campaignId: string;
  pathname?: string | null;
}): Promise<ApplicationTrackerView | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true, name: true, workspaceSeenJson: true },
  });
  if (!campaign) return null;
  const facts = await loadApplicationStepFacts(input);
  if (!facts) return null;
  const live = await getApplicationWorkspaceLive({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  let seen = parseWorkspaceSeenJson(campaign.workspaceSeenJson);
  if (campaign.workspaceSeenJson == null) {
    seen = initialWorkspaceSeen(facts, live.jobs);
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { workspaceSeenJson: seen },
    });
  }
  const currentStep = input.pathname
    ? applicationStepFromPathname(input.pathname)
    : null;
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    currentStep,
    steps: buildApplicationStepViews({
      campaignId: campaign.id,
      currentStep,
      facts,
      jobs: live.jobs,
      seen,
    }),
  };
}

export async function markApplicationStepViewed(input: {
  organizationId: string;
  campaignId: string;
  stepKey: ApplicationStepKey;
}): Promise<void> {
  const tracker = await getApplicationTracker(input);
  if (!tracker) {
    throw new Error("Application was not found.");
  }
  const step = tracker.steps.find((item) => item.key === input.stepKey);
  if (!step?.resultKey) return;
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { workspaceSeenJson: true },
  });
  if (!campaign) throw new Error("Application was not found.");
  const seen = parseWorkspaceSeenJson(campaign.workspaceSeenJson);
  if (seen[input.stepKey] === step.resultKey) return;
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: { workspaceSeenJson: { ...seen, [input.stepKey]: step.resultKey } },
  });
}
