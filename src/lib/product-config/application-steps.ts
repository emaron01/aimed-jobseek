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
  "job",
  "company",
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
      key: "job",
      number: 2,
      hrefSegment: "job",
      title: applicationWorkspaceCopy.jobRequirementTitle,
      emptyGuidance: "Review the posting, location, compensation, and employer fit before you write materials.",
    },
    {
      key: "company",
      number: 3,
      hrefSegment: "company",
      title: "Company Research",
      emptyGuidance: "Research this employer so the rest of the application has a company to work from.",
    },
    {
      key: "consultation",
      number: 4,
      hrefSegment: "consultation",
      title: "Harper Questionnaire",
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
  dashboardTitle: "Application Dashboard",
  trackerLabel: "Application steps",
  newMarker: "New",
  notStarted: "Not started",
  needsAttention: "Needs attention",
  inProgress: "In progress",
  active: "Started",
  done: "Done",
  currentlyCompleting: "Currently Completing",
  nextUp: "Next Up",
  newApplication: "New Application",
  companyMatchAndResearch: "Company match and research",
  newApplicationDate: "New: application date",
  newCompanyResearch: "New: company research",
  newJobRequirements: "New: job requirements",
  newHarperResults: "New: Harper results",
  newHarperQuestion: "New: Harper question",
  newResumeVersion: "New: resume version",
  newCoverLetterVersion: "New: cover letter version",
  newHiringPersonas: "New: Please review and/or update",
  appliedDone: "Applied",
  jobDone: "Successfully uploaded and reviewed by Harper",
  companyDone: "Reviewed and approved by you",
  consultationInProgress: "Please review and respond",
  assetsDone: "Completed and approved by you",
  interviewsDone: "Keep your interview notes updated",
  summaryStatus: "Review and study for each interview",
  harperIsWorking: "Harper is working",
  yourTurn: "Your turn",
  yourNextStep: "Your next step",
  openStep: "Open {step}",
  openFullPage: "Open full page",
  closeStep: "Close",
  markApplied: "Mark as applied",
  reviewJob: "Review job requirements",
  reviewCompany: "Review company research",
  answerHarper: "Answer Harper's questions",
  reviewBullets: "Review your bullets",
  reviewPersonas: "Review personas",
  sendMessage: "Send a message",
  addInterviewNotes: "Add interview notes",
  createPrepGuides: "Create prep guides",
  oneQuestionNeedsYourAnswer: "1 question needs your answer",
  questionsNeedYourAnswer: "{count} questions need your answer",
  oneInterviewerHasNoPrepGuide: "1 interviewer has no prep guide",
  interviewersHaveNoPrepGuide: "{count} interviewers have no prep guide",
  onePersonaIsNotBuilt: "1 persona is not built",
  personasAreNotBuilt: "{count} personas are not built",
  newOutreachContact: "New: contact added",
  newOutreachMessage: "New: message for",
  newInterviewStage: "New: interview stage",
  newCheatSheet: "New: Interview Preparation Guides",
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
  if (!step.hrefSegment) return `/campaigns/${id}?open=applied`;
  return `/campaigns/${id}/${step.hrefSegment}`;
}

export type ApplicationStepStatusTone = "done" | "progress" | "active" | "attention";

type ApplicationStepStatusInput = {
  key: ApplicationStepKey;
  workDone: boolean;
  hasNew: boolean;
  newLabel: string | null;
  state: "not_started" | "needs_attention" | "in_progress" | "active" | "done";
};

/** Dashboard cards, sidebar status text, and any pill that names a step status. */
export function applicationStepStatusLabel(step: ApplicationStepStatusInput): string {
  if (step.workDone) {
    switch (step.key) {
      case "applied":
        return applicationStepCopy.appliedDone;
      case "job":
        return applicationStepCopy.jobDone;
      case "company":
        return applicationStepCopy.companyDone;
      case "assets":
        return applicationStepCopy.assetsDone;
      case "interviews":
        return applicationStepCopy.interviewsDone;
      case "summary":
        return applicationStepCopy.summaryStatus;
      default:
        return applicationStepCopy.done;
    }
  }
  if (step.hasNew && step.newLabel) return step.newLabel;
  if (step.state === "active") return applicationStepCopy.active;
  if (step.state === "in_progress") {
    if (step.key === "consultation") return applicationStepCopy.consultationInProgress;
    return applicationStepCopy.inProgress;
  }
  if (step.state === "needs_attention") return applicationStepCopy.needsAttention;
  return applicationStepCopy.notStarted;
}

/** Interview Notes stays on the in-progress color after its work is done. */
export function applicationStepStatusTone(input: {
  key: ApplicationStepKey;
  workDone: boolean;
  state: ApplicationStepStatusInput["state"];
}): ApplicationStepStatusTone {
  if (input.key === "interviews" && (input.workDone || input.state === "done")) {
    return "progress";
  }
  if (input.workDone) return "done";
  if (input.state === "active") return "active";
  if (input.state === "in_progress") return "progress";
  return "attention";
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
