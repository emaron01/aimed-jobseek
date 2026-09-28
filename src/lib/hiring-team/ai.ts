import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { runPaidStructuredCall } from "@/lib/ai/paid-call-gate";
import { getPersonaAiProvider, isPersonaAiConfigured } from "@/lib/ai";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { aiCallTracking } from "@/lib/usage/ai-call";
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
import {
  excerptsForFingerprint,
  hiringTeamIdentifyFingerprint,
  hiringTeamSynthesizeFingerprint,
  type HiringTeamPeerIdentity,
} from "@/lib/hiring-team/paid-inputs";
import {
  isPersonaDraftResultUsable,
  readHiringTeamIncompleteSynthesize,
  recordHiringTeamIncompleteSynthesize,
} from "@/lib/hiring-team/synthesize-outcome";
import { isRetryableProviderMessage } from "@/lib/application-jobs/types";
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

export class RetryableHiringTeamProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableHiringTeamProviderError";
  }
}

export async function identifyRolesWithModel(input: {
  evidence: EvidenceExcerpt[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: HiringTeamIdentificationResult; skipped: boolean }
  | { ok: false; message: string; skipped: boolean }
> {
  if (!isPersonaAiConfigured()) {
    return {
      ok: false,
      skipped: false,
      message: "Persona AI is not configured, so roles stay the ones read from the evidence.",
    };
  }
  const organizationId = input.usage?.organizationId;
  const campaignId = input.usage?.campaignId;
  if (!organizationId || !campaignId) {
    return {
      ok: false,
      skipped: false,
      message: "Hiring Team identification is missing organization or application scope.",
    };
  }
  const fingerprint = hiringTeamIdentifyFingerprint({
    evidence: excerptsForFingerprint(input.evidence),
  });
  try {
    const gated = await runPaidStructuredCall<HiringTeamIdentificationResult>({
      organizationId,
      operation: "HIRING_TEAM_IDENTIFY",
      subjectKey: campaignId,
      inputFingerprint: fingerprint,
      parseStored: (raw) => hiringTeamIdentificationSchema.parse(raw),
      isResultUsable: (stored) => Array.isArray(stored.roles),
      callProvider: async () => {
        const response = await getPersonaAiProvider().generateStructured({
          ...structuredOutputRequest("hiringTeamIdentification"),
          ...(input.usage ? aiCallTracking(input.usage) : {}),
          messages: buildHiringTeamIdentificationMessages({
            evidence: input.evidence,
          }),
          parseOutput: (raw) => ({
            data: hiringTeamIdentificationSchema.parse(raw),
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
      JSON.stringify({ event: "hiring_team_identification_failed", message }),
    );
    return {
      ok: false,
      skipped: false,
      message: "Hiring Team identification could not be read from the model. The evidence rules still identified the roles.",
    };
  }
}

export async function draftRoleWithModel(input: {
  organizationId: string;
  personaId: string;
  roleName: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  involvement: "DIRECT" | "INDIRECT";
  notes: string | null;
  excerpts: EvidenceExcerpt[];
  peers: PersonaDifferentiationInput[];
  peerIdentities: HiringTeamPeerIdentity[];
  rejection?: string[];
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; draft: PersonaAiDraft; skipped: boolean }
  | { ok: false; message: string; skipped: boolean }
> {
  if (!isPersonaAiConfigured()) {
    return { ok: false, skipped: false, message: SYNTHESIS_UNAVAILABLE };
  }
  const rejection = (input.rejection ?? []).map((item) => item.trim()).filter(Boolean);
  const userContext =
    input.notes || rejection.length > 0
      ? {
          ...(input.notes ? { notes: input.notes } : {}),
          ...(rejection.length > 0 ? { synthesisRejection: rejection } : {}),
        }
      : null;
  const fingerprint = hiringTeamSynthesizeFingerprint({
    roleName: input.roleName,
    likelyTitles: input.likelyTitles,
    department: input.department,
    whyThisRoleMatters: input.whyThisRoleMatters,
    involvement: input.involvement,
    notes: input.notes,
    rejection,
    excerpts: excerptsForFingerprint(input.excerpts),
    peers: input.peerIdentities,
  });
  try {
    const gated = await runPaidStructuredCall<PersonaAiDraft>({
      organizationId: input.organizationId,
      operation: "HIRING_TEAM_SYNTHESIZE",
      subjectKey: input.personaId,
      inputFingerprint: fingerprint,
      parseStored: (raw) => {
        const wrapped =
          raw && typeof raw === "object" && "personaDraft" in raw
            ? raw
            : { personaDraft: raw };
        return parsePersonaAiResponse(wrapped).data.personaDraft;
      },
      isResultUsable: isPersonaDraftResultUsable,
      callProvider: async () => {
        const response = await getPersonaAiProvider().generateStructured({
          ...structuredOutputRequest("personaSynthesis"),
          ...(input.usage ? aiCallTracking(input.usage) : {}),
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
        return response.data.personaDraft;
      },
    });
    return { ok: true, draft: gated.data, skipped: gated.skipped };
  } catch (error) {
    if (error instanceof RetryableHiringTeamProviderError) throw error;
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        event: "hiring_team_synthesis_failed",
        roleName: input.roleName,
        message,
      }),
    );
    if (isRetryableProviderMessage(message)) {
      throw new RetryableHiringTeamProviderError(message);
    }
    return {
      ok: false,
      skipped: false,
      message: `${SYNTHESIS_FAILED} ${message}`,
    };
  }
}

export type HiringTeamSynthesisResult =
  | { ok: true; narrative: HiringTeamNarrative; skipped: boolean }
  | {
      ok: false;
      status: "PARTIAL" | "FAILED" | "AWAITING_DETAILS";
      kind?: "INSUFFICIENT_INFORMATION" | "TEMPORARY_EXHAUSTED";
      message: string;
      skipped: boolean;
      reasons?: string[];
    };

/** Calls the model, assesses quality, regenerates once on fixable rejection. */
export async function synthesizeHiringTeamRole(input: {
  organizationId: string;
  personaId: string;
  roleName: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  involvement: Involvement;
  notes: string | null;
  excerpts: EvidenceExcerpt[];
  peers: PersonaDifferentiationInput[];
  peerIdentities: HiringTeamPeerIdentity[];
  jobLines: string[];
  evidenceText: string;
  isHiringManager?: boolean;
  usage?: AiCallUsageContext;
}): Promise<HiringTeamSynthesisResult> {
  if (!isPersonaAiConfigured()) {
    return {
      ok: false,
      status: "PARTIAL",
      skipped: false,
      message: SYNTHESIS_UNAVAILABLE,
    };
  }

  const baseFingerprint = hiringTeamSynthesizeFingerprint({
    roleName: input.roleName,
    likelyTitles: input.likelyTitles,
    department: input.department,
    whyThisRoleMatters: input.whyThisRoleMatters,
    involvement: input.involvement,
    notes: input.notes,
    rejection: [],
    excerpts: excerptsForFingerprint(input.excerpts),
    peers: input.peerIdentities,
  });
  const blocked = await readHiringTeamIncompleteSynthesize({
    organizationId: input.organizationId,
    personaId: input.personaId,
    inputFingerprint: baseFingerprint,
  });
  if (blocked?.blocksPaidCall) {
    return {
      ok: false,
      status: "AWAITING_DETAILS",
      kind: blocked.kind,
      skipped: true,
      message: SYNTHESIS_FAILED,
      reasons: blocked.reasons,
    };
  }

  let rejection: string[] = [];
  let lastMessage = SYNTHESIS_FAILED;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const model = await draftRoleWithModel({
      ...input,
      rejection,
      usage: input.usage,
    });
    if (!model.ok) {
      lastMessage = model.message;
      if (attempt === 0) continue;
      await recordHiringTeamIncompleteSynthesize({
        organizationId: input.organizationId,
        personaId: input.personaId,
        inputFingerprint: baseFingerprint,
        kind: "INSUFFICIENT_INFORMATION",
        reasons: [lastMessage],
      });
      return {
        ok: false,
        status: "AWAITING_DETAILS",
        kind: "INSUFFICIENT_INFORMATION",
        skipped: false,
        message: lastMessage,
      };
    }
    const fields = fieldsFromPersonaDraft(model.draft);
    if (input.isHiringManager) {
      fields.interviewStage = applyHiringManagerInterviewStage(
        fields.interviewStage,
        input.evidenceText,
      );
    }
    const quality = assessHiringTeamDraft({
      fields,
      jobLines: input.jobLines,
      involvement: input.involvement,
      roleName: input.roleName,
      likelyTitles: input.likelyTitles,
    });
    if (quality.ok) {
      return {
        ok: true,
        skipped: model.skipped,
        narrative: narrativeFromDraft({
          draft: model.draft,
          fields,
          evidenceText: input.evidenceText,
          involvement: input.involvement,
        }),
      };
    }
    if (attempt === 0) {
      rejection = quality.reasons;
      continue;
    }
    await recordHiringTeamIncompleteSynthesize({
      organizationId: input.organizationId,
      personaId: input.personaId,
      inputFingerprint: baseFingerprint,
      kind: "INSUFFICIENT_INFORMATION",
      reasons: quality.reasons,
    });
    return {
      ok: false,
      status: "AWAITING_DETAILS",
      kind: "INSUFFICIENT_INFORMATION",
      skipped: model.skipped,
      message: SYNTHESIS_FAILED,
      reasons: quality.reasons,
    };
  }
  return {
    ok: false,
    status: "FAILED",
    skipped: false,
    message: lastMessage,
  };
}
