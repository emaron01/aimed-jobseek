import type { CriterionEvidenceClassValue } from "@/lib/criteria/evidence-class";
import type { TargetedSearchDecisionValue } from "@/lib/criteria/evidence-class";
import type { IcpCriterionTierValue } from "@/lib/criteria/tier";
import type { ExclusionTestabilityValue } from "@/lib/persona-research/contract";

export const CRITERION_DATA_TYPES = [
  "TEXT",
  "NUMBER",
  "CURRENCY",
  "BOOLEAN",
  "ENUM",
  "MULTI_SELECT",
  "DATE",
] as const;

export type CriterionDataTypeValue = (typeof CRITERION_DATA_TYPES)[number];

export const CRITERION_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "IN",
  "NOT_IN",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "BETWEEN",
  "EXISTS",
  "NOT_EXISTS",
] as const;

export type CriterionOperatorValue = (typeof CRITERION_OPERATORS)[number];

export const CRITERION_IMPORTANCE = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;

export type CriterionImportanceValue = (typeof CRITERION_IMPORTANCE)[number];

/** Snapshot-safe criterion shape (no live DB ids required for historical scoring). */
export type CriterionSnapshot = {
  id?: string;
  name: string;
  description?: string | null;
  criterionType: string;
  dataType: CriterionDataTypeValue;
  operator: CriterionOperatorValue;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  allowedValues?: unknown;
  importance: CriterionImportanceValue;
  isRequired: boolean;
  isDisqualifier: boolean;
  /** Persona exclusion evidence mode; null for non-disqualifiers and ICP criteria. */
  exclusionTestability?: ExclusionTestabilityValue | null;
  researchGuidance?: string | null;
  /** Why a model-proposed Must-have or Deal-breaker was downgraded. Null when kept. */
  strengthAdjustment?: string | null;
  source?: string;
  confidence?: string | null;
  manuallyEdited?: boolean;
  /** ICP evidence class; persona criteria omit this. */
  evidenceClass?: CriterionEvidenceClassValue;
  evidenceClassLocked?: boolean;
  /** ICP only. Missing on historical snapshots → PRIMARY. */
  tier?: IcpCriterionTierValue;
  /** ICP PRIMARY only. Missing on historical snapshots → false. */
  isMandatory?: boolean;
  targetedSearchDecision?: TargetedSearchDecisionValue | null;
  targetedSearchDecisionFingerprint?: string | null;
  targetedSearchDecidedAt?: string | null;
  sortOrder: number;
};

export type InterpretedCriterionDraft = Omit<
  CriterionSnapshot,
  "id" | "manuallyEdited" | "source"
> & {
  source?: CriterionSnapshot["source"];
};

/** Human-friendly display without exposing raw operators by default. */
export function formatCriterionDisplay(c: CriterionSnapshot): string {
  const opLabel: Partial<Record<CriterionOperatorValue, string>> = {
    EQUALS: "=",
    NOT_EQUALS: "≠",
    CONTAINS: "contains",
    IN: "in",
    NOT_IN: "not in",
    GREATER_THAN: ">",
    GREATER_THAN_OR_EQUAL: "≥",
    LESS_THAN: "<",
    LESS_THAN_OR_EQUAL: "≤",
    BETWEEN: "between",
    EXISTS: "exists",
    NOT_EXISTS: "missing",
  };

  if (c.operator === "BETWEEN") {
    return `${c.name} between ${stringifyValue(c.minValue)} and ${stringifyValue(c.maxValue)}`;
  }
  if (c.operator === "EXISTS" || c.operator === "NOT_EXISTS") {
    return `${c.name} ${opLabel[c.operator]}`;
  }
  if (c.operator === "IN" || c.operator === "NOT_IN") {
    const vals = Array.isArray(c.targetValue)
      ? c.targetValue.map(stringifyValue).join(", ")
      : stringifyValue(c.targetValue);
    return `${c.name} ${opLabel[c.operator]} [${vals}]`;
  }
  return `${c.name} ${opLabel[c.operator] ?? c.operator} ${stringifyValue(c.targetValue)}`;
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyValue).join(", ");
  return JSON.stringify(value);
}

export const ICP_INTERPRETATION_PROMPT_VERSION = "7";
export const PERSONA_INTERPRETATION_PROMPT_VERSION = "2";
export const CONTACT_RESEARCH_PROMPT_VERSION = "1";
export const SCORING_LOGIC_VERSION_CRITERIA = "5";
