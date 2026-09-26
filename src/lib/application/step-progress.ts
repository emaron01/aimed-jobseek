import type { ApplicationJobType } from "@prisma/client";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import {
  APPLICATION_STEP_KEYS,
  applicationStepHref,
  applicationStepList,
  type ApplicationStepKey,
} from "@/lib/product-config/application-steps";

export const APPLICATION_STEP_STATES = [
  "not_started",
  "needs_attention",
  "in_progress",
  "done",
] as const;

export type ApplicationStepState = (typeof APPLICATION_STEP_STATES)[number];

export type ApplicationStepFactInput = {
  researchDone: boolean;
  researchFailed: boolean;
  researchInProgress: boolean;
  hasJobTitle: boolean;
  fitNeedsRescore: boolean;
  hiringTeamRoleCount: number;
  hasApprovedResume: boolean;
  hasApprovedCoverLetter: boolean;
  contactCount: number;
  interviewStageCount: number;
  cheatSheetReady: boolean;
  appliedAt: string | null;
};

export type ApplicationStepView = {
  key: ApplicationStepKey;
  number: number;
  title: string;
  href: string;
  state: ApplicationStepState;
  resultKey: string | null;
  hasNew: boolean;
  isCurrent: boolean;
  isPage: boolean;
};

const STEP_JOBS: Record<ApplicationStepKey, Array<ApplicationJobType | "RESEARCH">> = {
  company: ["RESEARCH"],
  job: [],
  "hiring-team": ["HIRING_TEAM_IDENTIFY", "HIRING_TEAM_BUILD", "CONTACT_PROFILE"],
  assets: ["RESUME", "COVER_LETTER"],
  outreach: ["OUTREACH"],
  interviews: ["INTERVIEW_GUIDE"],
  summary: ["APPLICATION_SUMMARY"],
  applied: [],
};

export function stepResultKey(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
  jobs: WorkspaceJobStatusView[],
): string | null {
  const latest = latestCompletedJob(key, jobs);
  if (latest) return latest.id;
  switch (key) {
    case "company":
      return facts.researchDone ? "research:done" : null;
    case "job":
      return facts.hasJobTitle ? "job:ready" : null;
    case "hiring-team":
      return facts.hiringTeamRoleCount > 0
        ? `hiring-team:${facts.hiringTeamRoleCount}`
        : null;
    case "assets":
      return facts.hasApprovedResume ? "resume:approved" : null;
    case "outreach":
      return facts.contactCount > 0 ? `outreach:${facts.contactCount}` : null;
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

export function stepIsDone(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
): boolean {
  switch (key) {
    case "company":
      return facts.researchDone;
    case "job":
      return facts.hasJobTitle && !facts.fitNeedsRescore;
    case "hiring-team":
      return facts.hiringTeamRoleCount > 0;
    case "assets":
      return facts.hasApprovedResume;
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
  if (key === "job") return facts.fitNeedsRescore;
  return false;
}

export function stepIsInProgress(
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
  return key === "company" && facts.researchInProgress;
}

export function resolveApplicationStepState(
  key: ApplicationStepKey,
  facts: ApplicationStepFactInput,
  jobs: WorkspaceJobStatusView[],
): ApplicationStepState {
  if (stepIsInProgress(key, facts, jobs)) return "in_progress";
  if (stepNeedsAttention(key, facts, jobs)) return "needs_attention";
  if (stepIsDone(key, facts)) return "done";
  return "not_started";
}

export function parseWorkspaceSeenJson(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const seen: Record<string, string> = {};
  for (const [key, result] of Object.entries(value)) {
    if (typeof result === "string" && result.trim()) seen[key] = result;
  }
  return seen;
}

export function buildApplicationStepViews(input: {
  campaignId: string;
  currentStep: ApplicationStepKey | "overview" | null;
  facts: ApplicationStepFactInput;
  jobs: WorkspaceJobStatusView[];
  seen: Record<string, string>;
}): ApplicationStepView[] {
  return applicationStepList.map((step) => {
    const state = resolveApplicationStepState(step.key, input.facts, input.jobs);
    const resultKey = stepResultKey(step.key, input.facts, input.jobs);
    const viewed = input.seen[step.key];
    return {
      key: step.key,
      number: step.number,
      title: step.title,
      href: applicationStepHref(input.campaignId, step.key),
      state,
      resultKey,
      hasNew: Boolean(resultKey && viewed !== resultKey),
      isCurrent:
        input.currentStep === step.key ||
        (input.currentStep === "overview" && step.key === "applied"),
      isPage: step.hrefSegment !== null,
    };
  });
}

export function initialWorkspaceSeen(
  facts: ApplicationStepFactInput,
  jobs: WorkspaceJobStatusView[],
): Record<string, string> {
  const seen: Record<string, string> = {};
  for (const key of APPLICATION_STEP_KEYS) {
    const result = stepResultKey(key, facts, jobs);
    if (result) seen[key] = result;
  }
  return seen;
}

function jobsForStep(
  key: ApplicationStepKey,
  jobs: WorkspaceJobStatusView[],
): WorkspaceJobStatusView[] {
  const types = new Set(STEP_JOBS[key]);
  return jobs.filter((job) => types.has(job.type));
}

function latestCompletedJob(
  key: ApplicationStepKey,
  jobs: WorkspaceJobStatusView[],
): WorkspaceJobStatusView | undefined {
  return jobsForStep(key, jobs).find((job) => job.status === "COMPLETED");
}
