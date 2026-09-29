import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { aiCallTracking } from "@/lib/usage/ai-call";
import {
  coverLetterPresentationPlanSchema,
  normalizeCoverLetterPresentationPlan,
  normalizeResumePresentationPlan,
  resumePresentationPlanSchema,
  type PresentationPlan,
} from "@/lib/application-assets/plan-contract";
import { AiValidationError } from "@/lib/ai/errors";
import { buildPresentationPlanMessages } from "@/lib/application-assets/plan-prompt";
import { runGatedPresentationPlan } from "@/lib/application-assets/paid-inputs";
import { applicationAssetConfig } from "@/lib/product-config";

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
  usage?: AiCallUsageContext;
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
      message: applicationAssetConfig.labels.planModelUnavailable,
    };
  }
  try {
    const planInput = {
      ...input,
      qualityFeedback: input.qualityFeedback ?? [],
    };
    const callProvider = async (): Promise<PresentationPlan> => {
      const messages = buildPresentationPlanMessages(planInput);
      const response =
        input.type === "RESUME"
          ? await getConsultationAiProvider().generateStructured({
              ...structuredOutputRequest("resumePresentationPlan"),
              ...(input.usage ? aiCallTracking(input.usage) : {}),
              messages,
              parseOutput: (raw) => ({
                data: resumePresentationPlanSchema.parse(
                  normalizeResumePresentationPlan(raw),
                ),
                coercedFields: [],
              }),
            })
          : await getConsultationAiProvider().generateStructured({
              ...structuredOutputRequest("coverLetterPresentationPlan"),
              ...(input.usage ? aiCallTracking(input.usage) : {}),
              messages,
              parseOutput: (raw) => ({
                data: coverLetterPresentationPlanSchema.parse(
                  normalizeCoverLetterPresentationPlan(raw),
                ),
                coercedFields: [],
              }),
            });
      return response.data;
    };
    const organizationId = input.usage?.organizationId;
    const campaignId = input.usage?.campaignId?.trim();
    if (organizationId && campaignId) {
      const gated = await runGatedPresentationPlan({
        organizationId,
        campaignId,
        planInput,
        callProvider,
      });
      return { ok: true, data: gated.data };
    }
    return { ok: true, data: await callProvider() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : message;
    const issues =
      error instanceof AiValidationError ? error.issues ?? [] : [];
    console.error(
      JSON.stringify({
        event: "presentation_plan_failed",
        message,
        cause,
        issues,
        rawTextPreview:
          error instanceof AiValidationError
            ? error.rawTextPreview
            : undefined,
      }),
    );
    return {
      ok: false,
      message: applicationAssetConfig.labels.planFailed,
    };
  }
}
