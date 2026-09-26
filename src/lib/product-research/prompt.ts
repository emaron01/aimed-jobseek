import type { AiMessage } from "@/lib/ai/types";
import { PRODUCT_SYNTHESIS_PROMPT_VERSION } from "@/lib/product-research/contract";
import { PROFILE_SYNTHESIS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";

export type EvidenceExcerpt = {
  sourceId: string;
  sourceType: string;
  displayName: string;
  text: string;
  url?: string | null;
};

export function buildProductSynthesisMessages(input: {
  productName: string;
  primaryUrl: string | null;
  excerpts: EvidenceExcerpt[];
}): AiMessage[] {
  const system = `Prompt version: ${PRODUCT_SYNTHESIS_PROMPT_VERSION}

${PROFILE_SYNTHESIS_SYSTEM_INSTRUCTIONS}`;

  const user = JSON.stringify({
    candidateName: input.productName,
    suppliedUrl: input.primaryUrl,
    evidence: input.excerpts.map((e) => ({
      sourceId: e.sourceId,
      sourceType: e.sourceType,
      displayName: e.displayName,
      url: e.url ?? null,
      text: e.text.slice(0, 8_000),
    })),
    responseSchema: {
      candidateProfile: {
        schemaVersion: 1,
        identity: {
          name: "factItem|null",
          headline: "factItem|null",
          location: "factItem|null",
          email: "factItem|null",
          phone: "factItem|null",
          cityState: "factItem|null",
          linkedinUrl: "factItem|null",
          personalSite: "factItem|null",
          workArrangementPreference: "factItem|null",
          relocationOpenness: "factItem|null",
        },
        positioning: "factItem|null",
        direction: {
          targetTitles: ["factItem"],
          seniority: "factItem|null",
          functions: ["factItem"],
          careerGoals: ["factItem"],
        },
        experience: [
          {
            id: "string",
            kind: "FACT|INFERENCE",
            employer: "string|null",
            title: "string|null",
            startDate: "exact date text as written|null",
            endDate: "exact date text as written|null",
            location: "string|null",
            summary: "string|null",
            achievements: ["factItem"],
            provenance: [{ sourceId: "string" }],
          },
        ],
        skills: ["factItem"],
        problemsSolved: ["factItem"],
        differentiators: ["factItem"],
        education: ["factItem"],
        credentials: ["factItem"],
        awards: ["factItem"],
        domainVocabulary: ["factItem"],
        gaps: [{ id: "string", area: "string", detail: "string" }],
      },
      factItem: {
        id: "string",
        kind: "FACT|INFERENCE",
        text: "string",
        provenance: [{ sourceId: "string" }],
      },
    },
    domainsAbsent: [
      "suggestedBuyerRoles",
      "personas",
      "personaDrafts",
      "campaign",
      "offer",
      "cta",
      "contactScoring",
      "emailGeneration",
      "webSearchForThePerson",
    ],
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
