import type { AiMessage } from "@/lib/ai/types";
import { COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import type { CompanyResearchInput } from "@/lib/research/types";
import type { RetrievedEvidenceBundle } from "@/lib/research/sources";

export function buildCompanyResearchMessages(input: {
  company: CompanyResearchInput;
  evidence: RetrievedEvidenceBundle;
  webSearchEnabled: boolean;
  /** Set when HTTP fetch returned no usable first-party pages (403, empty, etc.). */
  firstPartyFetchUnavailable?: boolean;
  searchFocus?: string | null;
  stage?: "initial" | "follow_up" | "final_synthesis";
  searchesRemaining?: number;
}): AiMessage[] {
  const evidenceTargets = (input.company.evidenceTargets ?? [])
    .map((target) => target.trim())
    .filter(Boolean);
  const system = COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS;

  const user = JSON.stringify(
    {
      searchFocus: input.stage === "follow_up" ? input.searchFocus ?? null : null,
      stage: input.stage ?? "initial",
      searchesRemaining: input.searchesRemaining ?? null,
      evidenceTargets,
      company: {
        name: input.company.name,
        website: input.company.website,
        normalizedDomain: input.company.normalizedDomain,
        industry: input.company.industry,
        employeeCount: input.company.employeeCount,
        location: input.company.location,
      },
      seekerSuppliedNotes: input.company.seekerSuppliedNotes?.trim() || null,
      posting: {
        title: input.company.postingTitle?.trim() || null,
        url: input.company.postingUrl?.trim() || null,
        text: input.company.postingText?.trim() || null,
      },
      firstPartyEvidenceSources: input.evidence.sources,
      firstPartyEvidenceExcerpts: input.evidence.excerpts,
      webSearchEnabled: input.webSearchEnabled,
      responseSchema: {
        companySummary: "string|null — company highlights",
        whatTheySell: "string|null — products and services",
        customerTypes: ["string"],
        primaryMarkets: ["string"],
        businessModel: "string|null",
        companySizeContext: "string|null",
        relevantTechnologies: ["string"],
        hiringSignals: ["string"],
        riskSignals: ["string"],
        jobFocus:
          "string|null — the part of the company this job serves (a business unit, product line, service, segment, or market)",
        jobFocusDetail:
          "string|null — in-depth research on that part of the company, with citations",
        confidence: "HIGH|MEDIUM|LOW",
        identityCertainty: "HIGH|MEDIUM|LOW|AMBIGUOUS",
        sources: [
          {
            url: "must match a retrieved web-search or first-party evidence URL",
            title: "string|null",
            publisher: "string|null",
            sourceType:
              "COMPANY_WEBSITE|LINKEDIN|NEWS|DIRECTORY|REVIEW_SITE|OTHER",
            retrievedAt: "ISO string",
            supports: ["field or finding names"],
          },
        ],
      },
    },
    null,
    2,
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
