/**
 * Enforce Must-have and Deal-breaker against the seeker's own words.
 * The model proposes flags; this resolver downgrades any flag the text does not support.
 */

import type { CriterionImportanceValue } from "@/lib/criteria/types";
import { criterionFlags } from "@/lib/product-config";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "is",
  "be",
  "that",
  "with",
  "this",
  "from",
  "your",
  "their",
  "company",
  "companies",
  "want",
  "about",
  "still",
  "into",
  "than",
  "more",
  "less",
  "later",
  "work",
  "role",
]);

const TYPE_TERMS: Record<string, string[]> = {
  employee_count: ["employee", "employees", "headcount", "people", "size"],
  employees: ["employee", "employees", "headcount", "people", "size"],
  headcount: ["employee", "employees", "headcount", "people", "size"],
  company_size: ["employee", "employees", "headcount", "people", "size"],
  industry: ["industry", "industries"],
  industries: ["industry", "industries"],
  company_stage: ["stage", "series", "funding"],
  stage: ["stage", "series", "funding"],
  geography: ["geography", "location", "country", "based"],
  geographies: ["geography", "location", "country", "based"],
  location: ["geography", "location", "country", "based"],
  work_arrangement: ["remote", "hybrid", "onsite", "office", "arrangement"],
  culture: ["culture", "values", "psychological", "safety"],
  values: ["culture", "values", "psychological", "safety"],
  culture_values: ["culture", "values", "psychological", "safety"],
  growth_trajectory: ["growth", "growing", "trajectory"],
  growth: ["growth", "growing", "trajectory"],
};

const CLAUSE_MARKER =
  /^(?:and\s+|but\s+)?(?:i\s+)?(?:will\s+not|will\s+only|won'?t|prefer|ideally|ideal|open\s+to|would\s+like|must|need|needs|needed|required|requirement|only|never|not\s+interested(?:\s+in)?|no|don'?t\s+want|do\s+not\s+want)\b/i;

export type EmployerCriterionStrengthInput = {
  seekerText: string;
  name: string;
  criterionType: string;
  description?: string | null;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  allowedValues?: unknown;
  isRequired: boolean;
  isDisqualifier: boolean;
  importance: CriterionImportanceValue;
};

export type EmployerCriterionStrengthResult = {
  isRequired: boolean;
  isDisqualifier: boolean;
  importance: CriterionImportanceValue;
  /** Why a proposed Must-have or Deal-breaker was downgraded. Null when kept. */
  strengthAdjustment: string | null;
};

export function splitSeekerClauses(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[.!?])\s+|\s*;\s*|\n+/);
  const clauses: string[] = [];
  for (const sentence of sentences) {
    const bits = sentence.split(/,\s+/);
    let current = "";
    for (const bit of bits) {
      const trimmed = bit.trim();
      if (!trimmed) continue;
      if (!current) {
        current = trimmed;
        continue;
      }
      if (CLAUSE_MARKER.test(trimmed)) {
        clauses.push(current);
        current = trimmed;
      } else {
        current = `${current}, ${trimmed}`;
      }
    }
    if (current) clauses.push(current);
  }
  return clauses;
}

const NEGATOR_PATTERN =
  /\b(?:doesn'?t|don'?t|didn'?t|isn'?t|aren'?t|wasn'?t|weren'?t|cannot|can't|won'?t|not|no|never|without)\b/gi;

const HARD_TERM_PATTERN =
  /\b(?:must|need(?:ed|s)?|requirements?|non-?negotiable|only|necessarily)\b|\bwill only consider\b|\bi will only\b/gi;

const EXCLUSION_TERM_PATTERN =
  /\b(?:never|won'?t|will not|not interested in|do not want|don't want)\b|\bno\b(?!\s+(?:more|fewer|less|greater)\b)/gi;

/** Odd count of negators in the few words before `index` cancels the term. */
function isNegated(clause: string, index: number): boolean {
  const prefix = clause.slice(Math.max(0, index - 48), index);
  const window = prefix.trim().split(/\s+/).slice(-5).join(" ");
  const negators = window.match(NEGATOR_PATTERN);
  return (negators?.length ?? 0) % 2 === 1;
}

/**
 * "I can't work anywhere that isn't remote" requires remote.
 * The criterion term has to be what the inner negation rejects.
 */
function hasAffirmativeDoubleNegative(clause: string, terms: string[]): boolean {
  const pattern =
    /\b(?:can(?:not|'t)|unable to)\b(?:(?!\b(?:can(?:not|'t)|unable to)\b).){0,80}?\b(?:isn'?t|is not|aren'?t|are not)\s+([^.,;]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clause))) {
    const tail = match[1] ?? "";
    if (terms.some((term) => clauseMentions(tail, [term]))) return true;
  }
  return false;
}

function hasHardRequirement(clause: string, terms: string[]): boolean {
  if (hasAffirmativeDoubleNegative(clause, terms)) return true;
  HARD_TERM_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HARD_TERM_PATTERN.exec(clause))) {
    if (!isNegated(clause, match.index)) return true;
  }
  return false;
}

function isNeutralizedExclusion(term: string, after: string): boolean {
  if (
    /^never$/i.test(term) &&
    /^\s+(?:been\s+(?:a\s+)?)?(?:requirements?|required|a\s+must)\b/i.test(after)
  ) {
    return true;
  }
  if (
    /^no$/i.test(term) &&
    /^\s+(?:particular\s+)?(?:requirements?|preference|strong feelings|strong feeling|opinion)\b/i.test(
      after,
    )
  ) {
    return true;
  }
  return false;
}

function hasExclusion(clause: string): boolean {
  EXCLUSION_TERM_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXCLUSION_TERM_PATTERN.exec(clause))) {
    const term = match[0];
    const after = clause.slice(match.index + term.length);
    if (isNeutralizedExclusion(term, after)) continue;
    if (isNegated(clause, match.index)) continue;
    return true;
  }
  return false;
}

function collectTerms(value: unknown, into: Set<string>): void {
  if (value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(String(value));
    return;
  }
  if (typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const item of value) collectTerms(item, into);
    return;
  }
  if (typeof value === "object") return;
  const text = String(value).toLowerCase().replace(/[_-]+/g, " ");
  for (const token of text.split(/[^a-z0-9+]+/)) {
    if (token.length >= 3 && !STOPWORDS.has(token)) into.add(token);
    if (/^\d{2,}$/.test(token)) into.add(token);
  }
}

function criterionTerms(input: EmployerCriterionStrengthInput): string[] {
  const terms = new Set<string>();
  collectTerms(input.name, terms);
  collectTerms(input.description, terms);
  collectTerms(input.targetValue, terms);
  collectTerms(input.minValue, terms);
  collectTerms(input.maxValue, terms);
  collectTerms(input.allowedValues, terms);
  const slug = input.criterionType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  for (const term of TYPE_TERMS[slug] ?? []) terms.add(term);
  collectTerms(slug, terms);
  return [...terms];
}

function clauseMentions(clause: string, terms: string[]): boolean {
  const haystack = clause.toLowerCase().replace(/[_-]+/g, " ");
  return terms.some((term) => {
    const needle = term.toLowerCase().replace(/[_-]+/g, " ");
    if (/^\d+$/.test(needle)) return haystack.includes(needle);
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
  });
}

function preferenceImportance(clauses: string[]): CriterionImportanceValue {
  const blob = clauses.join(" ");
  if (/\b(?:prefer|ideally|ideal)\b/i.test(blob)) return "HIGH";
  if (/\bopen to\b/i.test(blob)) return "LOW";
  return "MEDIUM";
}

export function applyEmployerCriterionStrength(
  input: EmployerCriterionStrengthInput,
): EmployerCriterionStrengthResult {
  const clauses = splitSeekerClauses(input.seekerText);
  const terms = criterionTerms(input);
  const relevant =
    terms.length === 0
      ? []
      : clauses.filter((clause) => clauseMentions(clause, terms));
  const requiredSupported = relevant.some((clause) =>
    hasHardRequirement(clause, terms),
  );
  const exclusionSupported = relevant.some(hasExclusion);

  const isRequired = input.isRequired && requiredSupported;
  const isDisqualifier = input.isDisqualifier && exclusionSupported;
  const reasons: string[] = [];

  if (input.isRequired && !isRequired) {
    reasons.push(
      `${criterionFlags.required} was removed because the seeker's text does not state a hard requirement (must, only, need, required, non-negotiable, or will only consider) for this criterion.`,
    );
  }
  if (input.isDisqualifier && !isDisqualifier) {
    reasons.push(
      `${criterionFlags.disqualifier} was removed because the seeker's text does not state an explicit exclusion (no, never, won't, not interested in, or equivalent) for this criterion.`,
    );
  }

  const downgraded = reasons.length > 0;
  return {
    isRequired,
    isDisqualifier,
    importance: downgraded
      ? preferenceImportance(relevant)
      : input.importance,
    strengthAdjustment: downgraded ? reasons.join(" ") : null,
  };
}
