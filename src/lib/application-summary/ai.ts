import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { aiCallTracking } from "@/lib/usage/ai-call";
import {
  applicationSummaryShellSchema,
  cheatSheetPersonSectionSchema,
  type ApplicationSummaryGuidance,
  type CheatSheetPersonSection,
} from "@/lib/application-summary/contract";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";
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
  | { ok: true; data: Pick<ApplicationSummaryGuidance, "overview" | "stories"> }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) return unavailable();
  try {
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
    return { ok: true, data: response.data };
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
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: CheatSheetPersonSection }
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
        qualityFeedback: input.qualityFeedback,
      }),
      parseOutput: (raw) => ({
        data: cheatSheetPersonSectionSchema.parse(raw),
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
