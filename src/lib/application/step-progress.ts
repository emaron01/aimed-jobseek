import type { ApplicationJobType } from "@prisma/client";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import {
  APPLICATION_STEP_KEYS,
  applicationStepCopy,
  applicationStepHref,
  applicationStepList,
  type ApplicationStepKey,
} from "@/lib/product-config/application-steps";

export const APPLICATION_STEP_STATES = [
  "not_started",
  "needs_attention",
  "in_progress",
  "active",
  "done",
] as const;

export type ApplicationStepState = (typeof APPLICATION_STEP_STATES)[number];

export const WORKSPACE_SEEN_VERSION = 2;

export type ApplicationStepFactInput = {
  researchDone: boolean;
  researchFailed: boolean;
  researchInProgress: boolean;
  hasJobTitle: boolean;
  jobReprocessing: boolean;
  hiringTeamRoleCount: number;
  hiringTeamBuiltCount: number;
  hasResumeVersion: boolean;
  latestResumeApproved: boolean;
  hasUnapprovedAssetDraft: boolean;
  latestResumeVersion: number | null;
  latestCoverLetterVersion: number | null;
  latestAssetKind: "resume" | "cover" | null;
  hasApprovedResume: boolean;
  hasApprovedCoverLetter: boolean;
  contactCount: number;
  latestOutreachContactName: string | null;
  outreachMessageCount: number;
  interviewStageCount: number;
  cheatSheetReady: boolean;
  appliedAt: string | null;
  consultationStarted: boolean;
  consultationComplete: boolean;
  consultationUnanswered: boolean;
};

export type ApplicationStepView = {
  key: ApplicationStepKey;
  number: number;
  title: string;
  href: string;
  state: ApplicationStepState;
  resultKey: string | null;
  newLabel: string | null;
  statusNote: string | null;
  hasNew: boolean;
  hasActiveJob: boolean;
  isCurrent: boolean;
  isPage: boolean;
};

export type WorkspaceSeenState = {
  version: number;
  keys: Record<string, string>;
};

const STEP_JOBS: Record<ApplicationStepKey, Array<ApplicationJobType | "RESEARCH">> = {
  company: ["RESEARCH"],
  job: [],
  consultation: ["CONSULTATION"],
  assets: ["RESUME", "COVER_LETTER"],
  "hiring-team": ["HIRING_TEAM_IDENTIFY", "HIRING_TEAM_BUILD", "CONTACT_PROFILE"],
  outreach: ["OUTREACH"],
  interviews: ["INTERVIEW_GUIDE"],
  summary: ["APPLICATION_SUMMARY"],
  applied: [],
};

export function emptyApplicationStepFacts(): ApplicationStepFactInput {
  return {
    researchDone: false,
    researchFailed: false,
    researchInProgress: false,
    hasJobTitle: false,
    jobReprocessing: false,
    hiringTeamRoleCount: 0,
    hiringTeamBuiltCount: 0,
    hasResumeVersion: false,
    latestResumeApproved: false,
    hasUnapprovedAssetDraft: false,
    latestResumeVersion: null,
    latestCoverLetterVersion: null,
    latestAssetKind: null,
    hasApprovedResume: false,
    hasApprovedCoverLetter: false,
    contactCount: 0,
    latestOutreachContactName: null,
    outreachMessageCount: 0,
    interviewStageCount: 0,
    cheatSheetReady: false,
    appliedAt: null,
    consultationStarted: false,
    consultationComplete: false,
    consultationUnanswered: false,
  };
}

export function hiringTeamAllBuilt(facts: ApplicationStepFactInput): boolean {
  return (
    facts.hiringTeamRoleCount > 0 &&
    facts.hiringTeamBuiltCount === facts.hiringTeamRoleCount
  );
}

export function stepResultKey(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
): string | null {
  switch (key) {
    case "company":
      return facts.researchDone ? "research:done" : null;
    case "job":
      return facts.hasJobTitle ? "job:ready" : null;
    case "consultation":
      if (!facts.consultationStarted) return null;
      return facts.consultationComplete
        ? "consultation:complete"
        : "consultation:open";
    case "hiring-team":
      return facts.hiringTeamRoleCount > 0
        ? `hiring-team:built:${facts.hiringTeamBuiltCount}:${facts.hiringTeamRoleCount}`
        : null;
    case "assets":
      if (facts.latestAssetKind === "cover" && facts.latestCoverLetterVersion) {
        return `cover:v${facts.latestCoverLetterVersion}`;
      }
      if (facts.latestResumeVersion) return `resume:v${facts.latestResumeVersion}`;
      return facts.hasApprovedResume ? "resume:approved" : null;
    case "outreach":
      if (facts.outreachMessageCount > 0) {
        return `outreach:messages:${facts.outreachMessageCount}`;
      }
      return facts.contactCount > 0 ? `outreach:contacts:${facts.contactCount}` : null;
    case "interviews":
      return facts.interviewStageCount > 0
        ? `interviews:${facts.interviewStageCount}`
        : null;
    case "summary":
      return facts.cheatSheetReady ? "summary:ready" : null;
    case "applied":
      return facts.appliedAt;
    default: {
      const exhaustive: never = key;
      throw new Error(`Unknown application step: ${String(exhaustive)}`);
    }
  }
}

export function stepNewLabel(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
): string | null {
  switch (key) {
    case "applied":
      return applicationStepCopy.newApplicationDate;
    case "company":
      return applicationStepCopy.newCompanyResearch;
    case "job":
      return applicationStepCopy.newJobRequirements;
    case "consultation":
      return facts.consultationUnanswered
        ? applicationStepCopy.newHarperQuestion
        : applicationStepCopy.newHarperResults;
    case "hiring-team":
      return hiringTeamAllBuilt(facts)
        ? applicationStepCopy.newHiringPersonas
        : applicationStepCopy.reviewRemainingPersonas;
    case "assets":
      if (facts.latestAssetKind === "cover" && facts.latestCoverLetterVersion) {
        return `${applicationStepCopy.newCoverLetterVersion} ${facts.latestCoverLetterVersion}`;
      }
      if (facts.latestResumeVersion) {
        return `${applicationStepCopy.newResumeVersion} ${facts.latestResumeVersion}`;
      }
      return null;
    case "outreach":
      if (facts.outreachMessageCount > 0 && facts.latestOutreachContactName) {
        return `${applicationStepCopy.newOutreachMessage} ${facts.latestOutreachContactName}`;
      }
      return applicationStepCopy.newOutreachContact;
    case "interviews":
      return applicationStepCopy.newInterviewStage;
    case "summary":
      return applicationStepCopy.newCheatSheet;
    default: {
      const exhaustive: never = key;
      throw new Error(`Unknown application step: ${String(exhaustive)}`);
    }
  }
}

export function stepIsDone(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
): boolean {
  switch (key) {
    case "company":
      return facts.researchDone;
    case "job":
      return facts.hasJobTitle && !facts.jobReprocessing;
    case "consultation":
      return facts.consultationComplete;
    case "hiring-team":
      return hiringTeamAllBuilt(facts);
    case "assets":
      return facts.latestResumeApproved && !facts.hasUnapprovedAssetDraft;
    case "outreach":
      return false;
    case "interviews":
      return facts.interviewStageCount > 0;
    case "summary":
      return facts.cheatSheetReady;
    case "applied":
      return Boolean(facts.appliedAt);
    default: {
      const exhaustive: never = key;
      throw new Error(`Unknown application step: ${String(exhaustive)}`);
    }
  }
}

export function stepIsStarted(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
): boolean {
  switch (key) {
    case "company":
      return (
        facts.researchDone ||
        facts.researchFailed ||
        facts.researchInProgress
      );
    case "job":
      return facts.hasJobTitle || facts.jobReprocessing;
    case "consultation":
      return facts.consultationStarted;
    case "hiring-team":
      return facts.hiringTeamRoleCount > 0;
    case "assets":
      return facts.hasResumeVersion || facts.hasApprovedResume;
    case "outreach":
      return facts.contactCount > 0;
    case "interviews":
      return facts.interviewStageCount > 0;
    case "summary":
      return facts.cheatSheetReady;
    case "applied":
      return Boolean(facts.appliedAt);
    default: {
      const exhaustive: never = key;
      throw new Error(`Unknown application step: ${String(exhaustive)}`);
    }
  }
}

export function stepNeedsAttention(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
  jobs: WorkspaceJobStatusView[],
): boolean {
  if (jobsForStep(key, jobs).some((job) => job.status === "FAILED")) return true;
  if (key === "company") return facts.researchFailed;
  return false;
}

export function stepIsInProgress(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
  jobs: WorkspaceJobStatusView[],
): boolean {
  if (stepHasActiveJob(key, facts, jobs)) {
    return true;
  }
  if (key === "consultation") {
    return facts.consultationStarted && !facts.consultationComplete;
  }
  if (key === "hiring-team") {
    return facts.hiringTeamRoleCount > 0 && !hiringTeamAllBuilt(facts);
  }
  if (key === "assets") {
    return (
      facts.hasResumeVersion &&
      (!facts.latestResumeApproved || facts.hasUnapprovedAssetDraft)
    );
  }
  return false;
}

/** True when generation or research work for this step is queued or running. */
export function stepHasActiveJob(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
  jobs: WorkspaceJobStatusView[],
): boolean {
  if (
    jobsForStep(key, jobs).some(
      (job) => job.status === "PENDING" || job.status === "IN_PROGRESS",
    )
  ) {
    return true;
  }
  if (key === "company") return facts.researchInProgress;
  if (key === "job") return facts.jobReprocessing;
  return false;
}

export function resolveApplicationStepState(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
  jobs: WorkspaceJobStatusView[],
  unread = false,
): ApplicationStepState {
  if (key === "outreach") {
    if (stepIsInProgress(key, facts, jobs)) return "in_progress";
    if (stepNeedsAttention(key, facts, jobs) && stepIsStarted(key, facts)) {
      return "in_progress";
    }
    if (facts.contactCount > 0) return "active";
    return "not_started";
  }
  if (stepIsInProgress(key, facts, jobs)) return "in_progress";
  if (stepNeedsAttention(key, facts, jobs)) {
    return stepIsStarted(key, facts) ||
      jobsForStep(key, jobs).some((job) => job.status === "FAILED")
      ? "in_progress"
      : "not_started";
  }
  if (stepIsDone(key, facts)) {
    return unread ? "in_progress" : "done";
  }
  if (stepIsStarted(key, facts)) return "in_progress";
  return "not_started";
}

export function parseWorkspaceSeenJson(value: unknown): WorkspaceSeenState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 0, keys: {} };
  }
  const record = value as Record<string, unknown>;
  const version = typeof record.v === "number" ? record.v : 0;
  const keys: Record<string, string> = {};
  for (const [key, result] of Object.entries(record)) {
    if (key === "v") continue;
    if (typeof result === "string" && result.trim()) keys[key] = result;
  }
  return { version, keys };
}

export function serializeWorkspaceSeen(state: WorkspaceSeenState): {
  v: number;
  [key: string]: string | number;
} {
  return { v: state.version, ...state.keys };
}

export function migrateWorkspaceSeen(
  parsed: WorkspaceSeenState,
): WorkspaceSeenState {
  if (parsed.version >= WORKSPACE_SEEN_VERSION) return parsed;
  return { version: WORKSPACE_SEEN_VERSION, keys: { ...parsed.keys } };
}

export function buildApplicationStepViews(input: {
  campaignId: string;
  currentStep: ApplicationStepKey | "overview" | null;
  facts: ApplicationStepFactInput;
  jobs: WorkspaceJobStatusView[];
  seen: Record<string, string>;
}): ApplicationStepView[] {
  return applicationStepList.map((step) => {
    const resultKey = stepResultKey(step.key, input.facts);
    const viewed = input.seen[step.key];
    const hasNew = Boolean(resultKey && viewed !== resultKey);
    const hasActiveJob = stepHasActiveJob(step.key, input.facts, input.jobs);
    const state = resolveApplicationStepState(
      step.key,
      input.facts,
      input.jobs,
      hasNew && stepIsDone(step.key, input.facts),
    );
    return {
      key: step.key,
      number: step.number,
      title: step.title,
      href: applicationStepHref(input.campaignId, step.key),
      state,
      resultKey,
      newLabel: hasNew ? stepNewLabel(step.key, input.facts) : null,
      statusNote:
        step.key === "hiring-team" &&
        state === "in_progress" &&
        !hiringTeamAllBuilt(input.facts)
          ? applicationStepCopy.reviewRemainingPersonas
          : null,
      hasNew,
      hasActiveJob,
      isCurrent:
        input.currentStep === step.key ||
        (input.currentStep === "overview" && step.key === "applied"),
      isPage: step.hrefSegment !== null,
    };
  });
}

export function initialWorkspaceSeen(
  facts: ApplicationStepFactInput,
): WorkspaceSeenState {
  const keys: Record<string, string> = {};
  for (const key of APPLICATION_STEP_KEYS) {
    const result = stepResultKey(key, facts);
    if (result) keys[key] = result;
  }
  return { version: WORKSPACE_SEEN_VERSION, keys };
}

function jobsForStep(
  key: ApplicationStepKey,
  jobs: WorkspaceJobStatusView[],
): WorkspaceJobStatusView[] {
  const types = new Set(STEP_JOBS[key]);
  return jobs.filter((job) => types.has(job.type));
}
