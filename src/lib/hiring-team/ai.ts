import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { getPersonaAiProvider, isPersonaAiConfigured } from "@/lib/ai";
import {
  hiringTeamIdentificationSchema,
  type HiringTeamIdentificationResult,
} from "@/lib/hiring-team/contract";
import { buildHiringTeamIdentificationMessages } from "@/lib/hiring-team/prompt";
import type { PersonaDifferentiationInput } from "@/lib/persona/persona-differentiation";
import {
  parsePersonaAiResponse,
  type PersonaAiDraft,
} from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";

export async function identifyRolesWithModel(input: {
  evidence: EvidenceExcerpt[];
}): Promise<
  | { ok: true; data: HiringTeamIdentificationResult }
  | { ok: false; message: string }
> {
  if (!isPersonaAiConfigured()) {
    return {
      ok: false,
      message: "Persona AI is not configured, so roles stay the ones read from the evidence.",
    };
  }
  try {
    const response = await getPersonaAiProvider().generateStructured({
      ...structuredOutputRequest("hiringTeamIdentification"),
      messages: buildHiringTeamIdentificationMessages({
        evidence: input.evidence,
      }),
      parseOutput: (raw) => ({
        data: hiringTeamIdentificationSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "hiring_team_identification_failed", message }),
    );
    return {
      ok: false,
      message: "Hiring Team identification could not be read from the model. The evidence rules still identified the roles.",
    };
  }
}

export async function draftRoleWithModel(input: {
  roleName: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  involvement: "DIRECT" | "INDIRECT";
  notes: string | null;
  excerpts: EvidenceExcerpt[];
  peers: PersonaDifferentiationInput[];
}): Promise<{ ok: true; draft: PersonaAiDraft } | { ok: false; message: string }> {
  if (!isPersonaAiConfigured()) {
    return {
      ok: false,
      message: "Persona AI is not configured, so this role keeps the evidence draft.",
    };
  }
  try {
    const response = await getPersonaAiProvider().generateStructured({
      ...structuredOutputRequest("personaSynthesis"),
      messages: buildPersonaSynthesisMessages({
        productName: input.roleName,
        productSnapshot: {
          roleName: input.roleName,
          likelyTitles: input.likelyTitles,
          department: input.department,
          whyThisRoleMatters: input.whyThisRoleMatters,
          involvement: input.involvement,
          notes: input.notes,
        },
        productMessaging: null,
        buyerRole: {
          suggestionKey: input.roleName,
          name: input.roleName,
          likelyTitles: input.likelyTitles,
          departmentFunction: input.department,
          whyThisRoleMatters: input.whyThisRoleMatters,
          confidence: "MEDIUM",
          evidenceRefs: [],
        },
        userContext: input.notes ? { notes: input.notes } : null,
        productEvidence: input.excerpts,
        personaEvidence: [],
        icpContext: null,
        existingApprovedPersonas: input.peers,
      }),
      parseOutput: parsePersonaAiResponse,
    });
    return { ok: true, draft: response.data.personaDraft };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        event: "hiring_team_synthesis_failed",
        roleName: input.roleName,
        message,
      }),
    );
    return {
      ok: false,
      message: "This Hiring Team role could not be drafted by the model. The evidence draft is still here.",
    };
  }
}
