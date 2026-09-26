/**
 * Node-safe usage event writer (no server-only).
 */
import type {
  Prisma,
  UsageCategory,
  UsageEventStatus,
  UsageOperation,
} from "@prisma/client";
import { prisma } from "@/lib/prisma-client";

const SECRET_KEY_PATTERN =
  /(api[_-]?key|authorization|bearer|secret|password|token)/i;

export function sanitizeUsageMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string" && SECRET_KEY_PATTERN.test(value)) continue;
    if (typeof value === "string" && value.startsWith("sk-")) continue;
    out[key] = value;
  }
  return out as Prisma.InputJsonValue;
}

export type RecordUsageEventInput = {
  organizationId: string;
  userId?: string | null;
  category: UsageCategory;
  operation: UsageOperation;
  provider?: string | null;
  model?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  scoringRunId?: string | null;
  campaignId?: string | null;
  operationId?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
  outputTokens?: number | null;
  webSearchCalls?: number | null;
  status: UsageEventStatus;
  retryCount?: number;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
};

export async function recordUsageEvent(
  input: RecordUsageEventInput,
): Promise<void> {
  await prisma.usageEvent.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      category: input.category,
      operation: input.operation,
      provider: input.provider ?? null,
      model: input.model ?? null,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      scoringRunId: input.scoringRunId ?? null,
      campaignId: input.campaignId ?? null,
      operationId: input.operationId ?? null,
      inputTokens: input.inputTokens ?? null,
      cachedInputTokens: input.cachedInputTokens ?? null,
      cacheWriteTokens: input.cacheWriteTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      webSearchCalls: input.webSearchCalls ?? null,
      status: input.status,
      retryCount: input.retryCount ?? 0,
      durationMs: input.durationMs ?? null,
      metadata: sanitizeUsageMetadata(input.metadata),
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

export type UsageAggregateWindow = "today" | "7d" | "30d";

export async function aggregateUsage(input: {
  organizationId: string;
  timezone: string;
  window: UsageAggregateWindow;
  userId?: string;
}): Promise<{
  researchOperations: number;
  webSearches: number;
  scoringOperations: number;
  emailGenerations: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const { getOrganizationDayKey, getDayWindowUtcBounds } = await import(
    "@/lib/usage/timezone"
  );
  const now = new Date();
  let since: Date;

  if (input.window === "today") {
    const dayKey = getOrganizationDayKey(input.timezone, now);
    since = getDayWindowUtcBounds(input.timezone, dayKey).start;
  } else {
    const days = input.window === "7d" ? 7 : 30;
    since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const events = await prisma.usageEvent.findMany({
    where: {
      organizationId: input.organizationId,
      occurredAt: { gte: since },
      ...(input.userId ? { userId: input.userId } : {}),
      status: { in: ["SUCCESS", "PARTIAL"] },
    },
    select: {
      category: true,
      operation: true,
      inputTokens: true,
      outputTokens: true,
      webSearchCalls: true,
    },
  });

  let researchOperations = 0;
  let webSearches = 0;
  let scoringOperations = 0;
  let emailGenerations = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const e of events) {
    if (e.category === "RESEARCH" || e.category === "CONTACT_RESEARCH") {
      researchOperations += 1;
    }
    if (e.category === "SCORING") scoringOperations += 1;
    if (e.category === "EMAIL_GENERATION") emailGenerations += 1;
    if (e.operation === "WEB_SEARCH" || e.webSearchCalls) {
      webSearches += e.webSearchCalls ?? (e.operation === "WEB_SEARCH" ? 1 : 0);
    }
    inputTokens += e.inputTokens ?? 0;
    outputTokens += e.outputTokens ?? 0;
  }

  return {
    researchOperations,
    webSearches,
    scoringOperations,
    emailGenerations,
    inputTokens,
    outputTokens,
  };
}

export async function aggregateUsageByUser(input: {
  organizationId: string;
  timezone: string;
  window: UsageAggregateWindow;
}): Promise<
  Array<{
    userId: string | null;
    researchOperations: number;
    webSearches: number;
    scoringOperations: number;
    emailGenerations: number;
    inputTokens: number;
    outputTokens: number;
  }>
> {
  const { getOrganizationDayKey, getDayWindowUtcBounds } = await import(
    "@/lib/usage/timezone"
  );
  const now = new Date();
  let since: Date;
  if (input.window === "today") {
    const dayKey = getOrganizationDayKey(input.timezone, now);
    since = getDayWindowUtcBounds(input.timezone, dayKey).start;
  } else {
    const days = input.window === "7d" ? 7 : 30;
    since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const events = await prisma.usageEvent.findMany({
    where: {
      organizationId: input.organizationId,
      occurredAt: { gte: since },
      status: { in: ["SUCCESS", "PARTIAL"] },
    },
    select: {
      userId: true,
      category: true,
      operation: true,
      inputTokens: true,
      outputTokens: true,
      webSearchCalls: true,
    },
  });

  const byUser = new Map<
    string,
    {
      userId: string | null;
      researchOperations: number;
      webSearches: number;
      scoringOperations: number;
      emailGenerations: number;
      inputTokens: number;
      outputTokens: number;
    }
  >();

  for (const e of events) {
    const key = e.userId ?? "__none__";
    let row = byUser.get(key);
    if (!row) {
      row = {
        userId: e.userId,
        researchOperations: 0,
        webSearches: 0,
        scoringOperations: 0,
        emailGenerations: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      byUser.set(key, row);
    }
    if (e.category === "RESEARCH" || e.category === "CONTACT_RESEARCH") {
      row.researchOperations += 1;
    }
    if (e.category === "SCORING") row.scoringOperations += 1;
    if (e.category === "EMAIL_GENERATION") row.emailGenerations += 1;
    row.webSearches +=
      e.webSearchCalls ?? (e.operation === "WEB_SEARCH" ? 1 : 0);
    row.inputTokens += e.inputTokens ?? 0;
    row.outputTokens += e.outputTokens ?? 0;
  }

  return [...byUser.values()];
}
