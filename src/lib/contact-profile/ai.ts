import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { getPersonaAiProvider, isPersonaAiConfigured } from "@/lib/ai";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { aiCallTracking } from "@/lib/usage/ai-call";
import {
  CONTACT_PROFILE_PROMPT_VERSION,
  individualProfileSchema,
  type IndividualProfileDraft,
  type LinkedInExtracted,
} from "@/lib/contact-profile/contract";
import { CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS } from "@/lib/prompt-content/contact-individual-profile";

export async function generateIndividualProfileWithModel(input: {
  contactName: string;
  extracted: LinkedInExtracted;
  roleName: string | null;
  roleNarrative: unknown;
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: IndividualProfileDraft }
  | { ok: false; message: string }
> {
  if (!isPersonaAiConfigured()) {
    return {
      ok: false,
      message: "Persona AI is not configured, so the individual profile could not be built.",
    };
  }
  try {
    const response = await getPersonaAiProvider().generateStructured({
      ...structuredOutputRequest("contactIndividualProfile"),
      ...(input.usage ? aiCallTracking(input.usage) : {}),
      messages: [
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
          }),
        },
      ],
      parseOutput: (raw) => ({
        data: individualProfileSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "contact_individual_profile_failed", message }),
    );
    return { ok: false, message };
  }
}
