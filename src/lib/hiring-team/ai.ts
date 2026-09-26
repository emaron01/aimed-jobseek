import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { getPersonaAiProvider, isPersonaAiConfigured } from "@/lib/ai";
import {
  hiringTeamIdentificationSchema,
  type HiringTeamIdentificationResult,
} from "@/lib/hiring-team/contract";
import {
  applyHiringManagerInterviewStage,
  assessHiringTeamDraft,
  fieldsFromPersonaDraft,
  narrativeFromDraft,
  type HiringTeamNarrative,
} from "@/lib/hiring-team/draft-quality";
import { buildHiringTeamIdentificationMessages } from "@/lib/hiring-team/prompt";
import type { Involvement } from "@/lib/hiring-team/identify";
import type { PersonaDifferentiationInput } from "@/lib/persona/persona-differentiation";
import {
  parsePersonaAiResponse,
  type PersonaAiDraft,
} from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";

const SYNTHESIS_UNAVAILABLE =
  "Persona synthesis is not configured. This role shows its identification only. Retry after Persona AI is configured.";
const SYNTHESIS_FAILED =
  "Persona synthesis did not produce a specific draft. This role shows its identification only.";

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
  rejection?: string[];
}): Promise<{ ok: true; draft: PersonaAiDraft } | { ok: false; message: string }> {
  if (!isPersonaAiConfigured()) {
    return { ok: false, message: SYNTHESIS_UNAVAILABLE };
  }
  const rejection = (input.rejection ?? []).map((item) => item.trim()).filter(Boolean);
  const userContext =
    input.notes || rejection.length > 0
      ? {
          ...(input.notes ? { notes: input.notes } : {}),
          ...(rejection.length > 0 ? { synthesisRejection: rejection } : {}),
        }
      : null;
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
        userContext,
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
      message: `${SYNTHESIS_FAILED} ${message}`,
    };
  }
}

export type HiringTeamSynthesisResult =
  | { ok: true; narrative: HiringTeamNarrative }
  | { ok: false; status: "PARTIAL" | "FAILED"; message: string };

/** Calls the model, retries restated job text once, then keeps the last parseable draft. */
export async function synthesizeHiringTeamRole(input: {
  roleName: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  involvement: Involvement;
  notes: string | null;
  excerpts: EvidenceExcerpt[];
  peers: PersonaDifferentiationInput[];
  jobLines: string[];
  evidenceText: string;
  isHiringManager?: boolean;
}): Promise<HiringTeamSynthesisResult> {
  if (!isPersonaAiConfigured()) {
    return { ok: false, status: "PARTIAL", message: SYNTHESIS_UNAVAILABLE };
  }
  let rejection: string[] = [];
  let lastParseable: {
    draft: PersonaAiDraft;
    fields: ReturnType<typeof fieldsFromPersonaDraft>;
  } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const model = await draftRoleWithModel({ ...input, rejection });
    if (!model.ok) {
      if (lastParseable) break;
      return { ok: false, status: "FAILED", message: model.message };
    }
    const fields = fieldsFromPersonaDraft(model.draft);
    if (input.isHiringManager) {
      fields.interviewStage = applyHiringManagerInterviewStage(
        fields.interviewStage,
        input.evidenceText,
      );
    }
    lastParseable = { draft: model.draft, fields };
    const assessment = assessHiringTeamDraft({
      fields,
      jobLines: input.jobLines,
      involvement: input.involvement,
      roleName: input.roleName,
      likelyTitles: input.likelyTitles,
    });
    if (assessment.ok) {
      return {
        ok: true,
        narrative: narrativeFromDraft({
          draft: model.draft,
          fields,
          evidenceText: input.evidenceText,
          involvement: input.involvement,
        }),
      };
    }
    rejection = assessment.reasons;
  }
  if (lastParseable) {
    return {
      ok: true,
      narrative: narrativeFromDraft({
        draft: lastParseable.draft,
        fields: lastParseable.fields,
        evidenceText: input.evidenceText,
        involvement: input.involvement,
      }),
    };
  }
  return {
    ok: false,
    status: "FAILED",
    message: SYNTHESIS_FAILED,
  };
}
