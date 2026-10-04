/**
 * Research prose shown on the application company section and the Cheat Sheet
 * company section. Display applies this to stored rows without rewriting them.
 * Save applies the same text cleanup before a new row is written.
 *
 * A sentence with no citation stays when it names no other company, person,
 * number, or date. A sentence attributed to the job posting stays. A real
 * employer risk stays. An employer-risk sentence about the job is removed.
 */

import {
  hostIsEmployerSite,
  researchSourceHost,
} from "@/lib/research/source-policy";
import type { CompanyResearchResult, ResearchSource } from "@/lib/research/types";
import { employerRisksForJobSeeker } from "@/lib/research/validate";

const PROSE_FIELDS = [
  "companySummary",
  "whatTheySell",
  "businessModel",
  "companySizeContext",
  "jobFocus",
  "jobFocusDetail",
] as const;

const LIST_FIELDS = [
  "customerTypes",
  "primaryMarkets",
  "relevantTechnologies",
  "hiringSignals",
  "riskSignals",
] as const;

type ProseField = (typeof PROSE_FIELDS)[number];
type ListField = (typeof LIST_FIELDS)[number];

export type ResearchTextPart =
  | { type: "text"; value: string }
  | { type: "cite"; number: number; url: string };

export type ResearchCleanupContext = {
  anchorHost?: string | null;
  sisterHosts?: readonly string[] | null;
  companyName?: string | null;
  postingText?: string | null;
  /** Employer products and brands. Names found here are not other companies. */
  brandText?: string | null;
};

/** Model text sometimes stores the two characters "\" and "n" instead of a newline. */
export function unescapeResearchNewlines(text: string): string {
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function stripTrackingParameters(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      const name = key.toLowerCase();
      if (name.startsWith("utm_") || name === "gclid" || name === "fbclid") {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function stripTrackingInText(text: string): string {
  return text.replace(/https?:\/\/[^\s)\]>"']+/gi, (url) => {
    const trimmed = url.replace(/[.,;:]+$/g, "");
    const suffix = url.slice(trimmed.length);
    return `${stripTrackingParameters(trimmed)}${suffix}`;
  });
}

function paragraphsOf(text: string): string[] {
  return unescapeResearchNewlines(text)
    .split(/\n+/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function sentencesOf(paragraph: string): string[] {
  const parts = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [paragraph];
}

function hostsInText(text: string): string[] {
  const hosts = new Set<string>();
  const urlRe = /https?:\/\/[^\s)\]>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text))) {
    const host = researchSourceHost(match[0].replace(/[.,;:]+$/g, ""));
    if (host) hosts.add(host);
  }
  const hostRe = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;
  while ((match = hostRe.exec(text))) {
    const host = match[0].replace(/^www\./i, "").toLowerCase();
    if (host.includes(".")) hosts.add(host);
  }
  return [...hosts];
}

function keptCitationHosts(
  sources: ResearchSource[],
  context: ResearchCleanupContext,
): { employer: (host: string) => boolean; listed: Set<string> } {
  const listed = new Set<string>();
  for (const source of sources) {
    const host = researchSourceHost(stripTrackingParameters(source.url));
    if (host) listed.add(host);
  }
  return {
    listed,
    employer: (host: string) =>
      hostIsEmployerSite(host, context.anchorHost, context.sisterHosts),
  };
}

/**
 * Remove a sentence only when every citation host in it was dropped.
 * A sentence with at least one kept host stays.
 * A sentence with no citation host stays (unchanged from today).
 */
export function sentenceCitesOnlyDroppedSources(
  sentence: string,
  sources: ResearchSource[],
  context: ResearchCleanupContext,
): boolean {
  const hosts = hostsInText(sentence);
  if (hosts.length === 0) return false;
  const kept = keptCitationHosts(sources, context);
  return hosts.every((host) => !kept.employer(host) && !kept.listed.has(host));
}

const POSTING_ATTRIBUTION =
  /\b(?:job posting|the posting|this posting|according to the (?:job )?posting|the (?:job )?posting (?:says|states|lists|describes|requires|calls for|emphasizes|notes))\b/i;

const REAL_EMPLOYER_RISK_TEXT =
  /\b(layoffs?|laid off|restructur\w*|bankrupt\w*|insolven\w*|lawsuits?|litigation|sued|regulatory|regulators?|investigation|turnover|resign\w*|stepped down|financial trouble|funding trouble|debt|shutdown|shut down)\b/i;

const ORDINARY_CAPITALS = new Set([
  "a",
  "an",
  "and",
  "available",
  "before",
  "brand",
  "company",
  "culture",
  "domain",
  "during",
  "enterprise",
  "evidence",
  "for",
  "from",
  "global",
  "however",
  "it",
  "its",
  "leadership",
  "market",
  "markets",
  "or",
  "our",
  "recent",
  "sales",
  "security",
  "service",
  "services",
  "that",
  "the",
  "their",
  "these",
  "this",
  "those",
  "we",
  "while",
  "with",
]);

function nameTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of value.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 2) tokens.add(token);
  }
  return tokens;
}

function isEmployerOrBrand(name: string, allowed: Set<string>): boolean {
  const parts = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return false;
  const compact = parts.join("");
  if (allowed.has(compact)) return true;
  return parts.every((part) => allowed.has(part));
}

function sentenceHasQuantity(sentence: string): boolean {
  return /(?:^|[^A-Za-z])\d+(?:[.,]\d+)*(?:%|\b)/.test(sentence);
}

/**
 * An uncited sentence names a specific other company, person, number, or date.
 * The employer and its brands are not other companies. A short all-caps token
 * such as B2B or CSC is not a company name.
 */
export function sentenceHasUnsupportedSpecific(
  sentence: string,
  context: ResearchCleanupContext = {},
): boolean {
  if (sentenceHasQuantity(sentence)) return true;
  const allowed = nameTokens(
    `${context.companyName ?? ""} ${context.brandText ?? ""} ${context.anchorHost ?? ""} ${(context.sisterHosts ?? []).join(" ")}`,
  );
  const internalCap = (sentence.match(/\b[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g) ?? []).filter(
    (name) => /[a-z]/.test(name),
  );
  if (internalCap.some((name) => !isEmployerOrBrand(name, allowed))) return true;
  const words = sentence.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
  const sentenceStart = sentence.match(/[A-Za-z][A-Za-z0-9]*/)?.[0] ?? "";
  let skippedStart = false;
  for (const word of words) {
    if (!skippedStart && word === sentenceStart) {
      skippedStart = true;
      continue;
    }
    const lower = word.toLowerCase();
    if (ORDINARY_CAPITALS.has(lower)) continue;
    if (isEmployerOrBrand(word, allowed)) continue;
    return true;
  }
  const person = sentence.match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g) ?? [];
  return person.some((name) => !isEmployerOrBrand(name, allowed));
}

function sentenceIsPostingAttributed(
  sentence: string,
  context: ResearchCleanupContext,
): boolean {
  if (POSTING_ATTRIBUTION.test(sentence)) return true;
  const posting = context.postingText?.toLowerCase().replace(/\s+/g, " ").trim();
  if (!posting) return false;
  const text = sentence.toLowerCase().replace(/\s+/g, " ").trim();
  if (text.length >= 12 && posting.includes(text)) return true;
  const words = text.match(/[a-z0-9]{3,}/g) ?? [];
  if (words.length < 4) return false;
  const postingWords = new Set(posting.match(/[a-z0-9]{3,}/g) ?? []);
  const overlap = words.filter((word) => postingWords.has(word)).length;
  return overlap / words.length >= 0.75;
}

function sentenceLacksCitation(
  sentence: string,
  sources: ResearchSource[],
): boolean {
  if (hostsInText(sentence).length > 0) return false;
  return !sources.some((source) => {
    const title = source.title?.trim().toLowerCase() ?? "";
    return title.length >= 8 && sentence.toLowerCase().includes(title);
  });
}

export function cleanResearchProse(
  text: string,
  sources: ResearchSource[],
  context: ResearchCleanupContext = {},
): string {
  const paragraphs = paragraphsOf(stripTrackingInText(text));
  const kept = paragraphs
    .map((paragraph) =>
      sentencesOf(paragraph)
        .filter((sentence) => {
          if (sentenceCitesOnlyDroppedSources(sentence, sources, context)) {
            return false;
          }
          if (REAL_EMPLOYER_RISK_TEXT.test(sentence)) return true;
          if (!sentenceLacksCitation(sentence, sources)) return true;
          if (sentenceIsPostingAttributed(sentence, context)) return true;
          return !sentenceHasUnsupportedSpecific(sentence, context);
        })
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  return kept.join("\n\n");
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fieldText(fields: Record<string, string>, key: string): string {
  return fields[key]?.trim() ?? "";
}

function sourceSupportsLiveField(
  source: ResearchSource,
  fields: Record<string, string>,
): boolean {
  return source.supports.some((support) => {
    const value = compact(support);
    if (!value) return false;
    return Object.entries(fields).some(([key, text]) => {
      if (!text.trim()) return false;
      const name = compact(key);
      return value === name || value.includes(name) || name.includes(value);
    });
  });
}

function textCitesSource(text: string, source: ResearchSource): boolean {
  const lower = text.toLowerCase();
  const url = stripTrackingParameters(source.url).toLowerCase().replace(/\/$/, "");
  if (url && lower.includes(url)) return true;
  const title = source.title?.trim().toLowerCase() ?? "";
  return title.length >= 8 && lower.includes(title);
}

/** Sources cited by a remaining fact. An empty supports list and no mention is uncited. */
export function sourcesCitedByKeptFacts(
  sources: ResearchSource[],
  fields: Record<string, string>,
): ResearchSource[] {
  const allText = Object.values(fields).join("\n");
  const seen = new Set<string>();
  const cited: ResearchSource[] = [];
  for (const source of sources) {
    const url = stripTrackingParameters(source.url);
    const key = url.replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    const copy = { ...source, url };
    if (!sourceSupportsLiveField(copy, fields) && !textCitesSource(allText, copy)) {
      continue;
    }
    seen.add(key);
    cited.push(copy);
  }
  return cited;
}

function fieldContext(
  key: string,
  input: Pick<CompanyResearchResult, ProseField | ListField>,
  context: ResearchCleanupContext,
): ResearchCleanupContext {
  const brandText = [
    context.companyName,
    context.brandText,
    key === "whatTheySell" ? "" : input.whatTheySell,
  ]
    .filter(Boolean)
    .join(" ");
  return { ...context, brandText };
}

function labelEmployerWebsiteSources(
  sources: ResearchSource[],
  context: ResearchCleanupContext,
): ResearchSource[] {
  return sources.map((source) => {
    const host = researchSourceHost(stripTrackingParameters(source.url));
    if (!host || !hostIsEmployerSite(host, context.anchorHost, context.sisterHosts)) {
      return source;
    }
    return source.sourceType === "COMPANY_WEBSITE"
      ? source
      : { ...source, sourceType: "COMPANY_WEBSITE" };
  });
}

function cleanedFields(
  input: Pick<CompanyResearchResult, ProseField | ListField>,
  sources: ResearchSource[],
  context: ResearchCleanupContext,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of PROSE_FIELDS) {
    fields[key] = cleanResearchProse(
      input[key] ?? "",
      sources,
      fieldContext(key, input, context),
    );
  }
  for (const key of LIST_FIELDS) {
    const rawItems =
      key === "riskSignals"
        ? employerRisksForJobSeeker(input.riskSignals ?? [], context.postingText)
        : (input[key] ?? []);
    const items = rawItems
      .map((item) =>
        cleanResearchProse(item, sources, fieldContext(key, input, context)),
      )
      .filter(Boolean);
    fields[key] = items.join("\n");
    for (const [index, item] of items.entries()) {
      fields[`${key}:${index}`] = item;
    }
  }
  return fields;
}

export function cleanResearchForSave(
  result: CompanyResearchResult,
  context: ResearchCleanupContext = {},
): CompanyResearchResult {
  const sources = labelEmployerWebsiteSources(
    result.sources.map((source) => ({
      ...source,
      url: stripTrackingParameters(source.url),
    })),
    context,
  );
  const fields = cleanedFields(result, sources, context);
  const lists = {} as Record<ListField, string[]>;
  for (const key of LIST_FIELDS) {
    const rawItems =
      key === "riskSignals"
        ? employerRisksForJobSeeker(result.riskSignals ?? [], context.postingText)
        : (result[key] ?? []);
    lists[key] = rawItems
      .map((item) =>
        cleanResearchProse(item, sources, fieldContext(key, result, context)),
      )
      .filter(Boolean);
  }
  const prose: Record<string, string> = {};
  for (const key of PROSE_FIELDS) prose[key] = fields[key] ?? "";
  for (const key of LIST_FIELDS) {
    prose[key] = lists[key].join("\n");
  }
  return {
    ...result,
    companySummary: fieldText(prose, "companySummary") || null,
    whatTheySell: fieldText(prose, "whatTheySell") || null,
    businessModel: fieldText(prose, "businessModel") || null,
    companySizeContext: fieldText(prose, "companySizeContext") || null,
    jobFocus: fieldText(prose, "jobFocus") || null,
    jobFocusDetail: fieldText(prose, "jobFocusDetail") || null,
    customerTypes: lists.customerTypes,
    primaryMarkets: lists.primaryMarkets,
    relevantTechnologies: lists.relevantTechnologies,
    hiringSignals: lists.hiringSignals,
    riskSignals: lists.riskSignals,
    sources: sourcesCitedByKeptFacts(sources, prose),
  };
}

export type PresentedCompanyResearch = {
  companySummary: string;
  whatTheySell: string;
  businessModel: string;
  companySizeContext: string;
  jobFocus: string;
  jobFocusDetail: string;
  customerTypes: string[];
  primaryMarkets: string[];
  relevantTechnologies: string[];
  hiringSignals: string[];
  riskSignals: string[];
  sources: ResearchSource[];
};

export function presentCompanyResearch(
  input: {
    companySummary?: string | null;
    whatTheySell?: string | null;
    businessModel?: string | null;
    companySizeContext?: string | null;
    jobFocus?: string | null;
    jobFocusDetail?: string | null;
    customerTypes?: string[] | null;
    primaryMarkets?: string[] | null;
    relevantTechnologies?: string[] | null;
    hiringSignals?: string[] | null;
    riskSignals?: string[] | null;
    sources?: ResearchSource[] | null;
  },
  context: ResearchCleanupContext = {},
): PresentedCompanyResearch {
  const cleaned = cleanResearchForSave(
    {
      companySummary: input.companySummary ?? null,
      whatTheySell: input.whatTheySell ?? null,
      customerTypes: input.customerTypes ?? [],
      primaryMarkets: input.primaryMarkets ?? [],
      businessModel: input.businessModel ?? null,
      estimatedAov: null,
      aovReasoning: null,
      companySizeContext: input.companySizeContext ?? null,
      relevantTechnologies: input.relevantTechnologies ?? [],
      buyingSignals: [],
      hiringSignals: input.hiringSignals ?? [],
      riskSignals: input.riskSignals ?? [],
      jobFocus: input.jobFocus ?? null,
      jobFocusDetail: input.jobFocusDetail ?? null,
      confidence: "MEDIUM",
      sources: input.sources ?? [],
    },
    context,
  );
  return {
    companySummary: cleaned.companySummary ?? "",
    whatTheySell: cleaned.whatTheySell ?? "",
    businessModel: cleaned.businessModel ?? "",
    companySizeContext: cleaned.companySizeContext ?? "",
    jobFocus: cleaned.jobFocus ?? "",
    jobFocusDetail: cleaned.jobFocusDetail ?? "",
    customerTypes: cleaned.customerTypes,
    primaryMarkets: cleaned.primaryMarkets,
    relevantTechnologies: cleaned.relevantTechnologies,
    hiringSignals: cleaned.hiringSignals,
    riskSignals: cleaned.riskSignals,
    sources: cleaned.sources,
  };
}

function sourcesMatchingCitation(
  inner: string,
  sources: ResearchSource[],
): ResearchSource[] {
  const lower = inner.toLowerCase();
  const urls = [...lower.matchAll(/https?:\/\/[^\s)<>"']+/gi)].map((match) =>
    stripTrackingParameters(match[0]).toLowerCase().replace(/\/$/, ""),
  );
  const matched: ResearchSource[] = [];
  for (const source of sources) {
    const title = source.title?.trim().toLowerCase() ?? "";
    const url = stripTrackingParameters(source.url).toLowerCase().replace(/\/$/, "");
    const host = researchSourceHost(source.url) ?? "";
    const titleHit = title.length >= 8 && lower.includes(title);
    const urlHit = urls.some(
      (found) => found === url || found.startsWith(`${url}/`) || found.startsWith(`${url}?`),
    );
    const hostHit = host.length > 0 && (lower === host || lower === `www.${host}`);
    if (titleHit || urlHit || hostHit) matched.push(source);
  }
  return matched;
}

function markerParts(
  matched: ResearchSource[],
  sources: ResearchSource[],
): ResearchTextPart[] {
  const parts: ResearchTextPart[] = [];
  const seen = new Set<number>();
  for (const source of matched) {
    const number =
      sources.findIndex(
        (row) =>
          stripTrackingParameters(row.url).replace(/\/$/, "").toLowerCase() ===
          stripTrackingParameters(source.url).replace(/\/$/, "").toLowerCase(),
      ) + 1;
    if (number <= 0 || seen.has(number)) continue;
    seen.add(number);
    parts.push({
      type: "cite",
      number,
      url: stripTrackingParameters(source.url),
    });
  }
  return parts;
}

function tidyCitationParts(parts: ResearchTextPart[]): ResearchTextPart[] {
  const next = parts.map((part) => (part.type === "text" ? { ...part } : part));
  for (let index = 0; index < next.length; index += 1) {
    if (next[index]?.type !== "cite") continue;
    const previous = next[index - 1];
    if (previous?.type === "text") {
      previous.value = previous.value.replace(
        /(?:\s*\[[^\[\]\n]{0,120}\])?\s*\(?\s*$/u,
        "",
      );
    }
    const following = next[index + 1];
    if (following?.type === "text") {
      following.value = following.value.replace(/^[\s)\](]+/u, (lead) => {
        const rest = following.value.slice(lead.length);
        if (!rest) return "";
        return /^[A-Za-z0-9]/.test(rest) ? " " : "";
      });
    }
  }
  const compacted: ResearchTextPart[] = [];
  for (const part of next) {
    if (part.type === "text") {
      if (!part.value) continue;
      const last = compacted[compacted.length - 1];
      if (last?.type === "text") {
        last.value += part.value;
        continue;
      }
    }
    compacted.push(part);
  }
  return compacted;
}

function citeInline(sentence: string, sources: ResearchSource[]): ResearchTextPart[] {
  const pattern = /\(([^)]+)\)|https?:\/\/[^\s)<>"']+/gi;
  const parts: ResearchTextPart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sentence))) {
    const raw = match[0];
    const inner = match[1] ?? raw;
    const matched = sourcesMatchingCitation(inner, sources);
    if (matched.length === 0) continue;
    if (match.index > cursor) {
      parts.push({ type: "text", value: sentence.slice(cursor, match.index) });
    }
    parts.push(...markerParts(matched, sources));
    cursor = match.index + raw.length;
  }
  if (cursor < sentence.length) {
    parts.push({ type: "text", value: sentence.slice(cursor) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: sentence }];
}

function citationOnlySources(
  sentence: string,
  sources: ResearchSource[],
): ResearchSource[] {
  const bare = sentence.replace(/[.!?]+$/g, "").trim().toLowerCase();
  if (!bare) return [];
  return sources.filter((source) => {
    const title = source.title?.trim().toLowerCase() ?? "";
    const host = researchSourceHost(source.url) ?? "";
    return (title.length >= 8 && bare === title) || (host.length > 0 && bare === host);
  });
}

/** Replace parenthetical titles, domains, and URLs with numbered source markers. */
export function citeResearchParagraph(
  paragraph: string,
  sources: ResearchSource[],
): ResearchTextPart[] {
  const parts: ResearchTextPart[] = [];
  for (const sentence of sentencesOf(paragraph)) {
    const only = citationOnlySources(sentence, sources);
    const next = tidyCitationParts(
      only.length > 0 ? markerParts(only, sources) : citeInline(sentence, sources),
    );
    if (parts.length > 0) parts.push({ type: "text", value: " " });
    parts.push(...next);
  }
  return parts.length > 0 ? parts : [{ type: "text", value: paragraph }];
}

export function researchParagraphParts(
  text: string,
  sources: ResearchSource[],
): ResearchTextPart[][] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];
  return paragraphs.map((paragraph) => citeResearchParagraph(paragraph, sources));
}

export function citationNumbersInParts(parts: ResearchTextPart[][]): number[] {
  const numbers: number[] = [];
  for (const paragraph of parts) {
    for (const part of paragraph) {
      if (part.type === "cite" && !numbers.includes(part.number)) {
        numbers.push(part.number);
      }
    }
  }
  return numbers;
}
