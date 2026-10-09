import {
  createAiProvider,
  getConsultationAiConfig,
  getConsultationAiProvider,
  getConsultationReplyAiProvider,
  isConsultationAiConfigured,
  isConsultationReplyAiConfigured,
} from "@/lib/ai";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { aiCallTracking } from "@/lib/usage/ai-call";
import type { ApprovedInterviewAnswer } from "@/lib/application-summary/approved-answers";
import {
  applicationSummaryShellSchema,
  cheatSheetPersonSectionGenerateSchema,
} from "@/lib/application-summary/contract";
import type { CheatSheetInterviewerContext } from "@/lib/application-summary/people";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";
import { fingerprintPaidCallInputs, runPaidStructuredCall } from "@/lib/ai/paid-call-gate";
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
    cause: `${applicationSummaryConfig.title} is not available.`,
  };
}

export async function generateApplicationSummaryShell(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ReturnType<typeof applicationSummaryShellSchema.parse> }
  | { ok: false; message: string; cause: string }
> {
  if (!isConsultationAiConfigured()) return unavailable();
  const organizationId = input.usage?.organizationId;
  const campaignId = input.usage?.campaignId?.trim();
  const shellModel = process.env.APPLICATION_SUMMARY_SHELL_AI_MODEL?.trim();
  const shellProvider = shellModel
    ? createAiProvider({
        ...getConsultationAiConfig(),
        model: shellModel,
      })
    : getConsultationAiProvider();
  const callProvider = async () => {
    const response = await shellProvider.generateStructured({
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
      cause: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function generateCheatSheetPersonSectionGuidance(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  person: PersonInput;
  careerStage: CareerStage;
  qualityFeedback?: string[];
  usage?: AiCallUsageContext;
  approvedAnswers?: ApprovedInterviewAnswer[];
  likelyQuestionMax?: number;
  interviewer?: CheatSheetInterviewerContext | null;
}): Promise<
  | {
      ok: true;
      data: ReturnType<typeof cheatSheetPersonSectionGenerateSchema.parse>;
    }
  | { ok: false; message: string; cause: string }
> {
  if (!isConsultationReplyAiConfigured()) return unavailable();
  const messages = buildApplicationSummaryGuidanceMessages({
    sources: input.sources,
    people: [input.person],
    mode: "person",
    careerStage: input.careerStage,
    qualityFeedback: input.qualityFeedback,
    approvedAnswers: input.approvedAnswers,
    likelyQuestionMax: input.likelyQuestionMax,
    interviewer: input.interviewer,
  });
  const callProvider = async () => {
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("cheatSheetPersonSection"),
      ...(input.usage ? aiCallTracking(input.usage) : {}),
      messages,
      parseOutput: (raw) => {
        const parsed = cheatSheetPersonSectionGenerateSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(
            parsed.error.issues.map((issue) => issue.message).join("; ") ||
              "Cheat sheet person section did not match the schema.",
          );
        }
        return { data: parsed.data, coercedFields: [] };
      },
    });
    return response.data;
  };
  try {
    const organizationId = input.usage?.organizationId;
    const campaignId = input.usage?.campaignId?.trim();
    const sectionKey = input.person.sectionKey.trim();
    if (organizationId && campaignId && sectionKey) {
      const gated = await runPaidStructuredCall({
        organizationId,
        operation: "APPLICATION_SUMMARY_PERSON",
        subjectKey: `${campaignId}:${sectionKey}`,
        inputFingerprint: fingerprintPaidCallInputs(messages),
        isResultUsable: (stored) => stored.likelyQuestions.length > 0,
        parseStored: (json) => cheatSheetPersonSectionGenerateSchema.parse(json),
        callProvider,
      });
      return { ok: true, data: gated.data };
    }
    return { ok: true, data: await callProvider() };
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
      cause: error instanceof Error ? error.message : "unknown",
    };
  }
}
