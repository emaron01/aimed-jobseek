/**
 * Deterministic evidence-sufficiency evaluator for progressive company research.
 *
 * Official / company-website sources weigh more for product/customer/market facts.
 * Third-party sources help size/market/tech context.
 * AOV alone must NOT force unbounded additional searches.
 */

import type { ResearchSource } from "@/lib/research/types";

export type EvidenceDimensions = {
  companyIdentity: boolean;
  whatTheySell: boolean;
  customerTypes: boolean;
  businessModel: boolean;
  companySizeContext: boolean;
  primaryMarkets: boolean;
  relevantTechnologies: boolean;
  buyingSignals: boolean;
  riskSignals: boolean;
  estimatedAov: boolean;
};

export type SufficiencyInput = {
  sources: ResearchSource[];
  fields: {
    companySummary?: string | null;
    whatTheySell?: string | null;
    customerTypes?: string[] | null;
    businessModel?: string | null;
    companySizeContext?: string | null;
    primaryMarkets?: string[] | null;
    relevantTechnologies?: string[] | null;
    buyingSignals?: string[] | null;
    hiringSignals?: string[] | null;
    riskSignals?: string[] | null;
    estimatedAov?: string | null;
  };
  maxSourcesPerCompany: number;
};

export type SufficiencyResult = {
  sufficient: boolean;
  score: number;
  requiredMet: boolean;
  dimensions: EvidenceDimensions;
  missingPrimary: Array<keyof EvidenceDimensions>;
  missingSecondary: Array<keyof EvidenceDimensions>;
  qualityWeightedSourceScore: number;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length >= 8);
}

function hasList(value: string[] | null | undefined): boolean {
  return Array.isArray(value) && value.some((v) => v.trim().length > 0);
}

function sourceWeight(source: ResearchSource): number {
  switch (source.sourceType) {
    case "COMPANY_WEBSITE":
      return 3;
    case "LINKEDIN":
      return 2;
    case "NEWS":
      return 1.5;
    case "DIRECTORY":
      return 1.2;
    case "REVIEW_SITE":
      return 1.2;
    default:
      return 1;
  }
}

export function evaluateEvidenceSufficiency(
  input: SufficiencyInput,
): SufficiencyResult {
  const dims: EvidenceDimensions = {
    companyIdentity: hasText(input.fields.companySummary),
    whatTheySell: hasText(input.fields.whatTheySell),
    customerTypes: hasList(input.fields.customerTypes),
    businessModel: hasText(input.fields.businessModel),
    companySizeContext: hasText(input.fields.companySizeContext),
    primaryMarkets: hasList(input.fields.primaryMarkets),
    relevantTechnologies: hasList(input.fields.relevantTechnologies),
    buyingSignals:
      hasList(input.fields.buyingSignals) || hasList(input.fields.hiringSignals),
    riskSignals: hasList(input.fields.riskSignals),
    estimatedAov: hasText(input.fields.estimatedAov),
  };

  const primaryKeys: Array<keyof EvidenceDimensions> = [
    "companyIdentity",
    "whatTheySell",
    "customerTypes",
    "businessModel",
    "companySizeContext",
  ];
  const secondaryKeys: Array<keyof EvidenceDimensions> = [
    "primaryMarkets",
    "relevantTechnologies",
    "buyingSignals",
    "riskSignals",
    // estimatedAov intentionally secondary and never required for sufficiency
    "estimatedAov",
  ];

  const missingPrimary = primaryKeys.filter((k) => !dims[k]);
  const missingSecondary = secondaryKeys.filter(
    (k) => k !== "estimatedAov" && !dims[k],
  );

  const qualityWeightedSourceScore = input.sources.reduce(
    (sum, s) => sum + sourceWeight(s),
    0,
  );

  // Cap influence of source spam: count quality, not raw source volume.
  const cappedSources = input.sources.slice(0, input.maxSourcesPerCompany);
  const cappedQuality = cappedSources.reduce(
    (sum, s) => sum + sourceWeight(s),
    0,
  );

  const requiredMet = missingPrimary.length === 0;
  // Sufficient when all primary dimensions are present AND we have solid
  // quality-weighted evidence (official sources count more than junk).
  const sufficient =
    requiredMet &&
    cappedQuality >= 4 &&
    (    cappedSources.some((s) => s.sourceType === "COMPANY_WEBSITE") ||
      cappedQuality >= 6);

  let score = 0;
  for (const k of primaryKeys) if (dims[k]) score += 12;
  for (const k of secondaryKeys) if (dims[k] && k !== "estimatedAov") score += 5;
  if (dims.estimatedAov) score += 2;
  score += Math.min(20, Math.round(qualityWeightedSourceScore * 2));

  return {
    sufficient,
    score,
    requiredMet,
    dimensions: dims,
    missingPrimary,
    missingSecondary,
    qualityWeightedSourceScore,
  };
}

/**
 * Build a targeted follow-up search focus from missing primary dimensions.
 * Does not request AOV-only follow-ups.
 */
export function buildTargetedSearchFocus(
  missingPrimary: Array<keyof EvidenceDimensions>,
  missingSecondary: Array<keyof EvidenceDimensions>,
): string {
  const targets = [...missingPrimary, ...missingSecondary].filter(
    (k) => k !== "estimatedAov",
  );
  if (targets.length === 0) {
    return "Confirm company identity, products sold, and customer segments with official sources.";
  }

  const labels: Record<keyof EvidenceDimensions, string> = {
    companyIdentity: "company identity and official description",
    whatTheySell: "products and services sold",
    customerTypes: "customer types and buyer segments",
    businessModel: "business model and pricing model",
    companySizeContext: "company size, employees, or scale",
    primaryMarkets: "primary markets and geographies",
    relevantTechnologies: "technologies and integrations used",
    buyingSignals: "hiring and growth signals",
    riskSignals: "risk or churn signals",
    estimatedAov: "average order value",
  };

  return `Find evidence specifically for: ${targets.map((t) => labels[t]).join("; ")}. Prefer the official company website.`;
}
