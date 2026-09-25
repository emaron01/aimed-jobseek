import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
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

export type ConsultationPlanAiResult =
  | { ok: true; data: ConsultationPlanResult }
  | { ok: false; message: string };

const UNCONFIGURED = consultationConversationCopy.modelUnavailable;

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
    personaContext: unknown;
  }>;
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
  focusTargetKey?: string | null;
  qualityFeedback?: string[];
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
      message:
        "Consultation planning did not return a usable plan. Retry consultation.",
    };
  }
}

export async function extractWithModel(input: {
  answer: string;
  question: string;
  target: { key: string; kind: string; text: string } | null;
  targets: Array<{ key: string; kind: string; text: string }>;
  qualityFeedback?: string[];
}): Promise<
  | { ok: true; data: ConsultationExtractResult }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("consultationExtract"),
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
}): Promise<
  | { ok: true; data: ConsultationPolishResult }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("consultationPolish"),
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
}): Promise<
  | { ok: true; data: ConsultationStatementGroundingResult }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("consultationStatementGrounding"),
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
