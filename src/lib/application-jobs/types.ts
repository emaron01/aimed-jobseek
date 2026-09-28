import type { ApplicationJobStatus, ApplicationJobType } from "@prisma/client";

export type ApplicationJobView = {
  id: string;
  type: ApplicationJobType;
  status: ApplicationJobStatus;
  targetId: string | null;
  error: string | null;
  attempt: number;
  maxAttempts: number;
  canRetry: boolean;
};

export type ApplicationJobPayload = {
  operation?: string;
  /**
   * Ordered unique CONSULTATION planning operations preserved across PENDING reuse.
   * Drain-only ops (process_reply / answer / reply / edit_answer) are never stored here.
   */
  operations?: string[];
  userId?: string;
  personaId?: string;
  contactId?: string | null;
  stageId?: string;
  assetType?: string;
  purpose?: string;
  regenerationInstruction?: string | null;
  hiddenRoleIds?: string[];
  skipQuestions?: boolean;
  answers?: Array<{ id: string; answer: string }>;
  followUpToAssetId?: string | null;
  interviewStageId?: string | null;
  emailLength?: string | null;
  skipThankYouQuestions?: boolean;
  thankYouAnswers?: Array<{ id: string; answer: string }>;
  answer?: string;
  targetKey?: string;
  turnId?: string;
  questionTurnId?: string;
  adjustmentNote?: string | null;
  planType?: "RESUME" | "COVER_LETTER";
  sectionKey?: string;
  deferredOutreach?: {
    userId?: string;
    assetType: string;
    personaId: string;
    contactId?: string | null;
    purpose?: string;
    followUpToAssetId?: string | null;
    interviewStageId?: string | null;
    emailLength?: string | null;
    regenerationInstruction?: string | null;
    skipThankYouQuestions?: boolean;
    thankYouAnswers?: Array<{ id: string; answer: string }>;
  };
};

export function isTimeoutMessage(message: string): boolean {
  return /timed out|timeout/i.test(message);
}

/** Provider failures that should requeue HIRING_TEAM_BUILD (and similar) jobs. */
export function isRetryableProviderMessage(message: string): boolean {
  return (
    isTimeoutMessage(message) ||
    /rate limit|too many requests|\b429\b|\b502\b|\b503\b|\b504\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket hang up|temporarily unavailable/i.test(
      message,
    )
  );
}

export type ApplicationJobResult = {
  ok: boolean;
  jobId: string;
  type: ApplicationJobType | "UNKNOWN";
  campaignId: string | null;
  durationMs: number;
  error?: string;
};

export function formatApplicationJobLog(result: ApplicationJobResult): string {
  const outcome = result.ok ? "succeeded" : "failed";
  const type = result.type;
  const applicationId = result.campaignId ?? "unknown";
  const base =
    `[research-worker] application job ${result.jobId} type=${type} ` +
    `application=${applicationId} durationMs=${result.durationMs} outcome=${outcome}`;
  if (result.ok) return base;
  return `${base} error=${result.error ?? "Application job failed."}`;
}
