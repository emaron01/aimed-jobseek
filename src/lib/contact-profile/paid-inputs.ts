/**
 * Caching Phase 2 batch 3: fingerprints for contact profile extract + synthesize.
 */
import type { AiMessage } from "@/lib/ai/types";
import {
  findPaidCallReceipt,
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import {
  CONTACT_PROFILE_PROMPT_VERSION,
  individualProfileSchema,
  linkedInExtractedSchema,
  type IndividualProfileDraft,
  type LinkedInExtracted,
} from "@/lib/contact-profile/contract";
import { CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS } from "@/lib/prompt-content/contact-individual-profile";
import { INTERVIEWER_EXTRACTION_INSTRUCTIONS } from "@/lib/prompt-content/interviewer-extraction";
import { prisma } from "@/lib/prisma-client";

export const CONTACT_PROFILE_EXTRACT_OPERATION =
  "CONTACT_PROFILE_EXTRACT" as const;
export const CONTACT_PROFILE_SYNTHESIZE_OPERATION =
  "CONTACT_PROFILE_SYNTHESIZE" as const;

function messageFingerprintPayload(messages: AiMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function contactProfileSubjectKey(
  campaignId: string,
  contactId: string,
): string {
  return `${campaignId}:${contactId}`;
}

export function buildInterviewerExtractionMessages(input: {
  pastedText: string;
  contactName: string;
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${CONTACT_PROFILE_PROMPT_VERSION}\n\n${INTERVIEWER_EXTRACTION_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        personName: input.contactName,
        pastedText: input.pastedText.trim(),
      }),
    },
  ];
}

export function buildIndividualProfileMessages(input: {
  contactName: string;
  extracted: LinkedInExtracted;
  profileText: string;
  roleName: string | null;
  roleNarrative: unknown;
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${CONTACT_PROFILE_PROMPT_VERSION}\n\n${CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        contactName: input.contactName,
        extracted: input.extracted,
        hiringTeamRole: input.roleName,
        rolePersona: input.roleNarrative,
        pastedProfileText: input.profileText,
      }),
    },
  ];
}

export function contactProfileExtractFingerprint(input: {
  pastedText: string;
  contactName: string;
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: CONTACT_PROFILE_PROMPT_VERSION,
    schemaName: "interviewer_extraction",
    messages: messageFingerprintPayload(
      buildInterviewerExtractionMessages(input),
    ),
  });
}

export function contactProfileSynthesizeFingerprint(input: {
  contactName: string;
  extracted: LinkedInExtracted;
  profileText: string;
  roleName: string | null;
  roleNarrative: unknown;
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: CONTACT_PROFILE_PROMPT_VERSION,
    schemaName: "contact_individual_profile",
    messages: messageFingerprintPayload(buildIndividualProfileMessages(input)),
  });
}

export async function runGatedContactProfileExtract(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  pastedText: string;
  contactName: string;
  callProvider: () => Promise<LinkedInExtracted>;
}): Promise<{ data: LinkedInExtracted; skipped: boolean }> {
  const fingerprint = contactProfileExtractFingerprint({
    pastedText: input.pastedText,
    contactName: input.contactName,
  });
  return runPaidStructuredCall({
    organizationId: input.organizationId,
    operation: CONTACT_PROFILE_EXTRACT_OPERATION,
    subjectKey: contactProfileSubjectKey(input.campaignId, input.contactId),
    inputFingerprint: fingerprint,
    parseStored: (json) => linkedInExtractedSchema.parse(json),
    isResultUsable: (stored) => Boolean(stored && typeof stored === "object"),
    callProvider: input.callProvider,
  });
}

export async function runGatedContactProfileSynthesize(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  contactName: string;
  extracted: LinkedInExtracted;
  profileText: string;
  roleName: string | null;
  roleNarrative: unknown;
  callProvider: () => Promise<IndividualProfileDraft>;
}): Promise<{ data: IndividualProfileDraft; skipped: boolean }> {
  const fingerprint = contactProfileSynthesizeFingerprint({
    contactName: input.contactName,
    extracted: input.extracted,
    profileText: input.profileText,
    roleName: input.roleName,
    roleNarrative: input.roleNarrative,
  });
  return runPaidStructuredCall({
    organizationId: input.organizationId,
    operation: CONTACT_PROFILE_SYNTHESIZE_OPERATION,
    subjectKey: contactProfileSubjectKey(input.campaignId, input.contactId),
    inputFingerprint: fingerprint,
    parseStored: (json) => individualProfileSchema.parse(json),
    isResultUsable: (stored) => Array.isArray(stored?.caresAbout),
    callProvider: input.callProvider,
  });
}

/** True when extract + synthesize receipts match and a completed profile exists. */
export async function contactProfileBuildUnchanged(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  pastedText: string;
  contactName: string;
  extracted: LinkedInExtracted;
  roleName: string | null;
  roleNarrative: unknown;
}): Promise<boolean> {
  const subjectKey = contactProfileSubjectKey(input.campaignId, input.contactId);
  const extractFp = contactProfileExtractFingerprint({
    pastedText: input.pastedText,
    contactName: input.contactName,
  });
  const extractReceipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: CONTACT_PROFILE_EXTRACT_OPERATION,
    subjectKey,
  });
  if (!extractReceipt || extractReceipt.inputHash !== extractFp) return false;

  const synthesizeFp = contactProfileSynthesizeFingerprint({
    contactName: input.contactName,
    extracted: input.extracted,
    profileText: input.pastedText,
    roleName: input.roleName,
    roleNarrative: input.roleNarrative,
  });
  const synthesizeReceipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: CONTACT_PROFILE_SYNTHESIZE_OPERATION,
    subjectKey,
  });
  if (!synthesizeReceipt || synthesizeReceipt.inputHash !== synthesizeFp) {
    return false;
  }

  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: {
      individualProfileStatus: true,
      individualProfileJson: true,
    },
  });
  return (
    membership?.individualProfileStatus === "COMPLETED" &&
    membership.individualProfileJson != null
  );
}
