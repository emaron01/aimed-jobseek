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
};

export function isTimeoutMessage(message: string): boolean {
  return /timed out|timeout/i.test(message);
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
