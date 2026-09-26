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
import { applicationSummaryConfig } from "@/lib/product-config";

export async function generateApplicationSummaryGuidance(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  people: Array<{
    sectionKey: string;
    roleId: string;
    contactId: string | null;
    heading: string;
    roleName: string;
    titles: string[];
    sectionKind: string;
  }>;
  qualityFeedback?: string[];
}): Promise<
  | { ok: true; data: ApplicationSummaryGuidance }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) {
    return {
      ok: false,
      message:
        `${applicationSummaryConfig.title} is not available. Retry.`,
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
      message: `${applicationSummaryConfig.title} could not be generated. Retry.`,
    };
  }
}
