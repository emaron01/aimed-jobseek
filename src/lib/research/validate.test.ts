import { describe, expect, it } from "vitest";
import { validateCompanyResearchResult } from "@/lib/research/validate";
import type { RetrievedEvidenceBundle } from "@/lib/research/sources";

describe("research source / confidence validation", () => {
  it("prevents HIGH confidence with zero reliable sources", () => {
    const evidence: RetrievedEvidenceBundle = { sources: [], excerpts: [] };
    const result = validateCompanyResearchResult(
      {
        companySummary: "Invented summary",
        whatTheySell: "Widgets",
        customerTypes: [],
        primaryMarkets: [],
        businessModel: null,
        estimatedAov: "$1",
        aovReasoning: null,
        companySizeContext: null,
        relevantTechnologies: [],
        buyingSignals: [],
        hiringSignals: [],
        riskSignals: [],
        confidence: "HIGH",
        sources: [
          {
            url: "https://fabricated.example/page",
            title: "Fake",
            publisher: null,
            sourceType: "OTHER",
            retrievedAt: new Date().toISOString(),
            supports: ["companySummary"],
          },
        ],
      },
      evidence,
    );

    expect(result.confidence).toBe("LOW");
    expect(result.sources).toHaveLength(0);
    expect(result.companySummary).toBeNull();
    expect(result.whatTheySell).toBeNull();
  });

  it("keeps only evidence-bundle URLs (drops fabricated citations)", () => {
    const retrievedAt = new Date().toISOString();
    const evidence: RetrievedEvidenceBundle = {
      sources: [
        {
          url: "https://real.example/",
          title: "Home",
          publisher: null,
          sourceType: "COMPANY_WEBSITE",
          retrievedAt,
          supports: [],
        },
      ],
      excerpts: [
        {
          url: "https://real.example/",
          title: "Home",
          text: "We sell analytics software to mid-market teams.",
        },
      ],
    };

    const result = validateCompanyResearchResult(
      {
        companySummary: "Analytics software vendor",
        whatTheySell: "Analytics software",
        customerTypes: ["mid-market"],
        primaryMarkets: [],
        businessModel: "B2B SaaS",
        estimatedAov: null,
        aovReasoning: null,
        companySizeContext: null,
        relevantTechnologies: [],
        buyingSignals: [],
        hiringSignals: [],
        riskSignals: [],
        confidence: "MEDIUM",
        sources: [
          {
            url: "https://real.example/",
            title: "Home",
            publisher: null,
            sourceType: "COMPANY_WEBSITE",
            retrievedAt,
            supports: ["companySummary", "whatTheySell"],
          },
          {
            url: "https://totally-fake.example/made-up",
            title: "Fake",
            publisher: null,
            sourceType: "NEWS",
            retrievedAt,
            supports: ["buyingSignals"],
          },
        ],
      },
      evidence,
    );

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.url).toBe("https://real.example/");
    expect(result.sources[0]?.supports).toEqual(
      expect.arrayContaining(["companySummary", "whatTheySell"]),
    );
    expect(result.companySummary).toBe("Analytics software vendor");
  });
});
