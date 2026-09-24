import type { Prisma, QualificationBucket } from "@prisma/client";
import {
  applicationFitStaleReason,
  applyFitOverride,
  computeApplicationEmployerFit,
  displayedFitBucket,
} from "@/lib/application/fit";
import {
  decideEmployerResearch,
  decisionAfterResearchIdentity,
  type EmployerMatch,
} from "@/lib/job-requirement/employer";
import {
  identityMismatchReason,
  identityStaleReason,
  parseIdentityVerification,
  postingIdentityInput,
  researchIdentityInput,
  verifyEmployerIdentity,
} from "@/lib/job-requirement/identity-verification";
import { employerIdentityCopy } from "@/lib/product-config";
import type { ParsedJobRequirement } from "@/lib/job-requirement/types";
import { JOB_REQUIREMENT_PROMPT_VERSION } from "@/lib/job-requirement/types";
import { normalizeEvidenceClass } from "@/lib/criteria/evidence-class";
import type { CompanyResearchActuals } from "@/lib/criteria/research-cascade";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import {
  emptyEmployerCompensationProfile,
  parseEmploymentTypeCodes,
  type EmployerCompensationProfile,
} from "@/lib/application/compensation-fit";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";
import { normalizeCompanyName, parseStringArray } from "@/lib/research";
import { ingestNamedJobContacts } from "@/lib/application/contacts";
import { syncApplicationHiringTeam } from "@/lib/hiring-team/build";
import { TenantError } from "@/lib/tenant/errors";
import {
  researchCompany,
  resolveOrCreateCompany,
} from "@/lib/tenant/company-research-service";

const BUCKETS = ["GOOD", "NEEDS_REVIEW", "POOR_FIT", "EXCLUDED"] as const;

function asBucket(value: string): QualificationBucket {
  if ((BUCKETS as readonly string[]).includes(value)) {
    return value as QualificationBucket;
  }
  throw new TenantError("Choose a valid employer-fit result.");
}

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

async function loadCriteria(
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

async function companyMatches(
  organizationId: string,
  companyName: string | null,
): Promise<EmployerMatch[]> {
  const normalized = companyName ? normalizeCompanyName(companyName) : null;
  if (!normalized) return [];
  const rows = await prisma.company.findMany({
    where: { organizationId, normalizedName: normalized },
    include: {
      research: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    identityAmbiguous: row.research[0]?.identityAmbiguous === true,
  }));
}

async function scoreFit(input: {
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

function researchFailureReason(result: {
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

async function researchAndMaybeScore(input: {
  organizationId: string;
  campaignId: string;
  icpId: string;
  companyId: string;
}): Promise<void> {
  try {
    const profile = await loadCriteria(input.organizationId, input.icpId);
    const result = await researchCompany(input.companyId, {
      evidenceTargets: profile.targets,
    });
    const failure = researchFailureReason(result);
    const research = result.research;
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
    await scoreFit(input);
  } finally {
    await syncApplicationHiringTeam({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    });
  }
}

export async function attachParsedPosting(input: {
  organizationId: string;
  campaignId: string;
  rawText: string;
  postingUrl: string | null;
  parsed: ParsedJobRequirement;
  icpId: string;
}): Promise<void> {
  const matches = await companyMatches(
    input.organizationId,
    input.parsed.companyName,
  );
  const decision = decideEmployerResearch({
    rawText: input.rawText,
    matches,
  });
  let companyId: string | null =
    decision.disposition === "IDENTIFIED" ? decision.companyId : null;
  if (decision.disposition === "IDENTIFIED" && decision.runResearch) {
    const name = input.parsed.companyName?.trim();
    if (!name) {
      await prisma.jobRequirement.create({
        data: jobRequirementData(input, {
          disposition: "UNDISCLOSED",
          reason:
            "The posting did not name an employer. Research and fit are skipped until you supply the employer's name.",
          companyId: null,
        }),
      });
      await syncApplicationHiringTeam({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      });
      await ingestNamedJobContacts({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        namedContacts: input.parsed.namedContacts,
        companyName: input.parsed.companyName,
      });
      return;
    }
    if (!companyId) {
      const created = await resolveOrCreateCompany({ name });
      if (!created) {
        throw new TenantError(
          "The employer could not be saved, so research did not run.",
        );
      }
      companyId = created.id;
    }
  }

  await prisma.jobRequirement.create({
    data: jobRequirementData(input, {
      disposition: decision.disposition,
      reason: decision.disposition === "IDENTIFIED" ? null : decision.reason,
      companyId,
    }),
  });

  if (decision.disposition === "IDENTIFIED" && decision.runResearch && companyId) {
    await researchAndMaybeScore({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      icpId: input.icpId,
      companyId,
    });
    await ingestNamedJobContacts({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      namedContacts: input.parsed.namedContacts,
      companyName: input.parsed.companyName,
    });
    return;
  }
  await syncApplicationHiringTeam({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  await ingestNamedJobContacts({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    namedContacts: input.parsed.namedContacts,
    companyName: input.parsed.companyName,
  });
}

function jobRequirementData(
  input: {
    organizationId: string;
    campaignId: string;
    rawText: string;
    postingUrl: string | null;
    parsed: ParsedJobRequirement;
  },
  employer: {
    disposition: "IDENTIFIED" | "AMBIGUOUS" | "UNDISCLOSED";
    reason: string | null;
    companyId: string | null;
  },
): Prisma.JobRequirementCreateInput {
  const parsed = input.parsed;
  return {
    organization: { connect: { id: input.organizationId } },
    campaign: { connect: { id: input.campaignId } },
    rawText: input.rawText,
    postingUrl: input.postingUrl,
    title: parsed.title,
    companyName: parsed.companyName,
    location: parsed.location,
    workArrangement: parsed.workArrangement,
    employmentType: parsed.employmentType,
    seniority: parsed.seniority,
    compensationRange: parsed.compensationRange,
    reportingLine: parsed.reportingLine,
    responsibilities: jsonValue(parsed.responsibilities),
    requiredItems: jsonValue(parsed.requiredItems),
    preferredItems: jsonValue(parsed.preferredItems),
    scorecardJson: jsonValue(parsed.scorecard),
    namedContactsJson: jsonValue(parsed.namedContacts),
    employerDisposition: employer.disposition,
    employerSkipReason: employer.reason,
    identityConfirmation: "PENDING",
    company: employer.companyId
      ? { connect: { id: employer.companyId } }
      : undefined,
    parserPromptVersion: JOB_REQUIREMENT_PROMPT_VERSION,
  };
}

export async function nameApplicationEmployer(input: {
  organizationId: string;
  campaignId: string;
  employerName: string;
  website?: string | null;
  companyId?: string | null;
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
    include: { campaign: { select: { icpId: true } } },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement.`,
    );
  }
  const name = input.employerName.trim();
  if (!name && !input.companyId) {
    throw new TenantError("Enter the employer's name.");
  }
  let companyId = input.companyId ?? null;
  if (companyId) {
    const company = await prisma.company.findFirst({
      where: { id: companyId, organizationId: input.organizationId },
    });
    if (!company) throw new TenantError("That employer was not found.");
  } else {
    const created = await resolveOrCreateCompany({ name });
    if (!created) {
      throw new TenantError("The employer could not be saved.");
    }
    companyId = created.id;
  }
  const website = input.website?.trim() || null;
  await prisma.jobRequirement.update({
    where: { id: requirement.id },
    data: {
      suppliedEmployerName: name || undefined,
      suppliedEmployerWebsite: website,
      companyName: name || requirement.companyName,
      companyId,
      employerDisposition: "IDENTIFIED",
      employerSkipReason: null,
      identityConfirmation: "PENDING",
      identityVerificationJson: undefined,
    },
  });
  await researchAndMaybeScore({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    icpId: requirement.campaign.icpId,
    companyId,
  });
}

export async function rescoreApplicationFit(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
    include: { campaign: { select: { icpId: true } } },
  });
  if (!requirement?.companyId || requirement.employerDisposition !== "IDENTIFIED") {
    throw new TenantError(
      "Employer fit can be rescored after the employer is confirmed.",
    );
  }
  await scoreFit({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    icpId: requirement.campaign.icpId,
    companyId: requirement.companyId,
  });
}

export async function overrideApplicationFit(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  bucket: string;
  reason: string;
}): Promise<void> {
  const fit = await prisma.applicationFit.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!fit) {
    throw new TenantError("Score employer fit before overriding it.");
  }
  const next = applyFitOverride(
    {
      bucket: fit.bucket,
      overrideBucket: fit.overrideBucket,
      overrideReason: fit.overrideReason,
      overriddenAt: fit.overriddenAt,
      stale: fit.stale,
      staleReason: fit.staleReason,
      computedAt: fit.computedAt,
      icpUpdatedAt: fit.icpUpdatedAt,
      companyResearchUpdatedAt: fit.companyResearchUpdatedAt,
      interpretationPromptVersion: fit.interpretationPromptVersion,
    },
    { bucket: asBucket(input.bucket), reason: input.reason, at: new Date() },
  );
  await prisma.applicationFit.update({
    where: { id: fit.id },
    data: {
      overrideBucket: next.overrideBucket,
      overrideReason: next.overrideReason,
      overriddenAt: next.overriddenAt,
      overriddenByUserId: input.userId,
    },
  });
}

async function markIdentityDependentsStale(input: {
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

export async function ensureIdentityVerification(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
    include: {
      company: {
        include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!requirement) return;
  const research = requirement.company?.research[0] ?? null;
  if (!research || (research.status !== "COMPLETED" && research.status !== "PARTIAL")) {
    return;
  }
  const stored = parseIdentityVerification(requirement.identityVerificationJson);
  if (stored && requirement.identityConfirmation !== "PENDING") {
    return;
  }
  const verification = verifyEmployerIdentity({
    posting: postingIdentityInput(requirement),
    research: researchIdentityInput({
      ...research,
      company: requirement.company,
    }),
  });
  if (verification.verdict === "MATCHED" && stored?.verdict === "MATCHED") {
    return;
  }
  if (verification.verdict === "AMBIGUOUS") {
    await prisma.jobRequirement.update({
      where: { id: requirement.id },
      data: {
        employerDisposition: "AMBIGUOUS",
        employerSkipReason: identityMismatchReason(),
        identityVerificationJson: jsonValue(verification),
        identityConfirmation:
          requirement.identityConfirmation === "CONFIRMED"
            ? requirement.identityConfirmation
            : "PENDING",
      },
    });
    if (requirement.identityConfirmation !== "CONFIRMED") {
      await markIdentityDependentsStale({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      });
    }
    return;
  }
  if (!stored) {
    await prisma.jobRequirement.update({
      where: { id: requirement.id },
      data: { identityVerificationJson: jsonValue(verification) },
    });
  }
}

export async function confirmApplicationEmployerIdentity(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
    include: { campaign: { select: { icpId: true } } },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement.`,
    );
  }
  if (!parseIdentityVerification(requirement.identityVerificationJson)) {
    throw new TenantError(employerIdentityCopy.unmatched);
  }
  await prisma.jobRequirement.update({
    where: { id: requirement.id },
    data: {
      identityConfirmation: "CONFIRMED",
      employerDisposition: "IDENTIFIED",
      employerSkipReason: null,
    },
  });
  if (requirement.companyId) {
    await scoreFit({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      icpId: requirement.campaign.icpId,
      companyId: requirement.companyId,
    });
  }
  await syncApplicationHiringTeam({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
}

export async function rejectApplicationEmployerIdentity(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement.`,
    );
  }
  await prisma.jobRequirement.update({
    where: { id: requirement.id },
    data: {
      identityConfirmation: "REJECTED",
      employerDisposition: "AMBIGUOUS",
      employerSkipReason: employerIdentityCopy.rejected,
    },
  });
  await markIdentityDependentsStale({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  await syncApplicationHiringTeam({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
}

export async function retryApplicationResearch(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
    include: { campaign: { select: { icpId: true } } },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement.`,
    );
  }
  let companyId = requirement.companyId;
  const name = (requirement.suppliedEmployerName || requirement.companyName || "").trim();
  if (!companyId) {
    if (!name) {
      throw new TenantError("Enter the employer's name before retrying research.");
    }
    const created = await resolveOrCreateCompany({ name });
    if (!created) {
      throw new TenantError("The employer could not be saved, so research did not run.");
    }
    companyId = created.id;
    await prisma.jobRequirement.update({
      where: { id: requirement.id },
      data: { companyId, employerDisposition: "IDENTIFIED" },
    });
  }
  await prisma.jobRequirement.update({
    where: { id: requirement.id },
    data: {
      identityConfirmation: "PENDING",
      identityVerificationJson: undefined,
      employerSkipReason: null,
    },
  });
  await researchAndMaybeScore({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    icpId: requirement.campaign.icpId,
    companyId,
  });
}

export function readApplicationFitStale(input: {
  stale: boolean;
  staleReason: string | null;
  computedAt: Date;
  icpUpdatedAt: Date;
  companyResearchUpdatedAt: Date | null;
  interpretationPromptVersion: string | null;
  currentIcpUpdatedAt: Date;
  currentResearchUpdatedAt: Date | null;
  currentPromptVersion: string | null;
}): { stale: boolean; reason: string | null } {
  const derived = applicationFitStaleReason({
    computedAt: input.computedAt,
    recordedIcpUpdatedAt: input.icpUpdatedAt,
    recordedResearchUpdatedAt: input.companyResearchUpdatedAt,
    recordedPromptVersion: input.interpretationPromptVersion,
    currentIcpUpdatedAt: input.currentIcpUpdatedAt,
    currentResearchUpdatedAt: input.currentResearchUpdatedAt,
    currentPromptVersion: input.currentPromptVersion,
  });
  if (input.stale) {
    return { stale: true, reason: input.staleReason ?? derived };
  }
  if (derived) return { stale: true, reason: derived };
  return { stale: false, reason: null };
}

export { displayedFitBucket };
