/**
 * Candidate profile synthesis contract (v6).
 * Prompt instructions live in `@/lib/prompt-content/profile-synthesis`.
 * This file keeps payload assembly types, version, and parsing.
 */

import { z } from "zod";
import {
  normalizeAbsentNulls,
  summarizeCoercedFields,
} from "@/lib/ai/contract-normalize";
import type { StructuredParseResult } from "@/lib/ai/types";
import {
  candidateProfileSchema,
  emptyCandidateProfile,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";

const optionalString = z.string().nullable().optional();
const stringList = z.array(z.string()).optional().default([]);

const evidenceRefSchema = z.object({
  claim: z.string(),
  sourceIds: z.array(z.string()).optional().default([]),
  note: optionalString,
});

export const requiredRoleNameSchema = z
  .string()
  .trim()
  .min(1, "Buyer role name is required");

/** @deprecated Historical ProductDraft shape — read-only for leftover setup runs. */
export const productDraftSchema = z.object({
  description: optionalString,
  valueProposition: optionalString,
  problemsSolved: stringList,
  capabilities: stringList,
  differentiators: stringList,
  primaryUseCases: stringList,
  relevantBuyerFunctions: stringList,
  relevantIndustries: stringList,
  businessOutcomes: stringList,
  pricingAovContext: optionalString,
  deploymentContext: optionalString,
  proofPoints: stringList,
  customerEvidence: stringList,
  terminology: stringList,
  unknownFields: stringList,
  evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
});

export const productMessagingDraftSchema = z.object({
  primaryPositioning: optionalString,
  coreValueThemes: stringList,
  strongestDifferentiators: stringList,
  proofPoints: stringList,
  companyLanguage: stringList,
  supportedClaims: stringList,
  claimsNotToMake: stringList,
  terminologyToUse: stringList,
  terminologyToAvoid: stringList,
});

/** Lightweight AI buyer-role suggestion (not produced by profile synthesis). */
export const suggestedBuyerRoleAiSchema = z.object({
  name: requiredRoleNameSchema,
  likelyTitles: stringList,
  departmentFunction: optionalString,
  whyThisRoleMatters: optionalString,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
});

/** Schema passed to PRODUCT_AI — candidate profile only. */
export const productAiResponseSchema = z.object({
  candidateProfile: candidateProfileSchema,
});

/** App-persisted SuggestedBuyerRole with application-owned key. */
export const suggestedBuyerRoleSchema = z.object({
  suggestionKey: z.string().min(1),
  name: z.string().min(1),
  likelyTitles: stringList,
  departmentFunction: optionalString,
  whyThisRoleMatters: optionalString,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
});

export const productSynthesisResultSchema = z.object({
  candidateProfile: candidateProfileSchema,
});

export type ProductDraft = z.infer<typeof productDraftSchema>;
export type ProductMessagingDraft = z.infer<typeof productMessagingDraftSchema>;
export type SuggestedBuyerRole = z.infer<typeof suggestedBuyerRoleSchema>;
export type ProductAiResponse = z.infer<typeof productAiResponseSchema>;
export type ProductSynthesisResult = z.infer<typeof productSynthesisResultSchema>;

function stripForbiddenSynthesisKeys(
  root: Record<string, unknown>,
  coercedFields: Set<string>,
): Record<string, unknown> {
  const next = { ...root };
  if ("suggestedBuyerRoles" in next) {
    delete next.suggestedBuyerRoles;
    coercedFields.add("suggestedBuyerRoles");
  }
  if ("personas" in next) {
    delete next.personas;
    coercedFields.add("personas");
  }
  if ("personaDrafts" in next) {
    delete next.personaDrafts;
    coercedFields.add("personaDrafts");
  }
  return next;
}

function candidateProfileFromRoot(root: Record<string, unknown>): unknown {
  if (root.candidateProfile && typeof root.candidateProfile === "object") {
    return root.candidateProfile;
  }
  if (
    root.identity &&
    typeof root.identity === "object" &&
    !Array.isArray(root.identity)
  ) {
    return root;
  }
  return emptyCandidateProfile();
}

/** Defensive parse — strips leftover sales keys, then validates the profile. */
export function parseProductAiResponse(
  raw: unknown,
): StructuredParseResult<ProductAiResponse> {
  const coercedFields = new Set<string>();
  if (!raw || typeof raw !== "object") {
    return {
      data: productAiResponseSchema.parse({
        candidateProfile: emptyCandidateProfile(),
      }),
      coercedFields: [],
    };
  }

  const root = stripForbiddenSynthesisKeys(
    normalizeAbsentNulls(raw) as Record<string, unknown>,
    coercedFields,
  );

  const normalized = {
    candidateProfile: candidateProfileFromRoot(root),
  };

  return {
    data: productAiResponseSchema.parse(normalized),
    coercedFields: summarizeCoercedFields(coercedFields),
  };
}

export function synthesisHasSuggestedBuyerRoles(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return "suggestedBuyerRoles" in (value as Record<string, unknown>);
}

/** @deprecated Use SuggestedBuyerRole — kept for reading legacy setup runs / UI aliases. */
export type SuggestedPersona = SuggestedBuyerRole & {
  department?: string | null;
  whyThisPersonaMatters?: string | null;
  evidenceSummary?: string | null;
};

/** Legacy persona draft shape — historical ProductSetupRun.personaDraftsJson only. */
export type PersonaDraft = {
  suggestionKey: string;
  name: string;
  definition?: string | null;
  likelyTitles?: string[];
  department?: string | null;
  seniority?: string | null;
  responsibilities?: string[];
  ownershipAreas?: string[];
  painPoints?: string[];
  desiredOutcomesFromYourSolution?: string[];
  positiveRoleSignals?: string[];
  negativeRoleSignals?: string[];
  messagingNotes?: string | null;
  personaPositioning?: string | null;
  relevantProofPoints?: string[];
  likelyObjections?: string[];
  researchGuidance?: string | null;
  criteria?: Array<Record<string, unknown>>;
};

export type { CandidateProfile };

export const PRODUCT_SYNTHESIS_PROMPT_VERSION = "7";
