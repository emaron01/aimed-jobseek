/**
 * Project Persona AI signal arrays into PersonaCriterion drafts.
 *
 * Negative / exclusion paths always set isDisqualifier=true on projection.
 * Positive / ownership / responsibility paths always set isDisqualifier=false.
 * User demotion of a negative to supporting is preserved via form parse.
 */

import type {
  ExclusionTestabilityValue,
  PersonaAiDraft,
} from "@/lib/persona-research/contract";
import { EXCLUSION_TESTABILITY_VALUES } from "@/lib/persona-research/contract";
import { vocab } from "@/lib/product-config";

export const PERSONA_SIGNAL_CRITERION_TYPES = {
  positiveRoleSignal: "positive_role_signal",
  negativeRoleSignal: "negative_role_signal",
  ownership: "ownership",
  responsibility: "responsibility",
  /**
   * Unrecognized AI criterionType with no explicit isDisqualifier.
   * Held out of scoring until the user places the line in a typed box.
   */
  needsReview: "needs_review",
} as const;

export type ProjectedPersonaCriterionDraft = {
  name: string;
  criterionType: string;
  description: string | null;
  operator: "EXISTS";
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  isRequired: boolean;
  isDisqualifier: boolean;
  exclusionTestability: ExclusionTestabilityValue | null;
  researchGuidance: string | null;
  source: "AI_INTERPRETED";
};

export type RoleSignalEntry = {
  text: string;
  isDisqualifying: boolean;
  exclusionTestability?: ExclusionTestabilityValue | null;
};

export type PersonaCriterionFormRow = {
  name: string;
  criterionType: string;
  description?: string | null;
  importance?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  isRequired?: boolean;
  isDisqualifier?: boolean;
  exclusionTestability?: ExclusionTestabilityValue | null;
  researchGuidance?: string | null;
  manuallyEdited?: boolean;
};

export type PersonaCriteriaReviewResult = {
  criteria: PersonaCriterionFormRow[];
  droppedCount: number;
  unmappedCriterionTypes: string[];
  missingExclusionCriteria: boolean;
};

/** Leading ownership verbs stripped before semantic dedupe (case-insensitive). */
const LEADING_OWNERSHIP_VERB_PATTERN =
  /^(?:owns|owning|responsible for|accountable for|manages|managing|leads|leading|oversees|overseeing|directs|directing|drives|driving|runs|running)\s+/i;

/** Names that express exclusion regardless of declared criterionType. */
const EXCLUSION_NAME_PATTERN =
  /^(?:no|not|lack of|without|absence of)\b/i;

/**
 * Exclusion text that describes a responsibility / ownership gap — never title-only.
 * Matches: without, lacks, not responsible for, no ownership of, and close variants.
 */
const EVIDENCE_GAP_HEURISTIC_PATTERN =
  /\b(?:without|lacks|lacking|not responsible for|no ownership of|without ownership(?:\s+of)?)\b/i;

export type MappedAiCriterion = {
  criterionType: string;
  isDisqualifier: boolean;
  unmapped: boolean;
  originalType: string;
};

function criterionKey(name: string, criterionType: string): string {
  return `${criterionType.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

/** Semantic key for near-duplicate detection across signal arrays. */
export function normalizeCriterionSemanticKey(name: string): string {
  let normalized = name.trim().toLowerCase();
  normalized = normalized.replace(LEADING_OWNERSHIP_VERB_PATTERN, "");
  normalized = normalized.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  // Collapse near-duplicate IC / individual-seller exclusion wordings into one key.
  // Exact-key dedupe alone cannot merge "Individual contributor seller" with
  // "Individual quota-only seller" / AE-BDR variants.
  if (
    /\bindividual\b/.test(normalized) &&
    (/\bcontributor\b/.test(normalized) ||
      /\bquota\b/.test(normalized) ||
      /\bseller\b/.test(normalized) ||
      /\bsales\s+representative\b/.test(normalized) ||
      /\baccount\s+executive\b/.test(normalized) ||
      /\bbusiness\s+development\b/.test(normalized) ||
      /\bbdr\b/.test(normalized))
  ) {
    return "individual contributor seller";
  }
  return normalized;
}

export function isExclusionCriterionName(name: string): boolean {
  return EXCLUSION_NAME_PATTERN.test(name.trim());
}

export function describesEvidenceGap(text: string): boolean {
  return EVIDENCE_GAP_HEURISTIC_PATTERN.test(text.trim());
}

/**
 * Resolve exclusion testability for a disqualifier.
 * Heuristic wins over AI; missing/unrecognized AI values → EVIDENCE_TESTABLE.
 */
export function resolveExclusionTestability(input: {
  name: string;
  isDisqualifier: boolean;
  aiValue?: unknown;
}): ExclusionTestabilityValue | null {
  if (!input.isDisqualifier) return null;
  if (describesEvidenceGap(input.name)) return "EVIDENCE_TESTABLE";
  if (
    typeof input.aiValue === "string" &&
    (EXCLUSION_TESTABILITY_VALUES as readonly string[]).includes(input.aiValue)
  ) {
    return input.aiValue as ExclusionTestabilityValue;
  }
  return "EVIDENCE_TESTABLE";
}

export function isPositiveRoleSignalType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal ||
    (lower.includes("positive") && lower.includes("signal"))
  );
}

export function isNegativeRoleSignalType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal ||
    (lower.includes("negative") && lower.includes("signal"))
  );
}

function isOwnershipType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.ownership ||
    lower.includes("ownership")
  );
}

function isResponsibilityType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.responsibility ||
    lower.includes("responsib")
  );
}

function isProtectedFromCap(row: PersonaCriterionFormRow): boolean {
  return (
    row.isDisqualifier === true || isNegativeRoleSignalType(row.criterionType)
  );
}

export function isNeedsReviewCriterionType(criterionType: string): boolean {
  return (
    criterionType.trim().toLowerCase() ===
    PERSONA_SIGNAL_CRITERION_TYPES.needsReview
  );
}

function typeIsKnownVocabulary(lower: string): boolean {
  return (
    isPositiveRoleSignalType(lower) ||
    isNegativeRoleSignalType(lower) ||
    isOwnershipType(lower) ||
    isResponsibilityType(lower) ||
    lower.includes("disqualif") ||
    lower.includes("exclusion") ||
    lower.includes("negative") ||
    lower.includes("ownership") ||
    /\bown\b/.test(lower) ||
    lower.includes("responsib") ||
    lower.includes("accountab") ||
    lower.includes("kpi") ||
    lower.includes("pain") ||
    lower.includes("outcome") ||
    lower.includes("signal") ||
    lower.includes("context") ||
    lower.includes("behavior")
  );
}

/**
 * Map free-form AI criterionType (+ name polarity) to platform vocabulary.
 *
 * Precedence (before type-string mapping):
 * 1. Exclusion-shaped names → negative_role_signal
 * 2. Explicit AI isDisqualifier / isDisqualifyingSignal → negative_role_signal
 *    (never discarded by an unrecognized or positive-looking type)
 *
 * Unmapped types without an explicit disqualifier become needs_review — not
 * positive_role_signal — so invented labels cannot silently count as fit evidence.
 * Do not map bare "scope" / "role_scope" to positive; role_scope carried exclusions.
 */
export function mapAiCriterionType(input: {
  name: string;
  criterionType: string;
  isDisqualifier?: boolean;
  isDisqualifyingSignal?: boolean;
}): MappedAiCriterion {
  const originalType = input.criterionType.trim() || "unknown";
  const lower = originalType.toLowerCase();
  const name = input.name.trim();

  if (isExclusionCriterionName(name)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: true,
      unmapped: false,
      originalType,
    };
  }

  // Rule 1 — explicit AI disqualifier wins before any type-string mapping.
  if (input.isDisqualifier === true || input.isDisqualifyingSignal === true) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: true,
      // Keep unmapped=true when the type string itself is unknown (telemetry).
      unmapped: !typeIsKnownVocabulary(lower),
      originalType,
    };
  }

  if (isPositiveRoleSignalType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (isNegativeRoleSignalType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: true,
      unmapped: false,
      originalType,
    };
  }
  if (isOwnershipType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (isResponsibilityType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }

  if (lower.includes("disqualif") || lower.includes("exclusion")) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: true,
      unmapped: false,
      originalType,
    };
  }
  if (lower.includes("negative")) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: true,
      unmapped: false,
      originalType,
    };
  }
  if (lower.includes("ownership") || /\bown\b/.test(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (
    lower.includes("responsib") ||
    lower.includes("accountab") ||
    lower.includes("kpi")
  ) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (
    lower.includes("pain") ||
    lower.includes("outcome") ||
    lower.includes("signal") ||
    lower.includes("context") ||
    lower.includes("behavior")
  ) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }

  return {
    criterionType: PERSONA_SIGNAL_CRITERION_TYPES.needsReview,
    isDisqualifier: false,
    unmapped: true,
    originalType,
  };
}

function criterionTypeRank(criterionType: string): number {
  if (isOwnershipType(criterionType)) return 0;
  if (isResponsibilityType(criterionType)) return 1;
  if (isPositiveRoleSignalType(criterionType)) return 2;
  if (isNegativeRoleSignalType(criterionType)) return 3;
  return 4;
}

export function normalizeCriterionFlags(input: {
  name: string;
  criterionType: string;
  isRequired?: boolean;
  isDisqualifier?: boolean;
  isDisqualifyingSignal?: boolean;
  fromSignalProjection?: boolean;
  /** When true (form JSON), preserve user demotion of a negative to supporting. */
  preserveUserDisqualifierFlag?: boolean;
  exclusionTestability?: unknown;
}): {
  criterionType: string;
  isRequired: boolean;
  isDisqualifier: boolean;
  exclusionTestability: ExclusionTestabilityValue | null;
  unmapped: boolean;
} {
  const mapped = mapAiCriterionType({
    name: input.name,
    criterionType: input.criterionType,
    isDisqualifier: input.isDisqualifier,
    isDisqualifyingSignal: input.isDisqualifyingSignal,
  });

  if (isPositiveRoleSignalType(mapped.criterionType)) {
    return {
      criterionType: mapped.criterionType,
      isRequired: false,
      isDisqualifier: false,
      exclusionTestability: null,
      unmapped: mapped.unmapped,
    };
  }

  if (isNegativeRoleSignalType(mapped.criterionType)) {
    const isDisqualifier = input.preserveUserDisqualifierFlag
      ? Boolean(input.isDisqualifier)
      : true;
    return {
      criterionType: mapped.criterionType,
      isRequired: false,
      isDisqualifier,
      exclusionTestability: resolveExclusionTestability({
        name: input.name,
        isDisqualifier,
        aiValue: input.exclusionTestability,
      }),
      unmapped: mapped.unmapped,
    };
  }

  if (
    isOwnershipType(mapped.criterionType) ||
    isResponsibilityType(mapped.criterionType)
  ) {
    return {
      criterionType: mapped.criterionType,
      isRequired: input.fromSignalProjection
        ? false
        : Boolean(input.isRequired),
      isDisqualifier: false,
      exclusionTestability: null,
      unmapped: mapped.unmapped,
    };
  }

  if (isNeedsReviewCriterionType(mapped.criterionType)) {
    // Unmapped non-disqualifier: hold for review. Do not promote isRequired or
    // exclusionTestability until the user places the line in a typed box.
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.needsReview,
      isRequired: false,
      isDisqualifier: false,
      exclusionTestability: null,
      unmapped: true,
    };
  }

  const isDisqualifier = mapped.isDisqualifier;
  return {
    criterionType: mapped.criterionType,
    isRequired: Boolean(input.isRequired),
    isDisqualifier,
    exclusionTestability: resolveExclusionTestability({
      name: input.name,
      isDisqualifier,
      aiValue: input.exclusionTestability,
    }),
    unmapped: mapped.unmapped,
  };
}

export function personaHasExclusionCriteria(
  criteria: PersonaCriterionFormRow[],
): boolean {
  return criteria.some((row) => isProtectedFromCap(row));
}

/** Parse string or structured role-signal entries from AI / profileJson. */
export function parseRoleSignalEntry(value: unknown): RoleSignalEntry | null {
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    if (raw.startsWith("!")) {
      return { text: raw.slice(1).trim(), isDisqualifying: true };
    }
    const disqualifierPrefix = /^\[disqualifier\]\s*/i;
    if (disqualifierPrefix.test(raw)) {
      return {
        text: raw.replace(disqualifierPrefix, "").trim(),
        isDisqualifying: true,
      };
    }
    // Plain negativeRoleSignals entries are exclusions by default (Change A).
    return { text: raw, isDisqualifying: true };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const text = String(obj.text ?? obj.signal ?? obj.name ?? "").trim();
    if (!text) return null;
    const exclusionTestability = resolveExclusionTestability({
      name: text,
      isDisqualifier: true,
      aiValue: obj.exclusionTestability,
    });
    return {
      text,
      isDisqualifying: true,
      exclusionTestability,
    };
  }
  return null;
}

function asSignalList(values: unknown): RoleSignalEntry[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(parseRoleSignalEntry)
    .filter((e): e is RoleSignalEntry => e !== null && Boolean(e.text));
}

function asStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(String).map((s) => s.trim()).filter(Boolean);
}

type MergeRow = PersonaCriterionFormRow & {
  source: "draft" | "projected";
};

function normalizeReviewRow(
  row: Omit<
    PersonaCriterionFormRow,
    "criterionType" | "isRequired" | "isDisqualifier" | "exclusionTestability"
  > & {
    name: string;
    criterionType: string;
    isRequired?: boolean;
    isDisqualifier?: boolean;
    exclusionTestability?: ExclusionTestabilityValue | null;
  },
  options?: {
    fromSignalProjection?: boolean;
    isDisqualifyingSignal?: boolean;
    preserveUserDisqualifierFlag?: boolean;
    aiExclusionTestability?: unknown;
  },
): { row: PersonaCriterionFormRow; unmapped: boolean } {
  const normalized = normalizeCriterionFlags({
    name: row.name,
    criterionType: row.criterionType,
    isRequired: row.isRequired,
    isDisqualifier: row.isDisqualifier,
    isDisqualifyingSignal: options?.isDisqualifyingSignal,
    fromSignalProjection: options?.fromSignalProjection,
    preserveUserDisqualifierFlag: options?.preserveUserDisqualifierFlag,
    exclusionTestability:
      options?.aiExclusionTestability ?? row.exclusionTestability,
  });
  return {
    row: {
      ...row,
      criterionType: normalized.criterionType,
      isRequired: normalized.isRequired,
      isDisqualifier: normalized.isDisqualifier,
      exclusionTestability: normalized.exclusionTestability,
    },
    unmapped: normalized.unmapped,
  };
}

function shouldReplaceSemanticDuplicate(
  existing: MergeRow,
  incoming: MergeRow,
): boolean {
  if (incoming.isDisqualifier && !existing.isDisqualifier) return true;
  if (incoming.isRequired && !existing.isRequired && !existing.isDisqualifier) {
    return true;
  }
  if (existing.source === "draft" && incoming.source === "projected") {
    return false;
  }
  if (existing.source === "projected" && incoming.source === "draft") {
    return true;
  }
  return (
    criterionTypeRank(incoming.criterionType) <
    criterionTypeRank(existing.criterionType)
  );
}

function mergeCriteriaRows(rows: MergeRow[]): PersonaCriterionFormRow[] {
  const bySemantic = new Map<string, MergeRow>();

  for (const row of rows) {
    const semantic = normalizeCriterionSemanticKey(row.name);
    if (!semantic) continue;

    const existing = bySemantic.get(semantic);
    if (!existing) {
      bySemantic.set(semantic, row);
      continue;
    }

    const exactExisting = criterionKey(existing.name, existing.criterionType);
    const exactIncoming = criterionKey(row.name, row.criterionType);
    if (exactExisting === exactIncoming) continue;

    if (shouldReplaceSemanticDuplicate(existing, row)) {
      bySemantic.set(semantic, row);
    }
  }

  return [...bySemantic.values()].map(({ source, ...rest }) => {
    void source;
    return rest;
  });
}

function importanceRank(
  importance: PersonaCriterionFormRow["importance"] | undefined,
): number {
  switch (importance) {
    case "CRITICAL":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 3;
    default:
      return 4;
  }
}

function retentionRank(row: PersonaCriterionFormRow): number {
  if (row.isDisqualifier) return 0;
  if (isNegativeRoleSignalType(row.criterionType)) return 1;
  if (row.isRequired) return 2;
  return 3 + importanceRank(row.importance);
}

/**
 * Flexible (non-exclusion) families used when capping.
 * Round-robin across families so one HIGH-importance type cannot starve another
 * when exclusions consume most of the maxCriteria budget.
 */
type FlexibleCapFamily =
  | "ownership"
  | "positive"
  | "responsibility"
  | "other";

const FLEXIBLE_CAP_FAMILY_ORDER: FlexibleCapFamily[] = [
  "ownership",
  "positive",
  "responsibility",
  "other",
];

function flexibleCapFamily(row: PersonaCriterionFormRow): FlexibleCapFamily {
  if (isOwnershipType(row.criterionType)) return "ownership";
  if (isPositiveRoleSignalType(row.criterionType)) return "positive";
  if (isResponsibilityType(row.criterionType)) return "responsibility";
  return "other";
}

/**
 * Cap merged criteria — exclusions are never dropped.
 *
 * Flexible slots are filled by round-robin across ownership / positive /
 * responsibility / other (each family ordered by retentionRank). A global
 * retentionRank-only trim previously dropped every positive_role_signal once
 * protected exclusions + CRITICAL ownership filled maxProjectedPersonaCriteria.
 */
export function capPersonaCriteria(
  rows: PersonaCriterionFormRow[],
  maxCriteria: number,
): { criteria: PersonaCriterionFormRow[]; droppedCount: number } {
  if (maxCriteria < 1) {
    return { criteria: [], droppedCount: rows.length };
  }

  const protectedRows = rows.filter((row) => isProtectedFromCap(row));
  const flexibleRows = rows.filter((row) => !isProtectedFromCap(row));

  if (protectedRows.length >= maxCriteria) {
    return {
      criteria: protectedRows,
      droppedCount: rows.length - protectedRows.length,
    };
  }

  const flexibleSlots = maxCriteria - protectedRows.length;
  if (flexibleRows.length <= flexibleSlots) {
    return { criteria: rows, droppedCount: 0 };
  }

  const buckets = new Map<
    FlexibleCapFamily,
    Array<{ row: PersonaCriterionFormRow; index: number }>
  >();
  for (const family of FLEXIBLE_CAP_FAMILY_ORDER) {
    buckets.set(family, []);
  }
  flexibleRows.forEach((row, index) => {
    buckets.get(flexibleCapFamily(row))!.push({ row, index });
  });
  for (const family of FLEXIBLE_CAP_FAMILY_ORDER) {
    buckets.get(family)!.sort((a, b) => {
      const rankDiff = retentionRank(a.row) - retentionRank(b.row);
      return rankDiff !== 0 ? rankDiff : a.index - b.index;
    });
  }

  const keptFlexible: Array<{ row: PersonaCriterionFormRow; index: number }> =
    [];
  const cursors = new Map<FlexibleCapFamily, number>(
    FLEXIBLE_CAP_FAMILY_ORDER.map((family) => [family, 0]),
  );

  while (keptFlexible.length < flexibleSlots) {
    let progressed = false;
    for (const family of FLEXIBLE_CAP_FAMILY_ORDER) {
      if (keptFlexible.length >= flexibleSlots) break;
      const bucket = buckets.get(family)!;
      const cursor = cursors.get(family)!;
      if (cursor >= bucket.length) continue;
      keptFlexible.push(bucket[cursor]!);
      cursors.set(family, cursor + 1);
      progressed = true;
    }
    if (!progressed) break;
  }

  keptFlexible.sort((a, b) => a.index - b.index);

  const keptKeys = new Set(
    [...protectedRows, ...keptFlexible.map((entry) => entry.row)].map((row) =>
      criterionKey(row.name, row.criterionType),
    ),
  );
  const criteria = rows.filter((row) =>
    keptKeys.has(criterionKey(row.name, row.criterionType)),
  );

  return {
    criteria,
    droppedCount: rows.length - criteria.length,
  };
}

export function projectPersonaSignalsToCriteria(
  draft: Pick<
    PersonaAiDraft,
    | "criteria"
    | "positiveRoleSignals"
    | "negativeRoleSignals"
    | "ownershipAreas"
    | "kpisAndAccountabilities"
  >,
): ProjectedPersonaCriterionDraft[] {
  const existingKeys = new Set(
    (draft.criteria ?? []).map((c) => criterionKey(c.name, c.criterionType)),
  );

  const out: ProjectedPersonaCriterionDraft[] = [];

  function pushUnique(row: ProjectedPersonaCriterionDraft): void {
    const key = criterionKey(row.name, row.criterionType);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    out.push(row);
  }

  for (const signal of asSignalList(draft.positiveRoleSignals)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: signal.text,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
        importance: "HIGH",
      },
      { fromSignalProjection: true },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: `Positive role signal — evidence this ${vocab.buyer.singular} fits.`,
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: normalized.isRequired ?? false,
      isDisqualifier: false,
      exclusionTestability: null,
      researchGuidance:
        "Look for professional signals that indicate this role scope.",
      source: "AI_INTERPRETED",
    });
  }

  for (const signal of asSignalList(draft.negativeRoleSignals)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: signal.text,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
        importance: "CRITICAL",
        exclusionTestability: signal.exclusionTestability ?? null,
      },
      {
        fromSignalProjection: true,
        isDisqualifyingSignal: true,
        aiExclusionTestability: signal.exclusionTestability,
      },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: `Negative role signal — evidence against this ${vocab.buyer.singular}.`,
      operator: "EXISTS",
      importance: "CRITICAL",
      isRequired: false,
      isDisqualifier: true,
      exclusionTestability: normalized.exclusionTestability ?? null,
      researchGuidance:
        "Confirm whether contact evidence contradicts this buyer role.",
      source: "AI_INTERPRETED",
    });
  }

  for (const area of asStringList(draft.ownershipAreas)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: area,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
        importance: "CRITICAL",
      },
      { fromSignalProjection: true },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: `Ownership area for this ${vocab.buyer.singular}.`,
      operator: "EXISTS",
      importance: "CRITICAL",
      isRequired: normalized.isRequired ?? false,
      isDisqualifier: false,
      exclusionTestability: null,
      researchGuidance:
        "Confirm ownership / scope from role evidence — not title alone.",
      source: "AI_INTERPRETED",
    });
  }

  for (const kpi of asStringList(draft.kpisAndAccountabilities)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: kpi,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
        importance: "HIGH",
      },
      { fromSignalProjection: true },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: `KPI or accountability for this ${vocab.buyer.singular}.`,
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: normalized.isRequired ?? false,
      isDisqualifier: false,
      exclusionTestability: null,
      researchGuidance:
        "Confirm KPIs / accountabilities from responsibilities evidence.",
      source: "AI_INTERPRETED",
    });
  }

  return out;
}

const CRITERION_IMPORTANCE = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export function parsePersonaCriteriaFormJson(
  raw: string | null | undefined,
): PersonaCriterionFormRow[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const rows: PersonaCriterionFormRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      const criterionType = String(row.criterionType ?? "").trim();
      if (!name || !criterionType) continue;
      const importance = CRITERION_IMPORTANCE.includes(
        row.importance as (typeof CRITERION_IMPORTANCE)[number],
      )
        ? (row.importance as (typeof CRITERION_IMPORTANCE)[number])
        : "MEDIUM";
      const { row: normalized } = normalizeReviewRow(
        {
          name,
          criterionType,
          description:
            row.description == null ? null : String(row.description),
          importance,
          isRequired: Boolean(row.isRequired),
          isDisqualifier: Boolean(row.isDisqualifier),
          exclusionTestability:
            typeof row.exclusionTestability === "string"
              ? (row.exclusionTestability as ExclusionTestabilityValue)
              : null,
          researchGuidance:
            row.researchGuidance == null
              ? null
              : String(row.researchGuidance),
          manuallyEdited: Boolean(row.manuallyEdited),
        },
        {
          preserveUserDisqualifierFlag: true,
          aiExclusionTestability: row.exclusionTestability,
        },
      );
      rows.push(normalized);
    }
    return rows;
  } catch {
    return null;
  }
}

function findNegativeSignalTestability(
  draft: Pick<PersonaAiDraft, "negativeRoleSignals">,
  name: string,
): unknown {
  const target = normalizeCriterionSemanticKey(name);
  for (const signal of draft.negativeRoleSignals ?? []) {
    if (typeof signal === "string") {
      if (normalizeCriterionSemanticKey(signal) === target) return undefined;
      continue;
    }
    if (!signal || typeof signal !== "object") continue;
    const obj = signal as Record<string, unknown>;
    const text = String(obj.text ?? obj.signal ?? obj.name ?? "").trim();
    if (!text) continue;
    if (normalizeCriterionSemanticKey(text) === target) {
      return obj.exclusionTestability;
    }
  }
  return undefined;
}

export function buildPersonaCriteriaForReview(
  draft: PersonaAiDraft,
  options?: { maxCriteria?: number },
): PersonaCriteriaReviewResult {
  const unmappedTypes = new Set<string>();

  const fromDraft: MergeRow[] = (draft.criteria ?? []).map((c) => {
    const { row, unmapped } = normalizeReviewRow(
      {
        name: c.name,
        criterionType: c.criterionType,
        description: c.description ?? null,
        importance: c.importance ?? "MEDIUM",
        isRequired: c.isRequired ?? false,
        isDisqualifier: c.isDisqualifier ?? false,
        exclusionTestability: c.exclusionTestability ?? null,
        researchGuidance: c.researchGuidance ?? null,
        manuallyEdited: false,
      },
      {
        aiExclusionTestability:
          c.exclusionTestability ??
          findNegativeSignalTestability(draft, c.name),
      },
    );
    if (unmapped) unmappedTypes.add(c.criterionType);
    return { ...row, source: "draft" as const };
  });

  const projected: MergeRow[] = projectPersonaSignalsToCriteria(draft).map(
    (c) => ({
      name: c.name,
      criterionType: c.criterionType,
      description: c.description,
      importance: c.importance,
      isRequired: c.isRequired,
      isDisqualifier: c.isDisqualifier,
      exclusionTestability: c.exclusionTestability,
      researchGuidance: c.researchGuidance,
      manuallyEdited: false,
      source: "projected" as const,
    }),
  );

  const exactKeys = new Set<string>();
  const merged: MergeRow[] = [];

  for (const row of [...fromDraft, ...projected]) {
    const exact = criterionKey(row.name, row.criterionType);
    if (exactKeys.has(exact)) continue;
    exactKeys.add(exact);
    merged.push(row);
  }

  const deduped = mergeCriteriaRows(merged);
  const maxCriteria = options?.maxCriteria;
  const capped =
    maxCriteria == null
      ? { criteria: deduped, droppedCount: 0 }
      : capPersonaCriteria(deduped, maxCriteria);

  return {
    criteria: capped.criteria,
    droppedCount: capped.droppedCount,
    unmappedCriterionTypes: [...unmappedTypes].sort(),
    missingExclusionCriteria: !personaHasExclusionCriteria(capped.criteria),
  };
}

/**
 * Collect unrecognized draft.criteria types for UsageEvent telemetry.
 * Independent of whether the approve path uses form-reviewed criteriaJson
 * (which previously skipped buildPersonaCriteriaForReview and left logging empty).
 */
export function collectUnmappedCriterionTypesFromDraft(
  draft: Pick<PersonaAiDraft, "criteria" | "negativeRoleSignals">,
): string[] {
  const unmappedTypes = new Set<string>();
  for (const c of draft.criteria ?? []) {
    const { unmapped } = normalizeReviewRow(
      {
        name: c.name,
        criterionType: c.criterionType,
        importance: c.importance ?? "MEDIUM",
        isRequired: c.isRequired ?? false,
        isDisqualifier: c.isDisqualifier ?? false,
        exclusionTestability: c.exclusionTestability ?? null,
      },
      {
        aiExclusionTestability:
          c.exclusionTestability ??
          findNegativeSignalTestability(draft, c.name),
      },
    );
    if (unmapped) unmappedTypes.add(c.criterionType);
  }
  return [...unmappedTypes].sort();
}

export function projectSignalsFromProfileJson(
  profileJson: unknown,
  existingCriteria: Array<{ name: string; criterionType: string }>,
  options?: { maxCriteria?: number },
): { criteria: ProjectedPersonaCriterionDraft[]; droppedCount: number } {
  if (!profileJson || typeof profileJson !== "object") {
    return { criteria: [], droppedCount: 0 };
  }
  const draft = profileJson as PersonaAiDraft;
  const existingKeys = new Set(
    existingCriteria.map((c) => criterionKey(c.name, c.criterionType)),
  );
  const projected = projectPersonaSignalsToCriteria(draft).filter(
    (c) => !existingKeys.has(criterionKey(c.name, c.criterionType)),
  );

  if (options?.maxCriteria == null) {
    return { criteria: projected, droppedCount: 0 };
  }

  const capped = capPersonaCriteria(
    projected.map((row) => ({
      name: row.name,
      criterionType: row.criterionType,
      importance: row.importance,
      isRequired: row.isRequired,
      isDisqualifier: row.isDisqualifier,
      exclusionTestability: row.exclusionTestability,
    })),
    options.maxCriteria,
  );

  const cappedKeys = new Set(
    capped.criteria.map((row) => criterionKey(row.name, row.criterionType)),
  );

  return {
    criteria: projected.filter((row) =>
      cappedKeys.has(criterionKey(row.name, row.criterionType)),
    ),
    droppedCount: capped.droppedCount,
  };
}

export type CriteriaEditorBoxKey =
  | "positiveRoleSignals"
  | "exclusions"
  | "ownershipAreas"
  | "responsibilities";

export type CriteriaEditorBoxes = Record<CriteriaEditorBoxKey, string>;

const BOX_CRITERION_TYPE: Record<
  CriteriaEditorBoxKey,
  string
> = {
  positiveRoleSignals: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
  exclusions: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
  ownershipAreas: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
  responsibilities: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
};

/** Inline classify targets for needs-review rows (draft + edit pages). */
export const NEEDS_REVIEW_CLASSIFY_TARGETS: Array<{
  box: CriteriaEditorBoxKey;
  role: string;
  label: string;
}> = [
  {
    box: "positiveRoleSignals",
    role: "positive",
    label: "Positive role signal",
  },
  { box: "exclusions", role: "exclusion", label: "Exclusion" },
  { box: "ownershipAreas", role: "ownership", label: "Ownership" },
  {
    box: "responsibilities",
    role: "responsibility",
    label: "Responsibility",
  },
];

export function classifyNeedsReviewRole(role: string): {
  criterionType: string;
  isRequired: boolean;
  isDisqualifier: boolean;
} | null {
  switch (role) {
    case "required":
      return {
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
        isRequired: true,
        isDisqualifier: false,
      };
    case "supporting":
    case "positive":
      return {
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
        isRequired: false,
        isDisqualifier: false,
      };
    case "disqualifier":
    case "exclusion":
      return {
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
        isRequired: false,
        isDisqualifier: true,
      };
    case "ownership":
      return {
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
        isRequired: false,
        isDisqualifier: false,
      };
    case "responsibility":
      return {
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
        isRequired: false,
        isDisqualifier: false,
      };
    default:
      return null;
  }
}

export function appendCriterionLineToBox(boxText: string, line: string): string {
  const name = line.trim();
  if (!name) return boxText;
  const existing = parseCriteriaBoxLines(boxText);
  const semantic = normalizeCriterionSemanticKey(name);
  if (
    existing.some((row) => normalizeCriterionSemanticKey(row) === semantic)
  ) {
    return existing.join("\n");
  }
  return [...existing, name].join("\n");
}

export function remainingNeedsReviewCriteria(
  baseline: PersonaCriterionFormRow[],
  boxes: CriteriaEditorBoxes,
  dismissedSemanticKeys: Iterable<string> = [],
): PersonaCriterionFormRow[] {
  const dismissed = new Set(
    [...dismissedSemanticKeys].map((key) => key.trim().toLowerCase()),
  );
  const placed = new Set<string>();
  for (const boxKey of Object.keys(BOX_CRITERION_TYPE) as CriteriaEditorBoxKey[]) {
    for (const line of parseCriteriaBoxLines(boxes[boxKey] ?? "")) {
      placed.add(normalizeCriterionSemanticKey(line));
    }
  }
  return needsReviewCriteria(baseline).filter((row) => {
    const semantic = normalizeCriterionSemanticKey(row.name);
    return Boolean(semantic) && !placed.has(semantic) && !dismissed.has(semantic);
  });
}

function boxKeyForCriterion(row: PersonaCriterionFormRow): CriteriaEditorBoxKey | null {
  if (isNeedsReviewCriterionType(row.criterionType)) {
    // Held out of the four typed boxes until the user places the line.
    return null;
  }
  if (row.isDisqualifier || isNegativeRoleSignalType(row.criterionType)) {
    return "exclusions";
  }
  if (row.criterionType.toLowerCase().includes("ownership")) {
    return "ownershipAreas";
  }
  if (row.criterionType.toLowerCase().includes("responsib")) {
    return "responsibilities";
  }
  return "positiveRoleSignals";
}

export function parseCriteriaBoxLines(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const key = normalizeCriterionSemanticKey(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

/** Group projected criteria into four newline-separated box texts (order preserved). */
export function criteriaToEditorBoxes(
  criteria: PersonaCriterionFormRow[],
): CriteriaEditorBoxes {
  const buckets: Record<CriteriaEditorBoxKey, string[]> = {
    positiveRoleSignals: [],
    exclusions: [],
    ownershipAreas: [],
    responsibilities: [],
  };
  for (const row of criteria) {
    const name = row.name.trim();
    if (!name) continue;
    const box = boxKeyForCriterion(row);
    if (!box) continue;
    buckets[box].push(name);
  }
  return {
    positiveRoleSignals: buckets.positiveRoleSignals.join("\n"),
    exclusions: buckets.exclusions.join("\n"),
    ownershipAreas: buckets.ownershipAreas.join("\n"),
    responsibilities: buckets.responsibilities.join("\n"),
  };
}

/** Criteria held for review (unmapped non-disqualifiers). */
export function needsReviewCriteria(
  criteria: PersonaCriterionFormRow[],
): PersonaCriterionFormRow[] {
  return criteria.filter((row) => isNeedsReviewCriterionType(row.criterionType));
}

/**
 * Parse editor boxes back into criteria.
 *
 * Matching (item 3): within the same box type, an edited line matches a baseline
 * criterion when normalizeCriterionSemanticKey(line) equals the baseline name key.
 * Exact string match is not required — e.g. "Owns X" and "X" share a key after verb
 * stripping. Rewording that changes the semantic key is treated as a NEW criterion
 * (isRequired false); the previous baseline row is dropped because its line is gone.
 *
 * Testability (item 5): matched exclusions keep baseline exclusionTestability, then
 * resolveExclusionTestability re-applies the evidence-gap heuristic. New exclusion
 * lines use EVIDENCE_TESTABLE (+ heuristic).
 *
 * Manual edits (item 6): pass modifiedBoxes for any box whose text differs from the
 * initial boxes; all criteria emitted from those boxes get manuallyEdited: true.
 * Dismissed needs-review names (semantic keys) are omitted entirely.
 */
export function editorBoxesToCriteria(
  boxes: CriteriaEditorBoxes,
  baseline: PersonaCriterionFormRow[],
  options?: {
    modifiedBoxes?: Iterable<CriteriaEditorBoxKey>;
    dismissedNeedsReview?: Iterable<string>;
  },
): PersonaCriterionFormRow[] {
  const modified = new Set(options?.modifiedBoxes ?? []);
  const dismissed = new Set(
    [...(options?.dismissedNeedsReview ?? [])].map((key) =>
      key.trim().toLowerCase(),
    ),
  );
  const baselineByBox = new Map<
    CriteriaEditorBoxKey,
    Map<string, PersonaCriterionFormRow>
  >();

  for (const key of Object.keys(BOX_CRITERION_TYPE) as CriteriaEditorBoxKey[]) {
    baselineByBox.set(key, new Map());
  }
  for (const row of baseline) {
    const box = boxKeyForCriterion(row);
    if (!box) continue;
    const map = baselineByBox.get(box)!;
    const semantic = normalizeCriterionSemanticKey(row.name);
    if (!semantic || map.has(semantic)) continue;
    map.set(semantic, row);
  }

  const needsReviewBySemantic = new Map<string, PersonaCriterionFormRow>();
  for (const row of needsReviewCriteria(baseline)) {
    const semantic = normalizeCriterionSemanticKey(row.name);
    if (semantic && !needsReviewBySemantic.has(semantic)) {
      needsReviewBySemantic.set(semantic, row);
    }
  }

  const out: PersonaCriterionFormRow[] = [];
  const placedSemantics = new Set<string>();

  for (const boxKey of Object.keys(BOX_CRITERION_TYPE) as CriteriaEditorBoxKey[]) {
    const criterionType = BOX_CRITERION_TYPE[boxKey];
    const isExclusion = boxKey === "exclusions";
    const lines = parseCriteriaBoxLines(boxes[boxKey] ?? "");
    const baselineMap = baselineByBox.get(boxKey)!;
    const boxModified = modified.has(boxKey);

    for (const line of lines) {
      const semantic = normalizeCriterionSemanticKey(line);
      placedSemantics.add(semantic);
      const classifiedFromReview = needsReviewBySemantic.get(semantic);
      const prior = baselineMap.get(semantic) ?? classifiedFromReview;
      const isRequired = prior?.isRequired ?? false;
      const exclusionTestability = isExclusion
        ? resolveExclusionTestability({
            name: line,
            isDisqualifier: true,
            aiValue: prior?.exclusionTestability,
          })
        : null;

      out.push({
        name: line,
        criterionType,
        description: prior?.description ?? null,
        importance: prior?.importance ?? (isExclusion ? "CRITICAL" : "MEDIUM"),
        isRequired,
        isDisqualifier: isExclusion,
        exclusionTestability,
        researchGuidance: prior?.researchGuidance ?? null,
        manuallyEdited:
          boxModified ||
          Boolean(classifiedFromReview) ||
          Boolean(prior?.manuallyEdited),
      });
    }
  }

  // Preserve needs_review rows until the user classifies or dismisses them.
  // Same text already placed in a typed box does not emit a second row.
  for (const row of needsReviewCriteria(baseline)) {
    const semantic = normalizeCriterionSemanticKey(row.name);
    if (!semantic || placedSemantics.has(semantic) || dismissed.has(semantic)) {
      continue;
    }
    out.push({
      ...row,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.needsReview,
      isDisqualifier: false,
      isRequired: false,
      exclusionTestability: null,
    });
  }

  return out;
}

/** True when normalized box text differs from the initial snapshot. */
export function criteriaEditorBoxModified(
  initial: string,
  current: string,
): boolean {
  return (
    parseCriteriaBoxLines(initial).join("\n") !==
    parseCriteriaBoxLines(current).join("\n")
  );
}

/** Research guidance lines for criteria still present in a box (by semantic key). */
export function researchGuidanceForBox(
  boxKey: CriteriaEditorBoxKey,
  boxText: string,
  baseline: PersonaCriterionFormRow[],
): string[] {
  const keys = new Set(
    parseCriteriaBoxLines(boxText).map((line) =>
      normalizeCriterionSemanticKey(line),
    ),
  );
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const row of baseline) {
    if (boxKeyForCriterion(row) !== boxKey) continue;
    const guidance = row.researchGuidance?.trim();
    if (!guidance) continue;
    const semantic = normalizeCriterionSemanticKey(row.name);
    if (!keys.has(semantic) || seen.has(guidance)) continue;
    seen.add(guidance);
    notes.push(guidance);
  }
  return notes;
}
