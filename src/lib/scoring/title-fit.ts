/**
 * Positive title-fit gate for all-personas scoring.
 *
 * Matching reads each persona's own likelyTitles (stored as targetTitles).
 * It does not use a hardcoded job-title list. Word-level variant expansion
 * lets equivalent phrasings match: "VP Sales" / "VP of Sales" /
 * "Vice President of Sales", and "CRO" / "Chief Revenue Officer".
 */

import { evaluatePersonaExclusions } from "@/lib/scoring/persona-exclusions";
import type { PersonaSnapshot } from "@/lib/scoring/types";
import { vocab } from "@/lib/product-config";

export const ALL_PERSONAS_VALUE = "__all__";

export type TitleGateStatus = "CANDIDATE" | "EXCLUDED" | "UNKNOWN";

export type PersonaTitleGateResult = {
  personaId: string;
  personaName: string;
  status: TitleGateStatus;
  reason: string;
  matchedTitle?: string;
};

const STOPWORDS = new Set([
  "of",
  "the",
  "and",
  "for",
  "a",
  "an",
  "in",
  "at",
  "to",
  "or",
]);

const SENIORITY_TOKENS = new Set([
  "vp",
  "svp",
  "evp",
  "director",
  "head",
  "chief",
  "senior",
  "sr",
  "jr",
  "lead",
  "manager",
]);

/** Longest phrases first so "senior vice president" wins over "vice president". */
const LONG_TO_SHORT: Array<[RegExp, string]> = [
  [/\bsenior vice president\b/g, "svp"],
  [/\bexecutive vice president\b/g, "evp"],
  [/\bvice president\b/g, "vp"],
  [/\bchief revenue officer\b/g, "cro"],
  [/\bchief executive officer\b/g, "ceo"],
  [/\bchief financial officer\b/g, "cfo"],
  [/\bchief operating officer\b/g, "coo"],
  [/\bchief marketing officer\b/g, "cmo"],
  [/\bchief technology officer\b/g, "cto"],
  [/\bchief information officer\b/g, "cio"],
  [/\bchief people officer\b/g, "cpo"],
  [/\brevenue operations\b/g, "revops"],
  [/\bsales operations\b/g, "salesops"],
  [/\bhead of\b/g, "head"],
  [/\bdirector of\b/g, "director"],
];

function foldDottedAbbreviations(value: string): string {
  return value.replace(
    /\b([A-Za-z])(?:\.([A-Za-z]))+\./g,
    (match) => match.replace(/\./g, "").toLowerCase(),
  );
}

function collapseWhitespace(value: string): string {
  return foldDottedAbbreviations(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Canonical compact form: punctuation stripped, stopwords kept until token
 * filtering, long titles folded to acronyms, SVP/EVP folded to VP so
 * seniority variants of the same function still match.
 */
export function canonicalTitle(value: string): string {
  let text = collapseWhitespace(value);
  for (const [pattern, short] of LONG_TO_SHORT) {
    text = text.replace(pattern, short);
  }
  text = text.replace(/\b(svp|evp)\b/g, "vp");
  return text
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token))
    .join(" ");
}

export function titleTokens(value: string): string[] {
  return canonicalTitle(value)
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token));
}

function isSubset(small: Set<string>, large: Set<string>): boolean {
  return [...small].every((token) => large.has(token));
}

function meaningfulSubset(tokens: string[]): boolean {
  const content = tokens.filter((token) => !SENIORITY_TOKENS.has(token));
  if (content.length >= 1 && tokens.length >= 2) return true;
  if (content.length === 1 && content[0]!.length >= 4) return true;
  return false;
}

export function titlesMatch(contactTitle: string, likelyTitle: string): boolean {
  const contactTokens = titleTokens(contactTitle);
  const likelyTokens = titleTokens(likelyTitle);
  if (contactTokens.length === 0 || likelyTokens.length === 0) return false;
  if (contactTokens.join(" ") === likelyTokens.join(" ")) return true;
  if (
    likelyTokens.length === 1 &&
    contactTokens[0] === likelyTokens[0]
  ) {
    return true;
  }

  const contactSet = new Set(contactTokens);
  const likelySet = new Set(likelyTokens);
  if (isSubset(likelySet, contactSet) && meaningfulSubset(likelyTokens)) {
    return true;
  }
  if (isSubset(contactSet, likelySet) && meaningfulSubset(contactTokens)) {
    return true;
  }

  const overlap = [...contactSet].filter((token) => likelySet.has(token));
  if (overlap.length >= 2) {
    const union = new Set([...contactSet, ...likelySet]);
    return overlap.length / union.size >= 2 / 3;
  }
  return false;
}

export function contactMatchesPersonaTitles(
  contactTitle: string | null | undefined,
  likelyTitles: string[] | null | undefined,
): { matched: boolean; matchedTitle?: string } {
  const title = (contactTitle ?? "").trim();
  if (!title) return { matched: false };
  const list = (likelyTitles ?? [])
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
  if (list.length === 0) return { matched: false };
  for (const likely of list) {
    if (titlesMatch(title, likely)) {
      return { matched: true, matchedTitle: likely };
    }
  }
  return { matched: false };
}

export function evaluatePersonaTitleGate(input: {
  persona: Pick<PersonaSnapshot, "id" | "name" | "targetTitles" | "criteria">;
  contactTitle: string | null | undefined;
  applyPositiveFit: boolean;
}): PersonaTitleGateResult {
  const titleExclusion = evaluatePersonaExclusions({
    criteria: input.persona.criteria ?? [],
    title: input.contactTitle ?? null,
    contactResearch: null,
  }).find(
    (assessment) =>
      assessment.testability === "TITLE_TESTABLE" &&
      assessment.outcome === "CONFIRMED",
  );
  if (titleExclusion) {
    return {
      personaId: input.persona.id,
      personaName: input.persona.name,
      status: "EXCLUDED",
      reason: titleExclusion.reasoning,
    };
  }

  if (!input.applyPositiveFit) {
    return {
      personaId: input.persona.id,
      personaName: input.persona.name,
      status: "CANDIDATE",
      reason: `Single-${vocab.persona.singular} run — title fit is not used as a gate.`,
    };
  }

  const fit = contactMatchesPersonaTitles(
    input.contactTitle,
    input.persona.targetTitles,
  );
  if (fit.matched) {
    return {
      personaId: input.persona.id,
      personaName: input.persona.name,
      status: "CANDIDATE",
      reason: `Title matched likely title "${fit.matchedTitle}".`,
      matchedTitle: fit.matchedTitle,
    };
  }

  return {
    personaId: input.persona.id,
    personaName: input.persona.name,
    status: "UNKNOWN",
    reason: input.contactTitle?.trim()
      ? `Title did not match this ${vocab.persona.singular}'s likely titles and was not title-excluded.`
      : `No ${vocab.contact.singular} title is available to test ${vocab.persona.singular} fit.`,
  };
}

export function resolvePersonaSnapshots(input: {
  personaSnapshot: unknown;
  personaSnapshots?: unknown;
}): PersonaSnapshot[] {
  if (Array.isArray(input.personaSnapshots) && input.personaSnapshots.length > 0) {
    return input.personaSnapshots as PersonaSnapshot[];
  }
  if (input.personaSnapshot && typeof input.personaSnapshot === "object") {
    return [input.personaSnapshot as PersonaSnapshot];
  }
  return [];
}
