import type { QualificationBucket, ScoreLabel } from "@prisma/client";
import {
  coerceIsMandatory,
  normalizeIcpCriterionTier,
} from "@/lib/criteria/tier";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import type { CriterionEvidenceAssessment } from "@/lib/criteria/targeted-search-eval";
import {
  icpCriterionTier,
  icpQualificationToBucket,
  readIcpQualification,
  type IcpQualification,
} from "@/lib/scoring/icp-qualification";
import { vocab } from "@/lib/product-config";

/** Active workflow buckets — POOR_FIT remains in the schema for legacy rows only. */
export const QUALIFICATION_BUCKETS = [
  "GOOD",
  "NEEDS_REVIEW",
  "EXCLUDED",
] as const satisfies readonly QualificationBucket[];

/**
 * Rep-facing labels: what to do, not internal bucket names.
 * Schema values stay GOOD / NEEDS_REVIEW / EXCLUDED.
 */
export const QUALIFICATION_BUCKET_LABELS: Record<QualificationBucket, string> =
  {
    GOOD: "Ready to include",
    NEEDS_REVIEW: "Check before including",
    POOR_FIT: "Check before including",
    EXCLUDED: "Left out",
  };

/** Exclusion review panel — app removed contacts; rep decides whether to put them back. */
export const EXCLUSION_REVIEW_COPY = {
  addBack: "Add back",
  addAllBack: "Add all back",
  keepExcluded: "Keep excluded",
  panelHeading: (contactCount: number) =>
    contactCount === 1
      ? `We left 1 ${vocab.contact.singular} out of this ${vocab.campaign.singular}`
      : `We left ${contactCount} ${vocab.contact.plural} out of this ${vocab.campaign.singular}`,
  panelSubheading:
    "Review each group below. Add anyone back if you disagree — otherwise leave them out.",
  groupReason: (criterionName: string) =>
    `Why we left them out: ${criterionName}`,
} as const;


export type PersonaMatchStatus = "MATCHED" | "EXCLUDED" | "UNKNOWN";

export type DeterministicQualificationSkipReason =
  | "MANDATORY_ICP_FAIL"
  | "CONFIRMED_PERSONA_EXCLUSION"
  | "NO_TITLE_FIT"
  | "MULTI_PERSONA_MATCH"
  | "UNRESOLVED_MANDATORY"
  | "SINGLE_PERSONA_MATCH";

export type DeterministicQualificationResult = {
  bucket: QualificationBucket;
  reason: string;
  aiSkipReason: DeterministicQualificationSkipReason;
  matchedPersonaId: string | null;
  personaMatchStatus: PersonaMatchStatus;
};

export function readQualificationBucket(
  assessmentData: unknown,
): QualificationBucket | null {
  if (!assessmentData || typeof assessmentData !== "object") return null;
  const bucket = (assessmentData as { qualificationBucket?: unknown })
    .qualificationBucket;
  if (
    bucket === "GOOD" ||
    bucket === "NEEDS_REVIEW" ||
    bucket === "EXCLUDED" ||
    bucket === "POOR_FIT"
  ) {
    return bucket;
  }
  return null;
}

export function readQualificationReason(
  assessmentData: unknown,
): string | null {
  if (!assessmentData || typeof assessmentData !== "object") return null;
  const reason = (assessmentData as { qualificationReason?: unknown })
    .qualificationReason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

export function hasUnresolvedMandatoryCriterion(input: {
  criteria: CriterionSnapshot[];
  assessments: CriterionEvidenceAssessment[];
}): boolean {
  const byName = new Map(input.assessments.map((row) => [row.name, row]));
  for (const criterion of input.criteria) {
    if (icpCriterionTier(criterion) === "SECONDARY") continue;
    const mandatory = coerceIsMandatory(
      normalizeIcpCriterionTier(criterion.tier) ?? "PRIMARY",
      criterion.isMandatory,
    );
    if (!mandatory) continue;
    const assessment = byName.get(criterion.name);
    if (!assessment) return true;
    const outcome = String(assessment.evidenceOutcome ?? "");
    const value = String(assessment.assessment ?? "");
    if (
      outcome === "UNVERIFIABLE" ||
      value === "UNKNOWN" ||
      value === "NEUTRAL"
    ) {
      return true;
    }
  }
  return false;
}

export function deterministicContactQualification(input: {
  icpQualification: IcpQualification;
  criteria: CriterionSnapshot[];
  criterionAssessments: CriterionEvidenceAssessment[];
  candidatePersonas: Array<{ id: string; name: string }>;
  excludedPersonaIds: string[];
  titleExcludedPersonaIds: string[];
  hadTitleCandidate: boolean;
  anyUnknownTitle: boolean;
}): DeterministicQualificationResult {
  if (input.icpQualification.bucket === "NO") {
    const failed = input.icpQualification.mandatoryFailures;
    return {
      bucket: "EXCLUDED",
      reason:
        failed.length > 0
          ? `Mandatory ${vocab.icp.singular} criteria failed: ${failed.join(", ")}.`
          : `Company failed mandatory ${vocab.icp.singular} qualification.`,
      aiSkipReason: "MANDATORY_ICP_FAIL",
      matchedPersonaId: null,
      personaMatchStatus: "EXCLUDED",
    };
  }

  const personaExcluded =
    input.titleExcludedPersonaIds.length > 0 ||
    input.excludedPersonaIds.length > 0;

  if (
    personaExcluded &&
    input.candidatePersonas.length === 0
  ) {
    return {
      bucket: "EXCLUDED",
      reason: `${vocab.contact.Singular} matches ${vocab.persona.aSingular} exclusion rule.`,
      aiSkipReason: "CONFIRMED_PERSONA_EXCLUSION",
      matchedPersonaId: null,
      personaMatchStatus: "EXCLUDED",
    };
  }

  if (
    input.hadTitleCandidate &&
    input.candidatePersonas.length === 0 &&
    input.excludedPersonaIds.length > 0
  ) {
    return {
      bucket: "EXCLUDED",
      reason: `${vocab.contact.Singular} matches ${vocab.persona.aSingular} exclusion rule.`,
      aiSkipReason: "CONFIRMED_PERSONA_EXCLUSION",
      matchedPersonaId: null,
      personaMatchStatus: "EXCLUDED",
    };
  }

  if (input.candidatePersonas.length === 0) {
    return {
      bucket: "NEEDS_REVIEW",
      reason: input.anyUnknownTitle
        ? `Title did not match a selected ${vocab.persona.singular}.`
        : `No ${vocab.persona.singular} match for this ${vocab.contact.singular}.`,
      aiSkipReason: "NO_TITLE_FIT",
      matchedPersonaId: null,
      personaMatchStatus: "UNKNOWN",
    };
  }

  if (input.candidatePersonas.length > 1) {
    const names = input.candidatePersonas.map((row) => row.name).join(", ");
    return {
      bucket: "NEEDS_REVIEW",
      reason: `Title matches multiple ${vocab.persona.plural} (${names}).`,
      aiSkipReason: "MULTI_PERSONA_MATCH",
      matchedPersonaId: null,
      personaMatchStatus: "UNKNOWN",
    };
  }

  const matched = input.candidatePersonas[0]!;
  if (
    hasUnresolvedMandatoryCriterion({
      criteria: input.criteria,
      assessments: input.criterionAssessments,
    })
  ) {
    return {
      bucket: "NEEDS_REVIEW",
      reason: `Mandatory ${vocab.icp.singular} criteria could not be confirmed from available evidence.`,
      aiSkipReason: "UNRESOLVED_MANDATORY",
      matchedPersonaId: matched.id,
      personaMatchStatus: "MATCHED",
    };
  }

  return {
    bucket: "GOOD",
    reason: `Matched ${vocab.persona.singular}: ${matched.name}.`,
    aiSkipReason: "SINGLE_PERSONA_MATCH",
    matchedPersonaId: matched.id,
    personaMatchStatus: "MATCHED",
  };
}

export function readPersonaMatch(assessmentData: unknown): {
  status: PersonaMatchStatus;
  matchedPersonaId: string | null;
} | null {
  if (!assessmentData || typeof assessmentData !== "object") return null;
  const raw = (assessmentData as { personaMatch?: unknown }).personaMatch;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { status?: unknown; matchedPersonaId?: unknown };
  if (
    row.status !== "MATCHED" &&
    row.status !== "EXCLUDED" &&
    row.status !== "UNKNOWN"
  ) {
    return null;
  }
  return {
    status: row.status,
    matchedPersonaId:
      typeof row.matchedPersonaId === "string" ? row.matchedPersonaId : null,
  };
}

export function scoreLabelToBucket(
  scoreLabel: ScoreLabel | null,
  assessmentData?: unknown,
): QualificationBucket {
  const explicit = readQualificationBucket(assessmentData);
  if (explicit) {
    return explicit === "POOR_FIT" ? "NEEDS_REVIEW" : explicit;
  }
  const personaMatch = readPersonaMatch(assessmentData);
  const icp = readIcpQualification(assessmentData);
  if (personaMatch?.status === "EXCLUDED") return "EXCLUDED";
  if (icp?.bucket === "NO") return "EXCLUDED";
  if (personaMatch?.status === "UNKNOWN") return "NEEDS_REVIEW";
  return icpQualificationToBucket(icp, scoreLabel);
}

export type UnresolvedCriterion = {
  criterionId: string | null;
  name: string;
  reasoning: string;
};

export function firstUnresolvedCriterion(
  criterionAssessments: unknown,
): UnresolvedCriterion | null {
  if (!Array.isArray(criterionAssessments)) return null;
  for (const value of criterionAssessments) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const outcome = String(row.evidenceOutcome ?? "");
    const assessment = String(row.assessment ?? "");
    if (row.tier === "SECONDARY") continue;
    if (outcome !== "UNVERIFIABLE" && assessment !== "UNKNOWN" && assessment !== "NEUTRAL") continue;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    return {
      criterionId: typeof row.criterionId === "string" ? row.criterionId : null,
      name,
      reasoning:
        String(row.reasoning ?? "").trim() ||
        `Cannot confirm ${name.toLowerCase()}.`,
    };
  }
  return null;
}

export function firstUnresolvedDimension(
  assessmentData: unknown,
): UnresolvedCriterion | null {
  if (!assessmentData || typeof assessmentData !== "object") return null;
  const dimensions = (assessmentData as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dimensions)) return null;
  for (const value of dimensions) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const assessment = String(row.assessment ?? "");
    if (
      assessment !== "UNKNOWN" &&
      assessment !== "WEAK"
    ) {
      continue;
    }
    const name = String(row.dimension ?? "").trim();
    if (!name) continue;
    const concerns = Array.isArray(row.concerns)
      ? row.concerns.map(String).filter(Boolean)
      : [];
    return {
      criterionId: null,
      name,
      reasoning:
        concerns[0] ??
        `Cannot confirm ${name.toLowerCase()} from the available evidence.`,
    };
  }
  return null;
}
