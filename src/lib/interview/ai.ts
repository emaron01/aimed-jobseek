import {
  getConsultationReplyAiProvider,
  isConsultationReplyAiConfigured,
} from "@/lib/ai";
import { AiValidationError } from "@/lib/ai/errors";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { aiCallTracking } from "@/lib/usage/ai-call";
import { runGatedInterviewThankYouClarify } from "@/lib/interview/thank-you-paid-inputs";
import {
  interviewThankYouClarifyingQuestionsSchema,
  type InterviewThankYouClarifyingQuestions,
} from "./contract";
import { buildInterviewThankYouClarifyingMessages } from "./prompt";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const UNCONFIGURED =
  "Writing AI is not configured. Configure CONSULTATION_REPLY_AI_*, then retry.";

function failure(operation: string, error: unknown, message: string): Result<never> {
  const issues = error instanceof AiValidationError ? error.issues : undefined;
  console.error(
    JSON.stringify({
      event: "interview_thank_you_ai_failed",
      operation,
      message: error instanceof Error ? error.message : "unknown",
      issues,
    }),
  );
  const detail = issues?.length
    ? ` ${issues.map((issue) => `${issue.path}: ${issue.code}`).join("; ")}`
    : "";
  return { ok: false, message: `${message}${detail}` };
}

export function generateInterviewThankYouClarifyingQuestions(input: {
  notes: string;
  qualityFeedback: string[];
  organizationId: string;
  campaignId: string;
  stageId: string;
  usage?: AiCallUsageContext;
}): Promise<Result<InterviewThankYouClarifyingQuestions>> {
  if (!isConsultationReplyAiConfigured()) {
    return Promise.resolve({ ok: false, message: UNCONFIGURED });
  }
  const callProvider = async () => {
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("interviewThankYouClarifyingQuestions"),
      ...(input.usage ? aiCallTracking(input.usage) : {}),
      messages: buildInterviewThankYouClarifyingMessages(input),
      parseOutput: (raw) => ({
        data: interviewThankYouClarifyingQuestionsSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  return runGatedInterviewThankYouClarify({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    stageId: input.stageId,
    notes: input.notes,
    qualityFeedback: input.qualityFeedback,
    callProvider,
  })
    .then((gated) => ({ ok: true as const, data: gated.data }))
    .catch((error) =>
      failure(
        "interviewThankYouClarifyingQuestions",
        error,
        "Thank-you questions could not be generated. Retry.",
      ),
    );
}
