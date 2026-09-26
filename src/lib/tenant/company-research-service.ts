/**
 * Node-safe company + research operations (no server-only).
 * Next.js entry: `@/lib/tenant/companies` re-exports behind server-only.
 */

import type {
  Company,
  CompanyResearch,
  CompanyResearchStatus,
  Prisma,
  ResearchConfidence,
  ResearchMethod,
} from "@prisma/client";
import { markApplicationFitsStaleForCompany } from "@/lib/application/fit-staleness";
import { prisma } from "@/lib/prisma-client";
import { jobSeekerResearchColumns } from "@/lib/research/job-seeker-columns";
import {
  domainFromEmail,
  hasUsableCompanyResearchFields,
  isResearchFresh,
  needsResearchRefresh,
  normalizeCompanyName,
  normalizeDomain,
  normalizeWebsiteUrl,
  parseStringArray,
  researchExpiresAt,
  getCompanyResearchProvider,
  UnconfiguredCompanyResearchProvider,
  type CompanyResearchResult,
  type CompanyResearchProvenance,
  type ResearchSource,
  type AutomatedCompanyResearchResult,
} from "@/lib/research";
import { isResearchAiConfigured } from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import {
  classifyResearchFailure,
  type ResearchFailureInfo,
} from "@/lib/research/failure-classification";
import { isDevTenantBypassEnabled } from "@/lib/auth/config-core";
import { recordUsageEvent } from "@/lib/usage/events-service";
import {
  companyHasActiveResearchSlot,
  countActiveResearchedCompanies,
  orgHasAnyCompanyResearch,
} from "@/lib/usage/active-companies-service";
import { getResearchPolicy } from "@/lib/usage/policy-service";
import {
  assertUsageAllowed,
  UsageQuotaError,
} from "@/lib/usage/quota-service";
import { PaymentLockError, assertOrganizationNotPaymentLocked } from "@/lib/billing/payment-lock";
import { TenantError } from "@/lib/tenant/errors";
import { getTenantContext } from "@/lib/tenant/request-context";

async function orgId(): Promise<string> {
  const context = getTenantContext();
  if (context?.organizationId) return context.organizationId;
  // Workers must receive ALS via runWithTenantContext. Never import the
  // Next-only getCurrentOrganization wrapper (server-only / @/lib/prisma).
  if (!process.env.NEXT_RUNTIME) {
    throw new TenantError(
      "Organization context is required for company research.",
    );
  }
  const orgModule = "@/lib/tenant/" + "getCurrentOrganization";
  const { requireOrganizationId } = await import(orgModule);
  return requireOrganizationId();
}

async function resolveResearchUser(): Promise<
  import("@prisma/client").User | null
> {
  const context = getTenantContext();
  if (context?.userId) {
    return prisma.user.findUnique({ where: { id: context.userId } });
  }
  // Research worker has no cookies/session — skip user-scoped gates.
  if (!process.env.NEXT_RUNTIME) {
    return null;
  }
  const authzPath = "@/lib/org/" + "authz";
  const { getCurrentUser } = await import(authzPath);
  return getCurrentUser();
}

function notFound(entity: string): never {
  throw new TenantError(`${entity} not found in the active organization.`);
}

export type CompanyIdentityInput = {
  name?: string | null;
  website?: string | null;
  email?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  revenue?: number | null;
  location?: string | null;
};

export async function getCompany(id: string): Promise<
  Company & { research: CompanyResearch[] }
> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id, organizationId },
    include: {
      research: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!company) notFound("Company");
  return company;
}

export async function findCompanyByIdentity(
  input: CompanyIdentityInput,
): Promise<Company | null> {
  const organizationId = await orgId();
  const domain =
    normalizeDomain(input.website) ?? domainFromEmail(input.email);
  const normalizedName = normalizeCompanyName(input.name);

  if (domain) {
    const byDomain = await prisma.company.findFirst({
      where: { organizationId, normalizedDomain: domain },
    });
    if (byDomain) return byDomain;
  }

  if (normalizedName) {
    return prisma.company.findFirst({
      where: { organizationId, normalizedName },
    });
  }

  return null;
}

/**
 * Resolve an existing Company or create one. Tenant-scoped.
 * Matching: normalizedDomain first, then exact normalizedName.
 */
export async function resolveOrCreateCompany(
  input: CompanyIdentityInput,
): Promise<Company | null> {
  const organizationId = await orgId();
  const domain =
    normalizeDomain(input.website) ?? domainFromEmail(input.email);
  const normalizedName = normalizeCompanyName(input.name);
  const displayName = input.name?.trim() || domain || null;

  if (!displayName || (!domain && !normalizedName)) {
    return null;
  }

  const existing = await findCompanyByIdentity(input);
  if (existing) {
    const updates: Prisma.CompanyUpdateInput = {};
    if (!existing.website && input.website) {
      updates.website = normalizeWebsiteUrl(input.website) ?? existing.website;
    }
    if (!existing.normalizedDomain && domain) {
      updates.normalizedDomain = domain;
    }
    if (!existing.industry && input.industry) {
      updates.industry = input.industry;
    }
    if (existing.employeeCount == null && input.employeeCount != null) {
      updates.employeeCount = input.employeeCount;
    }
    if (existing.revenue == null && input.revenue != null) {
      updates.revenue = input.revenue;
    }
    if (!existing.location && input.location) {
      updates.location = input.location;
    }
    if (Object.keys(updates).length > 0) {
      return prisma.company.update({
        where: { id: existing.id },
        data: updates,
      });
    }
    return existing;
  }

  try {
    return await prisma.company.create({
      data: {
        organizationId,
        name: displayName,
        normalizedName: normalizedName ?? displayName.toLowerCase(),
        website: normalizeWebsiteUrl(input.website) ?? (domain ? `https://${domain}` : null),
        normalizedDomain: domain,
        industry: input.industry ?? null,
        employeeCount: input.employeeCount ?? null,
        revenue: input.revenue ?? null,
        location: input.location ?? null,
      },
    });
  } catch (error) {
    // Concurrent create on same domain — re-read
    const again = await findCompanyByIdentity(input);
    if (again) return again;
    throw error;
  }
}

export async function associateContactWithCompany(
  contactId: string,
): Promise<Company | null> {
  const organizationId = await orgId();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
  });
  if (!contact) notFound("Contact");

  if (contact.companyId) {
    const existing = await prisma.company.findFirst({
      where: { id: contact.companyId, organizationId },
    });
    if (existing) return existing;
  }

  const company = await resolveOrCreateCompany({
    name: contact.company,
    website: contact.companyWebsite,
    email: contact.email,
    industry: contact.industry,
    employeeCount: contact.employeeCount,
    revenue: contact.revenue != null ? Number(contact.revenue) : null,
    location: contact.location,
  });

  if (!company) return null;

  await prisma.contact.update({
    where: { id: contact.id },
    data: { companyId: company.id },
  });

  return company;
}

export async function associateContactsForList(
  contactListId: string,
): Promise<{ contactsProcessed: number; companiesLinked: number }> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      archivedAt: null,
      memberships: { some: { contactListId } },
    },
  });

  const companyIds = new Set<string>();
  const identityCache = new Map<string, Company | null>();

  for (const contact of contacts) {
    if (contact.companyId) {
      const existing = await prisma.company.findFirst({
        where: { id: contact.companyId, organizationId },
        select: { id: true },
      });
      if (existing) {
        companyIds.add(existing.id);
        continue;
      }
    }

    const domain =
      normalizeDomain(contact.companyWebsite) ??
      domainFromEmail(contact.email);
    const normalizedName = normalizeCompanyName(contact.company);
    const cacheKey = `${domain ?? ""}::${normalizedName ?? ""}`;

    let company = identityCache.get(cacheKey);
    if (company === undefined) {
      company = await resolveOrCreateCompany({
        name: contact.company,
        website: contact.companyWebsite,
        email: contact.email,
        industry: contact.industry,
        employeeCount: contact.employeeCount,
        revenue: contact.revenue != null ? Number(contact.revenue) : null,
        location: contact.location,
      });
      identityCache.set(cacheKey, company);
    }

    if (!company) continue;

    if (contact.companyId !== company.id) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { companyId: company.id },
      });
    }
    companyIds.add(company.id);
  }

  return {
    contactsProcessed: contacts.length,
    companiesLinked: companyIds.size,
  };
}

export type LatestCompanyResearch = CompanyResearch | null;

export async function getLatestCompanyResearch(
  companyId: string,
): Promise<LatestCompanyResearch> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true },
  });
  if (!company) notFound("Company");

  return prisma.companyResearch.findFirst({
    where: { organizationId, companyId },
    orderBy: { updatedAt: "desc" },
  });
}

export type ResearchPlanItem = {
  companyId: string;
  companyName: string;
  normalizedDomain: string | null;
  reason: "missing" | "stale" | "failed" | "no_usable_fields" | "fresh";
  latestResearch: CompanyResearch | null;
};

export type ResearchStatusCounts = {
  completed: number;
  partial: number;
  failed: number;
  notStarted: number;
  inProgress: number;
};

export type ResearchPlanSummary = {
  totalContacts: number;
  uniqueCompanies: number;
  alreadyResearched: number;
  needingResearch: number;
  noUsableResearch: number;
  statusCounts: ResearchStatusCounts;
  items: ResearchPlanItem[];
};

/**
 * Attach a Contact to a Company only when both belong to the active org.
 */
export async function setContactCompany(
  contactId: string,
  companyId: string,
): Promise<void> {
  const organizationId = await orgId();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { id: true },
  });
  if (!contact) notFound("Contact");

  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true },
  });
  if (!company) {
    throw new TenantError(
      "Company does not belong to the active organization.",
    );
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { companyId: company.id },
  });
}

export async function getCompaniesNeedingResearchForContactList(
  contactListId: string,
  options?: { associateMissing?: boolean },
): Promise<ResearchPlanSummary> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  if (options?.associateMissing !== false) {
    await associateContactsForList(contactListId);
  }

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      archivedAt: null,
      memberships: { some: { contactListId } },
      companyId: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      companyRecord: true,
    },
  });

  const byCompany = new Map<string, Company>();
  for (const contact of contacts) {
    if (contact.companyId && contact.companyRecord) {
      byCompany.set(contact.companyId, contact.companyRecord);
    }
  }

  const researchPolicy = await getResearchPolicy(organizationId);
  const freshnessDays = researchPolicy.researchFreshnessDays;

  const items: ResearchPlanItem[] = [];
  let alreadyResearched = 0;
  let needingResearch = 0;
  let noUsableResearch = 0;
  const statusCounts: ResearchStatusCounts = {
    completed: 0,
    partial: 0,
    failed: 0,
    notStarted: 0,
    inProgress: 0,
  };

  for (const [companyId, company] of byCompany) {
    const latest = await prisma.companyResearch.findFirst({
      where: { organizationId, companyId },
      orderBy: { updatedAt: "desc" },
    });

    let reason: ResearchPlanItem["reason"] = "missing";
    if (!latest) {
      reason = "missing";
      needingResearch += 1;
      statusCounts.notStarted += 1;
    } else if (latest.status === "FAILED") {
      reason = "failed";
      needingResearch += 1;
      statusCounts.failed += 1;
    } else if (
      (latest.status === "COMPLETED" || latest.status === "PARTIAL") &&
      !hasUsableCompanyResearchFields(latest)
    ) {
      reason = "no_usable_fields";
      noUsableResearch += 1;
      bumpStatusCount(statusCounts, latest.status);
    } else if (needsResearchRefresh(latest, new Date(), freshnessDays)) {
      reason = "stale";
      needingResearch += 1;
      bumpStatusCount(statusCounts, latest.status);
    } else if (isResearchFresh(latest, new Date(), freshnessDays)) {
      reason = "fresh";
      alreadyResearched += 1;
      bumpStatusCount(statusCounts, latest.status);
    } else {
      reason = "stale";
      needingResearch += 1;
      bumpStatusCount(statusCounts, latest.status);
    }

    items.push({
      companyId,
      companyName: company.name,
      normalizedDomain: company.normalizedDomain,
      reason,
      latestResearch: latest,
    });
  }

  const totalContacts = await prisma.contact.count({
    where: {
      organizationId,
      archivedAt: null,
      memberships: { some: { contactListId } },
    },
  });

  return {
    totalContacts,
    uniqueCompanies: byCompany.size,
    alreadyResearched,
    needingResearch,
    noUsableResearch,
    statusCounts,
    items,
  };
}

export async function getCompaniesNeedingResearchForScoringRun(
  scoringRunId: string,
  options?: { associateMissing?: boolean },
): Promise<ResearchPlanSummary> {
  const organizationId = await orgId();
  const run = await prisma.scoringRun.findFirst({
    where: { id: scoringRunId, organizationId },
    select: { id: true, contactListId: true },
  });
  if (!run) notFound("Scoring run");

  return getCompaniesNeedingResearchForContactList(run.contactListId, options);
}

export type ContactListGroupContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
};

export type ContactListCompanyGroup = {
  companyId: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: number | null;
  latestResearch: CompanyResearch | null;
  researchReason: ResearchPlanItem["reason"];
  contacts: ContactListGroupContact[];
};

export async function getContactListCompanyGroups(
  contactListId: string,
  options?: {
    page?: number;
    pageSize?: number;
    associateMissing?: boolean;
  },
): Promise<{
  groups: ContactListCompanyGroup[];
  totalCompanies: number;
  totalContacts: number;
  page: number;
  pageSize: number;
  showIndustry: boolean;
}> {
  const organizationId = await orgId();
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  const [plan, contacts] = await Promise.all([
    getCompaniesNeedingResearchForContactList(contactListId, {
      associateMissing: options?.associateMissing,
    }),
    prisma.contact.findMany({
      where: {
        organizationId,
        archivedAt: null,
        memberships: { some: { contactListId } },
      },
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
        companyId: true,
        company: true,
      },
    }),
  ]);

  const contactsByCompany = new Map<string, ContactListGroupContact[]>();
  const unlinkedContacts: ContactListGroupContact[] = [];

  for (const contact of contacts) {
    const row: ContactListGroupContact = {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      title: contact.title,
    };
    if (contact.companyId) {
      const existing = contactsByCompany.get(contact.companyId) ?? [];
      existing.push(row);
      contactsByCompany.set(contact.companyId, existing);
    } else {
      unlinkedContacts.push(row);
    }
  }

  const allGroups: ContactListCompanyGroup[] = plan.items
    .map((item) => ({
      companyId: item.companyId,
      companyName: item.companyName,
      website: item.normalizedDomain,
      industry: null as string | null,
      employeeCount: null as number | null,
      revenue: null as number | null,
      latestResearch: item.latestResearch,
      researchReason: item.reason,
      contacts: contactsByCompany.get(item.companyId) ?? [],
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

  // Need company record fields - fetch companies in one query
  const companyIds = allGroups.map((g) => g.companyId);
  const companies = await prisma.company.findMany({
    where: { organizationId, id: { in: companyIds } },
  });
  const companyById = new Map(companies.map((c) => [c.id, c]));

  for (const group of allGroups) {
    const company = companyById.get(group.companyId);
    if (company) {
      group.industry = company.industry;
      group.employeeCount = company.employeeCount;
      group.revenue =
        company.revenue != null ? Number(company.revenue) : null;
      group.website = company.normalizedDomain ?? company.website;
    }
  }

  if (unlinkedContacts.length > 0) {
    allGroups.push({
      companyId: "",
      companyName: "Unlinked contacts",
      website: null,
      industry: null,
      employeeCount: null,
      revenue: null,
      latestResearch: null,
      researchReason: "missing",
      contacts: unlinkedContacts,
    });
  }

  const showIndustry = allGroups.some(
    (group) => group.industry != null && group.industry.trim() !== "",
  );

  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? 25));
  const totalCompanies = allGroups.length;
  const skip = (page - 1) * pageSize;
  const groups = allGroups.slice(skip, skip + pageSize);

  return {
    groups,
    totalCompanies,
    totalContacts: plan.totalContacts,
    page,
    pageSize,
    showIndustry,
  };
}

function bumpStatusCount(
  counts: ResearchStatusCounts,
  status: CompanyResearchStatus,
): void {
  switch (status) {
    case "COMPLETED":
      counts.completed += 1;
      break;
    case "PARTIAL":
      counts.partial += 1;
      break;
    case "FAILED":
      counts.failed += 1;
      break;
    case "IN_PROGRESS":
      counts.inProgress += 1;
      break;
    case "NOT_STARTED":
    default:
      counts.notStarted += 1;
      break;
  }
}

/**
 * Create a CompanyResearch row under the company intro lock, copying or setting
 * firstResearchedByUserId immutably.
 */
async function createCompanyResearchRowUnderIntroLock(input: {
  organizationId: string;
  companyId: string;
  status: CompanyResearchStatus;
  researchMethod?: ResearchMethod;
  researchedByUserId?: string | null;
  companySummary?: string | null;
  aovReasoning?: string | null;
  researchedAt?: Date | null;
}): Promise<CompanyResearch> {
  const lockKey = `company-research-intro:${input.organizationId}:${input.companyId}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const prior = await tx.companyResearch.findFirst({
      where: {
        organizationId: input.organizationId,
        companyId: input.companyId,
      },
      orderBy: { createdAt: "asc" },
      select: { firstResearchedByUserId: true },
    });
    const firstResearchedByUserId = prior
      ? (prior.firstResearchedByUserId ?? null)
      : (input.researchedByUserId ?? null);

    return tx.companyResearch.create({
      data: {
        organizationId: input.organizationId,
        companyId: input.companyId,
        status: input.status,
        researchMethod: input.researchMethod ?? "AUTOMATED",
        companySummary: input.companySummary ?? null,
        aovReasoning: input.aovReasoning ?? null,
        researchedAt: input.researchedAt ?? null,
        researchedByUserId: input.researchedByUserId ?? null,
        firstResearchedByUserId,
      },
    });
  });
}

export async function saveCompanyResearch(input: {
  companyId: string;
  result: CompanyResearchResult;
  identityAmbiguous?: boolean;
  researchMethod?: ResearchMethod;
  status?: CompanyResearchStatus;
  provenance?: CompanyResearchProvenance | null;
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    webSearchCallCount?: number | null;
    researchDurationMs?: number | null;
  } | null;
  telemetry?: {
    searchStagesUsed?: number | null;
    researchStoppedReason?: string | null;
    researchStageTimings?: Prisma.InputJsonValue | null;
  } | null;
  researchedByUserId?: string | null;
  freshnessDays?: number;
}): Promise<CompanyResearch> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, organizationId },
  });
  if (!company) notFound("Company");

  const researchPolicy =
    input.freshnessDays != null
      ? { researchFreshnessDays: input.freshnessDays }
      : await getResearchPolicy(organizationId);

  const now = new Date();
  const sources = input.result.sources ?? [];
  const lockKey = `company-research-intro:${organizationId}:${company.id}`;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const prior = await tx.companyResearch.findFirst({
      where: { organizationId, companyId: company.id },
      orderBy: { createdAt: "asc" },
      select: { firstResearchedByUserId: true },
    });

    // First row for (org, company) → attribute introducer. Never overwrite later.
    const firstResearchedByUserId = prior
      ? (prior.firstResearchedByUserId ?? null)
      : (input.researchedByUserId ?? null);

    const automated = (input.researchMethod ?? "AUTOMATED") === "AUTOMATED";
    const seekerColumns = automated
      ? jobSeekerResearchColumns(input.result)
      : null;

    const saved = await tx.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        status: input.status ?? "COMPLETED",
        researchMethod: input.researchMethod ?? "AUTOMATED",
        companySummary: input.result.companySummary,
        whatTheySell: input.result.whatTheySell,
        customerTypes: input.result.customerTypes,
        primaryMarkets: input.result.primaryMarkets,
        businessModel: input.result.businessModel,
        estimatedAov: seekerColumns
          ? seekerColumns.estimatedAov
          : input.result.estimatedAov,
        aovReasoning: seekerColumns
          ? seekerColumns.aovReasoning
          : input.result.aovReasoning,
        companySizeContext: input.result.companySizeContext,
        relevantTechnologies: input.result.relevantTechnologies,
        buyingSignals: seekerColumns
          ? seekerColumns.buyingSignals
          : input.result.buyingSignals,
        hiringSignals: seekerColumns
          ? seekerColumns.hiringSignals
          : (input.result.hiringSignals ?? []),
        riskSignals: input.result.riskSignals,
        identityAmbiguous: input.identityAmbiguous ?? false,
        researchConfidence: input.result.confidence,
        sourceCount: sources.length,
        researchSources: sources,
        researchedAt: now,
        expiresAt: researchExpiresAt(now, researchPolicy.researchFreshnessDays),
        aiProvider: input.provenance?.aiProvider ?? null,
        aiModel: input.provenance?.aiModel ?? null,
        aiModelUrlIdentifier: input.provenance?.aiModelUrlIdentifier ?? null,
        promptVersion: input.provenance?.promptVersion ?? null,
        inputTokens: input.usage?.inputTokens ?? null,
        outputTokens: input.usage?.outputTokens ?? null,
        webSearchCallCount: input.usage?.webSearchCallCount ?? null,
        researchDurationMs: input.usage?.researchDurationMs ?? null,
        searchStagesUsed: input.telemetry?.searchStagesUsed ?? null,
        researchStoppedReason: input.telemetry?.researchStoppedReason ?? null,
        researchStageTimings: input.telemetry?.researchStageTimings ?? undefined,
        researchedByUserId: input.researchedByUserId ?? null,
        firstResearchedByUserId,
      },
    });
    await markApplicationFitsStaleForCompany(tx, organizationId, company.id);
    return saved;
  });
}

function isSuccessfulResearch(
  research: CompanyResearch | null,
): research is CompanyResearch {
  if (!research) return false;
  return (
    (research.status === "COMPLETED" || research.status === "PARTIAL") &&
    hasUsableCompanyResearchFields(research)
  );
}

export type ResearchCompanyResult = {
  skipped: boolean;
  reason?: string;
  research: CompanyResearch | null;
  refreshFailed?: boolean;
  researchFailed?: boolean;
  failure?: ResearchFailureInfo;
  quotaBlocked?: boolean;
  /** Email not verified — distinct from allowance quota. */
  verificationRequired?: boolean;
};

export async function researchCompany(
  companyId: string,
  options?: {
    force?: boolean;
    evidenceTargets?: string[];
    seekerSuppliedNotes?: string;
  },
): Promise<ResearchCompanyResult> {
  // Tenant ownership check BEFORE any external API spend.
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
  });
  if (!company) notFound("Company");

  const researchPolicy = await getResearchPolicy(organizationId);
  const user = await resolveResearchUser();

  if (user && !user.emailVerifiedAt && !isDevTenantBypassEnabled()) {
    return {
      skipped: true,
      reason: "Verify your email address to continue with this action.",
      research: await getLatestCompanyResearch(company.id),
      verificationRequired: true,
    };
  }

  const latest = await getLatestCompanyResearch(company.id);
  if (
    !options?.force &&
    latest &&
    isResearchFresh(latest, new Date(), researchPolicy.researchFreshnessDays)
  ) {
    // Fresh reusable research: access does not consume a new active-company slot
    // and does not create duplicate UsageEvents.
    return { skipped: true, reason: "fresh", research: latest };
  }

  const priorSuccessful = isSuccessfulResearch(latest) ? latest : null;
  const alreadyHasActiveSlot = await companyHasActiveResearchSlot(
    organizationId,
    company.id,
  );

  // First introducer = no prior CompanyResearch row for this company in the org.
  // Re-research / stale refresh does not burn a net-new slot.
  // Advisory lock covers check + claim INSERT so two concurrent firsts cannot both win.
  const lockKey = `company-research-intro:${organizationId}:${company.id}`;
  let isFirstIntroducer = false;
  if (user) {
    try {
      isFirstIntroducer = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const prior = await tx.companyResearch.findFirst({
          where: { organizationId, companyId: company.id },
          select: { id: true },
        });
        if (prior) return false;

        // Inline quota check under the company lock (avoid nested assertUsageAllowed tx).
        await assertOrganizationNotPaymentLocked(organizationId);
        const billingProfile =
          await prisma.organizationBillingProfile.findUnique({
            where: { organizationId },
            select: {
              planCode: true,
              billingStatus: true,
              trialEndsAt: true,
            },
          });
        const { planUsesPerUserCompanyAllowance } = await import(
          "@/lib/billing/plans"
        );
        const perUser = planUsesPerUserCompanyAllowance(
          billingProfile?.planCode ?? "",
        );
        const used = await countActiveResearchedCompanies(
          organizationId,
          new Date(),
          perUser
            ? {
                firstResearchedByUserId: user.id,
                includeInProgressClaims: true,
              }
            : undefined,
        );
        const { getEffectiveUsagePolicy } = await import(
          "@/lib/usage/policy-service"
        );
        const { getEffectiveCompanyResearchAllowance } = await import(
          "@/lib/billing/company-research-credits"
        );
        const policy = await getEffectiveUsagePolicy({
          organizationId,
          userId: user.id,
        });
        const { effectiveLimit: limit } =
          await getEffectiveCompanyResearchAllowance({
            organizationId,
            baseLimit: policy.activeResearchedCompanyLimit,
            userId: perUser ? user.id : null,
          });
        if (used >= limit) {
          const { formatResearchQuotaBlockedMessage } = await import(
            "@/lib/usage/research-allowance"
          );
          throw new UsageQuotaError(
            formatResearchQuotaBlockedMessage({
              used,
              limit,
              billingStatus: billingProfile?.billingStatus,
              trialEndsAt: billingProfile?.trialEndsAt,
              planCode: billingProfile?.planCode,
            }),
            "ACTIVE_RESEARCHED_COMPANY",
            used,
            limit,
          );
        }

        // Claim introducer under the same lock.
        await tx.companyResearch.create({
          data: {
            organizationId,
            companyId: company.id,
            status: "IN_PROGRESS",
            researchMethod: "AUTOMATED",
            researchedByUserId: user.id,
            firstResearchedByUserId: user.id,
          },
        });
        return true;
      });
    } catch (error) {
      if (
        error instanceof UsageQuotaError ||
        error instanceof PaymentLockError
      ) {
        return {
          skipped: true,
          reason: error.message,
          research: priorSuccessful ?? latest,
          quotaBlocked: true,
        };
      }
      throw error;
    }
  } else if (!(await orgHasAnyCompanyResearch(organizationId, company.id))) {
    isFirstIntroducer = true;
  }

  // Non-first refresh: payment-lock gate only (no net-new slot).
  if (user && !isFirstIntroducer) {
    try {
      await assertUsageAllowed({
        organizationId,
        userId: user.id,
        resource: "ACTIVE_RESEARCHED_COMPANY",
        wouldConsumeNewActiveCompanySlot: false,
        companyId: company.id,
      });
    } catch (error) {
      if (
        error instanceof UsageQuotaError ||
        error instanceof PaymentLockError
      ) {
        return {
          skipped: true,
          reason: error.message,
          research: priorSuccessful ?? latest,
          quotaBlocked: true,
        };
      }
      throw error;
    }
  }

  const provider = getCompanyResearchProvider();

  // No fabrication: leave explicit pending state when Research AI is not configured.
  if (
    provider instanceof UnconfiguredCompanyResearchProvider ||
    !isResearchAiConfigured()
  ) {
    const afterClaim = await getLatestCompanyResearch(company.id);
    if (afterClaim) {
      return {
        skipped: true,
        reason: "provider_unconfigured",
        research: afterClaim,
      };
    }
    const pending = await createCompanyResearchRowUnderIntroLock({
      organizationId,
      companyId: company.id,
      status: "NOT_STARTED",
      researchMethod: "AUTOMATED",
      researchedByUserId: user?.id ?? null,
    });
    return {
      skipped: true,
      reason: "provider_unconfigured",
      research: pending,
    };
  }

  try {
    const result = (await provider.research({
      organizationId,
      companyId: company.id,
      name: company.name,
      website: company.website,
      normalizedDomain: company.normalizedDomain,
      industry: company.industry,
      employeeCount: company.employeeCount,
      location: company.location,
      depthPolicy: researchPolicy,
      evidenceTargets: options?.evidenceTargets,
      seekerSuppliedNotes: options?.seekerSuppliedNotes,
    })) as CompanyResearchResult | AutomatedCompanyResearchResult;

    const provenance =
      "provenance" in result && result.provenance
        ? result.provenance
        : null;
    const usage =
      "usage" in result && result.usage ? result.usage : null;
    const telemetry =
      "searchStagesUsed" in result
        ? {
            searchStagesUsed: result.searchStagesUsed ?? null,
            researchStoppedReason: result.stoppedReason ?? null,
            researchStageTimings:
              result.stageTimings && result.stageTimings.length > 0
                ? result.stageTimings
                : null,
          }
        : null;
    const status: CompanyResearchStatus = hasUsableCompanyResearchFields(result)
      ? "COMPLETED"
      : "PARTIAL";

    const saved = await saveCompanyResearch({
      companyId: company.id,
      result,
      identityAmbiguous:
        "identityAmbiguous" in result && result.identityAmbiguous === true,
      researchMethod: "AUTOMATED",
      status,
      provenance,
      usage,
      telemetry,
      researchedByUserId: user?.id ?? null,
      freshnessDays: researchPolicy.researchFreshnessDays,
    });

    await recordUsageEvent({
      organizationId,
      userId: user?.id ?? null,
      category: "RESEARCH",
      operation: "RESEARCH_SYNTHESIS",
      provider: provenance?.aiProvider ?? null,
      model: provenance?.aiModel ?? null,
      companyId: company.id,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      webSearchCalls: usage?.webSearchCallCount ?? null,
      status: status === "PARTIAL" ? "PARTIAL" : "SUCCESS",
      durationMs: usage?.researchDurationMs ?? null,
      metadata: {
        forceRefresh: Boolean(options?.force),
        alreadyHadActiveSlot: alreadyHasActiveSlot,
        activeCompanyCountAfter: await countActiveResearchedCompanies(
          organizationId,
        ),
        searchStagesUsed: telemetry?.searchStagesUsed ?? null,
        researchStoppedReason: telemetry?.researchStoppedReason ?? null,
      },
    });

    return { skipped: false, research: saved };
  } catch (error) {
    if (error instanceof AiConfigError) {
      return {
        skipped: true,
        reason: "provider_unconfigured",
        research: priorSuccessful ?? latest,
      };
    }

    const failure = classifyResearchFailure(error);
    const message =
      error instanceof Error ? error.message : "Research provider failed.";

    await recordUsageEvent({
      organizationId,
      userId: user?.id ?? null,
      category: "RESEARCH",
      operation: "RESEARCH_SYNTHESIS",
      companyId: company.id,
      status: "FAILED",
      metadata: {
        forceRefresh: Boolean(options?.force),
        error: message.slice(0, 500),
        failureKind: failure.kind,
        failureCategory: failure.category,
        userMessage: failure.userMessage,
      },
    });

    const failedResult = {
      skipped: false as const,
      reason: failure.userMessage,
      researchFailed: true,
      refreshFailed: true,
      failure,
    };

    // Refresh safety: never replace prior successful research with a FAILED row.
    if (priorSuccessful) {
      return {
        ...failedResult,
        research: priorSuccessful,
      };
    }

    await createCompanyResearchRowUnderIntroLock({
      organizationId,
      companyId: company.id,
      status: "FAILED",
      researchMethod: "AUTOMATED",
      companySummary: null,
      aovReasoning: message.slice(0, 2000),
      researchedAt: new Date(),
      researchedByUserId: user?.id ?? null,
    });

    return {
      ...failedResult,
      research: await getLatestCompanyResearch(company.id),
    };
  }
}

export async function updateManualCompanyResearch(input: {
  companyId: string;
  companySummary?: string | null;
  whatTheySell?: string | null;
  estimatedAov?: string | null;
  aovReasoning?: string | null;
  customerTypes?: string[];
  primaryMarkets?: string[];
  businessModel?: string | null;
  companySizeContext?: string | null;
  relevantTechnologies?: string[];
  buyingSignals?: string[];
  riskSignals?: string[];
  researchConfidence?: ResearchConfidence | null;
}): Promise<CompanyResearch> {
  const organizationId = await orgId();
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, organizationId },
  });
  if (!company) notFound("Company");

  const latest = await getLatestCompanyResearch(company.id);
  const now = new Date();
  const researchPolicy = await getResearchPolicy(organizationId);
  const user = await resolveResearchUser();
  const isFirstIntroducer = !(await orgHasAnyCompanyResearch(
    organizationId,
    company.id,
  ));

  if (user && isFirstIntroducer) {
    try {
      await assertUsageAllowed({
        organizationId,
        userId: user.id,
        resource: "ACTIVE_RESEARCHED_COMPANY",
        wouldConsumeNewActiveCompanySlot: true,
        companyId: company.id,
      });
    } catch (error) {
      if (
        error instanceof UsageQuotaError ||
        error instanceof PaymentLockError
      ) {
        throw new TenantError(error.message);
      }
      throw error;
    }
  } else if (user) {
    try {
      await assertUsageAllowed({
        organizationId,
        userId: user.id,
        resource: "ACTIVE_RESEARCHED_COMPANY",
        wouldConsumeNewActiveCompanySlot: false,
        companyId: company.id,
      });
    } catch (error) {
      if (
        error instanceof UsageQuotaError ||
        error instanceof PaymentLockError
      ) {
        throw new TenantError(error.message);
      }
      throw error;
    }
  }

  const lockKey = `company-research-intro:${organizationId}:${company.id}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const prior = await tx.companyResearch.findFirst({
      where: { organizationId, companyId: company.id },
      orderBy: { createdAt: "asc" },
      select: { firstResearchedByUserId: true },
    });
    const firstResearchedByUserId = prior
      ? (prior.firstResearchedByUserId ?? null)
      : (user?.id ?? null);

    return tx.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        status: "COMPLETED" as CompanyResearchStatus,
        researchMethod: (latest && latest.researchMethod !== "MANUAL"
          ? "HYBRID"
          : "MANUAL") as ResearchMethod,
        companySummary: input.companySummary?.trim() || null,
        whatTheySell: input.whatTheySell?.trim() || null,
        estimatedAov: input.estimatedAov?.trim() || null,
        aovReasoning: input.aovReasoning?.trim() || null,
        customerTypes: input.customerTypes ?? [],
        primaryMarkets: input.primaryMarkets ?? [],
        businessModel: input.businessModel?.trim() || null,
        companySizeContext: input.companySizeContext?.trim() || null,
        relevantTechnologies: input.relevantTechnologies ?? [],
        buyingSignals: input.buyingSignals ?? [],
        riskSignals: input.riskSignals ?? [],
        researchConfidence: input.researchConfidence ?? "MEDIUM",
        sourceCount: Array.isArray(latest?.researchSources)
          ? (latest?.researchSources as unknown[]).length
          : 0,
        researchSources:
          (latest?.researchSources as ResearchSource[] | null) ?? [],
        researchedAt: now,
        expiresAt: researchExpiresAt(now, researchPolicy.researchFreshnessDays),
        researchedByUserId: user?.id ?? null,
        firstResearchedByUserId,
      },
    });
  });
}

export function researchStatusLabel(
  status: CompanyResearchStatus | null | undefined,
): string {
  switch (status) {
    case "COMPLETED":
      return "Complete";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    case "IN_PROGRESS":
      return "In progress";
    case "NOT_STARTED":
    default:
      return "Not Started";
  }
}

export { parseStringArray, isResearchFresh, needsResearchRefresh };
