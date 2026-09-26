import "server-only";

import type { UsageCategory, UsageEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  listAiModelRates,
  resolveRate,
  type AiModelRateRow,
} from "@/lib/platform/model-rates";

export const DRIFT_THRESHOLD_PERCENT = 15;

export type CostWindow = "7d" | "30d" | "90d";

export type CostableEvent = {
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
  outputTokens?: number | null;
  webSearchCalls?: number | null;
  occurredAt: Date;
  category?: UsageCategory;
  operation?: string;
  status?: string;
};

export type ApplicationCostRow = {
  campaignId: string;
  name: string;
  estimatedSpendUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type ProjectionEmails = 100 | 300 | 500;

export type CostProjection = {
  emails: ProjectionEmails;
  companiesNeeded: number;
  estimatedMonthlyUsd: number;
};

export type CostReport = {
  window: CostWindow;
  since: Date;
  until: Date;
  estimatedSpendUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  byCategory: Record<string, number>;
  byOperation: Record<string, number>;
  byApplication: ApplicationCostRow[];
  unratedEventCount: number;
  companiesResearched: number;
  costPerCompanyUsd: number | null;
  contactsWithCompany: number;
  distinctCompaniesWithContacts: number;
  contactsPerCompany: number | null;
  /** Observed contacts/company when >= 1 — 1:1 outreach would need this many more company researches for the same contact volume. */
  costMultiplierVsMultiThread: number | null;
  projections: CostProjection[];
  costPerEmailUsd: number | null;
  emailGenerationSpendUsd: number;
  emailDraftCount: number;
};

export type OrgCostSummary = {
  organizationId: string;
  name: string;
  estimatedSpendUsd: number;
  companiesResearched: number;
  costPerCompanyUsd: number | null;
  contactsPerCompany: number | null;
  contactsWithCompany: number;
  distinctCompaniesWithContacts: number;
};

const WINDOW_DAYS: Record<CostWindow, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function windowBounds(
  window: CostWindow,
  now: Date = new Date(),
): { since: Date; until: Date } {
  const days = WINDOW_DAYS[window];
  const until = now;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { since, until };
}

export function estimateEventCostUsd(
  event: CostableEvent,
  rates: AiModelRateRow[],
): number {
  const rate = resolveRate(
    event.provider,
    event.model,
    event.occurredAt,
    rates,
  );
  if (!rate) return 0;

  const inputTokens = event.inputTokens ?? 0;
  const cachedInputTokens = Math.min(
    Math.max(event.cachedInputTokens ?? 0, 0),
    inputTokens,
  );
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const cacheWriteTokens = Math.min(
    Math.max(event.cacheWriteTokens ?? 0, 0),
    uncachedInputTokens,
  );
  const billedUncachedTokens = uncachedInputTokens - cacheWriteTokens;
  const outputTokens = event.outputTokens ?? 0;
  const webSearchCalls = event.webSearchCalls ?? 0;

  return (
    (billedUncachedTokens / 1_000_000) * rate.inputPer1MUsd +
    (cachedInputTokens / 1_000_000) * rate.cachedInputPer1MUsd +
    (cacheWriteTokens / 1_000_000) * rate.cacheWritePer1MUsd +
    (outputTokens / 1_000_000) * rate.outputPer1MUsd +
    webSearchCalls * rate.webSearchPerCallUsd
  );
}

export function eventIsRated(
  event: CostableEvent,
  rates: AiModelRateRow[],
): boolean {
  return resolveRate(event.provider, event.model, event.occurredAt, rates) != null;
}

/**
 * Projection assumptions:
 * - one email ≈ one contact outreach
 * - companiesNeeded = emails / contactsPerCompany (ratio floor 1.0 when missing)
 * - cost = companiesNeeded * costPerCompanyUsd + emails * costPerEmailUsd
 * - costPerEmailUsd = email-generation spend / EMAIL_DRAFT_CREATED count (or 0)
 */
export function buildCostProjections(input: {
  contactsPerCompany: number | null;
  costPerCompanyUsd: number | null;
  costPerEmailUsd: number | null;
  emailVolumes?: ProjectionEmails[];
}): CostProjection[] {
  const volumes = input.emailVolumes ?? ([100, 300, 500] as ProjectionEmails[]);
  const ratio =
    input.contactsPerCompany != null &&
    Number.isFinite(input.contactsPerCompany) &&
    input.contactsPerCompany > 0
      ? input.contactsPerCompany
      : 1.0;
  const costPerCompany = input.costPerCompanyUsd ?? 0;
  const costPerEmail = input.costPerEmailUsd ?? 0;

  return volumes.map((emails) => {
    const companiesNeeded = Math.max(1, emails / ratio);
    const estimatedMonthlyUsd =
      companiesNeeded * costPerCompany + emails * costPerEmail;
    return { emails, companiesNeeded, estimatedMonthlyUsd };
  });
}

/** |actual − est| / actual × 100. Null when actual is 0. */
export function computeDriftPercent(
  providerReportedUsd: number,
  estimatedUsd: number,
): number | null {
  if (!Number.isFinite(providerReportedUsd) || providerReportedUsd === 0) {
    return null;
  }
  return (
    (Math.abs(providerReportedUsd - estimatedUsd) / providerReportedUsd) * 100
  );
}

export function driftExceedsThreshold(
  driftPercent: number | null,
  thresholdPercent: number = DRIFT_THRESHOLD_PERCENT,
): boolean {
  return driftPercent != null && driftPercent > thresholdPercent;
}

async function loadRatesCache(): Promise<AiModelRateRow[]> {
  return listAiModelRates();
}

function accumulateEvent(
  event: Pick<
    UsageEvent,
    | "provider"
    | "model"
    | "inputTokens"
    | "cachedInputTokens"
    | "cacheWriteTokens"
    | "outputTokens"
    | "webSearchCalls"
    | "occurredAt"
    | "category"
    | "operation"
    | "status"
  >,
  rates: AiModelRateRow[],
  acc: {
    estimatedSpendUsd: number;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    webSearchCalls: number;
    byCategory: Record<string, number>;
    byOperation: Record<string, number>;
    unratedEventCount: number;
    emailGenerationSpendUsd: number;
    emailDraftCount: number;
  },
): void {
  const costable: CostableEvent = {
    provider: event.provider,
    model: event.model,
    inputTokens: event.inputTokens,
    cachedInputTokens: event.cachedInputTokens,
    cacheWriteTokens: event.cacheWriteTokens,
    outputTokens: event.outputTokens,
    webSearchCalls: event.webSearchCalls,
    occurredAt: event.occurredAt,
  };
  const rated = eventIsRated(costable, rates);
  if (!rated) acc.unratedEventCount += 1;

  const usd = estimateEventCostUsd(costable, rates);
  acc.estimatedSpendUsd += usd;
  acc.inputTokens += event.inputTokens ?? 0;
  acc.cachedInputTokens += event.cachedInputTokens ?? 0;
  acc.cacheWriteTokens += event.cacheWriteTokens ?? 0;
  acc.outputTokens += event.outputTokens ?? 0;
  acc.webSearchCalls += event.webSearchCalls ?? 0;
  acc.byCategory[event.category] = (acc.byCategory[event.category] ?? 0) + usd;
  acc.byOperation[event.operation] =
    (acc.byOperation[event.operation] ?? 0) + usd;

  if (
    event.category === "EMAIL_GENERATION" &&
    event.operation === "EMAIL_DRAFT_CREATED" &&
    (event.status === "SUCCESS" || event.status === "PARTIAL")
  ) {
    acc.emailGenerationSpendUsd += usd;
    acc.emailDraftCount += 1;
  }
}

async function countCompaniesResearchedInWindow(input: {
  organizationId?: string;
  since: Date;
  until: Date;
}): Promise<number> {
  const rows = await prisma.usageEvent.findMany({
    where: {
      ...(input.organizationId
        ? { organizationId: input.organizationId }
        : {}),
      category: "RESEARCH",
      status: { in: ["SUCCESS", "PARTIAL"] },
      companyId: { not: null },
      occurredAt: { gte: input.since, lte: input.until },
    },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  return rows.length;
}

async function contactCompanyRatio(input: {
  organizationId?: string;
}): Promise<{
  contactsWithCompany: number;
  distinctCompaniesWithContacts: number;
  contactsPerCompany: number | null;
}> {
  if (input.organizationId) {
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: input.organizationId,
        companyId: { not: null },
      },
      select: { companyId: true },
    });
    const companyIds = new Set(
      contacts.map((c) => c.companyId).filter((id): id is string => Boolean(id)),
    );
    const contactsWithCompany = contacts.length;
    const distinctCompaniesWithContacts = companyIds.size;
    return {
      contactsWithCompany,
      distinctCompaniesWithContacts,
      contactsPerCompany:
        distinctCompaniesWithContacts > 0
          ? contactsWithCompany / distinctCompaniesWithContacts
          : null,
    };
  }

  // Platform-wide: average of orgs that have company-linked contacts.
  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });
  let weightedContacts = 0;
  let weightedCompanies = 0;
  let orgsWithData = 0;
  for (const org of orgs) {
    const ratio = await contactCompanyRatio({ organizationId: org.id });
    if (
      ratio.distinctCompaniesWithContacts > 0 &&
      ratio.contactsWithCompany > 0
    ) {
      weightedContacts += ratio.contactsWithCompany;
      weightedCompanies += ratio.distinctCompaniesWithContacts;
      orgsWithData += 1;
    }
  }
  if (orgsWithData === 0 || weightedCompanies === 0) {
    return {
      contactsWithCompany: 0,
      distinctCompaniesWithContacts: 0,
      contactsPerCompany: null,
    };
  }
  return {
    contactsWithCompany: weightedContacts,
    distinctCompaniesWithContacts: weightedCompanies,
    contactsPerCompany: weightedContacts / weightedCompanies,
  };
}

export async function computeCostReport(input: {
  organizationId?: string;
  window: CostWindow;
  now?: Date;
}): Promise<CostReport> {
  const now = input.now ?? new Date();
  const { since, until } = windowBounds(input.window, now);
  const rates = await loadRatesCache();

  const events = await prisma.usageEvent.findMany({
    where: {
      ...(input.organizationId
        ? { organizationId: input.organizationId }
        : {}),
      occurredAt: { gte: since, lte: until },
    },
    select: {
      provider: true,
      model: true,
      inputTokens: true,
      cachedInputTokens: true,
      cacheWriteTokens: true,
      outputTokens: true,
      webSearchCalls: true,
      occurredAt: true,
      category: true,
      operation: true,
      status: true,
      campaignId: true,
    },
  });

  const acc = {
    estimatedSpendUsd: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    webSearchCalls: 0,
    byCategory: {} as Record<string, number>,
    byOperation: {} as Record<string, number>,
    unratedEventCount: 0,
    emailGenerationSpendUsd: 0,
    emailDraftCount: 0,
  };
  const byApplicationMap = new Map<
    string,
    {
      campaignId: string;
      estimatedSpendUsd: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }
  >();

  for (const event of events) {
    accumulateEvent(event, rates, acc);
    if (!event.campaignId) continue;
    const usd = estimateEventCostUsd(event, rates);
    const row = byApplicationMap.get(event.campaignId) ?? {
      campaignId: event.campaignId,
      estimatedSpendUsd: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
    };
    row.estimatedSpendUsd += usd;
    row.inputTokens += event.inputTokens ?? 0;
    row.cachedInputTokens += event.cachedInputTokens ?? 0;
    row.outputTokens += event.outputTokens ?? 0;
    byApplicationMap.set(event.campaignId, row);
  }

  const campaignIds = [...byApplicationMap.keys()];
  const campaigns =
    campaignIds.length > 0
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, name: true },
        })
      : [];
  const campaignNames = new Map(campaigns.map((row) => [row.id, row.name]));
  const byApplication = [...byApplicationMap.values()]
    .map((row) => ({
      ...row,
      name: campaignNames.get(row.campaignId) ?? row.campaignId,
    }))
    .sort((a, b) => b.estimatedSpendUsd - a.estimatedSpendUsd);

  let companiesResearched = await countCompaniesResearchedInWindow({
    organizationId: input.organizationId,
    since,
    until,
  });

  if (companiesResearched === 0) {
    if (input.organizationId) {
      companiesResearched = await countActiveResearchedCompanies(
        input.organizationId,
        now,
      );
    } else {
      const orgs = await prisma.organization.findMany({ select: { id: true } });
      let sum = 0;
      for (const org of orgs) {
        sum += await countActiveResearchedCompanies(org.id, now);
      }
      companiesResearched = sum;
    }
  }

  const contactRatio = await contactCompanyRatio({
    organizationId: input.organizationId,
  });

  // Fully-loaded company cost excludes email generation so projections do not double-count.
  const companyRelatedSpend = Math.max(
    0,
    acc.estimatedSpendUsd - acc.emailGenerationSpendUsd,
  );
  const costPerCompanyUsd =
    companiesResearched > 0 ? companyRelatedSpend / companiesResearched : null;
  const costPerEmailUsd =
    acc.emailDraftCount > 0
      ? acc.emailGenerationSpendUsd / acc.emailDraftCount
      : null;

  const contactsPerCompany = contactRatio.contactsPerCompany;
  const costMultiplierVsMultiThread =
    contactsPerCompany != null && contactsPerCompany >= 1
      ? contactsPerCompany
      : null;

  const projections = buildCostProjections({
    contactsPerCompany,
    costPerCompanyUsd,
    costPerEmailUsd,
  });

  return {
    window: input.window,
    since,
    until,
    estimatedSpendUsd: acc.estimatedSpendUsd,
    inputTokens: acc.inputTokens,
    cachedInputTokens: acc.cachedInputTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    outputTokens: acc.outputTokens,
    webSearchCalls: acc.webSearchCalls,
    byCategory: acc.byCategory,
    byOperation: acc.byOperation,
    byApplication,
    unratedEventCount: acc.unratedEventCount,
    companiesResearched,
    costPerCompanyUsd,
    contactsWithCompany: contactRatio.contactsWithCompany,
    distinctCompaniesWithContacts: contactRatio.distinctCompaniesWithContacts,
    contactsPerCompany,
    costMultiplierVsMultiThread,
    projections,
    costPerEmailUsd,
    emailGenerationSpendUsd: acc.emailGenerationSpendUsd,
    emailDraftCount: acc.emailDraftCount,
  };
}

export async function listOrgCostSummaries(
  window: CostWindow,
  now: Date = new Date(),
): Promise<OrgCostSummary[]> {
  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const rows: OrgCostSummary[] = [];
  for (const org of orgs) {
    const report = await computeCostReport({
      organizationId: org.id,
      window,
      now,
    });
    rows.push({
      organizationId: org.id,
      name: org.name,
      estimatedSpendUsd: report.estimatedSpendUsd,
      companiesResearched: report.companiesResearched,
      costPerCompanyUsd: report.costPerCompanyUsd,
      contactsPerCompany: report.contactsPerCompany,
      contactsWithCompany: report.contactsWithCompany,
      distinctCompaniesWithContacts: report.distinctCompaniesWithContacts,
    });
  }
  return rows;
}

export async function estimateSpendForPeriod(input: {
  periodStart: Date;
  periodEnd: Date;
  provider?: string;
}): Promise<number> {
  const rates = await loadRatesCache();
  const providerFilter =
    input.provider && input.provider.toUpperCase() !== "ALL"
      ? input.provider.trim().toLowerCase()
      : null;

  const events = await prisma.usageEvent.findMany({
    where: {
      occurredAt: { gte: input.periodStart, lte: input.periodEnd },
      ...(providerFilter
        ? { provider: { equals: providerFilter, mode: "insensitive" } }
        : {}),
    },
    select: {
      provider: true,
      model: true,
      inputTokens: true,
      cachedInputTokens: true,
      cacheWriteTokens: true,
      outputTokens: true,
      webSearchCalls: true,
      occurredAt: true,
    },
  });

  let total = 0;
  for (const event of events) {
    total += estimateEventCostUsd(event, rates);
  }
  return total;
}

export async function getLatestSpendDrift(): Promise<{
  hasDrift: boolean;
  thresholdPercent: typeof DRIFT_THRESHOLD_PERCENT;
  latest: null | {
    id: string;
    provider: string;
    periodStart: Date;
    periodEnd: Date;
    providerReportedUsd: number;
    estimatedUsd: number;
    absDeltaUsd: number;
    driftPercent: number;
    createdAt: Date;
  };
}> {
  const latest = await prisma.providerSpendReconciliation.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!latest) {
    return {
      hasDrift: false,
      thresholdPercent: DRIFT_THRESHOLD_PERCENT,
      latest: null,
    };
  }

  const providerReportedUsd = Number(latest.providerReportedUsd);
  const estimatedUsd = Number(latest.estimatedUsd);
  const driftPercent =
    computeDriftPercent(providerReportedUsd, estimatedUsd) ?? 0;
  const absDeltaUsd = Math.abs(providerReportedUsd - estimatedUsd);

  return {
    hasDrift: driftExceedsThreshold(driftPercent),
    thresholdPercent: DRIFT_THRESHOLD_PERCENT,
    latest: {
      id: latest.id,
      provider: latest.provider,
      periodStart: latest.periodStart,
      periodEnd: latest.periodEnd,
      providerReportedUsd,
      estimatedUsd,
      absDeltaUsd,
      driftPercent,
      createdAt: latest.createdAt,
    },
  };
}

export async function listSpendReconciliations(limit = 50) {
  const rows = await prisma.providerSpendReconciliation.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      createdBy: { select: { id: true, email: true, name: true } },
    },
  });
  return rows.map((r) => {
    const providerReportedUsd = Number(r.providerReportedUsd);
    const estimatedUsd = Number(r.estimatedUsd);
    const driftPercent =
      computeDriftPercent(providerReportedUsd, estimatedUsd) ?? 0;
    return {
      id: r.id,
      provider: r.provider,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      providerReportedUsd,
      estimatedUsd,
      notes: r.notes,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
      absDeltaUsd: Math.abs(providerReportedUsd - estimatedUsd),
      driftPercent,
      hasDrift: driftExceedsThreshold(driftPercent),
    };
  });
}

export async function recordSpendReconciliation(input: {
  actorUserId: string;
  provider: string;
  periodStart: Date;
  periodEnd: Date;
  providerReportedUsd: number;
  notes?: string | null;
}): Promise<{
  id: string;
  estimatedUsd: number;
  driftPercent: number | null;
  hasDrift: boolean;
}> {
  const provider = input.provider.trim() || "ALL";
  if (!Number.isFinite(input.providerReportedUsd) || input.providerReportedUsd < 0) {
    throw new Error("Provider reported USD must be a non-negative number.");
  }
  if (input.periodEnd.getTime() < input.periodStart.getTime()) {
    throw new Error("Period end must be on or after period start.");
  }

  const estimatedUsd = await estimateSpendForPeriod({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    provider,
  });

  const created = await prisma.providerSpendReconciliation.create({
    data: {
      provider,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      providerReportedUsd: input.providerReportedUsd,
      estimatedUsd,
      notes: input.notes?.trim() || null,
      createdByUserId: input.actorUserId,
    },
  });

  const driftPercent = computeDriftPercent(
    input.providerReportedUsd,
    estimatedUsd,
  );

  await recordAdminAuditEvent({
    action: "PROVIDER_SPEND_RECONCILED",
    actorUserId: input.actorUserId,
    metadata: {
      reconciliationId: created.id,
      provider,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      providerReportedUsd: input.providerReportedUsd,
      estimatedUsd,
      driftPercent,
    },
  });

  return {
    id: created.id,
    estimatedUsd,
    driftPercent,
    hasDrift: driftExceedsThreshold(driftPercent),
  };
}
