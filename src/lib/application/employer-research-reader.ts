/**
 * One reader for an application's employer research.
 * Tailored research anchored to the company website is preferred and does not
 * require seeker confirmation. Otherwise the shared company row is returned
 * through the existing usable-research gate, with no job focus.
 */
import {
  anchorHostFromResearchTimings,
  employerWebsiteAnchor,
} from "@/lib/application/company-website";
import { usableEmployerResearch } from "@/lib/job-requirement/identity-verification";
import type { CompanyResearchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";
import { parseStringArray } from "@/lib/research";
import type { ResearchSource, ResearchSourceType } from "@/lib/research/types";

const RESEARCH_SOURCE_TYPES = new Set<string>([
  "COMPANY_WEBSITE",
  "LINKEDIN",
  "NEWS",
  "DIRECTORY",
  "REVIEW_SITE",
  "OTHER",
]);

export type EmployerResearchModelInput = {
  companySummary: string | null;
  whatTheySell: string | null;
  businessModel: string | null;
  companySizeContext: string | null;
  hiringSignals: string[];
  riskSignals: string[];
  jobFocus: string | null;
  jobFocusDetail: string | null;
};

export type ApplicationEmployerResearchView = EmployerResearchModelInput & {
  source: "tailored" | "shared";
  id: string;
  updatedAt: Date;
  status: CompanyResearchStatus;
  customerTypes: string[];
  primaryMarkets: string[];
  relevantTechnologies: string[];
  researchSources: ResearchSource[];
  researchedAt: Date | null;
  researchMethod: string | null;
  anchorHost: string | null;
};

type ResearchRow = {
  id: string;
  status: string;
  companySummary?: string | null;
  whatTheySell?: string | null;
  customerTypes?: unknown;
  primaryMarkets?: unknown;
  businessModel?: string | null;
  companySizeContext?: string | null;
  relevantTechnologies?: unknown;
  hiringSignals?: unknown;
  riskSignals?: unknown;
  jobFocus?: string | null;
  jobFocusDetail?: string | null;
  researchSources?: unknown;
  researchedAt?: Date | null;
  updatedAt: Date;
  researchMethod?: string | null;
  researchStageTimings?: unknown;
  anchorHost?: string | null;
  identityAmbiguous?: boolean;
};

type RequirementForResearch = {
  identityConfirmation?: "PENDING" | "CONFIRMED" | "REJECTED" | null;
  identityVerificationJson?: unknown;
  rawText?: string | null;
  title?: string | null;
  companyName?: string | null;
  location?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  compensationRange?: string | null;
  suppliedEmployerWebsite?: string | null;
  company?: {
    name?: string | null;
    location?: string | null;
    website?: string | null;
    normalizedDomain?: string | null;
  } | null;
};

function asSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return [];
  const sources: ResearchSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.url !== "string" || !row.url.trim()) continue;
    const sourceType = RESEARCH_SOURCE_TYPES.has(String(row.sourceType))
      ? (String(row.sourceType) as ResearchSourceType)
      : "OTHER";
    sources.push({
      url: row.url,
      title: typeof row.title === "string" ? row.title : null,
      publisher: typeof row.publisher === "string" ? row.publisher : null,
      sourceType,
      retrievedAt:
        typeof row.retrievedAt === "string"
          ? row.retrievedAt
          : new Date(0).toISOString(),
      supports: parseStringArray(row.supports),
    });
  }
  return sources;
}

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text || null;
}

function hasTailoredContent(row: ResearchRow): boolean {
  return Boolean(
    trimmed(row.companySummary) ||
      trimmed(row.whatTheySell) ||
      trimmed(row.businessModel) ||
      trimmed(row.companySizeContext) ||
      trimmed(row.jobFocus) ||
      trimmed(row.jobFocusDetail) ||
      parseStringArray(row.customerTypes).length ||
      parseStringArray(row.primaryMarkets).length ||
      parseStringArray(row.relevantTechnologies).length ||
      parseStringArray(row.hiringSignals).length ||
      parseStringArray(row.riskSignals).length,
  );
}

function toView(
  row: ResearchRow,
  source: "tailored" | "shared",
): ApplicationEmployerResearchView {
  return {
    source,
    id: row.id,
    updatedAt: row.updatedAt,
    status: row.status as CompanyResearchStatus,
    companySummary: trimmed(row.companySummary),
    whatTheySell: trimmed(row.whatTheySell),
    customerTypes: parseStringArray(row.customerTypes),
    primaryMarkets: parseStringArray(row.primaryMarkets),
    businessModel: trimmed(row.businessModel),
    companySizeContext: trimmed(row.companySizeContext),
    hiringSignals: parseStringArray(row.hiringSignals),
    riskSignals: parseStringArray(row.riskSignals),
    relevantTechnologies: parseStringArray(row.relevantTechnologies),
    jobFocus: source === "tailored" ? trimmed(row.jobFocus) : null,
    jobFocusDetail: source === "tailored" ? trimmed(row.jobFocusDetail) : null,
    researchSources: asSources(row.researchSources),
    researchedAt: row.researchedAt ?? null,
    researchMethod: row.researchMethod ?? (source === "tailored" ? "AUTOMATED" : null),
    anchorHost:
      trimmed(row.anchorHost) ??
      anchorHostFromResearchTimings(row.researchStageTimings),
  };
}

export function employerResearchModelInput(
  view: ApplicationEmployerResearchView,
): EmployerResearchModelInput {
  return {
    companySummary: view.companySummary,
    whatTheySell: view.whatTheySell,
    businessModel: view.businessModel,
    companySizeContext: view.companySizeContext,
    hiringSignals: view.hiringSignals,
    riskSignals: view.riskSignals,
    jobFocus: view.jobFocus,
    jobFocusDetail: view.jobFocusDetail,
  };
}

function tailoredAnchorMatches(
  requirement: RequirementForResearch,
  row: ResearchRow,
): boolean {
  const anchor = employerWebsiteAnchor({
    suppliedEmployerWebsite: requirement.suppliedEmployerWebsite,
    companyWebsite: requirement.company?.website,
    companyDomain: requirement.company?.normalizedDomain,
  });
  if (!anchor) return false;
  const host =
    trimmed(row.anchorHost)?.toLowerCase() ??
    anchorHostFromResearchTimings(row.researchStageTimings);
  return host === anchor.domain;
}

/**
 * Prefer anchored tailored research without confirmation. Fall back to the
 * shared company row through usableEmployerResearch.
 */
export function selectApplicationEmployerResearch(input: {
  requirement: RequirementForResearch;
  tailored: ResearchRow | null;
  shared: ResearchRow | null;
}): ApplicationEmployerResearchView | null {
  const tailored = input.tailored;
  const rejected = input.requirement.identityConfirmation === "REJECTED";
  if (
    tailored &&
    !rejected &&
    (tailored.status === "COMPLETED" || tailored.status === "PARTIAL") &&
    hasTailoredContent(tailored) &&
    tailoredAnchorMatches(input.requirement, tailored)
  ) {
    return toView(tailored, "tailored");
  }
  const shared = usableEmployerResearch(input.requirement, input.shared);
  if (!shared) return null;
  return toView(shared, "shared");
}

export async function loadApplicationEmployerResearch(input: {
  organizationId: string;
  campaignId: string;
}): Promise<ApplicationEmployerResearchView | null> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    include: {
      company: {
        include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!requirement) return null;
  const tailored = await prisma.applicationEmployerResearch.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    orderBy: { updatedAt: "desc" },
  });
  return selectApplicationEmployerResearch({
    requirement,
    tailored,
    shared: requirement.company?.research[0] ?? null,
  });
}
