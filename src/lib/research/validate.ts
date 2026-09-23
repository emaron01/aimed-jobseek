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

function hasSubstantiveFindings(result: CompanyResearchAiResult): boolean {
  return Boolean(
    result.companySummary ||
      result.whatTheySell ||
      result.businessModel ||
      result.estimatedAov ||
      result.companySizeContext ||
      result.customerTypes.length ||
      result.primaryMarkets.length ||
      result.relevantTechnologies.length ||
      result.buyingSignals.length ||
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
      aovReasoning:
        "Insufficient reliable sources to support company findings.",
      companySizeContext: null,
      relevantTechnologies: [],
      buyingSignals: [],
      hiringSignals: [],
      riskSignals: [],
      confidence: "LOW",
      sources: [],
    };
  }

  let estimatedAov = raw.estimatedAov;
  let aovReasoning = raw.aovReasoning;
  const aovSupported = sources.some((s) =>
    s.supports.some((item) => /aov|deal|pricing|contract/i.test(item)),
  );
  if (estimatedAov && sources.length > 0 && !aovSupported && confidence === "HIGH") {
    // Keep estimate but confidence already constrained; prefer explicit unknown if weak.
    confidence = confidence === "HIGH" ? "MEDIUM" : confidence;
  }
  if (!estimatedAov && !aovReasoning) {
    estimatedAov = null;
    aovReasoning = null;
  }

  return {
    companySummary: raw.companySummary,
    whatTheySell: raw.whatTheySell,
    customerTypes: raw.customerTypes,
    primaryMarkets: raw.primaryMarkets,
    businessModel: raw.businessModel,
    estimatedAov,
    aovReasoning,
    companySizeContext: raw.companySizeContext,
    relevantTechnologies: raw.relevantTechnologies,
    buyingSignals: raw.buyingSignals,
    hiringSignals: raw.hiringSignals,
    riskSignals: raw.riskSignals,
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
