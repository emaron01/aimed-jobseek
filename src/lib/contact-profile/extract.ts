import { getPersonaAiProvider, isPersonaAiConfigured } from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext } from "@/lib/ai/types";
import {
  LINKEDIN_PASTE_SOURCE,
  interviewerExtractionSchema,
  linkedInExtractedSchema,
  type InterviewerExtractionResult,
  type LinkedInExtracted,
} from "@/lib/contact-profile/contract";
import {
  buildInterviewerExtractionMessages,
  runGatedContactProfileExtract,
} from "@/lib/contact-profile/paid-inputs";
import { aiCallTracking } from "@/lib/usage/ai-call";

const UNCONFIGURED =
  "Persona AI is not configured, so the pasted profile could not be read.";

function fact(text: string | null | undefined) {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) return null;
  return {
    text: value,
    kind: "FACT" as const,
    provenance: [{ sourceId: LINKEDIN_PASTE_SOURCE }],
  };
}

function facts(values: string[]) {
  return values
    .map((value) => fact(value))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

/** Shapes the model result into the stored extract. Fields the text lacked stay empty. */
export function interviewerExtractFromModel(
  result: InterviewerExtractionResult,
): LinkedInExtracted {
  return linkedInExtractedSchema.parse({
    headline: fact(result.headline),
    about: fact(result.about),
    currentTitle: fact(result.currentTitle),
    currentEmployer: fact(result.currentEmployer),
    currentTenure: fact(result.currentTenure),
    workExperience: result.workExperience
      .map((role) => ({
        employer: fact(role.employer),
        title: fact(role.title),
        dates: fact(role.dates),
        location: fact(role.location),
        description: fact(role.description),
        accomplishments: facts(role.accomplishments),
      }))
      .filter(
        (role) =>
          role.employer ||
          role.title ||
          role.description ||
          role.accomplishments.length > 0,
      ),
    priorRoles: [],
    education: facts(result.education),
    certifications: facts(result.certifications),
    skills: facts(result.skills),
    statedFocus: facts(result.statedFocus),
  });
}

/**
 * Reads whatever the seeker pasted about one interviewer. Works on a copied
 * LinkedIn page, a bio, a team page, or notes; nothing depends on headings.
 */
export async function extractInterviewerFacts(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  pastedText: string;
  contactName: string;
  usage?: AiCallUsageContext;
}): Promise<
  { ok: true; data: LinkedInExtracted; skipped: boolean } | { ok: false; message: string }
> {
  const text = input.pastedText.trim();
  if (!text) {
    return { ok: false, message: "There was no pasted text to read." };
  }
  if (!isPersonaAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  try {
    const gated = await runGatedContactProfileExtract({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      pastedText: text,
      contactName: input.contactName,
      callProvider: async () => {
        const response = await getPersonaAiProvider().generateStructured({
          ...structuredOutputRequest("interviewerExtraction"),
          ...(input.usage ? aiCallTracking(input.usage) : {}),
          messages: buildInterviewerExtractionMessages({
            pastedText: text,
            contactName: input.contactName,
          }),
          parseOutput: (raw) => ({
            data: interviewerExtractionSchema.parse(raw),
            coercedFields: [],
          }),
        });
        return interviewerExtractFromModel(response.data);
      },
    });
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "interviewer_extraction_failed", message }),
    );
    return { ok: false, message };
  }
}
