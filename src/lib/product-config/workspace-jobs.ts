/**
 * Application workspace wait groups and progress copy.
 * Which work is stay-and-watch versus longer background work lives here.
 */
import type { ApplicationJobType } from "@prisma/client";
import { consultationConfig } from "./consultation";
import { applicationResearchCopy, applicationWorkspaceCopy, vocab } from "./vocabulary";
import { applicationAssetConfig } from "./application-assets";
import { applicationSummaryConfig } from "./application-summary";

export type WorkspaceWaitKind = "stayAndWatch" | "longer";

export const WORKSPACE_JOB_TYPES = [
  "CONSULTATION",
  "HIRING_TEAM_IDENTIFY",
  "HIRING_TEAM_BUILD",
  "CONTACT_PROFILE",
  "RESUME",
  "COVER_LETTER",
  "OUTREACH",
  "INTERVIEW_GUIDE",
  "APPLICATION_SUMMARY",
  "NEXT_STEP",
] as const satisfies readonly ApplicationJobType[];

const STAY_AND_WATCH = new Set<ApplicationJobType>([
  "CONSULTATION",
  "HIRING_TEAM_BUILD",
  "CONTACT_PROFILE",
  "OUTREACH",
]);

export function workspaceWaitKind(
  type: ApplicationJobType | "RESEARCH",
): WorkspaceWaitKind {
  if (type === "RESEARCH") return "longer";
  return STAY_AND_WATCH.has(type) ? "stayAndWatch" : "longer";
}

export function workspaceSectionId(
  type: ApplicationJobType | "RESEARCH",
): string {
  switch (type) {
    case "CONSULTATION":
      return "consultation";
    case "HIRING_TEAM_IDENTIFY":
    case "HIRING_TEAM_BUILD":
    case "CONTACT_PROFILE":
      return "hiring-team";
    case "RESUME":
    case "COVER_LETTER":
      return "assets";
    case "OUTREACH":
      return "outreach";
    case "INTERVIEW_GUIDE":
      return "interviews";
    case "APPLICATION_SUMMARY":
      return "application-summary";
    case "NEXT_STEP":
      return "application-next-step";
    case "RESEARCH":
      return "company";
    default:
      return "application-workspace";
  }
}

export function workspaceProgressText(
  type: ApplicationJobType | "RESEARCH",
  roleName?: string | null,
  operation?: string | null,
): string {
  switch (type) {
    case "CONSULTATION":
      return `${consultationConfig.displayName} is reading your ${vocab.product.singular} and the job…`;
    case "HIRING_TEAM_IDENTIFY":
      return `Identifying the ${vocab.persona.nav}…`;
    case "HIRING_TEAM_BUILD":
      return roleName
        ? `Building the ${roleName} ${vocab.persona.singular}…`
        : `Building this ${vocab.persona.singular}…`;
    case "CONTACT_PROFILE":
      return "Building this person's individual profile…";
    case "RESUME":
      return operation === "plan"
        ? applicationAssetConfig.labels.writingPlan
        : `Writing the ${applicationAssetConfig.labels.resume}…`;
    case "COVER_LETTER":
      return operation === "plan"
        ? applicationAssetConfig.labels.writingPlan
        : `Writing the ${applicationAssetConfig.labels.coverLetter}…`;
    case "OUTREACH":
      return "Writing this message…";
    case "INTERVIEW_GUIDE":
      return "Writing the interview guide…";
    case "APPLICATION_SUMMARY":
      return `Writing the ${applicationSummaryConfig.title}…`;
    case "NEXT_STEP":
      return `${consultationConfig.displayName} is writing the next step…`;
    case "RESEARCH":
      return applicationResearchCopy.researchingDetail;
    default:
      return "Working…";
  }
}

export function workspaceReadyText(
  type: ApplicationJobType | "RESEARCH",
  operation?: string | null,
): string {
  switch (type) {
    case "CONSULTATION":
      return `${consultationConfig.displayName} is ready.`;
    case "HIRING_TEAM_IDENTIFY":
      return `${vocab.persona.nav} roles are ready.`;
    case "HIRING_TEAM_BUILD":
      return `The ${vocab.persona.singular} is ready.`;
    case "CONTACT_PROFILE":
      return "The individual profile is ready.";
    case "RESUME":
      return operation === "plan"
        ? applicationAssetConfig.labels.readyPlan
        : `${applicationAssetConfig.labels.resume} is ready.`;
    case "COVER_LETTER":
      return operation === "plan"
        ? applicationAssetConfig.labels.readyPlan
        : `${applicationAssetConfig.labels.coverLetter} is ready.`;
    case "OUTREACH":
      return "The message is ready.";
    case "INTERVIEW_GUIDE":
      return "The interview guide is ready.";
    case "APPLICATION_SUMMARY":
      return `${applicationSummaryConfig.title} is ready.`;
    case "NEXT_STEP":
      return applicationWorkspaceCopy.nextStepTitle;
    case "RESEARCH":
      return applicationResearchCopy.doneDetail;
    default:
      return applicationWorkspaceCopy.readyNotice;
  }
}

export const workspaceJobCopy = Object.freeze({
  keepWorking: applicationWorkspaceCopy.keepWorking,
  readyLink: applicationWorkspaceCopy.readyLink,
  typing: applicationWorkspaceCopy.typing.replace(
    "{consultant}",
    consultationConfig.displayName,
  ),
  failed: "This did not finish. Retry.",
  retry: "Retry",
});
