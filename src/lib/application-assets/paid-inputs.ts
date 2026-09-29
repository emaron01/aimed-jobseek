/**
 * Caching Phase 2 batch 2: fingerprints for resume/cover plan, generation, claim validation.
 */
import {
  findPaidCallReceipt,
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import {
  ASSET_CLAIM_VALIDATION_PROMPT_VERSION,
  COVER_LETTER_ASSET_PROMPT_VERSION,
  RESUME_ASSET_PROMPT_VERSION,
  assetClaimValidationSchema,
  coverLetterAssetContentSchema,
  resumeAssetContentSchema,
  type AssetClaim,
  type AssetClaimValidation,
  type CoverLetterAssetContent,
  type ResumeAssetContent,
} from "@/lib/application-assets/contract";
import {
  PRESENTATION_PLAN_PROMPT_VERSION,
  presentationPlanSchema,
  type PresentationPlan,
} from "@/lib/application-assets/plan-contract";
import { buildPresentationPlanMessages } from "@/lib/application-assets/plan-prompt";
import {
  buildAssetClaimValidationMessages,
  buildCoverLetterAssetMessages,
  buildResumeAssetMessages,
} from "@/lib/application-assets/prompt";
import type {
  ApplicationGenerationContext,
  ReadyApplicationGenerationContext,
} from "@/lib/generation/context";
import { prisma } from "@/lib/prisma-client";

export const PRESENTATION_PLAN_OPERATION = "PRESENTATION_PLAN" as const;
export const RESUME_ASSET_OPERATION = "RESUME_ASSET" as const;
export const COVER_LETTER_ASSET_OPERATION = "COVER_LETTER_ASSET" as const;
export const ASSET_CLAIM_VALIDATION_OPERATION =
  "ASSET_CLAIM_VALIDATION" as const;

function messageFingerprintPayload(
  messages: Array<{ role: string; content: string }>,
) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function presentationPlanFingerprint(
  input: Parameters<typeof buildPresentationPlanMessages>[0],
): string {
  return fingerprintPaidCallInputs({
    promptVersion: PRESENTATION_PLAN_PROMPT_VERSION,
    schemaName:
      input.type === "RESUME"
        ? "resume_presentation_plan"
        : "cover_letter_presentation_plan",
    messages: messageFingerprintPayload(buildPresentationPlanMessages(input)),
  });
}

export function presentationPlanSubjectKey(
  campaignId: string,
  type: "RESUME" | "COVER_LETTER",
): string {
  return `${campaignId}:${type}`;
}

export function resumeAssetFingerprint(
  input: Parameters<typeof buildResumeAssetMessages>[0],
): string {
  return fingerprintPaidCallInputs({
    promptVersion: RESUME_ASSET_PROMPT_VERSION,
    schemaName: "application_resume",
    messages: messageFingerprintPayload(buildResumeAssetMessages(input)),
  });
}

export function coverLetterAssetFingerprint(
  input: Parameters<typeof buildCoverLetterAssetMessages>[0],
): string {
  return fingerprintPaidCallInputs({
    promptVersion: COVER_LETTER_ASSET_PROMPT_VERSION,
    schemaName: "application_cover_letter",
    messages: messageFingerprintPayload(buildCoverLetterAssetMessages(input)),
  });
}

export function assetClaimValidationFingerprint(input: {
  claims: AssetClaim[];
  sources: ApplicationGenerationContext["sources"];
  assetType: "RESUME" | "COVER_LETTER";
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: ASSET_CLAIM_VALIDATION_PROMPT_VERSION,
    schemaName: "application_asset_claim_validation",
    assetType: input.assetType,
    messages: messageFingerprintPayload(
      buildAssetClaimValidationMessages({
        claims: input.claims,
        sources: input.sources,
      }),
    ),
  });
}

export function assetClaimValidationSubjectKey(
  campaignId: string,
  assetType: "RESUME" | "COVER_LETTER",
): string {
  return `${campaignId}:${assetType}`;
}

export async function runGatedPresentationPlan(input: {
  organizationId: string;
  campaignId: string;
  planInput: Parameters<typeof buildPresentationPlanMessages>[0];
  callProvider: () => Promise<PresentationPlan>;
}): Promise<{ data: PresentationPlan; skipped: boolean }> {
  const fingerprint = presentationPlanFingerprint(input.planInput);
  return runPaidStructuredCall<PresentationPlan>({
    organizationId: input.organizationId,
    operation: PRESENTATION_PLAN_OPERATION,
    subjectKey: presentationPlanSubjectKey(input.campaignId, input.planInput.type),
    inputFingerprint: fingerprint,
    parseStored: (json) => presentationPlanSchema.parse(json),
    isResultUsable: (stored) =>
      Boolean(stored && stored.type === input.planInput.type),
    callProvider: input.callProvider,
  });
}

export async function runGatedResumeAsset(input: {
  organizationId: string;
  campaignId: string;
  resumeInput: Parameters<typeof buildResumeAssetMessages>[0];
  callProvider: () => Promise<ResumeAssetContent>;
}): Promise<{ data: ResumeAssetContent; skipped: boolean }> {
  const fingerprint = resumeAssetFingerprint(input.resumeInput);
  return runPaidStructuredCall<ResumeAssetContent>({
    organizationId: input.organizationId,
    operation: RESUME_ASSET_OPERATION,
    subjectKey: input.campaignId,
    inputFingerprint: fingerprint,
    parseStored: (json) => resumeAssetContentSchema.parse(json),
    isResultUsable: (stored) => stored?.type === "RESUME",
    callProvider: input.callProvider,
  });
}

export async function runGatedCoverLetterAsset(input: {
  organizationId: string;
  campaignId: string;
  coverInput: Parameters<typeof buildCoverLetterAssetMessages>[0];
  callProvider: () => Promise<CoverLetterAssetContent>;
}): Promise<{ data: CoverLetterAssetContent; skipped: boolean }> {
  const fingerprint = coverLetterAssetFingerprint(input.coverInput);
  return runPaidStructuredCall<CoverLetterAssetContent>({
    organizationId: input.organizationId,
    operation: COVER_LETTER_ASSET_OPERATION,
    subjectKey: input.campaignId,
    inputFingerprint: fingerprint,
    parseStored: (json) => coverLetterAssetContentSchema.parse(json),
    isResultUsable: (stored) => stored?.type === "COVER_LETTER",
    callProvider: input.callProvider,
  });
}

export async function runGatedAssetClaimValidation(input: {
  organizationId: string;
  campaignId: string;
  assetType: "RESUME" | "COVER_LETTER";
  claims: AssetClaim[];
  sources: ApplicationGenerationContext["sources"];
  callProvider: () => Promise<AssetClaimValidation>;
}): Promise<{ data: AssetClaimValidation; skipped: boolean }> {
  const fingerprint = assetClaimValidationFingerprint({
    claims: input.claims,
    sources: input.sources,
    assetType: input.assetType,
  });
  return runPaidStructuredCall<AssetClaimValidation>({
    organizationId: input.organizationId,
    operation: ASSET_CLAIM_VALIDATION_OPERATION,
    subjectKey: assetClaimValidationSubjectKey(input.campaignId, input.assetType),
    inputFingerprint: fingerprint,
    parseStored: (json) => assetClaimValidationSchema.parse(json),
    isResultUsable: (stored) => Array.isArray(stored?.violations),
    callProvider: input.callProvider,
  });
}

/** True when Generate/Regenerate would not call the asset model (receipt + usable asset). */
export async function applicationAssetGenerationUnchanged(input: {
  organizationId: string;
  campaignId: string;
  type: "RESUME" | "COVER_LETTER";
  fingerprint: string;
}): Promise<boolean> {
  const operation =
    input.type === "RESUME" ? RESUME_ASSET_OPERATION : COVER_LETTER_ASSET_OPERATION;
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation,
    subjectKey: input.campaignId,
  });
  if (!receipt || receipt.inputHash !== input.fingerprint) return false;
  const stored = receipt.resultJson;
  if (
    !stored ||
    typeof stored !== "object" ||
    (stored as { type?: string }).type !== input.type
  ) {
    return false;
  }
  const latest = await prisma.applicationAsset.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: input.type,
    },
    orderBy: { version: "desc" },
    select: { id: true, contentJson: true },
  });
  if (!latest) return false;
  const content = latest.contentJson;
  return (
    Boolean(content) &&
    typeof content === "object" &&
    (content as { type?: string }).type === input.type
  );
}

export type AssetGenerationFingerprintInput = {
  context: ReadyApplicationGenerationContext;
  type: "RESUME" | "COVER_LETTER";
  hiddenRoleIds: string[];
  condensedRoleIds: string[];
  salutation: string;
  regenerationInstruction: string | null;
  qualityFeedback?: string[];
};

export function assetGenerationFingerprint(
  input: AssetGenerationFingerprintInput,
): string {
  if (input.type === "RESUME") {
    return resumeAssetFingerprint({
      context: input.context,
      hiddenRoleIds: input.hiddenRoleIds,
      condensedRoleIds: input.condensedRoleIds,
      regenerationInstruction: input.regenerationInstruction,
      qualityFeedback: input.qualityFeedback ?? [],
    });
  }
  return coverLetterAssetFingerprint({
    context: input.context,
    salutation: input.salutation,
    regenerationInstruction: input.regenerationInstruction,
    qualityFeedback: input.qualityFeedback ?? [],
  });
}
