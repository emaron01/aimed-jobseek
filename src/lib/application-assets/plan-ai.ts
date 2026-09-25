import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import {
  coverLetterPresentationPlanSchema,
  resumePresentationPlanSchema,
  type PresentationPlan,
} from "@/lib/application-assets/plan-contract";
import { buildPresentationPlanMessages } from "@/lib/application-assets/plan-prompt";
import { consultationConfig } from "@/lib/product-config";

export async function writePresentationPlanWithModel(input: {
  type: "RESUME" | "COVER_LETTER";
  application: { title: string | null; employer: string | null };
  roles: Array<{
    id: string;
    title: string | null;
    employer: string | null;
    startDate: string | null;
    endDate: string | null;
    yearsSinceEnd: number | null;
  }>;
  stories: Array<{ id: string; result: string }>;
  assessments: Array<{ text: string; strength: string; explanation: string }>;
  adjustmentNote: string | null;
  qualityFeedback?: string[];
}): Promise<{ ok: true; data: PresentationPlan } | { ok: false; message: string }> {
  if (!isConsultationAiConfigured()) {
    console.error(
      JSON.stringify({
        event: "presentation_plan_failed",
        cause: "CONSULTATION_AI_not_configured",
      }),
    );
    return {
      ok: false,
      message: `${consultationConfig.displayName} could not write this plan because Consultation AI is not configured.`,
    };
  }
  try {
    const messages = buildPresentationPlanMessages({
      ...input,
      qualityFeedback: input.qualityFeedback ?? [],
    });
    const response =
      input.type === "RESUME"
        ? await getConsultationAiProvider().generateStructured({
            ...structuredOutputRequest("resumePresentationPlan"),
            messages,
            parseOutput: (raw) => ({
              data: resumePresentationPlanSchema.parse(raw),
              coercedFields: [],
            }),
          })
        : await getConsultationAiProvider().generateStructured({
            ...structuredOutputRequest("coverLetterPresentationPlan"),
            messages,
            parseOutput: (raw) => ({
              data: coverLetterPresentationPlanSchema.parse(raw),
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
      JSON.stringify({ event: "presentation_plan_failed", message, cause }),
    );
    return {
      ok: false,
      message: `${consultationConfig.displayName} could not write this plan. Retry.`,
    };
  }
}
