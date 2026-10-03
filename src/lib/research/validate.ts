import type { CompanyResearchAiResult } from "@/lib/research/assessment";
import type { RetrievedEvidenceBundle } from "@/lib/research/sources";
import type {
  CompanyResearchResult,
  ResearchConfidenceValue,
  ResearchSource,
} from "@/lib/research/types";

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

const POSTING_INCONSISTENCY =
  /\b(inconsist\w*|discrepan\w*|contradict\w*|workforce figures|conflicting (figures|numbers|headcount|employee counts)|posting (lists|says|states|claims|shows))\b/i;

const JOB_REQUIREMENT =
  /\b((role|job|position) (requires|demands|needs)|must have|years of experience|qualifications?|job(?:'s|’s)? demands|role requirements)\b/i;

/** Company events a job seeker should see. Posting noise is not in this list. */
const REAL_EMPLOYER_RISK =
  /\b(layoffs?|laid off|restructur\w*|bankrupt\w*|insolven\w*|lawsuits?|litigation|sued|regulatory|regulators?|investigation|turnover|resign\w*|stepped down|financial trouble|funding trouble|debt|shutdown|shut down)\b/i;

function mostlyPostingText(risk: string, posting: string): boolean {
  const riskNorm = risk.toLowerCase().replace(/\s+/g, " ").trim();
  const postingNorm = posting.toLowerCase().replace(/\s+/g, " ").trim();
  if (riskNorm.length >= 12 && postingNorm.includes(riskNorm)) return true;
  const words = riskNorm.match(/[a-z0-9]{3,}/g) ?? [];
  if (words.length < 4) return false;
  const postingWords = new Set(postingNorm.match(/[a-z0-9]{3,}/g) ?? []);
  const overlap = words.filter((word) => postingWords.has(word)).length;
  return overlap / words.length >= 0.75;
}

function sentenceIsEmployerRisk(
  sentence: string,
  postingText: string | null | undefined,
): boolean {
  const text = sentence.trim();
  if (!text) return false;
  if (POSTING_INCONSISTENCY.test(text)) return false;
  if (JOB_REQUIREMENT.test(text) && !REAL_EMPLOYER_RISK.test(text)) return false;
  const posting = postingText?.trim();
  if (posting && mostlyPostingText(text, posting) && !REAL_EMPLOYER_RISK.test(text)) {
    return false;
  }
  return true;
}

/**
 * Employer risk is only a real risk for a job seeker. Inconsistencies in the
 * posting and the job's own requirements are removed. A company event such as
 * layoffs stays even when the posting also mentions it.
 */
export function employerRisksForJobSeeker(
  risks: string[],
  postingText?: string | null,
): string[] {
  const kept: string[] = [];
  for (const risk of risks) {
    const sentences = risk
      .split(/(?<=[.!])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const good = (sentences.length > 0 ? sentences : [risk]).filter((sentence) =>
      sentenceIsEmployerRisk(sentence, postingText),
    );
    if (good.length > 0) kept.push(good.join(" "));
  }
  return kept;
}

function hasSubstantiveFindings(result: CompanyResearchAiResult): boolean {
  return Boolean(
    result.companySummary ||
      result.whatTheySell ||
      result.businessModel ||
      result.companySizeContext ||
      result.jobFocus ||
      result.jobFocusDetail ||
      result.customerTypes.length ||
      result.primaryMarkets.length ||
      result.relevantTechnologies.length ||
      result.hiringSignals.length ||
      result.riskSignals.length,
  );
}

/**
 * Enforce source provenance and confidence discipline.
 * - Drop source URLs not present in the retrieved evidence bundle (no fabricated citations).
 * - Zero reliable sources cannot be HIGH confidence.
 * - Clear unsupported AOV precision when no sources support it.
 */
export function validateCompanyResearchResult(
  raw: CompanyResearchAiResult,
  evidence: RetrievedEvidenceBundle,
  options?: { postingText?: string | null },
): CompanyResearchResult {
  const allowed = new Map(
    evidence.sources.map((source) => [normalizeUrl(source.url), source]),
  );

  const mergedSupports = new Map<string, Set<string>>();
  for (const source of raw.sources) {
    const key = normalizeUrl(source.url);
    if (!allowed.has(key)) continue;
    const set = mergedSupports.get(key) ?? new Set<string>();
    for (const item of source.supports) {
      if (item.trim()) set.add(item.trim());
    }
    mergedSupports.set(key, set);
  }

  const sources: ResearchSource[] = evidence.sources.map((source) => {
    const key = normalizeUrl(source.url);
    const supports = [...(mergedSupports.get(key) ?? new Set())];
    return {
      ...source,
      supports,
    };
  });

  let confidence: ResearchConfidenceValue = raw.confidence;
  if (sources.length === 0) {
    confidence = "LOW";
  } else if (confidence === "HIGH" && sources.length === 0) {
    confidence = "LOW";
  }

  // If model claimed HIGH with no sources that support any finding, downgrade.
  const anySupports = sources.some((s) => s.supports.length > 0);
  if (confidence === "HIGH" && !anySupports && hasSubstantiveFindings(raw)) {
    confidence = "MEDIUM";
  }
  if (sources.length === 0 && hasSubstantiveFindings(raw)) {
    // Findings without sources are not trustworthy — strip to unknown.
    return {
      companySummary: null,
      whatTheySell: null,
      customerTypes: [],
      primaryMarkets: [],
      businessModel: null,
      estimatedAov: null,
      aovReasoning: null,
      companySizeContext: null,
      relevantTechnologies: [],
      buyingSignals: [],
      hiringSignals: [],
      riskSignals: [],
      jobFocus: null,
      jobFocusDetail: null,
      confidence: "LOW",
      sources: [],
    };
  }

  return {
    companySummary: raw.companySummary,
    whatTheySell: raw.whatTheySell,
    customerTypes: raw.customerTypes,
    primaryMarkets: raw.primaryMarkets,
    businessModel: raw.businessModel,
    estimatedAov: null,
    aovReasoning: null,
    companySizeContext: raw.companySizeContext,
    relevantTechnologies: raw.relevantTechnologies,
    buyingSignals: [],
    hiringSignals: raw.hiringSignals,
    riskSignals: employerRisksForJobSeeker(raw.riskSignals, options?.postingText),
    jobFocus: raw.jobFocus,
    jobFocusDetail: raw.jobFocusDetail,
    confidence,
    sources,
  };
}

/** Reject impossible HIGH confidence + empty sources combinations. */
export function assertResearchConfidenceAllowed(
  result: CompanyResearchResult,
): void {
  if (result.confidence === "HIGH" && result.sources.length === 0) {
    throw new Error(
      "Invalid research result: HIGH confidence requires reliable sources.",
    );
  }
}
