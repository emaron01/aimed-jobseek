import {
  getAssetAiProvider,
  getAssetValidationAiProvider,
  isAssetAiConfigured,
} from "@/lib/ai";
import { AiValidationError } from "@/lib/ai/errors";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type {
  ApplicationGenerationContext,
  ReadyApplicationGenerationContext,
} from "@/lib/generation/context";
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
  buildResumeAssetMessages,
} from "./prompt";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const UNCONFIGURED =
  "Application asset AI is not configured. Configure it, then retry.";

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

export function generateResumeWithModel(input: {
  context: ReadyApplicationGenerationContext;
  hiddenRoleIds: string[];
  condensedRoleIds: string[];
  regenerationInstruction: string | null;
  qualityFeedback: string[];
}): Promise<Result<ResumeAssetContent>> {
  if (!isAssetAiConfigured()) return Promise.resolve({ ok: false, message: UNCONFIGURED });
  return getAssetAiProvider()
    .generateStructured({
      ...structuredOutputRequest("resumeAsset"),
      messages: buildResumeAssetMessages(input),
      parseOutput: (raw) => ({
        data: resumeAssetContentSchema.parse(raw),
        coercedFields: [],
      }),
    })
    .then((response) => ({ ok: true as const, data: response.data }))
    .catch((error) =>
      failure("resumeAsset", error, "The resume could not be generated. Retry."),
    );
}

export function generateCoverLetterWithModel(input: {
  context: ReadyApplicationGenerationContext;
  salutation: string;
  regenerationInstruction: string | null;
  qualityFeedback: string[];
}): Promise<Result<CoverLetterAssetContent>> {
  if (!isAssetAiConfigured()) return Promise.resolve({ ok: false, message: UNCONFIGURED });
  return getAssetAiProvider()
    .generateStructured({
      ...structuredOutputRequest("coverLetterAsset"),
      messages: buildCoverLetterAssetMessages(input),
      parseOutput: (raw) => ({
        data: coverLetterAssetContentSchema.parse(raw),
        coercedFields: [],
      }),
    })
    .then((response) => ({ ok: true as const, data: response.data }))
    .catch((error) =>
      failure(
        "coverLetterAsset",
        error,
        "The cover letter could not be generated. Retry.",
      ),
    );
}

export function generateOutreachWithModel(
  input: OutreachGenerationInput,
): Promise<Result<ApplicationAssetContent>> {
  if (!isAssetAiConfigured()) return Promise.resolve({ ok: false, message: UNCONFIGURED });
  const messages = buildOutreachAssetMessages(input);
  const failed = (error: unknown) =>
    failure(
      "outreachAsset",
      error,
      "The outreach message could not be generated. Retry.",
    );
  if (input.type === "EMAIL") {
    return getAssetAiProvider()
      .generateStructured({
        ...structuredOutputRequest("outreachEmailAsset"),
        messages,
        parseOutput: (raw) => ({
          data: emailAssetContentSchema.parse(raw),
          coercedFields: [],
        }),
      })
      .then((response) => ({ ok: true as const, data: response.data }))
      .catch(failed);
  }
  if (input.type === "LINKEDIN_CONNECTION_NOTE") {
    return getAssetAiProvider()
      .generateStructured({
        ...structuredOutputRequest("outreachLinkedinNoteAsset"),
        messages,
        parseOutput: (raw) => ({
          data: linkedinNoteAssetContentSchema.parse(raw),
          coercedFields: [],
        }),
      })
      .then((response) => ({ ok: true as const, data: response.data }))
      .catch(failed);
  }
  return getAssetAiProvider()
    .generateStructured({
      ...structuredOutputRequest("outreachLinkedinInmailAsset"),
      messages,
      parseOutput: (raw) => ({
        data: linkedinInmailAssetContentSchema.parse(raw),
        coercedFields: [],
      }),
    })
    .then((response) => ({ ok: true as const, data: response.data }))
    .catch(failed);
}

export function validateAssetClaimsWithModel(input: {
  claims: AssetClaim[];
  sources: ApplicationGenerationContext["sources"];
}): Promise<Result<AssetClaimValidation>> {
  if (!isAssetAiConfigured()) return Promise.resolve({ ok: false, message: UNCONFIGURED });
  return getAssetValidationAiProvider()
    .generateStructured({
      ...structuredOutputRequest("applicationAssetClaimValidation"),
      messages: buildAssetClaimValidationMessages(input),
      parseOutput: (raw) => ({
        data: assetClaimValidationSchema.parse(raw),
        coercedFields: [],
      }),
    })
    .then((response) => ({ ok: true as const, data: response.data }))
    .catch((error) =>
      failure(
        "applicationAssetClaimValidation",
        error,
        "The asset claim check could not be completed. Retry.",
      ),
    );
}
