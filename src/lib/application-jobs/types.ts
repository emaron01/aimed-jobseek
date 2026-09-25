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
  adjustmentNote?: string | null;
  planType?: "RESUME" | "COVER_LETTER";
};

export function isTimeoutMessage(message: string): boolean {
  return /timed out|timeout/i.test(message);
}
