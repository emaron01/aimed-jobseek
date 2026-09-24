import { getAssetAiProvider, isAssetAiConfigured } from "@/lib/ai";
import { AiValidationError } from "@/lib/ai/errors";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  interviewClarifyingQuestionsSchema,
  interviewGuideContentSchema,
  type InterviewClarifyingQuestions,
  type InterviewGuideContent,
} from "./contract";
import {
  buildInterviewClarifyingMessages,
  buildInterviewGuideMessages,
  type InterviewGuidePromptInput,
} from "./prompt";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const UNCONFIGURED =
  "Application asset AI is not configured. Configure it, then retry.";

function failure(operation: string, error: unknown, message: string): Result<never> {
  const issues = error instanceof AiValidationError ? error.issues : undefined;
  console.error(
    JSON.stringify({
      event: "interview_guide_ai_failed",
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

export function generateInterviewClarifyingQuestions(input: {
  missing: string[];
  qualityFeedback: string[];
}): Promise<Result<InterviewClarifyingQuestions>> {
  if (!isAssetAiConfigured()) {
    return Promise.resolve({ ok: false, message: UNCONFIGURED });
  }
  return getAssetAiProvider()
    .generateStructured({
      ...structuredOutputRequest("interviewClarifyingQuestions"),
      messages: buildInterviewClarifyingMessages(input),
      parseOutput: (raw) => ({
        data: interviewClarifyingQuestionsSchema.parse(raw),
        coercedFields: [],
      }),
    })
    .then((response) => ({ ok: true as const, data: response.data }))
    .catch((error) =>
      failure(
        "interviewClarifyingQuestions",
        error,
        "Clarifying questions could not be generated. Retry.",
      ),
    );
}

export function generateInterviewGuideWithModel(
  input: InterviewGuidePromptInput,
): Promise<Result<InterviewGuideContent>> {
  if (!isAssetAiConfigured()) {
    return Promise.resolve({ ok: false, message: UNCONFIGURED });
  }
  return getAssetAiProvider()
    .generateStructured({
      ...structuredOutputRequest("interviewGuide"),
      messages: buildInterviewGuideMessages(input),
      parseOutput: (raw) => {
        const payload =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? { ...(raw as Record<string, unknown>) }
            : {};
        if (!Array.isArray(payload.chronologicalWalkthrough)) {
          payload.chronologicalWalkthrough = [];
        }
        return {
          data: interviewGuideContentSchema.parse(payload),
          coercedFields: [],
        };
      },
    })
    .then((response) => ({ ok: true as const, data: response.data }))
    .catch((error) =>
      failure(
        "interviewGuide",
        error,
        "The interview guide could not be generated. Retry.",
      ),
    );
}
