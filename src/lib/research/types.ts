/**
 * Company research contracts.
 * Automated research providers plug into CompanyResearchProvider.
 *
 * COMPANY_RESEARCH_FRESHNESS_DAYS is a legacy fallback only.
 * Production freshness MUST come from Organization ResearchPolicy.researchFreshnessDays.
 */

export const COMPANY_RESEARCH_FRESHNESS_DAYS = 90;

export const RESEARCH_SOURCE_TYPES = [
  "COMPANY_WEBSITE",
  "LINKEDIN",
  "NEWS",
  "DIRECTORY",
  "REVIEW_SITE",
  "OTHER",
] as const;

export type ResearchSourceType = (typeof RESEARCH_SOURCE_TYPES)[number];

export type ResearchSource = {
  url: string;
  title?: string | null;
  publisher?: string | null;
  sourceType: ResearchSourceType;
  retrievedAt: string;
  supports: string[];
};

export type ResearchConfidenceValue = "HIGH" | "MEDIUM" | "LOW";

export type CompanyResearchResult = {
  companySummary: string | null;
  whatTheySell: string | null;

  customerTypes: string[];
  primaryMarkets: string[];
  businessModel: string | null;

  estimatedAov: string | null;
  aovReasoning: string | null;

  companySizeContext: string | null;
  relevantTechnologies: string[];
  buyingSignals: string[];
  hiringSignals: string[];
  riskSignals: string[];

  confidence: ResearchConfidenceValue;

  sources: ResearchSource[];
};

/** Automated research provenance (never includes API keys). */
export type CompanyResearchProvenance = {
  aiProvider: string;
  aiModel: string;
  aiModelUrlIdentifier: string;
  promptVersion: string;
};

export type CompanyResearchDepthPolicy = {
  maxSearchQueriesPerCompany: number;
  maxSourcesPerCompany: number;
  researchFreshnessDays: number;
};

export type ResearchStoppedReason =
  | "sufficient"
  | "website_sufficient"
  | "max_queries"
  | "no_web_search";

/** One LLM synthesis stage within automated company research. */
export type ResearchStageTiming = {
  stage: "initial" | "follow_up";
  webSearchEnabled: boolean;
  durationMs: number;
};

export type CompanyResearchInput = {
  organizationId: string;
  companyId: string;
  name: string;
  website: string | null;
  normalizedDomain: string | null;
  industry: string | null;
  employeeCount: number | null;
  location: string | null;
  /** When omitted, provider uses conservative creation-time defaults only as fallback. */
  depthPolicy?: CompanyResearchDepthPolicy;
  /** Target Employer researchGuidance lines. They direct evidence search, not fit. */
  evidenceTargets?: string[];
};

export interface CompanyResearchProvider {
  research(input: CompanyResearchInput): Promise<CompanyResearchResult>;
}
