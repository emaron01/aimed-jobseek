import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { aiCallTracking } from "@/lib/usage/ai-call";
import {
  applicationSummaryShellSchema,
  cheatSheetPersonSectionGenerateSchema,
} from "@/lib/application-summary/contract";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";
import { runGatedApplicationSummaryShell } from "@/lib/application-summary/shell-gate";
import type { CareerStage } from "@/lib/consultation/career-stage";
import { applicationSummaryConfig } from "@/lib/product-config";

type PersonInput = {
  sectionKey: string;
  roleId: string;
  contactId: string | null;
  heading: string;
  roleName: string;
  titles: string[];
  sectionKind: string;
};

async function unavailable() {
  return {
    ok: false as const,
    message: `${applicationSummaryConfig.title} is not available. Retry.`,
  };
}

export async function generateApplicationSummaryShell(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ReturnType<typeof applicationSummaryShellSchema.parse> }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) return unavailable();
  const organizationId = input.usage?.organizationId;
  const campaignId = input.usage?.campaignId?.trim();
  const callProvider = async () => {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("applicationSummaryShell"),
      ...(input.usage ? aiCallTracking(input.usage) : {}),
      messages: buildApplicationSummaryGuidanceMessages({
        sources: input.sources,
        people: [],
        mode: "shell",
        qualityFeedback: input.qualityFeedback,
      }),
      parseOutput: (raw) => ({
        data: applicationSummaryShellSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    if (organizationId && campaignId) {
      const gated = await runGatedApplicationSummaryShell({
        organizationId,
        campaignId,
        sources: input.sources,
        callProvider,
      });
      return { ok: true, data: gated.data };
    }
    return { ok: true, data: await callProvider() };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "application_summary_shell_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: `${applicationSummaryConfig.title} could not be generated. Retry.`,
    };
  }
}

export async function generateCheatSheetPersonSectionGuidance(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  person: PersonInput;
  careerStage: CareerStage;
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ReturnType<typeof cheatSheetPersonSectionGenerateSchema.parse> }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) return unavailable();
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("cheatSheetPersonSection"),
      ...(input.usage ? aiCallTracking(input.usage) : {}),
      messages: buildApplicationSummaryGuidanceMessages({
        sources: input.sources,
        people: [input.person],
        mode: "person",
        careerStage: input.careerStage,
        qualityFeedback: input.qualityFeedback,
      }),
      parseOutput: (raw) => ({
        data: cheatSheetPersonSectionGenerateSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "cheat_sheet_person_section_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: `${applicationSummaryConfig.title} could not be generated. Retry.`,
    };
  }
}
