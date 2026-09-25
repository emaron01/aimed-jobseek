/**
 * Node-safe post-research identity and fit for an application.
 * The research worker imports this after researching the employer.
 */

import type { Prisma } from "@prisma/client";
import {
  computeApplicationEmployerFit,
} from "@/lib/application/fit";
import { decisionAfterResearchIdentity } from "@/lib/job-requirement/employer";
import {
  identityMismatchReason,
  identityStaleReason,
  parseIdentityVerification,
  postingIdentityInput,
  researchIdentityInput,
  verifyEmployerIdentity,
} from "@/lib/job-requirement/identity-verification";
import { normalizeEvidenceClass } from "@/lib/criteria/evidence-class";
import type { CompanyResearchActuals } from "@/lib/criteria/research-cascade";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import {
  emptyEmployerCompensationProfile,
  parseEmploymentTypeCodes,
  type EmployerCompensationProfile,
} from "@/lib/application/compensation-fit";
import { prisma } from "@/lib/prisma-client";
import { vocab } from "@/lib/product-config";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import type { ResearchCompanyResult } from "@/lib/tenant/company-research-service";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function researchActuals(row: {
  companySummary: string | null;
  whatTheySell: string | null;
  businessModel: string | null;
  companySizeContext: string | null;
  relevantTechnologies: Prisma.JsonValue | null;
  buyingSignals: Prisma.JsonValue | null;
  hiringSignals: Prisma.JsonValue | null;
  riskSignals: Prisma.JsonValue | null;
  primaryMarkets: Prisma.JsonValue | null;
} | null): CompanyResearchActuals | null {
  if (!row) return null;
  return {
    companySummary: row.companySummary,
    whatTheySell: row.whatTheySell,
    businessModel: row.businessModel,
    companySizeContext: row.companySizeContext,
    relevantTechnologies: parseStringArray(row.relevantTechnologies),
    buyingSignals: parseStringArray(row.buyingSignals),
    hiringSignals: parseStringArray(row.hiringSignals),
    riskSignals: parseStringArray(row.riskSignals),
    primaryMarkets: parseStringArray(row.primaryMarkets),
  };
}

function decimalToNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function employerCompensationFromIcp(icp: {
  targetAnnualEarningsMin: unknown;
  targetAnnualEarningsTarget: unknown;
  targetHourlyRateMin: unknown;
  targetHourlyRateTarget: unknown;
  compensationCurrency: string | null;
  employmentTypes: unknown;
  annualEarningsMinimumRequired: boolean;
  hourlyRateMinimumRequired: boolean;
  employmentTypeRequired: boolean;
}): EmployerCompensationProfile {
  return {
    targetAnnualEarningsMin: decimalToNumber(icp.targetAnnualEarningsMin),
    targetAnnualEarningsTarget: decimalToNumber(icp.targetAnnualEarningsTarget),
    targetHourlyRateMin: decimalToNumber(icp.targetHourlyRateMin),
    targetHourlyRateTarget: decimalToNumber(icp.targetHourlyRateTarget),
    compensationCurrency: icp.compensationCurrency,
    employmentTypes: parseEmploymentTypeCodes(icp.employmentTypes),
    annualEarningsMinimumRequired: icp.annualEarningsMinimumRequired,
    hourlyRateMinimumRequired: icp.hourlyRateMinimumRequired,
    employmentTypeRequired: icp.employmentTypeRequired,
  };
}

export async function loadCriteria(
  organizationId: string,
  icpId: string,
): Promise<{
  criteria: CriterionSnapshot[];
  version: string | null;
  updatedAt: Date;
  targets: string[];
  compensation: EmployerCompensationProfile;
}> {
  const icp = await prisma.icp.findFirst({
    where: { id: icpId, organizationId },
    include: { criteria: { orderBy: { sortOrder: "asc" } } },
  });
  if (!icp) {
    throw new TenantError(
      `${vocab.icp.Singular} was not found for this ${vocab.campaign.singular}.`,
    );
  }
  const criteria: CriterionSnapshot[] = icp.criteria.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    criterionType: row.criterionType,
    dataType: row.dataType,
    operator: row.operator,
    targetValue: row.targetValue,
    minValue: row.minValue,
    maxValue: row.maxValue,
    importance: row.importance,
    isRequired: row.isRequired,
    isDisqualifier: row.isDisqualifier,
    researchGuidance: row.researchGuidance,
    evidenceClass: normalizeEvidenceClass(row.evidenceClass),
    tier: row.tier,
    isMandatory: row.isMandatory,
    sortOrder: row.sortOrder,
  }));
  return {
    criteria,
    version: icp.interpretationPromptVersion,
    updatedAt: icp.updatedAt,
    targets: criteria
      .map((criterion) => criterion.researchGuidance?.trim() ?? "")
      .filter(Boolean),
    compensation: employerCompensationFromIcp(icp),
  };
}

export async function scoreFit(input: {
  organizationId: string;
  campaignId: string;
  icpId: string;
  companyId: string;
}): Promise<void> {
  const profile = await loadCriteria(input.organizationId, input.icpId);
  const research = await prisma.companyResearch.findFirst({
    where: {
      organizationId: input.organizationId,
      companyId: input.companyId,
      status: { in: ["COMPLETED", "PARTIAL"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  const requirementForUse = await prisma.jobRequirement.findFirst({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    select: { identityConfirmation: true, identityVerificationJson: true },
  });
  const verification = parseIdentityVerification(
    requirementForUse?.identityVerificationJson,
  );
  if (
    !research ||
    research.identityAmbiguous ||
    requirementForUse?.identityConfirmation === "REJECTED" ||
    (requirementForUse?.identityConfirmation !== "CONFIRMED" &&
      verification?.verdict === "AMBIGUOUS")
  ) {
    return;
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    select: { compensationRange: true, employmentType: true },
  });
  const computed = computeApplicationEmployerFit({
    criteria: profile.criteria,
    company: {
      industry: null,
      employeeCount: null,
      revenue: null,
      location: null,
    },
    research: researchActuals(research),
    interpretationPromptVersion: profile.version,
    compensation: {
      profile: profile.compensation ?? emptyEmployerCompensationProfile(),
      compensationRange: requirement?.compensationRange ?? null,
      employmentType: requirement?.employmentType ?? null,
    },
  });
  const now = new Date();
  const data = {
    bucket: computed.bucket,
    outcomesJson: jsonValue(computed.outcomes),
    computedAt: now,
    companyResearchId: research.id,
    companyResearchUpdatedAt: research.updatedAt,
    icpUpdatedAt: profile.updatedAt,
    interpretationPromptVersion: profile.version,
    stale: false,
    staleReason: null,
  };
  await prisma.applicationFit.upsert({
    where: { campaignId: input.campaignId },
    create: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      icpId: input.icpId,
      ...data,
    },
    update: data,
  });
}

export async function markIdentityDependentsStale(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  await prisma.applicationFit.updateMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    data: {
      stale: true,
      staleReason: identityStaleReason(),
    },
  });
}

export function researchFailureReason(result: {
  skipped?: boolean;
  reason?: string;
  researchFailed?: boolean;
}): string | null {
  if (result.researchFailed) {
    return result.reason?.trim() || "Employer research failed, so fit was not scored.";
  }
  if (result.skipped && result.reason === "fresh") return null;
  if (result.skipped && result.reason === "provider_unconfigured") {
    return "Employer research is not configured, so fit was not scored.";
  }
  if (result.skipped && result.reason) return result.reason;
  return null;
}

export async function finishApplicationAfterResearch(input: {
  organizationId: string;
  campaignId: string;
  icpId: string;
  companyId: string;
  result: ResearchCompanyResult;
}): Promise<void> {
  const failure = researchFailureReason(input.result);
  const research = input.result.research;
  if (failure || !research || (research.status !== "COMPLETED" && research.status !== "PARTIAL")) {
    await prisma.jobRequirement.update({
      where: { campaignId: input.campaignId },
      data: {
        employerSkipReason:
          failure ?? "Employer research did not finish, so fit was not scored.",
      },
    });
    return;
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
    include: { company: { select: { name: true, location: true, website: true } } },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement.`,
    );
  }
  const verification = verifyEmployerIdentity({
    posting: postingIdentityInput(requirement),
    research: researchIdentityInput({
      ...research,
      company: requirement.company,
    }),
  });
  const after = decisionAfterResearchIdentity(
    research.identityAmbiguous === true || verification.verdict === "AMBIGUOUS",
  );
  if (!after.scoreFit) {
    await prisma.jobRequirement.update({
      where: { campaignId: input.campaignId },
      data: {
        employerDisposition: "AMBIGUOUS",
        employerSkipReason: after.reason ?? identityMismatchReason(),
        identityVerificationJson: jsonValue(verification),
        identityConfirmation: "PENDING",
      },
    });
    await markIdentityDependentsStale({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    });
    return;
  }
  await prisma.jobRequirement.update({
    where: { campaignId: input.campaignId },
    data: {
      employerDisposition: "IDENTIFIED",
      employerSkipReason: null,
      identityVerificationJson: jsonValue(verification),
      identityConfirmation: "PENDING",
    },
  });
  await scoreFit({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    icpId: input.icpId,
    companyId: input.companyId,
  });
  const { enqueueApplicationJob } = await import("@/lib/application-jobs/service");
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "HIRING_TEAM_IDENTIFY",
  });
}
