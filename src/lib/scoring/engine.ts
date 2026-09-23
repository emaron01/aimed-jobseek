import "server-only";

import {
  isContactResearchAiConfigured,
  isScoringAiConfigured,
} from "@/lib/ai/config";
import { listUnconfiguredScoringRoles } from "@/lib/ai/roles";
import { SCORING_CONCURRENCY } from "@/lib/scoring/config";
import { scoreSingleContact } from "@/lib/scoring/score-contact";
import { resolvePersonaSnapshots } from "@/lib/scoring/title-fit";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";
import { prisma } from "@/lib/prisma";
import { hasUsableCompanyResearchFields } from "@/lib/research/freshness";
import { getResearchPolicy } from "@/lib/usage/policy-service";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import {
  assertCanModifyOwnedWork,
  getWorkActor,
} from "@/lib/work/ownership";
import { vocab } from "@/lib/product-config";

export {
  scoreSingleContact,
  type ScoreContactResult,
} from "@/lib/scoring/score-contact";

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]!);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

function asSnapshot<T>(value: unknown): T {
  return value as T;
}

export type RunScoringOptions = {
  rescoreFailedOnly?: boolean;
  forceRescore?: boolean;
  /** Score only these rows (used after a title-suggestion approval). */
  contactScoreIds?: string[];
  /** Optional persona override; defaults to the run snapshots. */
  personas?: PersonaSnapshot[];
};

export type RunScoringSummary = {
  totalContacts: number;
  attempted: number;
  completed: number;
  failed: number;
  companiesResearched: number;
  companiesMissingResearch: number;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
};

export async function getScoringReadiness(scoringRunId: string): Promise<{
  totalContacts: number;
  companiesResearched: number;
  companiesMissingResearch: number;
  alreadyScored: number;
  pending: number;
  failed: number;
  aiConfigured: boolean;
  contactResearchAiConfigured: boolean;
  contactResearchEnabled: boolean;
  unconfiguredRoleLabels: string[];
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const run = await prisma.scoringRun.findFirst({
    where: {
      id: scoringRunId,
      organizationId,
      ...(actor.canViewAll
        ? {}
        : { contactList: { ownerUserId: actor.userId } }),
    },
    select: { id: true, contactListId: true },
  });
  if (!run)
    throw new TenantError("Scoring run not found in the active organization.");

  const scores = await prisma.contactScore.findMany({
    where: { organizationId, scoringRunId },
    include: {
      contact: {
        select: {
          companyId: true,
          companyRecord: {
            select: {
              research: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: {
                  status: true,
                  companySummary: true,
                  whatTheySell: true,
                  estimatedAov: true,
                  aovReasoning: true,
                  customerTypes: true,
                  primaryMarkets: true,
                  businessModel: true,
                  companySizeContext: true,
                  relevantTechnologies: true,
                  buyingSignals: true,
                  riskSignals: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const companyResearch = new Map<string, boolean>();
  for (const row of scores) {
    const companyId = row.contact.companyId;
    if (!companyId) continue;
    const latest = row.contact.companyRecord?.research[0];
    const ok =
      latest != null &&
      (latest.status === "COMPLETED" || latest.status === "PARTIAL") &&
      hasUsableCompanyResearchFields(latest);
    companyResearch.set(companyId, ok);
  }

  let companiesResearched = 0;
  let companiesMissingResearch = 0;
  for (const ok of companyResearch.values()) {
    if (ok) companiesResearched += 1;
    else companiesMissingResearch += 1;
  }

  const researchPolicy = await getResearchPolicy(organizationId);
  const contactResearchEnabled = researchPolicy.contactResearchEnabled;
  const unconfiguredRoles = listUnconfiguredScoringRoles({
    contactResearchEnabled,
  });

  return {
    totalContacts: scores.length,
    companiesResearched,
    companiesMissingResearch,
    alreadyScored: scores.filter((s) => s.scoringStatus === "COMPLETED").length,
    pending: scores.filter(
      (s) =>
        s.scoringStatus === "PENDING" ||
        s.scoringStatus === "FAILED" ||
        s.scoringStatus === "IN_PROGRESS",
    ).length,
    failed: scores.filter((s) => s.scoringStatus === "FAILED").length,
    aiConfigured: isScoringAiConfigured(),
    contactResearchAiConfigured: isContactResearchAiConfigured(),
    contactResearchEnabled,
    unconfiguredRoleLabels: unconfiguredRoles.map((role) => role.label),
  };
}

export async function runScoringForRun(
  scoringRunId: string,
  options?: RunScoringOptions,
): Promise<RunScoringSummary> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;

  const run = await prisma.scoringRun.findFirst({
    where: { id: scoringRunId, organizationId },
    include: { contactList: { select: { ownerUserId: true } } },
  });
  if (!run) {
    throw new TenantError("Scoring run not found in the active organization.");
  }
  assertCanModifyOwnedWork(actor, run.contactList.ownerUserId, "Scoring run");

  const product = asSnapshot<ProductSnapshot>(run.productSnapshot);
  const icp = asSnapshot<IcpSnapshot>(run.icpSnapshot);
  const personas =
    options?.personas && options.personas.length > 0
      ? options.personas
      : resolvePersonaSnapshots({
          personaSnapshot: run.personaSnapshot,
          personaSnapshots: run.personaSnapshots,
        });
  const persona = personas[0];
  if (!persona) {
    throw new TenantError(`Scoring run is missing ${vocab.persona.aSingular} snapshot.`);
  }

  const subset = Boolean(options?.contactScoreIds?.length);

  await prisma.scoringRun.update({
    where: { id: run.id },
    data: { status: "IN_PROGRESS", completedAt: null },
  });

  const scores = await prisma.contactScore.findMany({
    where: { organizationId, scoringRunId: run.id },
    select: { id: true, contactId: true, scoringStatus: true },
    orderBy: { createdAt: "asc" },
  });

  const allowedIds = options?.contactScoreIds
    ? new Set(options.contactScoreIds)
    : null;
  const targets = scores.filter((row) => {
    if (row.scoringStatus === "SUPPRESSED") return false;
    if (row.scoringStatus === "UNUSABLE") return false;
    if (allowedIds) return allowedIds.has(row.id);
    if (options?.forceRescore) return true;
    if (options?.rescoreFailedOnly) return row.scoringStatus === "FAILED";
    return row.scoringStatus !== "COMPLETED";
  });

  const readiness = await getScoringReadiness(run.id);

  const results = await mapPool(targets, SCORING_CONCURRENCY, (row) =>
    scoreSingleContact({
      organizationId,
      scoringRunId: run.id,
      contactScoreId: row.id,
      product,
      icp,
      persona,
      personas,
    }),
  );

  const completedNow = results.filter((r) => r.ok).length;
  const failedNow = results.filter((r) => !r.ok).length;

  const refreshed = await prisma.contactScore.findMany({
    where: { organizationId, scoringRunId: run.id },
    select: { scoringStatus: true },
  });

  const completedTotal = refreshed.filter(
    (r) => r.scoringStatus === "COMPLETED",
  ).length;
  const failedTotal = refreshed.filter(
    (r) => r.scoringStatus === "FAILED",
  ).length;
  const pendingTotal = refreshed.filter(
    (r) => r.scoringStatus === "PENDING" || r.scoringStatus === "IN_PROGRESS",
  ).length;

  let status: RunScoringSummary["status"] = "COMPLETED";
  if (completedTotal === 0 && failedTotal > 0) status = "FAILED";
  else if (failedTotal > 0 || pendingTotal > 0) status = "PARTIAL";
  else status = "COMPLETED";

  await prisma.scoringRun.update({
    where: { id: run.id },
    data: {
      status,
      scoredContacts: completedTotal,
      totalContacts: refreshed.length,
      completedAt: new Date(),
    },
  });

  if (!subset && personas.length > 1) {
    try {
      const { generateTitleSuggestionsForRun } =
        await import("@/lib/scoring/title-suggestions");
      await generateTitleSuggestionsForRun({
        organizationId,
        scoringRunId: run.id,
      });
    } catch {
      // Scoring results are already persisted. Suggestion failures are metered.
    }
  }

  return {
    totalContacts: refreshed.length,
    attempted: results.length,
    completed: completedNow,
    failed: failedNow,
    companiesResearched: readiness.companiesResearched,
    companiesMissingResearch: readiness.companiesMissingResearch,
    status,
  };
}
