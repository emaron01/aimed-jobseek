/**
 * Fact resolver: list fields first, then research prose, else unresolved.
 *
 * Kind comes from the criterion's dataType / operator / target at runtime.
 * This module is the company-shaped fact source. Evaluation does not live here.
 */

import type { CriterionSnapshot } from "@/lib/criteria/types";

export const NUMERIC_EVIDENCE_KIND = "numeric-evidence" as const;

export type NumericEvidence = {
  kind: typeof NUMERIC_EVIDENCE_KIND;
  min: number | null;
  max: number | null;
  display: string;
};

export type ActualProvenanceSource = "LIST" | "RESEARCH";

export type ActualProvenance = {
  source: ActualProvenanceSource;
  field: string;
  excerpt: string | null;
  displayValue: string;
  label: string;
  hedged: boolean;
};

export type CompanyListActuals = {
  industry?: string | null;
  employeeCount?: number | null;
  revenue?: { toString(): string } | number | string | null;
  location?: string | null;
};

export type CompanyResearchActuals = {
  relevantTechnologies?: string[] | null;
  buyingSignals?: string[] | null;
  hiringSignals?: string[] | null;
  riskSignals?: string[] | null;
  primaryMarkets?: string[] | null;
  companySizeContext?: string | null;
  companySummary?: string | null;
  whatTheySell?: string | null;
  businessModel?: string | null;
};

export type CompanyActualResolution = {
  value: unknown;
  provenance: ActualProvenance | null;
};

/**
 * Hedge words on the claim itself. A cited source ("LinkedIn lists…") is not a hedge.
 * "approximately 200" is; "201–500" is not.
 */
export const RESEARCH_HEDGE_PATTERN =
  /\b(approximately|approx\.?|around|about|roughly|estimated|estimates?|perhaps|maybe|possibly|likely|appears?|seems?|could be|might be|unclear|unknown|reportedly|believed|allegedly|or so)\b/i;

const CURRENCY_MARK =
  /\$|\busd\b|\bmillion\b|\bbillion\b|\bmm\b/i;

export function isNumericEvidence(value: unknown): value is NumericEvidence {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { kind?: unknown }).kind === NUMERIC_EVIDENCE_KIND,
  );
}

export function isHedgedResearchText(text: string): boolean {
  return RESEARCH_HEDGE_PATTERN.test(text);
}

function hasListValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function listText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "toString" in value) {
    return String(value.toString()).trim();
  }
  return String(value).trim();
}

function parseCountToken(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function sentenceAt(text: string, index: number, length: number): string {
  const before = text.slice(0, index);
  const after = text.slice(index + length);
  const start = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("\n"),
  );
  const ends = [".", "!", "?", "\n"]
    .map((mark) => after.indexOf(mark))
    .filter((pos) => pos >= 0);
  const endRel = ends.length > 0 ? Math.min(...ends) : after.length;
  return text.slice(start + 1, index + length + endRel + 1).trim();
}

function provenanceLabel(
  shortName: string,
  displayValue: string,
  source: ActualProvenanceSource,
): string {
  const from = source === "LIST" ? "from your list" : "from research";
  return `${shortName}: ${displayValue} (${from})`;
}

function listResolution(
  shortName: string,
  field: string,
  value: unknown,
  displayValue: string,
): CompanyActualResolution {
  return {
    value,
    provenance: {
      source: "LIST",
      field,
      excerpt: null,
      displayValue,
      label: provenanceLabel(shortName, displayValue, "LIST"),
      hedged: false,
    },
  };
}

function unresolved(): CompanyActualResolution {
  return { value: null, provenance: null };
}

function hedgedResolution(
  shortName: string,
  field: string,
  excerpt: string,
): CompanyActualResolution {
  return {
    value: null,
    provenance: {
      source: "RESEARCH",
      field,
      excerpt,
      displayValue: excerpt,
      label: `${shortName}: unresolved (hedged research)`,
      hedged: true,
    },
  };
}

function researchResolution(
  shortName: string,
  field: string,
  value: unknown,
  displayValue: string,
  excerpt: string,
): CompanyActualResolution {
  return {
    value,
    provenance: {
      source: "RESEARCH",
      field,
      excerpt,
      displayValue,
      label: provenanceLabel(shortName, displayValue, "RESEARCH"),
      hedged: false,
    },
  };
}

type NumericHit = {
  evidence: NumericEvidence;
  excerpt: string;
  hedged: boolean;
};

function looksLikeCurrency(text: string): boolean {
  return CURRENCY_MARK.test(text);
}

function extractNumericEvidence(text: string): NumericHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const rangeRe =
    /(\d{1,3}(?:,\d{3})*)\s*[–—-]\s*(\d{1,3}(?:,\d{3})*)(?:\s*\+)?/gi;
  for (const match of trimmed.matchAll(rangeRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    if (looksLikeCurrency(excerpt) || looksLikeCurrency(match[0])) continue;
    const min = parseCountToken(match[1] ?? "");
    const max = parseCountToken(match[2] ?? "");
    if (min == null || max == null || min > max) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min,
        max,
        display: `${min.toLocaleString("en-US")}–${max.toLocaleString("en-US")}`,
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  const atLeastRe =
    /(?:at least|more than|over|minimum of)\s+(\d{1,3}(?:,\d{3})*)/gi;
  for (const match of trimmed.matchAll(atLeastRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    if (looksLikeCurrency(excerpt) || looksLikeCurrency(match[0])) continue;
    const min = parseCountToken(match[1] ?? "");
    if (min == null) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min,
        max: null,
        display: `${min.toLocaleString("en-US")}+`,
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  const upToRe =
    /(?:up to|fewer than|less than|under|no more than)\s+(\d{1,3}(?:,\d{3})*)/gi;
  for (const match of trimmed.matchAll(upToRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    if (looksLikeCurrency(excerpt) || looksLikeCurrency(match[0])) continue;
    const max = parseCountToken(match[1] ?? "");
    if (max == null) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min: null,
        max,
        display: `up to ${max.toLocaleString("en-US")}`,
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  const plusRe = /(\d{1,3}(?:,\d{3})*)\+/gi;
  for (const match of trimmed.matchAll(plusRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    if (looksLikeCurrency(excerpt) || looksLikeCurrency(match[0])) continue;
    const min = parseCountToken(match[1] ?? "");
    if (min == null) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min,
        max: null,
        display: `${min.toLocaleString("en-US")}+`,
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  return null;
}

function scaleSuffix(suffix: string): number | null {
  const s = suffix.toLowerCase();
  if (s === "k") return 1_000;
  if (s === "m" || s === "million") return 1_000_000;
  if (s === "b" || s === "billion") return 1_000_000_000;
  return null;
}

function extractCurrencyEvidence(text: string): NumericHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const re =
    /(?:\$|usd)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k|m|b|million|billion)?\b|(?<![A-Za-z])(\d+(?:\.\d+)?)\s*(million|billion)\b/gi;
  for (const match of trimmed.matchAll(re)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    const amountRaw = match[1] ?? match[3];
    const suffix = match[2] ?? match[4] ?? "";
    const amount = Number(String(amountRaw ?? "").replace(/,/g, ""));
    const multiplier = suffix ? scaleSuffix(suffix) : 1;
    if (!Number.isFinite(amount) || multiplier == null) continue;
    const value = amount * multiplier;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min: value,
        max: value,
        display: match[0].trim(),
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }
  return null;
}

function targetNeedles(criterion: CriterionSnapshot): string[] {
  const values = [
    ...(Array.isArray(criterion.targetValue)
      ? criterion.targetValue
      : criterion.targetValue != null
        ? [criterion.targetValue]
        : []),
    ...(Array.isArray(criterion.allowedValues)
      ? criterion.allowedValues
      : criterion.allowedValues != null
        ? [criterion.allowedValues]
        : []),
  ];
  return values
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
}

function findTargetExcerpt(
  text: string,
  needles: string[],
): { excerpt: string; hedged: boolean } | null {
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  for (const needle of needles) {
    const index = lower.indexOf(needle);
    if (index < 0) continue;
    const excerpt = sentenceAt(text, index, needle.length);
    return { excerpt, hedged: isHedgedResearchText(excerpt) };
  }
  return null;
}

function joinList(values: string[] | null | undefined): string | null {
  if (!values?.length) return null;
  const joined = values.map(String).filter(Boolean).join(", ");
  return joined || null;
}

function researchField(
  research: CompanyResearchActuals | null | undefined,
  field: keyof CompanyResearchActuals,
): string | null {
  if (!research) return null;
  const raw = research[field];
  if (Array.isArray(raw)) return joinList(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

const RESEARCH_TEXT_FIELDS: Array<keyof CompanyResearchActuals> = [
  "companySizeContext",
  "companySummary",
  "whatTheySell",
  "businessModel",
  "relevantTechnologies",
  "buyingSignals",
  "hiringSignals",
  "riskSignals",
  "primaryMarkets",
];

function firstExtractedFromResearch(
  research: CompanyResearchActuals | null | undefined,
  extract: (text: string) => NumericHit | null,
): { field: string; hit: NumericHit } | null {
  for (const field of RESEARCH_TEXT_FIELDS) {
    const text = researchField(research, field);
    if (!text) continue;
    const hit = extract(text);
    if (hit) return { field, hit };
  }
  return null;
}

function firstTextMatchFromResearch(
  research: CompanyResearchActuals | null | undefined,
  needles: string[],
): { field: string; text: string; excerpt: string; hedged: boolean } | null {
  if (needles.length === 0) return null;
  let hedged: { field: string; text: string; excerpt: string } | null = null;
  for (const field of RESEARCH_TEXT_FIELDS) {
    const text = researchField(research, field);
    if (!text) continue;
    const found = findTargetExcerpt(text, needles);
    if (!found) continue;
    if (found.hedged) {
      hedged = { field, text, excerpt: found.excerpt };
      continue;
    }
    return { field, text, excerpt: found.excerpt, hedged: false };
  }
  if (hedged) {
    return { ...hedged, hedged: true };
  }
  return null;
}

function applyExtractedHit(
  criterion: CriterionSnapshot,
  extracted: { field: string; hit: NumericHit },
): CompanyActualResolution {
  if (extracted.hit.hedged) {
    return hedgedResolution(criterion.name, extracted.field, extracted.hit.excerpt);
  }
  return researchResolution(
    criterion.name,
    extracted.field,
    extracted.hit.evidence,
    extracted.hit.evidence.display,
    extracted.hit.excerpt,
  );
}

function resolveNumeric(
  criterion: CriterionSnapshot,
  company: CompanyListActuals,
  research?: CompanyResearchActuals | null,
): CompanyActualResolution {
  if (company.employeeCount != null) {
    return listResolution(
      criterion.name,
      "employeeCount",
      company.employeeCount,
      String(company.employeeCount),
    );
  }
  const extracted = firstExtractedFromResearch(research, extractNumericEvidence);
  if (!extracted) return unresolved();
  return applyExtractedHit(criterion, extracted);
}

function resolveCurrency(
  criterion: CriterionSnapshot,
  company: CompanyListActuals,
  research?: CompanyResearchActuals | null,
): CompanyActualResolution {
  if (hasListValue(company.revenue)) {
    const display = listText(company.revenue);
    return listResolution(criterion.name, "revenue", company.revenue, display);
  }
  const extracted = firstExtractedFromResearch(research, extractCurrencyEvidence);
  if (!extracted) return unresolved();
  return applyExtractedHit(criterion, extracted);
}

function listFieldMatchesNeedles(
  value: unknown,
  needles: string[],
): boolean {
  if (!hasListValue(value) || needles.length === 0) return false;
  const actual = listText(value).toLowerCase();
  return needles.some(
    (needle) => actual === needle || actual.includes(needle),
  );
}

function resolveText(
  criterion: CriterionSnapshot,
  company: CompanyListActuals,
  research?: CompanyResearchActuals | null,
): CompanyActualResolution {
  const needles = targetNeedles(criterion);
  // List text columns win only when they answer this criterion's target.
  // dataType TEXT has two list slots (industry, location); neither is used
  // as a default actual for an unrelated criterion.
  if (listFieldMatchesNeedles(company.industry, needles)) {
    return listResolution(
      criterion.name,
      "industry",
      company.industry,
      listText(company.industry),
    );
  }
  if (listFieldMatchesNeedles(company.location, needles)) {
    return listResolution(
      criterion.name,
      "location",
      company.location,
      listText(company.location),
    );
  }
  const found = firstTextMatchFromResearch(research, needles);
  if (!found) return unresolved();
  if (found.hedged) {
    return hedgedResolution(criterion.name, found.field, found.excerpt);
  }
  return researchResolution(
    criterion.name,
    found.field,
    found.text,
    found.excerpt,
    found.excerpt,
  );
}

/**
 * List value if present, else research, else unresolved.
 * Routes by criterion dataType — never by criterion name.
 */
export function resolveCompanyActualWithProvenance(
  criterion: CriterionSnapshot,
  company: CompanyListActuals,
  research?: CompanyResearchActuals | null,
): CompanyActualResolution {
  switch (criterion.dataType) {
    case "NUMBER":
      return resolveNumeric(criterion, company, research);
    case "CURRENCY":
      return resolveCurrency(criterion, company, research);
    case "DATE":
    case "BOOLEAN":
      return resolveText(criterion, company, research);
    default:
      return resolveText(criterion, company, research);
  }
}

export function resolveCompanyActualForCriterion(
  criterion: CriterionSnapshot,
  company: CompanyListActuals,
  research?: CompanyResearchActuals | null,
): unknown {
  return resolveCompanyActualWithProvenance(criterion, company, research).value;
}

export function readCriterionProvenanceLabels(assessmentData: unknown): string[] {
  if (!assessmentData || typeof assessmentData !== "object") return [];
  const rows = (assessmentData as { criterionAssessments?: unknown })
    .criterionAssessments;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const provenance = (row as { provenance?: Partial<ActualProvenance> })
        .provenance;
      if (typeof provenance?.label === "string" && provenance.label.trim()) {
        return provenance.label.trim();
      }
      return null;
    })
    .filter((label): label is string => Boolean(label));
}
