import type {
  JobRequirementModelOutput,
  JobScorecard,
  ParsedJobRequirement,
  ScorecardItem,
} from "@/lib/job-requirement/types";

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A value is stated only when the posting contains it. Anything else is dropped. */
export function statedInPosting(value: string, rawText: string): boolean {
  const needle = value.trim().toLowerCase();
  if (needle.length < 2) return false;
  return rawText.toLowerCase().includes(needle);
}

function statedOrNull(value: string | null | undefined, rawText: string): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return statedInPosting(cleaned, rawText) ? cleaned : null;
}

function statedList(values: string[] | null | undefined, rawText: string): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const stated = statedOrNull(value, rawText);
    if (!stated) continue;
    const key = stated.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(stated);
  }
  return kept;
}

/** Stable across re-parses of the same item so later steps can reference it. */
export function stableScorecardId(kind: string, text: string): string {
  const input = `${kind}\n${text.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `sc_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function scorecardItem(
  kind: string,
  item: { text?: string | null; inferred?: boolean | null } | null | undefined,
  rawText: string,
): ScorecardItem | null {
  const text = clean(item?.text);
  if (!text) return null;
  const stated = statedInPosting(text, rawText);
  return {
    id: stableScorecardId(kind, text),
    text,
    inferred: stated ? false : true,
  };
}

function scorecardList(
  kind: string,
  items: Array<{ text?: string | null; inferred?: boolean | null }> | null | undefined,
  rawText: string,
): ScorecardItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const kept: ScorecardItem[] = [];
  for (const item of items) {
    const next = scorecardItem(kind, item, rawText);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    kept.push(next);
  }
  return kept;
}

export function emptyScorecard(): JobScorecard {
  return { mission: null, outcomes: [], competencies: [] };
}

/**
 * Keep only fields the posting states. Derived scorecard items stay, marked inferred.
 * Required and preferred stay in the lists the model assigned.
 */
export function normalizeParsedJobRequirement(
  model: JobRequirementModelOutput,
  rawText: string,
): ParsedJobRequirement {
  const posting = rawText ?? "";
  const requiredItems = statedList(model.requiredItems, posting);
  const requiredKeys = new Set(requiredItems.map((item) => item.toLowerCase()));
  const preferredItems = statedList(model.preferredItems, posting).filter(
    (item) => !requiredKeys.has(item.toLowerCase()),
  );
  const scorecard = model.scorecard ?? {};
  return {
    title: statedOrNull(model.title, posting),
    companyName: statedOrNull(model.companyName, posting),
    location: statedOrNull(model.location, posting),
    workArrangement: statedOrNull(model.workArrangement, posting),
    employmentType: statedOrNull(model.employmentType, posting),
    seniority: statedOrNull(model.seniority, posting),
    compensationRange: statedOrNull(model.compensationRange, posting),
    reportingLine: statedOrNull(model.reportingLine, posting),
    responsibilities: statedList(model.responsibilities, posting),
    requiredItems,
    preferredItems,
    scorecard: {
      mission: scorecardItem("mission", scorecard.mission, posting),
      outcomes: scorecardList("outcome", scorecard.outcomes, posting),
      competencies: scorecardList("competency", scorecard.competencies, posting),
    },
  };
}
