import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { getPersonaAiProvider, isPersonaAiConfigured } from "@/lib/ai";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { aiCallTracking } from "@/lib/usage/ai-call";
import {
  individualProfileSchema,
  type IndividualProfileDraft,
  type LinkedInExtracted,
} from "@/lib/contact-profile/contract";
import {
  buildIndividualProfileMessages,
  runGatedContactProfileSynthesize,
} from "@/lib/contact-profile/paid-inputs";

export async function generateIndividualProfileWithModel(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  contactName: string;
  extracted: LinkedInExtracted;
  profileText: string;
  roleName: string | null;
  roleNarrative: unknown;
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: IndividualProfileDraft; skipped: boolean }
  | { ok: false; message: string }
> {
  if (!isPersonaAiConfigured()) {
    return {
      ok: false,
      message: "Persona AI is not configured, so the individual profile could not be built.",
    };
  }
  try {
    const gated = await runGatedContactProfileSynthesize({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      contactName: input.contactName,
      extracted: input.extracted,
      profileText: input.profileText,
      roleName: input.roleName,
      roleNarrative: input.roleNarrative,
      callProvider: async () => {
        const response = await getPersonaAiProvider().generateStructured({
          ...structuredOutputRequest("contactIndividualProfile"),
          ...(input.usage ? aiCallTracking(input.usage) : {}),
          messages: buildIndividualProfileMessages({
            contactName: input.contactName,
            extracted: input.extracted,
            profileText: input.profileText,
            roleName: input.roleName,
            roleNarrative: input.roleNarrative,
          }),
          parseOutput: (raw) => ({
            data: individualProfileSchema.parse(raw),
            coercedFields: [],
          }),
        });
        return response.data;
      },
    });
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "contact_individual_profile_failed", message }),
    );
    return { ok: false, message };
  }
}
