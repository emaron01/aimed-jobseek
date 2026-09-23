import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import {
  consultationPlanSchema,
  consultationExtractSchema,
  type ConsultationPlanResult,
  type ConsultationExtractResult,
} from "@/lib/consultation/contract";
import {
  buildConsultationCoachMessages,
  buildConsultationExtractMessages,
} from "@/lib/consultation/prompt";

export type ConsultationPlanAiResult =
  | { ok: true; data: ConsultationPlanResult }
  | { ok: false; message: string };

const UNCONFIGURED =
  "Consultation AI is not configured. Configure it, then retry consultation.";

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
  hiringTeam: Array<{ name: string; whyThisRoleMatters: string | null }>;
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
}): Promise<ConsultationPlanAiResult> {
  if (!isConsultationAiConfigured()) {
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
    console.error(
      JSON.stringify({ event: "consultation_coach_failed", message }),
    );
    return {
      ok: false,
      message: "Consultation planning could not be generated. Retry consultation.",
    };
  }
}

export async function extractWithModel(input: {
  answer: string;
  question: string;
  target: { key: string; kind: string; text: string } | null;
  targets: Array<{ key: string; kind: string; text: string }>;
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
