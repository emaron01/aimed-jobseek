/**
 * Application workspace steps: names, order, routes, and empty-state copy.
 * Step names come from the vocabulary module. Done-state rules live with
 * the application data in step-progress.ts.
 */
import { applicationAssetConfig } from "./application-assets";
import { applicationSummaryConfig } from "./application-summary";
import { hiringTeamConfig } from "./hiring-team";
import { interviewConfig } from "./interview";
import { outreachConfig } from "./outreach";
import { consultationConfig, consultationConversationCopy } from "./consultation";
import { applicationWorkspaceCopy, vocab } from "./vocabulary";

export const APPLICATION_STEP_KEYS = [
  "applied",
  "company",
  "job",
  "consultation",
  "assets",
  "hiring-team",
  "outreach",
  "interviews",
  "summary",
] as const;

export type ApplicationStepKey = (typeof APPLICATION_STEP_KEYS)[number];

export type ApplicationStepDefinition = {
  key: ApplicationStepKey;
  number: number;
  hrefSegment: string | null;
  title: string;
  emptyGuidance: string;
};

export const applicationStepList: readonly ApplicationStepDefinition[] =
  Object.freeze([
    {
      key: "applied",
      number: 1,
      hrefSegment: null,
      title: applicationWorkspaceCopy.appliedTitle,
      emptyGuidance: outreachConfig.labels.appliedHelp,
    },
    {
      key: "company",
      number: 2,
      hrefSegment: "company",
      title: applicationWorkspaceCopy.companyTitle,
      emptyGuidance: "Research this employer so the rest of the application has a company to work from.",
    },
    {
      key: "job",
      number: 3,
      hrefSegment: "job",
      title: applicationWorkspaceCopy.jobRequirementTitle,
      emptyGuidance: "Review the posting, location, compensation, and employer fit before you write materials.",
    },
    {
      key: "consultation",
      number: 4,
      hrefSegment: "consultation",
      title: consultationConfig.displayName,
      emptyGuidance: consultationConversationCopy.start,
    },
    {
      key: "assets",
      number: 5,
      hrefSegment: "assets",
      title: applicationAssetConfig.labels.sectionTitle,
      emptyGuidance: applicationAssetConfig.labels.sectionHelp,
    },
    {
      key: "hiring-team",
      number: 6,
      hrefSegment: "hiring-team",
      title: hiringTeamConfig.workspaceTitle,
      emptyGuidance: "Identify who will evaluate you so outreach and interview prep have people to aim at.",
    },
    {
      key: "outreach",
      number: 7,
      hrefSegment: "outreach",
      title: outreachConfig.labels.sectionTitle,
      emptyGuidance: outreachConfig.labels.sectionHelp,
    },
    {
      key: "interviews",
      number: 8,
      hrefSegment: "interviews",
      title: interviewConfig.labels.sectionTitle,
      emptyGuidance: interviewConfig.labels.sectionHelp,
    },
    {
      key: "summary",
      number: 9,
      hrefSegment: "summary",
      title: applicationSummaryConfig.title,
      emptyGuidance: applicationSummaryConfig.description,
    },
  ]);

export const applicationStepCopy = Object.freeze({
  overviewTitle: vocab.campaign.Singular,
  trackerLabel: "Application steps",
  newMarker: "New",
  notStarted: "Not started",
  needsAttention: "Needs attention",
  inProgress: "In progress",
  done: "Done",
  expandTracker: "Show steps",
  collapseTracker: "Hide steps",
  appliedAction: outreachConfig.labels.appliedStatus,
  appliedDate: outreachConfig.labels.appliedTitle,
  factFit: applicationWorkspaceCopy.employerFitTitle,
  factLocation: "Location",
  factWorkArrangement: "Work arrangement",
  factCompensation: "Compensation as stated",
  factMissing: "Not stated in the posting.",
  harperCollapse: `Hide ${consultationConfig.displayName}`,
  harperExpand: `Show ${consultationConfig.displayName}`,
});

export function applicationStepByKey(
  key: ApplicationStepKey,
): ApplicationStepDefinition {
  const step = applicationStepList.find((item) => item.key === key);
  if (!step) {
    throw new Error(`Unknown application step: ${key}`);
  }
  return step;
}

export function applicationStepHref(
  campaignId: string,
  key: ApplicationStepKey,
): string {
  const id = campaignId.trim();
  if (!id) throw new Error("Application step link is missing an application.");
  const step = applicationStepByKey(key);
  if (!step.hrefSegment) return `/campaigns/${id}#applied`;
  return `/campaigns/${id}/${step.hrefSegment}`;
}

export function applicationStepFromPathname(
  pathname: string,
): ApplicationStepKey | "overview" | null {
  const match = pathname.match(/^\/campaigns\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return null;
  const segment = match[2];
  if (!segment) return "overview";
  if (segment === "interviews") return "interviews";
  const step = applicationStepList.find((item) => item.hrefSegment === segment);
  return step?.key ?? null;
}
