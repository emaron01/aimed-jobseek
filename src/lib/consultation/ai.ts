import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext } from "@/lib/ai/types";
import {
  getConsultationAiProvider,
  getConsultationReplyAiProvider,
  isConsultationAiConfigured,
  isConsultationReplyAiConfigured,
} from "@/lib/ai";
import {
  consultationPlanSchema,
  consultationExtractSchema,
  consultationPolishSchema,
  consultationStatementGroundingSchema,
  type ConsultationPlanResult,
  type ConsultationExtractResult,
  type ConsultationPolishResult,
  type ConsultationStatementGroundingResult,
} from "@/lib/consultation/contract";
import {
  buildConsultationCoachMessages,
  buildConsultationExtractMessages,
  buildConsultationPolishMessages,
  buildConsultationStatementGroundingMessages,
} from "@/lib/consultation/prompt";
import { consultationConversationCopy } from "@/lib/product-config";
import { aiCallTracking } from "@/lib/usage/ai-call";

export type ConsultationPlanAiResult =
  | { ok: true; data: ConsultationPlanResult }
  | { ok: false; message: string };

const UNCONFIGURED = consultationConversationCopy.modelUnavailable;
const REPLY_UNCONFIGURED =
  "Consultation reply AI is not configured. Configure CONSULTATION_REPLY_AI_*, then retry.";

function tracking(usage?: AiCallUsageContext) {
  return usage ? aiCallTracking(usage) : {};
}

export async function planConsultationWithModel(input: {
  targets: Array<{ key: string; kind: string; text: string }>;
  profileItems: Array<{
    id: string;
    kind: string;
    text: string;
    itemType: string;
    employer?: string | null;
    title?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    roleId?: string | null;
  }>;
  hiringTeam: Array<{
    id: string;
    name: string;
    likelyTitles: string[];
    whyThisRoleMatters: string | null;
  }>;
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
  focusTargetKey?: string | null;
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
}): Promise<ConsultationPlanAiResult> {
  if (!isConsultationAiConfigured()) {
    console.error(
      JSON.stringify({
        event: "consultation_coach_failed",
        cause: "CONSULTATION_AI_not_configured",
        message: UNCONFIGURED,
      }),
    );
    return { ok: false, message: UNCONFIGURED };
  }
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("consultationPlan"),
      ...tracking(input.usage),
      messages: buildConsultationCoachMessages(input),
      parseOutput: (raw) => ({
        data: consultationPlanSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : message;
    console.error(
      JSON.stringify({ event: "consultation_coach_failed", message, cause }),
    );
    return {
      ok: false,
      message: consultationConversationCopy.planUnusable,
    };
  }
}

export async function extractWithModel(input: {
  answer: string;
  question: string;
  target: { key: string; kind: string; text: string } | null;
  targets: Array<{ key: string; kind: string; text: string }>;
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ConsultationExtractResult }
  | { ok: false; message: string }
> {
  if (!isConsultationReplyAiConfigured()) {
    return { ok: false, message: REPLY_UNCONFIGURED };
  }
  try {
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("consultationExtract"),
      ...tracking(input.usage),
      messages: buildConsultationExtractMessages(input),
      parseOutput: (raw) => ({
        data: consultationExtractSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_extract_failed", message }),
    );
    return {
      ok: false,
      message: "Consultation answer analysis failed. Retry consultation.",
    };
  }
}

export async function polishAnswerWithModel(input: {
  answer: string;
  story: {
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
  };
  sources: Array<{ id: string; text: string }>;
  declinedFollowUp: boolean;
  strengtheningNeeds: string[];
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ConsultationPolishResult }
  | { ok: false; message: string }
> {
  if (!isConsultationReplyAiConfigured()) {
    return { ok: false, message: REPLY_UNCONFIGURED };
  }
  try {
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("consultationPolish"),
      ...tracking(input.usage),
      messages: buildConsultationPolishMessages(input),
      parseOutput: (raw) => ({
        data: consultationPolishSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_polish_failed", message }),
    );
    return {
      ok: false,
      message: "Consultation statements could not be generated. Retry consultation.",
    };
  }
}

export async function groundStatementWithModel(input: {
  statement: string;
  kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
  sources: Array<{ id: string; text: string }>;
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ConsultationStatementGroundingResult }
  | { ok: false; message: string }
> {
  if (!isConsultationReplyAiConfigured()) {
    return { ok: false, message: REPLY_UNCONFIGURED };
  }
  try {
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("consultationStatementGrounding"),
      ...tracking(input.usage),
      messages: buildConsultationStatementGroundingMessages(input),
      parseOutput: (raw) => ({
        data: consultationStatementGroundingSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_statement_grounding_failed", message }),
    );
    return {
      ok: false,
      message: "The edited statement could not be verified. Retry approval.",
    };
  }
}
