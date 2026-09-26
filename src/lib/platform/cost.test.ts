/**
 * Phase B cost / margin unit tests (pure math + rate resolution).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SEED_AI_MODEL_RATES,
  resolveRate,
  type AiModelRateRow,
} from "@/lib/platform/model-rates";
import {
  DRIFT_THRESHOLD_PERCENT,
  buildCostProjections,
  computeDriftPercent,
  driftExceedsThreshold,
  estimateEventCostUsd,
} from "@/lib/platform/cost";

const RATES: AiModelRateRow[] = [
  {
    provider: "openai",
    model: "gpt-5.6-luna",
    inputPer1MUsd: 0.2,
    cachedInputPer1MUsd: 0.02,
    cacheWritePer1MUsd: 0.25,
    outputPer1MUsd: 1.2,
    webSearchPerCallUsd: 0.01,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
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
  },
];

describe("estimateEventCostUsd", () => {
  it("prices tokens and web search from resolved rates", () => {
    const usd = estimateEventCostUsd(
      {
        provider: "openai",
        model: "gpt-5.6-luna",
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        webSearchCalls: 3,
        occurredAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      RATES,
    );
    // 1M * 0.20 + 0.5M * 1.20 + 3 * 0.01 = 0.20 + 0.60 + 0.03 = 0.83
    expect(usd).toBeCloseTo(0.83, 6);
  });

  it("prices cached input and cache writes from the rate table", () => {
    const usd = estimateEventCostUsd(
      {
        provider: "openai",
        model: "gpt-5.6-luna",
        inputTokens: 1_000_000,
        cachedInputTokens: 800_000,
        cacheWriteTokens: 100_000,
        outputTokens: 0,
        webSearchCalls: 0,
        occurredAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      RATES,
    );
    // uncached 100k * 0.20 + cached 800k * 0.02 + write 100k * 0.25
    expect(usd).toBeCloseTo(0.061, 6);
  });

  it("falls back to provider wildcard for unmatched models", () => {
    const usd = estimateEventCostUsd(
      {
        provider: "openai",
        model: "some-new-model",
        inputTokens: 1_000_000,
        outputTokens: 0,
        webSearchCalls: 0,
        occurredAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      RATES,
    );
    expect(usd).toBeCloseTo(2.0, 6);
  });

  it("returns 0 when no rate matches", () => {
    const usd = estimateEventCostUsd(
      {
        provider: "anthropic",
        model: "claude",
        inputTokens: 1000,
        outputTokens: 1000,
        webSearchCalls: 1,
        occurredAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      [
        {
          provider: "openai",
          model: "gpt-5",
          inputPer1MUsd: 1,
          cachedInputPer1MUsd: 0.1,
          cacheWritePer1MUsd: 1.25,
          outputPer1MUsd: 1,
          webSearchPerCallUsd: 0.01,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    );
    expect(usd).toBe(0);
  });
});

describe("resolveRate history", () => {
  it("picks latest effectiveFrom <= at", () => {
    const rates: AiModelRateRow[] = [
      {
        provider: "openai",
        model: "gpt-5",
        inputPer1MUsd: 1,
        cachedInputPer1MUsd: 0.1,
        cacheWritePer1MUsd: 1.25,
        outputPer1MUsd: 1,
        webSearchPerCallUsd: 0,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        provider: "openai",
        model: "gpt-5",
        inputPer1MUsd: 9,
        cachedInputPer1MUsd: 0.9,
        cacheWritePer1MUsd: 11.25,
        outputPer1MUsd: 9,
        webSearchPerCallUsd: 0,
        effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      },
    ];
    const early = resolveRate(
      "openai",
      "gpt-5",
      new Date("2026-03-01T00:00:00.000Z"),
      rates,
    );
    expect(early?.inputPer1MUsd).toBe(1);
    const late = resolveRate(
      "openai",
      "gpt-5",
      new Date("2026-07-01T00:00:00.000Z"),
      rates,
    );
    expect(late?.inputPer1MUsd).toBe(9);
  });
});

describe("projection math", () => {
  it("ratio 3 → 300 emails needs 100 companies", () => {
    const projections = buildCostProjections({
      contactsPerCompany: 3,
      costPerCompanyUsd: 2.5,
      costPerEmailUsd: 0.1,
      emailVolumes: [300],
    });
    expect(projections).toHaveLength(1);
    expect(projections[0]!.companiesNeeded).toBeCloseTo(100, 6);
    // 100 * 2.5 + 300 * 0.1 = 250 + 30 = 280
    expect(projections[0]!.estimatedMonthlyUsd).toBeCloseTo(280, 6);
  });

  it("uses ratio 1.0 when contactsPerCompany is missing", () => {
    const projections = buildCostProjections({
      contactsPerCompany: null,
      costPerCompanyUsd: 1,
      costPerEmailUsd: 0,
      emailVolumes: [100],
    });
    expect(projections[0]!.companiesNeeded).toBe(100);
  });
});

describe("drift threshold", () => {
  it("flags when |actual-est|/actual > 15%", () => {
    expect(DRIFT_THRESHOLD_PERCENT).toBe(15);
    const drift = computeDriftPercent(100, 80);
    expect(drift).toBeCloseTo(20, 6);
    expect(driftExceedsThreshold(drift)).toBe(true);
    expect(driftExceedsThreshold(computeDriftPercent(100, 90))).toBe(false);
  });
});

describe("seed rates", () => {
  it("SEED_AI_MODEL_RATES includes luna, terra, gpt-5, wildcard", () => {
    expect(SEED_AI_MODEL_RATES.some((r) => r.model === "gpt-5.6-luna")).toBe(
      true,
    );
    expect(SEED_AI_MODEL_RATES.some((r) => r.model === "gpt-5.6-terra")).toBe(
      true,
    );
    expect(SEED_AI_MODEL_RATES.some((r) => r.model === "gpt-5")).toBe(true);
    expect(SEED_AI_MODEL_RATES.some((r) => r.model === "*")).toBe(true);
    const luna = SEED_AI_MODEL_RATES.find((r) => r.model === "gpt-5.6-luna")!;
    expect(luna.inputPer1MUsd).toBe(0.2);
    expect(luna.cachedInputPer1MUsd).toBe(0.02);
    expect(luna.cacheWritePer1MUsd).toBe(0.25);
    expect(luna.outputPer1MUsd).toBe(1.2);
    expect(luna.webSearchPerCallUsd).toBe(0.01);
    const terra = SEED_AI_MODEL_RATES.find((r) => r.model === "gpt-5.6-terra")!;
    expect(terra.inputPer1MUsd).toBe(2);
    expect(terra.cachedInputPer1MUsd).toBe(0.2);
    expect(terra.cacheWritePer1MUsd).toBe(2.5);
    expect(terra.outputPer1MUsd).toBe(12);
  });

  it("ensureAiModelRatesSeeded is exported from model-rates", () => {
    const src = readFileSync(resolve("src/lib/platform/model-rates.ts"), "utf8");
    expect(src).toContain("export async function ensureAiModelRatesSeeded");
    expect(src).toContain("SEED_AI_MODEL_RATES");
  });
});
