import { ensureApplicationNextStep } from "@/lib/application/next-step";
import {
  displayedFitBucket,
  formatFitBucketLabel,
} from "@/lib/application/fit";
import { getApplicationTracker } from "@/lib/application/tracker";
import { prisma } from "@/lib/prisma-client";
import {
  interviewConfig,
  isApplicationProgress,
  outreachConfig,
} from "@/lib/product-config";
import type { ApplicationStepView } from "@/lib/application/step-progress";

export type ApplicationStatusTone =
  | "neutral"
  | "current"
  | "done"
  | "attention"
  | "progress";

export type ApplicationOverviewView = {
  campaignId: string;
  campaignName: string;
  jobTitle: string | null;
  companyName: string | null;
  statusLabel: string;
  statusTone: ApplicationStatusTone;
  appliedAt: string | null;
  nextStepText: string;
  nextStepFailed: boolean;
  fitLabel: string | null;
  location: string | null;
  workArrangement: string | null;
  compensation: string | null;
  steps: ApplicationStepView[];
};

export function applicationStatusDisplay(input: {
  appliedAt: string | null;
  applicationProgress: string | null;
}): { label: string; tone: ApplicationStatusTone } {
  if (!input.appliedAt) {
    return { label: outreachConfig.labels.notAppliedStatus, tone: "attention" };
  }
  if (
    input.applicationProgress &&
    isApplicationProgress(input.applicationProgress)
  ) {
    const label = interviewConfig.progress[input.applicationProgress];
    if (input.applicationProgress === "OFFER") {
      return { label, tone: "done" };
    }
    if (
      input.applicationProgress === "REJECTED" ||
      input.applicationProgress === "WITHDRAWN"
    ) {
      return { label, tone: "attention" };
    }
    if (input.applicationProgress === "INTERVIEWING") {
      return { label, tone: "progress" };
    }
    return { label, tone: "done" };
  }
  return { label: outreachConfig.labels.appliedStatus, tone: "done" };
}

export async function getApplicationOverview(input: {
  organizationId: string;
  campaignId: string;
}): Promise<ApplicationOverviewView | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      id: true,
      name: true,
      appliedAt: true,
      applicationProgress: true,
      applicationFit: {
        select: { bucket: true, overrideBucket: true },
      },
      jobRequirement: {
        select: {
          title: true,
          companyName: true,
          location: true,
          workArrangement: true,
          compensationRange: true,
        },
      },
    },
  });
  if (!campaign) return null;
  const tracker = await getApplicationTracker(input);
  if (!tracker) return null;
  const nextStep = await ensureApplicationNextStep(input);
  const status = applicationStatusDisplay({
    appliedAt: campaign.appliedAt?.toISOString() ?? null,
    applicationProgress: campaign.applicationProgress,
  });
  const fit = campaign.applicationFit
    ? displayedFitBucket({
        bucket: campaign.applicationFit.bucket,
        overrideBucket: campaign.applicationFit.overrideBucket,
      })
    : null;
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    jobTitle: campaign.jobRequirement?.title?.trim() || null,
    companyName: campaign.jobRequirement?.companyName?.trim() || null,
    statusLabel: status.label,
    statusTone: status.tone,
    appliedAt: campaign.appliedAt?.toISOString() ?? null,
    nextStepText: nextStep.text ?? "",
    nextStepFailed: nextStep.failed,
    fitLabel: fit ? formatFitBucketLabel(fit) : null,
    location: campaign.jobRequirement?.location?.trim() || null,
    workArrangement: campaign.jobRequirement?.workArrangement?.trim() || null,
    compensation: campaign.jobRequirement?.compensationRange?.trim() || null,
    steps: tracker.steps,
  };
}
