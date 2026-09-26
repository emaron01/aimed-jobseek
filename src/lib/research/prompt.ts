import type { AiMessage } from "@/lib/ai/types";
import { COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
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
  const system = `You are a production company research analyst.
Prompt version: ${RESEARCH_PROMPT_VERSION}

${COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS}
${input.webSearchEnabled ? "Web search is enabled — use it when needed." : "Web search is not enabled for this pass."}`;

  const user = JSON.stringify(
    {
      instruction:
        input.stage === "follow_up"
          ? "Perform a targeted follow-up search for missing employer-research dimensions, especially named products and services. Avoid repeating prior broad searches. Do not estimate deal size."
          : input.webSearchEnabled
            ? input.firstPartyFetchUnavailable
              ? "The official website could not be retrieved. Research this employer with web search. Prioritize what they do: named services and products in as much detail as public evidence allows, then customers, business model, size, stage and funding, hiring and growth, employer risk, recent news, leadership, public culture, and work arrangement."
              : "Research this employer. Prioritize what they do: named services and products in as much detail as public evidence allows, then customers, business model, size, stage and funding, hiring and growth, employer risk, recent news, leadership, public culture, and work arrangement."
            : "Synthesize employer research from the supplied first-party website evidence and any seeker-supplied notes. Prioritize named products and services. Do not invent facts absent from that evidence. If the evidence is thin, leave fields null or empty.",
      searchFocus: input.searchFocus ?? null,
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
      firstPartyEvidenceSources: input.evidence.sources,
      firstPartyEvidenceExcerpts: input.evidence.excerpts,
      webSearchEnabled: input.webSearchEnabled,
      responseSchema: {
        companySummary:
          "string|null — what the company does, stage, funding, recent news, and leadership when evidenced",
        whatTheySell:
          "string|null — the most important field. Name services and products in as much detail as the evidence allows: each offering, what it does, who it is for, and how it is delivered. Prefer concrete lines over a one-sentence category. Do not invent offerings.",
        customerTypes: ["string"],
        primaryMarkets: ["string"],
        businessModel: "string|null",
        estimatedAov: "null",
        aovReasoning: "null",
        companySizeContext: "string|null",
        relevantTechnologies: ["string"],
        buyingSignals: [],
        hiringSignals: ["string — hiring and growth only"],
        riskSignals: ["string — layoffs, restructuring, funding trouble, leadership turnover"],
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
