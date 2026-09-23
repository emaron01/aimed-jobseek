import type { PersonaDifferentiationInput } from "@/lib/persona/persona-differentiation";
import type { AiMessage } from "@/lib/ai/types";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { PERSONA_SYNTHESIS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import type { PersonaResearchExcerpt } from "@/lib/persona-research/progressive-search";

export function buildPersonaSynthesisMessages(input: {
  productName: string;
  productSnapshot: Record<string, unknown>;
  productMessaging: Record<string, unknown> | null;
  buyerRole: SuggestedBuyerRole;
  userContext: Record<string, unknown> | null;
  productEvidence: EvidenceExcerpt[];
  personaEvidence: PersonaResearchExcerpt[];
  icpContext: Record<string, unknown> | null;
  existingApprovedPersonas?: PersonaDifferentiationInput[];
}): AiMessage[] {
  const system = `Prompt version: ${PERSONA_SYNTHESIS_PROMPT_VERSION}

${PERSONA_SYNTHESIS_SYSTEM_INSTRUCTIONS}`;

  const user = JSON.stringify({
    productName: input.productName,
    approvedProduct: input.productSnapshot,
    productMessaging: input.productMessaging,
    selectedBuyerRole: {
      name: input.buyerRole.name,
      likelyTitles: input.buyerRole.likelyTitles,
      departmentFunction: input.buyerRole.departmentFunction,
      whyThisRoleMatters: input.buyerRole.whyThisRoleMatters,
    },
    userContext: input.userContext,
    icpContext: input.icpContext,
    productEvidence: input.productEvidence.map((e) => ({
      sourceId: e.sourceId,
      provenanceClass: "CUSTOMER_EVIDENCE",
      displayName: e.displayName,
      text: e.text.slice(0, 6_000),
    })),
    personaWebEvidence: input.personaEvidence.map((e) => ({
      sourceId: e.sourceId,
      provenanceClass: e.provenanceClass,
      displayName: e.displayName,
      text: e.text.slice(0, 4_000),
      url: e.url ?? null,
    })),
    existingApprovedPersonas: (input.existingApprovedPersonas ?? []).map(
      (persona) => ({
        name: persona.name,
        painPoints: persona.painPoints,
        messagingNotes: persona.messagingNotes,
      }),
    ),
    responseSchema: {
      personaDraft: {
        name: "string (REQUIRED)",
        likelyTitles: ["string"],
        departmentFunction: "string|null",
        seniority: "string|null",
        roleSummary: "string|null",
        primaryResponsibilities: ["string"],
        ownershipAreas: ["string"],
        kpisAndAccountabilities: ["string"],
        organizationalPressures: ["string"],
        painPoints: ["string"],
        desiredOutcomesFromSolution: ["string"],
        messagingNotes: ["string"],
        impact: "string|null",
        talkingPoints: ["string"],
        needsFromHire: ["string"],
        candidateConcerns: ["string"],
        involvement: "DIRECT|INDIRECT|null",
        interviewStage: "string|null",
        evaluates: ["string"],
        communicationApproach: ["string"],
        positiveRoleSignals: ["string"],
        negativeRoleSignals: [
          {
            text: "string (REQUIRED — person who should NOT be contacted)",
            exclusionTestability: "TITLE_TESTABLE|EVIDENCE_TESTABLE",
          },
        ],
        confidence: "HIGH|MEDIUM|LOW (exact uppercase only)",
        evidenceRefs: [
          {
            claim: "string (REQUIRED)",
            kind: "FACT|INFERENCE",
            sourceIds: ["string"],
            note: "string|null",
            provenanceClasses: [
              "CUSTOMER_EVIDENCE|WEB_EVIDENCE|MODEL_INFERENCE",
            ],
          },
        ],
        criteria: [
          {
            name: "string",
            criterionType: "string",
            importance: "CRITICAL|HIGH|MEDIUM|LOW",
            isDisqualifier: "boolean",
            exclusionTestability:
              "TITLE_TESTABLE|EVIDENCE_TESTABLE|null (required when isDisqualifier)",
          },
        ],
      },
    },
    domainsAbsent: ["campaign", "cta", "contactScoring", "emailGeneration"],
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
