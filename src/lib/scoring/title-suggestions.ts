import "server-only";

import type { Prisma } from "@prisma/client";
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
  getScoringAiConfig,
  getScoringAiProvider,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { getCurrentUser } from "@/lib/org/authz";
import {
  appendTargetTitle,
  mergeManualEditedFields,
  TARGET_TITLES_FIELD,
} from "@/lib/persona/manual-target-titles";
import { prisma } from "@/lib/prisma";
import { snapshotCriterionRow, snapshotPersona } from "@/lib/scoring/snapshots";
import type { TitleSuggestionAiResult } from "@/lib/scoring/title-suggestion-contract";
import {
  buildTitleSuggestionMessages,
  TITLE_SUGGESTION_PROMPT_VERSION,
} from "@/lib/scoring/title-suggestion-prompt";
import {
  canonicalTitle,
  resolvePersonaSnapshots,
} from "@/lib/scoring/title-fit";
import type { PersonaSnapshot } from "@/lib/scoring/types";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import { recordUsageEvent } from "@/lib/usage/events";
import { countedNoun, vocab } from "@/lib/product-config";

export type UnmatchedTitleRow = {
  contactScoreId: string;
  title: string | null | undefined;
};

export type UnmatchedTitleGroup = {
  title: string;
  normalizedTitle: string;
  contactCount: number;
  contactScoreIds: string[];
};

export type MappedTitleSuggestion = UnmatchedTitleGroup & {
  proposedPersonaId: string | null;
  proposedPersonaName: string | null;
  confidence: string;
  reasoning: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiTimeoutError) return true;
  if (error instanceof AiProviderError) return error.retryable;
  return false;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function isUnmatchedTitleScore(score: {
  scoringStatus: string;
  assessmentData: unknown;
}): boolean {
  if (score.scoringStatus !== "COMPLETED") return false;
  const data = score.assessmentData;
  if (!data || typeof data !== "object") return false;
  const record = data as {
    personaMatch?: { status?: string };
    aiSkipReason?: string;
  };
  return (
    record.personaMatch?.status === "UNKNOWN" ||
    record.aiSkipReason === "NO_TITLE_FIT"
  );
}

export function groupUnmatchedTitles(
  rows: UnmatchedTitleRow[],
): UnmatchedTitleGroup[] {
  const byCanonical = new Map<
    string,
    { spellings: Map<string, number>; ids: string[] }
  >();

  for (const row of rows) {
    const raw = (row.title ?? "").trim();
    if (!raw) continue;
    const normalized = canonicalTitle(raw);
    if (!normalized) continue;
    let group = byCanonical.get(normalized);
    if (!group) {
      group = { spellings: new Map(), ids: [] };
      byCanonical.set(normalized, group);
    }
    group.ids.push(row.contactScoreId);
    group.spellings.set(raw, (group.spellings.get(raw) ?? 0) + 1);
  }

  const groups: UnmatchedTitleGroup[] = [];
  for (const [normalizedTitle, group] of byCanonical) {
    let title = "";
    let best = -1;
    for (const [spelling, count] of group.spellings) {
      if (count > best) {
        best = count;
        title = spelling;
      }
    }
    groups.push({
      title,
      normalizedTitle,
      contactCount: group.ids.length,
      contactScoreIds: group.ids,
    });
  }

  groups.sort(
    (left, right) =>
      right.contactCount - left.contactCount ||
      left.title.localeCompare(right.title),
  );
  return groups;
}

export function mapAiSuggestionsToGroups(input: {
  groups: UnmatchedTitleGroup[];
  personas: Array<{ id: string; name: string }>;
  ai: TitleSuggestionAiResult;
}): MappedTitleSuggestion[] {
  const personaById = new Map(
    input.personas.map((persona) => [persona.id, persona]),
  );
  const aiByCanonical = new Map<
    string,
    TitleSuggestionAiResult["suggestions"][number]
  >();
  for (const item of input.ai.suggestions) {
    aiByCanonical.set(canonicalTitle(item.unmatchedTitle), item);
  }

  return input.groups.map((group) => {
    const item = aiByCanonical.get(group.normalizedTitle);
    const proposedId = item?.proposedPersonaId?.trim() || null;
    const persona = proposedId ? personaById.get(proposedId) : undefined;
    if (!item || !persona) {
      return {
        ...group,
        proposedPersonaId: null,
        proposedPersonaName: null,
        confidence: item?.confidence === "NONE" ? "NONE" : (item?.confidence ?? "NONE"),
        reasoning:
          item?.reasoning?.trim() ||
          "No persona match. Contacts stay in needs review.",
      };
    }
    return {
      ...group,
      proposedPersonaId: persona.id,
      proposedPersonaName: persona.name,
      confidence: item.confidence,
      reasoning: item.reasoning,
    };
  });
}

export async function generateTitleSuggestionAssessment(input: {
  personas: PersonaSnapshot[];
  unmatchedTitles: string[];
  maxRetries: number;
}): Promise<{
  data: TitleSuggestionAiResult;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}> {
  const provider = getScoringAiProvider();
  let attempt = 0;
  while (true) {
    try {
      const response = await provider.generateStructured({
        ...structuredOutputRequest("titleSuggestion"),
        messages: buildTitleSuggestionMessages({
          personas: input.personas,
          unmatchedTitles: input.unmatchedTitles,
        }),
      });
      return {
        data: response.data,
        provider: response.provider,
        model: response.model,
        inputTokens: response.usage?.inputTokens ?? null,
        outputTokens: response.usage?.outputTokens ?? null,
      };
    } catch (error) {
      if (
        error instanceof AiValidationError ||
        error instanceof AiConfigError ||
        error instanceof TenantError
      ) {
        throw error;
      }
      if (!isRetryable(error) || attempt >= input.maxRetries) throw error;
      await sleep(Math.min(2000 * 2 ** attempt, 8000));
      attempt += 1;
    }
  }
}

export async function generateTitleSuggestionsForRun(input: {
  organizationId: string;
  scoringRunId: string;
}): Promise<{ suggestionCount: number; aiCalled: boolean }> {
  const run = await prisma.scoringRun.findFirst({
    where: { id: input.scoringRunId, organizationId: input.organizationId },
  });
  if (!run) {
    throw new TenantError("Scoring run not found in the active organization.");
  }

  const personas = resolvePersonaSnapshots({
    personaSnapshot: run.personaSnapshot,
    personaSnapshots: run.personaSnapshots,
  });
  if (personas.length <= 1) {
    return { suggestionCount: 0, aiCalled: false };
  }

  const scores = await prisma.contactScore.findMany({
    where: {
      organizationId: input.organizationId,
      scoringRunId: run.id,
    },
    select: {
      id: true,
      scoringStatus: true,
      assessmentData: true,
      contact: { select: { title: true } },
    },
  });

  const unmatchedRows = scores
    .filter((row) => isUnmatchedTitleScore(row))
    .map((row) => ({
      contactScoreId: row.id,
      title: row.contact.title,
    }));
  const groups = groupUnmatchedTitles(unmatchedRows);

  const dismissed = await prisma.productTitleDismissal.findMany({
    where: {
      organizationId: input.organizationId,
      productId: run.productId,
    },
    select: { normalizedTitle: true },
  });
  const dismissedSet = new Set(
    dismissed.map((row) => row.normalizedTitle),
  );

  const alreadyResolved = await prisma.titleSuggestion.findMany({
    where: {
      organizationId: input.organizationId,
      scoringRunId: run.id,
      status: { in: ["APPROVED", "DISMISSED"] },
    },
    select: { normalizedTitle: true },
  });
  const resolvedSet = new Set(
    alreadyResolved.map((row) => row.normalizedTitle),
  );

  const pendingGroups = groups.filter(
    (group) =>
      !dismissedSet.has(group.normalizedTitle) &&
      !resolvedSet.has(group.normalizedTitle),
  );

  if (pendingGroups.length === 0) {
    await prisma.titleSuggestion.deleteMany({
      where: {
        organizationId: input.organizationId,
        scoringRunId: run.id,
        status: "PENDING",
      },
    });
    return { suggestionCount: 0, aiCalled: false };
  }

  const started = Date.now();
  const user = await getCurrentUser();
  const config = getScoringAiConfig();

  try {
    const ai = await generateTitleSuggestionAssessment({
      personas,
      unmatchedTitles: pendingGroups.map((group) => group.title),
      maxRetries: config.maxRetries,
    });
    const mapped = mapAiSuggestionsToGroups({
      groups: pendingGroups,
      personas,
      ai: ai.data,
    });

    await prisma.$transaction(async (tx) => {
      await tx.titleSuggestion.deleteMany({
        where: {
          organizationId: input.organizationId,
          scoringRunId: run.id,
          status: "PENDING",
        },
      });
      if (mapped.length > 0) {
        await tx.titleSuggestion.createMany({
          data: mapped.map((row) => ({
            organizationId: input.organizationId,
            scoringRunId: run.id,
            productId: run.productId,
            unmatchedTitle: row.title,
            normalizedTitle: row.normalizedTitle,
            contactCount: row.contactCount,
            proposedPersonaId: row.proposedPersonaId,
            proposedPersonaName: row.proposedPersonaName,
            confidence: row.confidence,
            reasoning: row.reasoning,
            status: "PENDING",
          })),
        });
      }
    });

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: user?.id ?? null,
      category: "SCORING",
      operation: "TITLE_SUGGESTION",
      provider: ai.provider,
      model: ai.model,
      scoringRunId: run.id,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      metadata: {
        unmatchedTitleCount: pendingGroups.length,
        promptVersion: TITLE_SUGGESTION_PROMPT_VERSION,
        aiCalls: 1,
      },
    });

    return { suggestionCount: mapped.length, aiCalled: true };
  } catch (error) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: user?.id ?? null,
      category: "SCORING",
      operation: "TITLE_SUGGESTION",
      scoringRunId: run.id,
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        unmatchedTitleCount: pendingGroups.length,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function listTitleSuggestionsForRun(scoringRunId: string) {
  const { requireOrganizationId } = await import(
    "@/lib/tenant/getCurrentOrganization"
  );
  const organizationId = await requireOrganizationId();
  return prisma.titleSuggestion.findMany({
    where: { organizationId, scoringRunId },
    orderBy: [{ status: "asc" }, { contactCount: "desc" }, { unmatchedTitle: "asc" }],
  });
}

async function loadPersonaSnapshot(
  organizationId: string,
  personaId: string,
): Promise<PersonaSnapshot> {
  const persona = await prisma.persona.findFirst({
    where: { id: personaId, organizationId, archivedAt: null },
    include: { criteria: { orderBy: { sortOrder: "asc" } } },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
  }
  return snapshotPersona(
    persona,
    persona.criteria.map(snapshotCriterionRow),
  );
}

async function persistManualTargetTitle(input: {
  organizationId: string;
  productId: string;
  personaId: string;
  title: string;
}): Promise<PersonaSnapshot> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      productId: input.productId,
      archivedAt: null,
    },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
  }

  const targetTitles = appendTargetTitle(
    persona.targetTitles,
    input.title,
    canonicalTitle,
  );
  const manuallyEditedFields = mergeManualEditedFields(
    persona.manuallyEditedFields,
    [TARGET_TITLES_FIELD],
  );

  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      targetTitles: jsonValue(targetTitles),
      manuallyEditedFields: jsonValue(manuallyEditedFields),
    },
  });

  return loadPersonaSnapshot(input.organizationId, persona.id);
}

async function replaceRunPersonaSnapshot(input: {
  organizationId: string;
  scoringRunId: string;
  snapshot: PersonaSnapshot;
}): Promise<void> {
  const run = await prisma.scoringRun.findFirst({
    where: { id: input.scoringRunId, organizationId: input.organizationId },
  });
  if (!run) {
    throw new TenantError("Scoring run not found in the active organization.");
  }
  const snapshots = resolvePersonaSnapshots({
    personaSnapshot: run.personaSnapshot,
    personaSnapshots: run.personaSnapshots,
  }).map((persona) =>
    persona.id === input.snapshot.id ? input.snapshot : persona,
  );
  const replaced = snapshots.some((persona) => persona.id === input.snapshot.id);
  const next = replaced ? snapshots : [...snapshots, input.snapshot];
  await prisma.scoringRun.update({
    where: { id: run.id },
    data: {
      personaSnapshot: jsonValue(next[0] ?? input.snapshot),
      personaSnapshots: jsonValue(next),
    },
  });
}

export type ResolveTitleSuggestionResult = {
  ok: boolean;
  message: string;
  scored?: number;
  failed?: number;
};

export async function resolveTitleSuggestion(input: {
  organizationId: string;
  userId: string | null;
  suggestionId: string;
  action: "approve" | "assign" | "dismiss";
  personaId?: string | null;
}): Promise<ResolveTitleSuggestionResult> {
  const suggestion = await prisma.titleSuggestion.findFirst({
    where: {
      id: input.suggestionId,
      organizationId: input.organizationId,
    },
  });
  if (!suggestion) {
    throw new TenantError(
      "Title suggestion not found in the active organization.",
    );
  }
  if (suggestion.status !== "PENDING") {
    return {
      ok: false,
      message: "This title suggestion has already been reviewed.",
    };
  }

  if (input.action === "dismiss") {
    await prisma.$transaction([
      prisma.productTitleDismissal.upsert({
        where: {
          organizationId_productId_normalizedTitle: {
            organizationId: input.organizationId,
            productId: suggestion.productId,
            normalizedTitle: suggestion.normalizedTitle,
          },
        },
        update: {
          unmatchedTitle: suggestion.unmatchedTitle,
          dismissedById: input.userId,
        },
        create: {
          organizationId: input.organizationId,
          productId: suggestion.productId,
          normalizedTitle: suggestion.normalizedTitle,
          unmatchedTitle: suggestion.unmatchedTitle,
          dismissedById: input.userId,
        },
      }),
      prisma.titleSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: "DISMISSED",
          resolvedAt: new Date(),
          resolvedById: input.userId,
        },
      }),
    ]);
    return {
      ok: true,
      message: `Dismissed "${suggestion.unmatchedTitle}". It will not be proposed again for this ${vocab.product.singular}.`,
    };
  }

  const personaId =
    input.action === "assign"
      ? input.personaId?.trim() || ""
      : input.personaId?.trim() || suggestion.proposedPersonaId || "";
  if (!personaId) {
    return {
      ok: false,
      message:
        `Choose ${vocab.persona.aSingular} to assign. The model did not propose a match.`,
    };
  }

  const snapshot = await persistManualTargetTitle({
    organizationId: input.organizationId,
    productId: suggestion.productId,
    personaId,
    title: suggestion.unmatchedTitle,
  });

  await replaceRunPersonaSnapshot({
    organizationId: input.organizationId,
    scoringRunId: suggestion.scoringRunId,
    snapshot,
  });

  await prisma.titleSuggestion.update({
    where: { id: suggestion.id },
    data: {
      status: "APPROVED",
      resolvedPersonaId: snapshot.id,
      resolvedAt: new Date(),
      resolvedById: input.userId,
    },
  });

  const scores = await prisma.contactScore.findMany({
    where: {
      organizationId: input.organizationId,
      scoringRunId: suggestion.scoringRunId,
    },
    select: {
      id: true,
      scoringStatus: true,
      assessmentData: true,
      contact: { select: { title: true } },
    },
  });
  const contactScoreIds = scores
    .filter(
      (row) =>
        isUnmatchedTitleScore(row) &&
        canonicalTitle(row.contact.title ?? "") === suggestion.normalizedTitle,
    )
    .map((row) => row.id);

  if (contactScoreIds.length === 0) {
    return {
      ok: true,
      message: `Added "${suggestion.unmatchedTitle}" to ${snapshot.name}. No unmatched ${vocab.contact.plural} left to score.`,
      scored: 0,
      failed: 0,
    };
  }

  const { runScoringForRun } = await import("@/lib/scoring/engine");
  const summary = await runScoringForRun(suggestion.scoringRunId, {
    contactScoreIds,
    personas: [snapshot],
  });

  return {
    ok: true,
    message: `Added "${suggestion.unmatchedTitle}" to ${snapshot.name} and scored ${countedNoun(summary.completed, vocab.contact)}.`,
    scored: summary.completed,
    failed: summary.failed,
  };
}
