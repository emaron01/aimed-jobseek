/**
 * Caching Phase 2 batch 3: fingerprints for outreach facts, generation, claim validation.
 */
import {
  findPaidCallReceipt,
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import {
  ASSET_CLAIM_VALIDATION_PROMPT_VERSION,
  assetClaimValidationSchema,
  emailAssetContentSchema,
  linkedinInmailAssetContentSchema,
  linkedinNoteAssetContentSchema,
  type ApplicationAssetContent,
  type AssetClaim,
  type AssetClaimValidation,
} from "@/lib/application-assets/contract";
import type { OutreachGenerationInput } from "@/lib/application-assets/outreach-types";
import {
  buildAssetClaimValidationMessages,
  buildOutreachAssetMessages,
  buildOutreachFactSelectionMessages,
  outreachFactCandidates,
  type OutreachFactCandidate,
} from "@/lib/application-assets/prompt";
import type { ApplicationGenerationContext } from "@/lib/generation/context";
import { emailFactSelectionResultSchema } from "@/lib/email-generation/fact-selection-contract";
import { outreachGroupKey } from "@/lib/product-config";
import { prisma } from "@/lib/prisma-client";

export const OUTREACH_FACT_SELECTION_OPERATION =
  "OUTREACH_FACT_SELECTION" as const;
export const OUTREACH_ASSET_OPERATION = "OUTREACH_ASSET" as const;
export const OUTREACH_CLAIM_VALIDATION_OPERATION =
  "OUTREACH_CLAIM_VALIDATION" as const;

function messageFingerprintPayload(
  messages: Array<{ role: string; content: string }>,
) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function outreachSubjectKey(input: {
  campaignId: string;
  type: OutreachGenerationInput["type"];
  personaId: string | null;
  contactId: string | null;
  purpose: OutreachGenerationInput["purpose"];
  interviewStageId?: string | null;
}): string {
  return `${input.campaignId}:${outreachGroupKey({
    type: input.type,
    personaId: input.personaId,
    contactId: input.contactId,
    purpose: input.purpose,
    interviewStageId: input.interviewStageId,
  })}`;
}

export function outreachFactSelectionSubjectKey(input: {
  campaignId: string;
  personaId: string | null;
  contactId: string | null;
  purpose: OutreachGenerationInput["purpose"];
}): string {
  return [
    input.campaignId,
    input.personaId ?? "none",
    input.contactId ?? "none",
    input.purpose,
  ].join(":");
}

export function outreachFactSelectionFingerprint(input: {
  context: OutreachGenerationInput["context"];
  purpose: OutreachGenerationInput["purpose"];
  candidates: OutreachFactCandidate[];
}): string {
  return fingerprintPaidCallInputs({
    schemaName: "email_company_fact_selection",
    messages: messageFingerprintPayload(
      buildOutreachFactSelectionMessages({
        context: input.context,
        purpose: input.purpose,
        candidates: input.candidates,
      }),
    ),
  });
}

export function outreachAssetFingerprint(
  input: OutreachGenerationInput & { selectedFacts: OutreachFactCandidate[] },
): string {
  const schemaName =
    input.type === "EMAIL"
      ? "application_outreach_email"
      : input.type === "LINKEDIN_CONNECTION_NOTE"
        ? "application_outreach_linkedin_note"
        : "application_outreach_linkedin_inmail";
  return fingerprintPaidCallInputs({
    schemaName,
    messages: messageFingerprintPayload(buildOutreachAssetMessages(input)),
  });
}

export function outreachClaimValidationFingerprint(input: {
  claims: AssetClaim[];
  sources: ApplicationGenerationContext["sources"];
  assetType: OutreachGenerationInput["type"];
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

export async function runGatedOutreachFactSelection(input: {
  organizationId: string;
  campaignId: string;
  personaId: string | null;
  contactId: string | null;
  purpose: OutreachGenerationInput["purpose"];
  context: OutreachGenerationInput["context"];
  candidates: OutreachFactCandidate[];
  callProvider: () => Promise<{
    noneRelevant: boolean;
    selected: Array<{ candidateId: string }>;
  }>;
}): Promise<{ data: OutreachFactCandidate[]; skipped: boolean }> {
  const fingerprint = outreachFactSelectionFingerprint({
    context: input.context,
    purpose: input.purpose,
    candidates: input.candidates,
  });
  const subjectKey = outreachFactSelectionSubjectKey({
    campaignId: input.campaignId,
    personaId: input.personaId,
    contactId: input.contactId,
    purpose: input.purpose,
  });
  const byId = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const gated = await runPaidStructuredCall({
    organizationId: input.organizationId,
    operation: OUTREACH_FACT_SELECTION_OPERATION,
    subjectKey,
    inputFingerprint: fingerprint,
    parseStored: (json) => emailFactSelectionResultSchema.parse(json),
    isResultUsable: (stored) =>
      typeof stored?.noneRelevant === "boolean" &&
      Array.isArray(stored?.selected),
    callProvider: input.callProvider,
  });
  if (gated.data.noneRelevant) {
    return { data: [], skipped: gated.skipped };
  }
  return {
    data: gated.data.selected
      .map((row) => byId.get(row.candidateId))
      .filter((row): row is OutreachFactCandidate => Boolean(row)),
    skipped: gated.skipped,
  };
}

function parseOutreachAssetContent(json: unknown): ApplicationAssetContent {
  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    "type" in json
  ) {
    const type = (json as { type?: string }).type;
    if (type === "EMAIL") return emailAssetContentSchema.parse(json);
    if (type === "LINKEDIN_CONNECTION_NOTE") {
      return linkedinNoteAssetContentSchema.parse(json);
    }
    if (type === "LINKEDIN_INMAIL") {
      return linkedinInmailAssetContentSchema.parse(json);
    }
  }
  throw new Error("Stored outreach asset is not usable.");
}

export async function runGatedOutreachAsset(input: {
  organizationId: string;
  campaignId: string;
  personaId: string | null;
  contactId: string | null;
  interviewStageId?: string | null;
  generationInput: OutreachGenerationInput & {
    selectedFacts: OutreachFactCandidate[];
  };
  callProvider: () => Promise<ApplicationAssetContent>;
}): Promise<{ data: ApplicationAssetContent; skipped: boolean }> {
  const fingerprint = outreachAssetFingerprint(input.generationInput);
  return runPaidStructuredCall({
    organizationId: input.organizationId,
    operation: OUTREACH_ASSET_OPERATION,
    subjectKey: outreachSubjectKey({
      campaignId: input.campaignId,
      type: input.generationInput.type,
      personaId: input.personaId,
      contactId: input.contactId,
      purpose: input.generationInput.purpose,
      interviewStageId: input.interviewStageId,
    }),
    inputFingerprint: fingerprint,
    parseStored: parseOutreachAssetContent,
    isResultUsable: (stored) => stored?.type === input.generationInput.type,
    callProvider: input.callProvider,
  });
}

export async function runGatedOutreachClaimValidation(input: {
  organizationId: string;
  campaignId: string;
  personaId: string | null;
  contactId: string | null;
  interviewStageId?: string | null;
  assetType: OutreachGenerationInput["type"];
  purpose: OutreachGenerationInput["purpose"];
  claims: AssetClaim[];
  sources: ApplicationGenerationContext["sources"];
  callProvider: () => Promise<AssetClaimValidation>;
}): Promise<{ data: AssetClaimValidation; skipped: boolean }> {
  const fingerprint = outreachClaimValidationFingerprint({
    claims: input.claims,
    sources: input.sources,
    assetType: input.assetType,
  });
  return runPaidStructuredCall({
    organizationId: input.organizationId,
    operation: OUTREACH_CLAIM_VALIDATION_OPERATION,
    subjectKey: outreachSubjectKey({
      campaignId: input.campaignId,
      type: input.assetType,
      personaId: input.personaId,
      contactId: input.contactId,
      purpose: input.purpose,
      interviewStageId: input.interviewStageId,
    }),
    inputFingerprint: fingerprint,
    parseStored: (json) => assetClaimValidationSchema.parse(json),
    isResultUsable: (stored) => Array.isArray(stored?.violations),
    callProvider: input.callProvider,
  });
}

/** True when Generate/Regenerate would not call the outreach generation model. */
export async function outreachAssetGenerationUnchanged(input: {
  organizationId: string;
  campaignId: string;
  type: OutreachGenerationInput["type"];
  personaId: string | null;
  contactId: string | null;
  purpose: OutreachGenerationInput["purpose"];
  interviewStageId?: string | null;
  fingerprint: string;
}): Promise<boolean> {
  const subjectKey = outreachSubjectKey(input);
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: OUTREACH_ASSET_OPERATION,
    subjectKey,
  });
  if (!receipt || receipt.inputHash !== input.fingerprint) return false;
  try {
    const stored = parseOutreachAssetContent(receipt.resultJson);
    if (stored.type !== input.type) return false;
  } catch {
    return false;
  }
  const groupKey = outreachGroupKey({
    type: input.type,
    personaId: input.personaId,
    contactId: input.contactId,
    purpose: input.purpose,
    interviewStageId: input.interviewStageId,
  });
  const latest = await prisma.applicationAsset.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      groupKey,
    },
    orderBy: { version: "desc" },
    select: { id: true, contentJson: true },
  });
  if (!latest) return false;
  try {
    const content = parseOutreachAssetContent(latest.contentJson);
    return content.type === input.type;
  } catch {
    return false;
  }
}

export function outreachFactCandidatesForFingerprint(
  context: OutreachGenerationInput["context"],
): OutreachFactCandidate[] {
  return outreachFactCandidates(context);
}

/** Returns selected facts when the fact-selection receipt matches; null if a paid call would run. */
export async function selectedOutreachFactsIfUnchanged(input: {
  organizationId: string;
  campaignId: string;
  personaId: string | null;
  contactId: string | null;
  purpose: OutreachGenerationInput["purpose"];
  context: OutreachGenerationInput["context"];
}): Promise<OutreachFactCandidate[] | null> {
  const candidates = outreachFactCandidates(input.context);
  if (candidates.length === 0) return [];
  const fingerprint = outreachFactSelectionFingerprint({
    context: input.context,
    purpose: input.purpose,
    candidates,
  });
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: OUTREACH_FACT_SELECTION_OPERATION,
    subjectKey: outreachFactSelectionSubjectKey(input),
  });
  if (!receipt || receipt.inputHash !== fingerprint) return null;
  try {
    const stored = emailFactSelectionResultSchema.parse(receipt.resultJson);
    if (stored.noneRelevant) return [];
    const byId = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate]),
    );
    return stored.selected
      .map((row) => byId.get(row.candidateId))
      .filter((row): row is OutreachFactCandidate => Boolean(row));
  } catch {
    return null;
  }
}
