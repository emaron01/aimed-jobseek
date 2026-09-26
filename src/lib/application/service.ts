import type { Prisma, QualificationBucket } from "@prisma/client";
import {
  applicationFitStaleReason,
  applyFitOverride,
  displayedFitBucket,
} from "@/lib/application/fit";
import {
  markIdentityDependentsStale,
  scoreFit,
} from "@/lib/application/research-finish";
import { enqueueApplicationResearch } from "@/lib/research/runs-service";
import {
  decideEmployerResearch,
  type EmployerMatch,
} from "@/lib/job-requirement/employer";
import {
  identityMismatchReason,
  parseIdentityVerification,
  postingIdentityInput,
  researchIdentityInput,
  verifyEmployerIdentity,
} from "@/lib/job-requirement/identity-verification";
import { employerIdentityCopy } from "@/lib/product-config";
import type { JobScorecard, ParsedJobRequirement, ScorecardItem } from "@/lib/job-requirement/types";
import { JOB_REQUIREMENT_PROMPT_VERSION } from "@/lib/job-requirement/types";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";
import { normalizeCompanyName } from "@/lib/research";
import { ingestNamedJobContacts } from "@/lib/application/contacts";
import { queueHiringTeamIdentify } from "@/lib/hiring-team/build";
import { TenantError } from "@/lib/tenant/errors";
import { resolveOrCreateCompany } from "@/lib/tenant/company-research-service";

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

async function queueApplicationResearch(input: {
  organizationId: string;
  campaignId: string;
  companyId: string;
  forceRefresh?: boolean;
}): Promise<void> {
  await enqueueApplicationResearch({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    companyId: input.companyId,
    forceRefresh: input.forceRefresh,
  });
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
      await queueHiringTeamIdentify({
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
    await queueApplicationResearch({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
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
  await queueHiringTeamIdentify({
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
  await queueApplicationResearch({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
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
  reason?: string | null;
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
  await queueHiringTeamIdentify({
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
  await queueHiringTeamIdentify({
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
  await queueApplicationResearch({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    companyId,
    forceRefresh: true,
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

export async function ensureHiringTeamAfterResearch(input: {
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
  const research = requirement?.company?.research[0] ?? null;
  const rejectedOrUndisclosed =
    requirement?.identityConfirmation === "REJECTED" ||
    requirement?.employerDisposition === "UNDISCLOSED";
  if (
    !rejectedOrUndisclosed &&
    (!research || (research.status !== "COMPLETED" && research.status !== "PARTIAL"))
  ) {
    return;
  }
  const latestRole = await prisma.persona.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  if (
    research &&
    latestRole &&
    latestRole.updatedAt >= research.updatedAt
  ) {
    return;
  }
  await queueHiringTeamIdentify({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
}

function scorecardItemFromText(
  existing: ScorecardItem[],
  text: string,
  prefix: string,
  index: number,
): ScorecardItem {
  const found = existing.find((item) => item.text === text);
  if (found) return found;
  return { id: `${prefix}_${index}`, text, inferred: false };
}

function scorecardFromForm(input: {
  existing: JobScorecard;
  mission: string;
  outcomes: string[];
  competencies: string[];
}): JobScorecard {
  return {
    mission: input.mission
      ? scorecardItemFromText(
          input.existing.mission ? [input.existing.mission] : [],
          input.mission,
          "mission",
          0,
        )
      : null,
    outcomes: input.outcomes.map((text, index) =>
      scorecardItemFromText(input.existing.outcomes, text, "outcome", index),
    ),
    competencies: input.competencies.map((text, index) =>
      scorecardItemFromText(
        input.existing.competencies,
        text,
        "competency",
        index,
      ),
    ),
  };
}

function readStoredScorecard(value: unknown): JobScorecard {
  if (!value || typeof value !== "object") {
    return { mission: null, outcomes: [], competencies: [] };
  }
  const row = value as Partial<JobScorecard>;
  const item = (entry: unknown): ScorecardItem | null => {
    if (!entry || typeof entry !== "object") return null;
    const candidate = entry as Partial<ScorecardItem>;
    if (typeof candidate.text !== "string" || !candidate.text.trim()) return null;
    if (typeof candidate.id !== "string") return null;
    return {
      id: candidate.id,
      text: candidate.text,
      inferred: candidate.inferred === true,
    };
  };
  return {
    mission: item(row.mission),
    outcomes: Array.isArray(row.outcomes)
      ? row.outcomes.flatMap((entry) => {
          const next = item(entry);
          return next ? [next] : [];
        })
      : [],
    competencies: Array.isArray(row.competencies)
      ? row.competencies.flatMap((entry) => {
          const next = item(entry);
          return next ? [next] : [];
        })
      : [],
  };
}

export async function updateApplicationCompanyInformation(input: {
  organizationId: string;
  campaignId: string;
  companyName: string;
  companySummary: string;
  whatTheySell: string;
  businessModel: string;
  companySizeContext: string;
  estimatedAov: string;
  aovReasoning: string;
  customerTypes: string[];
  primaryMarkets: string[];
  relevantTechnologies: string[];
  buyingSignals: string[];
  hiringSignals: string[];
  riskSignals: string[];
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
    include: {
      company: {
        include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement.`,
    );
  }
  const companyName = input.companyName.trim() || requirement.companyName;
  let companyId = requirement.companyId;
  if (!companyId && companyName) {
    const created = await resolveOrCreateCompany({ name: companyName });
    if (!created) {
      throw new TenantError("The employer could not be saved.");
    }
    companyId = created.id;
  }
  await prisma.jobRequirement.update({
    where: { id: requirement.id },
    data: {
      companyName,
      ...(companyId ? { companyId } : {}),
    },
  });
  if (!companyId) {
    throw new TenantError("Enter the employer's name.");
  }
  const research = requirement.company?.research[0] ?? null;
  const researchData = {
    companySummary: input.companySummary.trim() || null,
    whatTheySell: input.whatTheySell.trim() || null,
    businessModel: input.businessModel.trim() || null,
    companySizeContext: input.companySizeContext.trim() || null,
    estimatedAov: input.estimatedAov.trim() || null,
    aovReasoning: input.aovReasoning.trim() || null,
    customerTypes: jsonValue(input.customerTypes),
    primaryMarkets: jsonValue(input.primaryMarkets),
    relevantTechnologies: jsonValue(input.relevantTechnologies),
    buyingSignals: jsonValue(input.buyingSignals),
    hiringSignals: jsonValue(input.hiringSignals),
    riskSignals: jsonValue(input.riskSignals),
    researchMethod: "MANUAL" as const,
    status: "COMPLETED" as const,
    researchedAt: new Date(),
  };
  if (research) {
    await prisma.companyResearch.update({
      where: { id: research.id },
      data: researchData,
    });
    return;
  }
  await prisma.companyResearch.create({
    data: {
      organizationId: input.organizationId,
      companyId,
      ...researchData,
    },
  });
}

export async function updateApplicationJobRequirement(input: {
  organizationId: string;
  campaignId: string;
  title: string;
  companyName: string;
  location: string;
  workArrangement: string;
  employmentType: string;
  seniority: string;
  compensationRange: string;
  reportingLine: string;
  responsibilities: string[];
  requiredItems: string[];
  preferredItems: string[];
  mission: string;
  outcomes: string[];
  competencies: string[];
}): Promise<void> {
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement.`,
    );
  }
  const scorecard = scorecardFromForm({
    existing: readStoredScorecard(requirement.scorecardJson),
    mission: input.mission.trim(),
    outcomes: input.outcomes,
    competencies: input.competencies,
  });
  await prisma.jobRequirement.update({
    where: { id: requirement.id },
    data: {
      title: input.title.trim() || null,
      companyName: input.companyName.trim() || null,
      location: input.location.trim() || null,
      workArrangement: input.workArrangement.trim() || null,
      employmentType: input.employmentType.trim() || null,
      seniority: input.seniority.trim() || null,
      compensationRange: input.compensationRange.trim() || null,
      reportingLine: input.reportingLine.trim() || null,
      responsibilities: jsonValue(input.responsibilities),
      requiredItems: jsonValue(input.requiredItems),
      preferredItems: jsonValue(input.preferredItems),
      scorecardJson: jsonValue(scorecard),
    },
  });
}

export { displayedFitBucket };
