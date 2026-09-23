import { COMPANY_RESEARCH_FRESHNESS_DAYS } from "@/lib/research/types";
import type {
  CompanyResearch as PrismaCompanyResearch,
} from "@prisma/client";

type CompanyResearchContent = {
  companySummary?: unknown;
  whatTheySell?: unknown;
  estimatedAov?: unknown;
  aovReasoning?: unknown;
  customerTypes?: unknown;
  primaryMarkets?: unknown;
  businessModel?: unknown;
  companySizeContext?: unknown;
  relevantTechnologies?: unknown;
  buyingSignals?: unknown;
  hiringSignals?: unknown;
  riskSignals?: unknown;
  researchConfidence?: unknown;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && Boolean(value.trim());
}

export function hasUsableCompanyResearchFields(
  research: CompanyResearchContent | null | undefined,
): boolean {
  if (!research) return false;
  return Boolean(
    hasText(research.companySummary) ||
      hasText(research.whatTheySell) ||
      hasText(research.estimatedAov) ||
      hasText(research.aovReasoning) ||
      parseStringArray(research.customerTypes).length ||
      parseStringArray(research.primaryMarkets).length ||
      hasText(research.businessModel) ||
      hasText(research.companySizeContext) ||
      parseStringArray(research.relevantTechnologies).length ||
      parseStringArray(research.buyingSignals).length ||
      parseStringArray(research.hiringSignals).length ||
      parseStringArray(research.riskSignals).length,
  );
}

export function researchExpiresAt(
  from: Date = new Date(),
  freshnessDays = COMPANY_RESEARCH_FRESHNESS_DAYS,
): Date {
  const expires = new Date(from);
  expires.setUTCDate(expires.getUTCDate() + freshnessDays);
  return expires;
}

export function isResearchFresh(
  research: Pick<
    PrismaCompanyResearch,
    "status" | "expiresAt" | "researchedAt"
  > &
    CompanyResearchContent,
  now: Date = new Date(),
  freshnessDays: number = COMPANY_RESEARCH_FRESHNESS_DAYS,
): boolean {
  if (research.status !== "COMPLETED" && research.status !== "PARTIAL") {
    return false;
  }
  if (!hasUsableCompanyResearchFields(research)) {
    return false;
  }
  if (research.expiresAt && research.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  if (!research.expiresAt && research.researchedAt) {
    const ageMs = now.getTime() - research.researchedAt.getTime();
    const maxMs = freshnessDays * 24 * 60 * 60 * 1000;
    if (ageMs > maxMs) return false;
  }
  return true;
}

export function needsResearchRefresh(
  research: PrismaCompanyResearch | null | undefined,
  now: Date = new Date(),
  freshnessDays: number = COMPANY_RESEARCH_FRESHNESS_DAYS,
): boolean {
  if (!research) return true;
  if (research.status === "FAILED" || research.status === "NOT_STARTED") {
    return true;
  }
  if (research.status === "IN_PROGRESS") return false;
  return !isResearchFresh(research, now, freshnessDays);
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}
