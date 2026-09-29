/**
 * Caching Phase 2 batch 3: thank-you clarifying questions gate.
 */
import {
  findPaidCallReceipt,
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import {
  INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION,
  interviewThankYouClarifyingQuestionsSchema,
  type InterviewThankYouClarifyingQuestions,
} from "@/lib/interview/contract";
import { buildInterviewThankYouClarifyingMessages } from "@/lib/interview/prompt";

export const INTERVIEW_THANK_YOU_CLARIFY_OPERATION =
  "INTERVIEW_THANK_YOU_CLARIFY" as const;

function messageFingerprintPayload(
  messages: Array<{ role: string; content: string }>,
) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function interviewThankYouClarifySubjectKey(
  campaignId: string,
  stageId: string,
): string {
  return `${campaignId}:${stageId}`;
}

export function interviewThankYouClarifyFingerprint(input: {
  notes: string;
  qualityFeedback: string[];
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION,
    schemaName: "interview_thank_you_clarifying_questions",
    messages: messageFingerprintPayload(
      buildInterviewThankYouClarifyingMessages(input),
    ),
  });
}

export async function runGatedInterviewThankYouClarify(input: {
  organizationId: string;
  campaignId: string;
  stageId: string;
  notes: string;
  qualityFeedback: string[];
  callProvider: () => Promise<InterviewThankYouClarifyingQuestions>;
}): Promise<{ data: InterviewThankYouClarifyingQuestions; skipped: boolean }> {
  const fingerprint = interviewThankYouClarifyFingerprint({
    notes: input.notes,
    qualityFeedback: input.qualityFeedback,
  });
  return runPaidStructuredCall({
    organizationId: input.organizationId,
    operation: INTERVIEW_THANK_YOU_CLARIFY_OPERATION,
    subjectKey: interviewThankYouClarifySubjectKey(
      input.campaignId,
      input.stageId,
    ),
    inputFingerprint: fingerprint,
    parseStored: (json) => interviewThankYouClarifyingQuestionsSchema.parse(json),
    isResultUsable: (stored) => Array.isArray(stored?.questions),
    callProvider: input.callProvider,
  });
}

export async function interviewThankYouClarifyUnchanged(input: {
  organizationId: string;
  campaignId: string;
  stageId: string;
  notes: string;
  qualityFeedback?: string[];
}): Promise<boolean> {
  const fingerprint = interviewThankYouClarifyFingerprint({
    notes: input.notes,
    qualityFeedback: input.qualityFeedback ?? [],
  });
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: INTERVIEW_THANK_YOU_CLARIFY_OPERATION,
    subjectKey: interviewThankYouClarifySubjectKey(
      input.campaignId,
      input.stageId,
    ),
  });
  if (!receipt || receipt.inputHash !== fingerprint) return false;
  try {
    const stored = interviewThankYouClarifyingQuestionsSchema.parse(
      receipt.resultJson,
    );
    return Array.isArray(stored.questions);
  } catch {
    return false;
  }
}
