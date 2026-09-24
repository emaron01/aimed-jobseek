import { describeConstraintMiss } from "@/lib/criteria/evaluate";
import type { ActualProvenance } from "@/lib/criteria/research-cascade";
import type { CriterionEvidenceAssessment } from "@/lib/criteria/targeted-search-eval";
import { formatCriterionDisplay, type CriterionSnapshot } from "@/lib/criteria/types";
import type { PersonaExclusionAssessment } from "@/lib/scoring/persona-exclusions";

export type ExclusionSourceKind =
  | "LIST"
  | "RESEARCH"
  | "TITLE"
  | "CONTACT_RESEARCH";

export type IcpExclusionDetail = {
  kind: "ICP";
  criterionId: string | null;
  criterionName: string;
  criterionRange: string;
  resolvedValue: string;
  sourceKind: ExclusionSourceKind;
  sourceLabel: string;
  comparison: string;
};

export type PersonaExclusionDetail = {
  kind: "PERSONA";
  criterionId: string | null;
  criterionName: string;
  matchedText: string;
  testability: "TITLE_TESTABLE" | "EVIDENCE_TESTABLE";
  sourceLabel: string;
};

export type ExclusionDetail = IcpExclusionDetail | PersonaExclusionDetail;
function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(
      /^[$]?([\d,.]+)\s*(k|m|mm|b|thousand|million|billion)?$/,
    );
    if (match) {
      let amount = Number(match[1]!.replace(/,/g, ""));
      if (!Number.isFinite(amount)) return null;
      switch (match[2]) {
        case "k":
        case "thousand":
          amount *= 1_000;
          break;
        case "m":
        case "mm":
        case "million":
          amount *= 1_000_000;
          break;
        case "b":
        case "billion":
          amount *= 1_000_000_000;
          break;
        default:
          break;
      }
      return amount;
    }
    const cleaned = value.replace(/[$,%\s]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatComparisonPhrase(
  criterion: Pick<
    CriterionSnapshot,
    "operator" | "minValue" | "maxValue" | "targetValue"
  >,
  resolvedValue: string,
): string {
  const operator = criterion.operator.trim().toUpperCase();
  const actual = parseNumeric(resolvedValue);

  if (operator === "BETWEEN" && actual != null) {
    const min = parseNumeric(criterion.minValue);
    const max = parseNumeric(criterion.maxValue);
    if (min != null && actual < min) return "below the minimum";
    if (max != null && actual > max) return "above the maximum";
  }

  if (
    (operator === "GREATER_THAN" || operator === "GREATER_THAN_OR_EQUAL") &&
    actual != null
  ) {
    const target = parseNumeric(criterion.targetValue);
    if (target != null && actual <= target) return "below the minimum";
  }

  if (
    (operator === "LESS_THAN" || operator === "LESS_THAN_OR_EQUAL") &&
    actual != null
  ) {
    const target = parseNumeric(criterion.targetValue);
    if (target != null && actual >= target) return "above the maximum";
  }

  const miss = describeConstraintMiss({
    operator: criterion.operator,
    minValue: criterion.minValue,
    maxValue: criterion.maxValue,
    targetValue: criterion.targetValue,
  });
  if (miss) return miss;
  if (operator === "NOT_IN" || operator === "NOT_EQUALS") {
    return "matches an excluded value";
  }
  return "does not match";
}

function provenanceSourceKind(
  provenance?: ActualProvenance | null,
): ExclusionSourceKind {
  if (provenance?.source === "LIST") return "LIST";
  if (provenance?.source === "RESEARCH") return "RESEARCH";
  return "LIST";
}

function formatProvenanceSource(provenance?: ActualProvenance | null): string {
  if (!provenance) return "Available evidence";
  if (provenance.source === "LIST") {
    const field = provenance.field?.trim();
    return field ? `List data (${field})` : "List data";
  }
  if (provenance.excerpt?.trim()) return provenance.excerpt.trim();
  if (provenance.label?.trim()) return provenance.label.trim();
  return "Research evidence";
}

function observedValue(
  assessment: CriterionEvidenceAssessment,
): string {
  if (assessment.provenance?.displayValue?.trim()) {
    return assessment.provenance.displayValue.trim();
  }
  const miss = assessment.confirmedFailureLine?.trim();
  if (miss?.includes(":")) {
    const afterColon = miss.split(":").slice(1).join(":").trim();
    const beforeParen = afterColon.split("(")[0]?.trim();
    if (beforeParen) return beforeParen;
  }
  return "";
}

function isConfirmedIcpFailure(
  assessment: CriterionEvidenceAssessment,
): boolean {
  if (assessment.scope !== "ICP") return false;
  if (assessment.excludeFromScore) return false;
  if (assessment.evidenceOutcome === "CONTRADICTED") return true;
  if (assessment.assessment === "NO_FIT") return true;
  return false;
}

function buildIcpExclusionDetail(
  assessment: CriterionEvidenceAssessment,
  criterion?: CriterionSnapshot,
): IcpExclusionDetail {
  const criterionName = assessment.name;
  const criterionRange = criterion
    ? formatCriterionDisplay(criterion)
    : criterionName;
  const resolvedValue = observedValue(assessment);
  const comparison = criterion
    ? formatComparisonPhrase(criterion, resolvedValue)
    : describeConstraintMiss({
        operator: "EQUALS",
        targetValue: null,
      }) ?? "does not match";

  return {
    kind: "ICP",
    criterionId: assessment.criterionId ?? criterion?.id ?? null,
    criterionName,
    criterionRange,
    resolvedValue,
    sourceKind: provenanceSourceKind(assessment.provenance),
    sourceLabel: formatProvenanceSource(assessment.provenance),
    comparison,
  };
}

function buildPersonaExclusionDetail(
  assessment: PersonaExclusionAssessment,
): PersonaExclusionDetail {
  const matchedText =
    assessment.evidence[0]?.trim() ||
    (assessment.testability === "TITLE_TESTABLE"
      ? "Contact title"
      : "Contact research signal");
  const sourceLabel =
    assessment.testability === "TITLE_TESTABLE"
      ? matchedText.startsWith("Contact title:")
        ? matchedText
        : `Contact title: ${matchedText}`
      : matchedText;

  return {
    kind: "PERSONA",
    criterionId: assessment.criterionId ?? null,
    criterionName: assessment.criterion,
    matchedText,
    testability: assessment.testability,
    sourceLabel,
  };
}

export function buildExclusionDetails(input: {
  criterionAssessments: CriterionEvidenceAssessment[];
  icpCriteria?: CriterionSnapshot[];
  personaExclusionAssessments?: PersonaExclusionAssessment[];
}): ExclusionDetail[] {
  const criteriaById = new Map(
    (input.icpCriteria ?? [])
      .filter((row) => row.id)
      .map((row) => [row.id!, row]),
  );
  const criteriaByName = new Map(
    (input.icpCriteria ?? []).map((row) => [row.name, row]),
  );

  const icpDetails = input.criterionAssessments
    .filter(isConfirmedIcpFailure)
    .map((assessment) => {
      const criterion =
        (assessment.criterionId
          ? criteriaById.get(assessment.criterionId)
          : undefined) ?? criteriaByName.get(assessment.name);
      return buildIcpExclusionDetail(assessment, criterion);
    });

  const personaDetails = (input.personaExclusionAssessments ?? [])
    .filter((row) => row.outcome === "CONFIRMED")
    .map(buildPersonaExclusionDetail);

  return [...icpDetails, ...personaDetails];
}

export function readExclusionDetails(assessmentData: unknown): ExclusionDetail[] {
  if (!assessmentData || typeof assessmentData !== "object") return [];
  const stored = (assessmentData as { exclusionDetails?: unknown })
    .exclusionDetails;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .map(parseExclusionDetail)
      .filter((row): row is ExclusionDetail => row != null);
  }
  return deriveExclusionDetails(assessmentData);
}

function parseExclusionDetail(value: unknown): ExclusionDetail | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.kind === "ICP") {
    const criterionName = String(row.criterionName ?? "").trim();
    if (!criterionName) return null;
    return {
      kind: "ICP",
      criterionId:
        typeof row.criterionId === "string" ? row.criterionId : null,
      criterionName,
      criterionRange: String(row.criterionRange ?? criterionName),
      resolvedValue: String(row.resolvedValue ?? ""),
      sourceKind:
        row.sourceKind === "LIST" ||
        row.sourceKind === "RESEARCH" ||
        row.sourceKind === "TITLE" ||
        row.sourceKind === "CONTACT_RESEARCH"
          ? row.sourceKind
          : "LIST",
      sourceLabel: String(row.sourceLabel ?? "Available evidence"),
      comparison: String(row.comparison ?? "does not match"),
    };
  }
  if (row.kind === "PERSONA") {
    const criterionName = String(row.criterionName ?? "").trim();
    if (!criterionName) return null;
    return {
      kind: "PERSONA",
      criterionId:
        typeof row.criterionId === "string" ? row.criterionId : null,
      criterionName,
      matchedText: String(row.matchedText ?? ""),
      testability:
        row.testability === "EVIDENCE_TESTABLE"
          ? "EVIDENCE_TESTABLE"
          : "TITLE_TESTABLE",
      sourceLabel: String(row.sourceLabel ?? ""),
    };
  }
  return null;
}

export function deriveExclusionDetails(assessmentData: unknown): ExclusionDetail[] {
  if (!assessmentData || typeof assessmentData !== "object") return [];
  const data = assessmentData as {
    criterionAssessments?: unknown;
    personaExclusionAssessments?: unknown;
  };
  const criterionAssessments = Array.isArray(data.criterionAssessments)
    ? (data.criterionAssessments as CriterionEvidenceAssessment[])
    : [];
  const personaExclusionAssessments = Array.isArray(
    data.personaExclusionAssessments,
  )
    ? (data.personaExclusionAssessments as PersonaExclusionAssessment[])
    : [];
  return buildExclusionDetails({
    criterionAssessments,
    personaExclusionAssessments,
  });
}

export function formatExclusionDetailLine(detail: ExclusionDetail): string {
  if (detail.kind === "ICP") {
    const parts = [detail.criterionRange];
    if (detail.resolvedValue) parts.push(`Value: ${detail.resolvedValue}`);
    parts.push(detail.comparison);
    parts.push(`Source: ${detail.sourceLabel}`);
    return parts.join(" · ");
  }
  return `${detail.criterionName} · Matched: ${detail.matchedText} · ${detail.sourceLabel}`;
}

export function exclusionGroupKey(detail: ExclusionDetail): string {
  if (detail.kind === "ICP") {
    return `ICP:${detail.criterionId ?? detail.criterionName}`;
  }
  return `PERSONA:${detail.criterionId ?? detail.criterionName}`;
}

export function groupExclusionDetailsByCriterion(
  rows: Array<{ contactId: string; details: ExclusionDetail[] }>,
): Array<{
  key: string;
  criterionName: string;
  contactIds: string[];
  detail: ExclusionDetail;
}> {
  const groups = new Map<
    string,
    { contactIds: Set<string>; detail: ExclusionDetail }
  >();
  for (const row of rows) {
    for (const detail of row.details) {
      const key = exclusionGroupKey(detail);
      const entry = groups.get(key) ?? { contactIds: new Set(), detail };
      entry.contactIds.add(row.contactId);
      groups.set(key, entry);
    }
  }
  return [...groups.entries()]
    .filter(([, entry]) => entry.contactIds.size > 1)
    .map(([key, entry]) => ({
      key,
      criterionName: entry.detail.criterionName,
      contactIds: [...entry.contactIds],
      detail: entry.detail,
    }));
}
