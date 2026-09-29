import {
  getAssetAiProvider,
  getAssetValidationAiProvider,
  getEmailAiProvider,
  getEmailFactsAiProvider,
  isAssetAiConfigured,
  isEmailAiConfigured,
  isEmailFactsAiConfigured,
} from "@/lib/ai";
import { AiValidationError } from "@/lib/ai/errors";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext } from "@/lib/ai/types";
import type {
  ApplicationGenerationContext,
  ReadyApplicationGenerationContext,
} from "@/lib/generation/context";
import { emailFactSelectionResultSchema } from "@/lib/email-generation/fact-selection-contract";
import { aiCallTracking } from "@/lib/usage/ai-call";
import {
  runGatedAssetClaimValidation,
  runGatedCoverLetterAsset,
  runGatedResumeAsset,
} from "@/lib/application-assets/paid-inputs";
import {
  runGatedOutreachAsset,
  runGatedOutreachClaimValidation,
  runGatedOutreachFactSelection,
} from "@/lib/application-assets/outreach-paid-inputs";
import {
  assetClaimValidationSchema,
  coverLetterAssetContentSchema,
  emailAssetContentSchema,
  linkedinInmailAssetContentSchema,
  linkedinNoteAssetContentSchema,
  resumeAssetContentSchema,
  type ApplicationAssetContent,
  type AssetClaim,
  type AssetClaimValidation,
  type CoverLetterAssetContent,
  type ResumeAssetContent,
} from "./contract";
import type { OutreachGenerationInput } from "./outreach-types";
import {
  buildAssetClaimValidationMessages,
  buildCoverLetterAssetMessages,
  buildOutreachAssetMessages,
  buildOutreachFactSelectionMessages,
  buildResumeAssetMessages,
  outreachFactCandidates,
  type OutreachFactCandidate,
} from "./prompt";

type Result<T> =
  | { ok: true; data: T; skipped: boolean }
  | { ok: false; message: string };

const UNCONFIGURED =
  "Application asset AI is not configured. Configure it, then retry.";
const EMAIL_UNCONFIGURED =
  "Email generation AI is not configured. Configure EMAIL_AI_*, then retry.";
const EMAIL_FACTS_UNCONFIGURED =
  "Email company-fact selection AI is not configured. Configure EMAIL_FACTS_AI_*, then retry.";

function assetUsage(
  context: ReadyApplicationGenerationContext,
  operation: AiCallUsageContext["operation"],
  category: AiCallUsageContext["category"] = "ASSET_GENERATION",
): AiCallUsageContext {
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    campaignId: context.campaign.id,
    category,
    operation,
  };
}

function failure(operation: string, error: unknown, message: string) {
  const issues = error instanceof AiValidationError ? error.issues : undefined;
  console.error(
    JSON.stringify({
      event: "application_asset_ai_failed",
      operation,
      message: error instanceof Error ? error.message : "unknown",
      issues,
    }),
  );
  const detail = issues?.length
    ? ` ${issues
        .map((issue) => `${issue.path}: ${issue.code}`)
        .join("; ")}`
    : "";
  return { ok: false as const, message: `${message}${detail}` };
}

export async function generateResumeWithModel(input: {
  context: ReadyApplicationGenerationContext;
  hiddenRoleIds: string[];
  condensedRoleIds: string[];
  regenerationInstruction: string | null;
  qualityFeedback: string[];
}): Promise<Result<ResumeAssetContent>> {
  if (!isAssetAiConfigured()) return { ok: false, message: UNCONFIGURED };
  const resumeInput = input;
  const callProvider = async () => {
    const response = await getAssetAiProvider().generateStructured({
      ...structuredOutputRequest("resumeAsset"),
      ...aiCallTracking(
        assetUsage(input.context, "APPLICATION_ASSET_GENERATION"),
      ),
      messages: buildResumeAssetMessages(resumeInput),
      parseOutput: (raw) => ({
        data: resumeAssetContentSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    const gated = await runGatedResumeAsset({
      organizationId: input.context.organizationId,
      campaignId: input.context.campaign.id,
      resumeInput,
      callProvider,
    });
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    return failure("resumeAsset", error, "The resume could not be generated. Retry.");
  }
}

export async function generateCoverLetterWithModel(input: {
  context: ReadyApplicationGenerationContext;
  salutation: string;
  regenerationInstruction: string | null;
  qualityFeedback: string[];
}): Promise<Result<CoverLetterAssetContent>> {
  if (!isAssetAiConfigured()) return { ok: false, message: UNCONFIGURED };
  const coverInput = input;
  const callProvider = async () => {
    const response = await getAssetAiProvider().generateStructured({
      ...structuredOutputRequest("coverLetterAsset"),
      ...aiCallTracking(
        assetUsage(input.context, "APPLICATION_ASSET_GENERATION"),
      ),
      messages: buildCoverLetterAssetMessages(coverInput),
      parseOutput: (raw) => ({
        data: coverLetterAssetContentSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    const gated = await runGatedCoverLetterAsset({
      organizationId: input.context.organizationId,
      campaignId: input.context.campaign.id,
      coverInput,
      callProvider,
    });
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    return failure(
      "coverLetterAsset",
      error,
      "The cover letter could not be generated. Retry.",
    );
  }
}

async function selectOutreachFacts(
  input: OutreachGenerationInput & {
    contactId: string | null;
    personaId: string | null;
  },
): Promise<Result<OutreachFactCandidate[]>> {
  const candidates = outreachFactCandidates(input.context);
  if (candidates.length === 0) return { ok: true, data: [], skipped: false };
  if (!isEmailFactsAiConfigured()) {
    return { ok: false, message: EMAIL_FACTS_UNCONFIGURED };
  }
  try {
    const gated = await runGatedOutreachFactSelection({
      organizationId: input.context.organizationId,
      campaignId: input.context.campaign.id,
      personaId: input.personaId,
      contactId: input.contactId,
      purpose: input.purpose,
      context: input.context,
      candidates,
      callProvider: async () => {
        const response = await getEmailFactsAiProvider().generateStructured({
          ...structuredOutputRequest("emailCompanyFactSelection"),
          ...aiCallTracking(
            assetUsage(
              input.context,
              "EMAIL_COMPANY_FACT_SELECTION",
              "EMAIL_GENERATION",
            ),
          ),
          messages: buildOutreachFactSelectionMessages({
            context: input.context,
            purpose: input.purpose,
            candidates,
          }),
          parseOutput: (raw) => ({
            data: emailFactSelectionResultSchema.parse(raw),
            coercedFields: [],
          }),
        });
        return response.data;
      },
    });
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    return failure(
      "outreachFactSelection",
      error,
      "The outreach facts could not be selected. Retry.",
    );
  }
}

export async function generateOutreachWithModel(
  input: OutreachGenerationInput & {
    contactId: string | null;
    personaId: string | null;
    interviewStageId?: string | null;
  },
): Promise<Result<ApplicationAssetContent>> {
  if (!isEmailAiConfigured()) {
    return { ok: false, message: EMAIL_UNCONFIGURED };
  }
  const selected = await selectOutreachFacts(input);
  if (!selected.ok) return selected;
  const generationInput = {
    ...input,
    selectedFacts: selected.data,
  };
  const messages = buildOutreachAssetMessages(generationInput);
  const tracking = aiCallTracking(
    assetUsage(input.context, "EMAIL_GENERATION", "EMAIL_GENERATION"),
  );
  const failed = (error: unknown) =>
    failure(
      "outreachAsset",
      error,
      "The outreach message could not be generated. Retry.",
    );
  const callProvider = async (): Promise<ApplicationAssetContent> => {
    if (input.type === "EMAIL") {
      const response = await getEmailAiProvider().generateStructured({
        ...structuredOutputRequest("outreachEmailAsset"),
        ...tracking,
        messages,
        parseOutput: (raw) => ({
          data: emailAssetContentSchema.parse(raw),
          coercedFields: [],
        }),
      });
      return response.data;
    }
    if (input.type === "LINKEDIN_CONNECTION_NOTE") {
      const response = await getEmailAiProvider().generateStructured({
        ...structuredOutputRequest("outreachLinkedinNoteAsset"),
        ...tracking,
        messages,
        parseOutput: (raw) => ({
          data: linkedinNoteAssetContentSchema.parse(raw),
          coercedFields: [],
        }),
      });
      return response.data;
    }
    const response = await getEmailAiProvider().generateStructured({
      ...structuredOutputRequest("outreachLinkedinInmailAsset"),
      ...tracking,
      messages,
      parseOutput: (raw) => ({
        data: linkedinInmailAssetContentSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    const gated = await runGatedOutreachAsset({
      organizationId: input.context.organizationId,
      campaignId: input.context.campaign.id,
      personaId: input.personaId,
      contactId: input.contactId,
      interviewStageId: input.interviewStageId,
      generationInput,
      callProvider,
    });
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    return failed(error);
  }
}

export async function validateAssetClaimsWithModel(input: {
  claims: AssetClaim[];
  sources: ApplicationGenerationContext["sources"];
  context?: Pick<
    ReadyApplicationGenerationContext,
    "organizationId" | "userId" | "campaign"
  >;
  /** When set, gate with PaidCallReceipt (resume/cover). */
  assetType?: "RESUME" | "COVER_LETTER";
  /** When set, gate outreach claim validation per contact/channel/purpose. */
  outreachGate?: {
    assetType: OutreachGenerationInput["type"];
    purpose: OutreachGenerationInput["purpose"];
    personaId: string | null;
    contactId: string | null;
    interviewStageId?: string | null;
  };
}): Promise<Result<AssetClaimValidation>> {
  if (!isAssetAiConfigured()) return { ok: false, message: UNCONFIGURED };
  const tracking = input.context
    ? aiCallTracking({
        organizationId: input.context.organizationId,
        userId: input.context.userId,
        campaignId: input.context.campaign.id,
        category: "ASSET_GENERATION",
        operation: "APPLICATION_ASSET_GENERATION",
      })
    : {};
  const callProvider = async () => {
    const response = await getAssetValidationAiProvider().generateStructured({
      ...structuredOutputRequest("applicationAssetClaimValidation"),
      ...tracking,
      messages: buildAssetClaimValidationMessages(input),
      parseOutput: (raw) => ({
        data: assetClaimValidationSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    if (
      input.assetType &&
      input.context?.organizationId &&
      input.context.campaign.id
    ) {
      const gated = await runGatedAssetClaimValidation({
        organizationId: input.context.organizationId,
        campaignId: input.context.campaign.id,
        assetType: input.assetType,
        claims: input.claims,
        sources: input.sources,
        callProvider,
      });
      return { ok: true, data: gated.data, skipped: gated.skipped };
    }
    if (
      input.outreachGate &&
      input.context?.organizationId &&
      input.context.campaign.id
    ) {
      const gated = await runGatedOutreachClaimValidation({
        organizationId: input.context.organizationId,
        campaignId: input.context.campaign.id,
        personaId: input.outreachGate.personaId,
        contactId: input.outreachGate.contactId,
        interviewStageId: input.outreachGate.interviewStageId,
        assetType: input.outreachGate.assetType,
        purpose: input.outreachGate.purpose,
        claims: input.claims,
        sources: input.sources,
        callProvider,
      });
      return { ok: true, data: gated.data, skipped: gated.skipped };
    }
    return { ok: true, data: await callProvider(), skipped: false };
  } catch (error) {
    return failure(
      "applicationAssetClaimValidation",
      error,
      "The asset claim check could not be completed. Retry.",
    );
  }
}
