import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  applicationSummaryGuidanceSchema,
  type ApplicationSummaryGuidance,
} from "@/lib/application-summary/contract";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";

export async function generateApplicationSummaryGuidance(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  directRoles: Array<{ id: string; name: string }>;
  qualityFeedback?: string[];
}): Promise<
  | { ok: true; data: ApplicationSummaryGuidance }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) {
    return {
      ok: false,
      message:
        "Application Summary AI is not configured. Configure it, then retry.",
    };
  }
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("applicationSummaryGuidance"),
      messages: buildApplicationSummaryGuidanceMessages(input),
      parseOutput: (raw) => ({
        data: applicationSummaryGuidanceSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "application_summary_guidance_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: "Application Summary guidance could not be generated. Retry.",
    };
  }
}
