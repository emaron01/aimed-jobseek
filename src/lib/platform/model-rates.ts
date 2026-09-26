import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAdminAuditEvent } from "@/lib/auth/audit-service";

/** Bootstrap rates (Aug 2026 OpenAI-ish). Never use these directly in cost math — load from DB. */
export const SEED_AI_MODEL_RATES: Array<{
  provider: string;
  model: string;
  inputPer1MUsd: number;
  cachedInputPer1MUsd: number;
  cacheWritePer1MUsd: number;
  outputPer1MUsd: number;
  webSearchPerCallUsd: number;
  effectiveFrom: Date;
  note: string;
}> = [
  {
    provider: "openai",
    model: "gpt-5.6-luna",
    inputPer1MUsd: 0.2,
    cachedInputPer1MUsd: 0.02,
    cacheWritePer1MUsd: 0.25,
    outputPer1MUsd: 1.2,
    webSearchPerCallUsd: 0.01,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    note: "Seed: luna cached input $0.02/1M, cache write 1.25x input",
  },
  {
    provider: "openai",
    model: "gpt-5.6-terra",
    inputPer1MUsd: 2.0,
    cachedInputPer1MUsd: 0.2,
    cacheWritePer1MUsd: 2.5,
    outputPer1MUsd: 12.0,
    webSearchPerCallUsd: 0.01,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    note: "Seed: terra cached input $0.20/1M, cache write 1.25x input",
  },
  {
    provider: "openai",
    model: "gpt-5",
    inputPer1MUsd: 1.25,
    cachedInputPer1MUsd: 0.125,
    cacheWritePer1MUsd: 1.5625,
    outputPer1MUsd: 10.0,
    webSearchPerCallUsd: 0.01,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    note: "Seed: Aug 2026 OpenAI-ish actuals",
  },
  {
    provider: "openai",
    model: "gpt-4.1",
    inputPer1MUsd: 2.0,
    cachedInputPer1MUsd: 0.2,
    cacheWritePer1MUsd: 2.5,
    outputPer1MUsd: 8.0,
    webSearchPerCallUsd: 0.01,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    note: "Seed: Aug 2026 OpenAI-ish actuals",
  },
  {
    provider: "openai",
    model: "gpt-4o",
    inputPer1MUsd: 2.5,
    cachedInputPer1MUsd: 0.25,
    cacheWritePer1MUsd: 3.125,
    outputPer1MUsd: 10.0,
    webSearchPerCallUsd: 0.01,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    note: "Seed: Aug 2026 OpenAI-ish actuals",
  },
  {
    provider: "openai",
    model: "*",
    inputPer1MUsd: 2.0,
    cachedInputPer1MUsd: 0.2,
    cacheWritePer1MUsd: 2.5,
    outputPer1MUsd: 10.0,
    webSearchPerCallUsd: 0.01,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    note: "Seed: wildcard fallback for unmatched OpenAI models",
  },
];

export type AiModelRateRow = {
  id?: string;
  provider: string;
  model: string;
  inputPer1MUsd: number;
  cachedInputPer1MUsd: number;
  cacheWritePer1MUsd: number;
  outputPer1MUsd: number;
  webSearchPerCallUsd: number;
  effectiveFrom: Date;
  note?: string | null;
};

function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value);
}

export async function ensureAiModelRatesSeeded(): Promise<void> {
  for (const row of SEED_AI_MODEL_RATES) {
    await prisma.aiModelRate.upsert({
      where: {
        provider_model_effectiveFrom: {
          provider: row.provider,
          model: row.model,
          effectiveFrom: row.effectiveFrom,
        },
      },
      update: {},
      create: {
        provider: row.provider,
        model: row.model,
        inputPer1MUsd: row.inputPer1MUsd,
        cachedInputPer1MUsd: row.cachedInputPer1MUsd,
        cacheWritePer1MUsd: row.cacheWritePer1MUsd,
        outputPer1MUsd: row.outputPer1MUsd,
        webSearchPerCallUsd: row.webSearchPerCallUsd,
        effectiveFrom: row.effectiveFrom,
        note: row.note,
      },
    });
  }
}

export async function listAiModelRates(): Promise<AiModelRateRow[]> {
  const rows = await prisma.aiModelRate.findMany({
    orderBy: [
      { provider: "asc" },
      { model: "asc" },
      { effectiveFrom: "desc" },
    ],
  });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    inputPer1MUsd: decimalToNumber(r.inputPer1MUsd),
    cachedInputPer1MUsd: decimalToNumber(r.cachedInputPer1MUsd),
    cacheWritePer1MUsd: decimalToNumber(r.cacheWritePer1MUsd),
    outputPer1MUsd: decimalToNumber(r.outputPer1MUsd),
    webSearchPerCallUsd: decimalToNumber(r.webSearchPerCallUsd),
    effectiveFrom: r.effectiveFrom,
    note: r.note,
  }));
}

/**
 * SUPER_ADMIN: append a new rate version (history). Does not mutate prior rows.
 */
export async function upsertAiModelRate(input: {
  actorUserId: string;
  provider: string;
  model: string;
  inputPer1MUsd: number;
  cachedInputPer1MUsd: number;
  cacheWritePer1MUsd: number;
  outputPer1MUsd: number;
  webSearchPerCallUsd: number;
  effectiveFrom: Date;
  note?: string | null;
}): Promise<AiModelRateRow> {
  const provider = input.provider.trim().toLowerCase();
  const model = input.model.trim();
  if (!provider) throw new Error("Provider is required.");
  if (!model) throw new Error("Model is required.");
  for (const [label, n] of [
    ["Input rate", input.inputPer1MUsd],
    ["Cached input rate", input.cachedInputPer1MUsd],
    ["Cache write rate", input.cacheWritePer1MUsd],
    ["Output rate", input.outputPer1MUsd],
    ["Web search rate", input.webSearchPerCallUsd],
  ] as const) {
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${label} must be a non-negative number.`);
    }
  }

  const created = await prisma.aiModelRate.create({
    data: {
      provider,
      model,
      inputPer1MUsd: input.inputPer1MUsd,
      cachedInputPer1MUsd: input.cachedInputPer1MUsd,
      cacheWritePer1MUsd: input.cacheWritePer1MUsd,
      outputPer1MUsd: input.outputPer1MUsd,
      webSearchPerCallUsd: input.webSearchPerCallUsd,
      effectiveFrom: input.effectiveFrom,
      note: input.note?.trim() || null,
    },
  });

  await recordAdminAuditEvent({
    action: "AI_MODEL_RATE_CHANGED",
    actorUserId: input.actorUserId,
    metadata: {
      rateId: created.id,
      provider,
      model,
      inputPer1MUsd: input.inputPer1MUsd,
      cachedInputPer1MUsd: input.cachedInputPer1MUsd,
      cacheWritePer1MUsd: input.cacheWritePer1MUsd,
      outputPer1MUsd: input.outputPer1MUsd,
      webSearchPerCallUsd: input.webSearchPerCallUsd,
      effectiveFrom: input.effectiveFrom.toISOString(),
    },
  });

  return {
    id: created.id,
    provider: created.provider,
    model: created.model,
    inputPer1MUsd: decimalToNumber(created.inputPer1MUsd),
    cachedInputPer1MUsd: decimalToNumber(created.cachedInputPer1MUsd),
    cacheWritePer1MUsd: decimalToNumber(created.cacheWritePer1MUsd),
    outputPer1MUsd: decimalToNumber(created.outputPer1MUsd),
    webSearchPerCallUsd: decimalToNumber(created.webSearchPerCallUsd),
    effectiveFrom: created.effectiveFrom,
    note: created.note,
  };
}

/**
 * Pick latest effectiveFrom <= at for provider+model; else provider+`*` / default; else null.
 */
export function resolveRate(
  provider: string | null | undefined,
  model: string | null | undefined,
  at: Date,
  rates: AiModelRateRow[],
): AiModelRateRow | null {
  const p = (provider ?? "").trim().toLowerCase();
  const m = (model ?? "").trim();
  const atMs = at.getTime();

  const eligible = (pred: (r: AiModelRateRow) => boolean) =>
    rates
      .filter((r) => pred(r) && r.effectiveFrom.getTime() <= atMs)
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  if (p && m) {
    const exact = eligible(
      (r) => r.provider.toLowerCase() === p && r.model === m,
    );
    if (exact[0]) return exact[0];
  }

  if (p) {
    const wildcard = eligible(
      (r) =>
        r.provider.toLowerCase() === p &&
        (r.model === "*" || r.model.toLowerCase() === "default"),
    );
    if (wildcard[0]) return wildcard[0];
  }

  const anyDefault = eligible(
    (r) => r.model === "*" || r.model.toLowerCase() === "default",
  );
  return anyDefault[0] ?? null;
}
