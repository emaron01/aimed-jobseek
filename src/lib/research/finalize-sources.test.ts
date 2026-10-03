import { describe, expect, it } from "vitest";
import {
  finalizeResearchSources,
  researchSourceNearDedupeKey,
} from "@/lib/research/finalize-sources";
import {
  evaluateWebsiteFirstSufficiency,
  WEBSITE_FIRST_MIN_EXCERPT_CHARS,
} from "@/lib/research/website-first-sufficiency";
import type { ResearchSource } from "@/lib/research/types";

function source(
  partial: Partial<ResearchSource> & Pick<ResearchSource, "url" | "sourceType">,
): ResearchSource {
  return {
    title: null,
    publisher: null,
    retrievedAt: new Date().toISOString(),
    supports: [],
    ...partial,
  };
}

describe("website-first sufficiency", () => {
  const richExcerpt = "x".repeat(WEBSITE_FIRST_MIN_EXCERPT_CHARS);
  const richFields = {
    companySummary: "Acme builds operations software for mid-market teams.",
    whatTheySell: "Workflow automation for operations leaders.",
    customerTypes: ["Mid-market operations teams"],
    businessModel: "Subscription SaaS",
    companySizeContext: "200–500 employees",
  };

  it("fails when the website excerpt is thin even if fields look complete", () => {
    const result = evaluateWebsiteFirstSufficiency({
      websiteExcerptText: "Welcome to Acme.",
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [
            "companySummary",
            "whatTheySell",
            "customerTypes",
            "businessModel",
            "companySizeContext",
          ],
        }),
      ],
      fields: richFields,
    });
    expect(result.sufficient).toBe(false);
    expect(result.failReasons.some((r) => /excerpt too short/i.test(r))).toBe(
      true,
    );
  });

  it("fails when primary fields are filled but not grounded on website supports", () => {
    const result = evaluateWebsiteFirstSufficiency({
      websiteExcerptText: richExcerpt,
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [],
        }),
      ],
      fields: richFields,
    });
    expect(result.sufficient).toBe(false);
    expect(
      result.failReasons.some((r) => /supports only 0 primary/i.test(r)),
    ).toBe(true);
  });

  it("passes only when excerpt, primaries, website source, and supports all clear", () => {
    const result = evaluateWebsiteFirstSufficiency({
      websiteExcerptText: richExcerpt,
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [
            "companySummary",
            "whatTheySell",
            "customerTypes",
            "businessModel",
          ],
        }),
      ],
      fields: richFields,
    });
    expect(result.sufficient).toBe(true);
    expect(result.failReasons).toEqual([]);
  });
});

describe("finalizeResearchSources", () => {
  it("drops empty-support third-party URLs but keeps the official website", () => {
    const finalized = finalizeResearchSources({
      companyWebsiteUrl: "https://acme.example",
      companyDomain: "acme.example",
      maxSources: 8,
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [],
        }),
        source({
          url: "https://linkedin.com/posts/acme-activity-1",
          sourceType: "LINKEDIN",
          supports: [],
        }),
        source({
          url: "https://news.example/acme-raises",
          sourceType: "NEWS",
          supports: ["buyingSignals"],
        }),
      ],
    });
    expect(finalized.map((s) => s.url)).toEqual(["https://acme.example/"]);
    expect(
      finalized.some((s) => s.url.includes("linkedin.com")),
    ).toBe(false);
  });

  it("near-dedupes LinkedIn keys, then the host rule drops LinkedIn and other hosts", () => {
    expect(
      researchSourceNearDedupeKey(
        "https://www.linkedin.com/posts/stoneeagle-activity-111",
      ),
    ).toBe(
      researchSourceNearDedupeKey(
        "https://www.linkedin.com/posts/stoneeagle-activity-222",
      ),
    );
    const finalized = finalizeResearchSources({
      companyDomain: "stoneeagle.com",
      maxSources: 8,
      sources: [
        source({
          url: "https://linkedin.com/posts/stoneeagle-activity-1",
          sourceType: "LINKEDIN",
          supports: [],
        }),
        source({
          url: "https://linkedin.com/posts/stoneeagle-activity-2",
          sourceType: "LINKEDIN",
          supports: [],
        }),
        source({
          url: "https://linkedin.com/posts/stoneeagle-activity-3",
          sourceType: "LINKEDIN",
          supports: ["riskSignals"],
        }),
        source({
          url: "https://news.example/acquisition",
          sourceType: "NEWS",
          supports: ["riskSignals"],
        }),
      ],
    });
    expect(finalized).toEqual([]);
  });

  it("keeps approved news that names the company and drops other hosts", () => {
    const finalized = finalizeResearchSources({
      companyName: "Acme",
      maxSources: 2,
      sources: [
        source({
          url: "https://linkedin.com/posts/a-activity-1",
          sourceType: "LINKEDIN",
          supports: ["riskSignals"],
        }),
        source({
          url: "https://reuters.com/acme",
          title: "Acme raises a new round",
          sourceType: "NEWS",
          supports: ["riskSignals", "companySummary"],
        }),
        source({
          url: "https://directory.example/acme",
          sourceType: "DIRECTORY",
          supports: ["companySummary"],
        }),
      ],
    });
    expect(finalized.map((row) => row.url)).toEqual(["https://reuters.com/acme"]);
  });
});
