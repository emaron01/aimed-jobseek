import { describe, expect, it } from "vitest";
import {
  isResearchFresh,
  needsResearchRefresh,
  researchExpiresAt,
} from "@/lib/research/freshness";
import { COMPANY_RESEARCH_FRESHNESS_DAYS } from "@/lib/research/types";

describe("research freshness", () => {
  it("marks completed usable research fresh inside expiry window", () => {
    const researchedAt = new Date("2026-01-01T00:00:00.000Z");
    const expiresAt = researchExpiresAt(researchedAt);
    expect(
      isResearchFresh(
        {
          status: "COMPLETED",
          researchConfidence: "MEDIUM",
          companySummary: "Usable company facts",
          researchedAt,
          expiresAt,
        },
        new Date("2026-01-15T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("marks stale research for refresh after expiry", () => {
    const researchedAt = new Date("2025-01-01T00:00:00.000Z");
    const expiresAt = researchExpiresAt(researchedAt);
    const now = new Date(expiresAt);
    now.setUTCDate(now.getUTCDate() + 1);

    const research = {
      id: "r1",
      organizationId: "o1",
      companyId: "c1",
      status: "COMPLETED" as const,
      researchMethod: "AUTOMATED" as const,
      companySummary: "x",
      whatTheySell: null,
      customerTypes: null,
      primaryMarkets: null,
      businessModel: null,
      estimatedAov: null,
      aovReasoning: null,
      companySizeContext: null,
      relevantTechnologies: null,
      buyingSignals: null,
      hiringSignals: null,
      riskSignals: null,
      identityAmbiguous: false,
      researchConfidence: "HIGH" as const,
      sourceCount: 1,
      researchSources: [],
      researchedAt,
      expiresAt,
      aiProvider: null,
      aiModel: null,
      aiModelUrlIdentifier: null,
      promptVersion: null,
      inputTokens: null,
      outputTokens: null,
      webSearchCallCount: null,
      researchDurationMs: null,
      searchStagesUsed: null,
      researchStoppedReason: null,
      researchStageTimings: null,
      researchedByUserId: null,
      firstResearchedByUserId: null,
      createdAt: researchedAt,
      updatedAt: researchedAt,
    };

    expect(isResearchFresh(research, now)).toBe(false);
    expect(needsResearchRefresh(research, now)).toBe(true);
  });

  it("treats usable low-confidence research as fresh", () => {
    const researchedAt = new Date();
    expect(
      isResearchFresh({
        status: "COMPLETED",
        researchConfidence: "LOW",
        companySummary: "Usable company facts",
        researchedAt,
        expiresAt: researchExpiresAt(researchedAt),
      }),
    ).toBe(true);
  });

  it("does not treat an attempted result with no usable fields as fresh", () => {
    const researchedAt = new Date();
    expect(
      isResearchFresh({
        status: "PARTIAL",
        researchConfidence: "MEDIUM",
        researchedAt,
        expiresAt: researchExpiresAt(researchedAt),
      }),
    ).toBe(false);
  });

  it("COMPANY_RESEARCH_FRESHNESS_DAYS remains a legacy fallback constant only", () => {
    expect(COMPANY_RESEARCH_FRESHNESS_DAYS).toBe(90);
  });
});
