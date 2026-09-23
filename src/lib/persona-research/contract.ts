/**
 * PERSONA_AI synthesis contract — one canonical PersonaDraft per run.
 */

import { z } from "zod";
import {
  normalizeAbsentNulls,
  normalizeConfidenceValue,
  normalizeEvidenceRefs,
  summarizeCoercedFields,
} from "@/lib/ai/contract-normalize";
import type { StructuredParseResult } from "@/lib/ai/types";

const optionalString = z.string().nullable().optional();
const stringList = z.array(z.string()).optional().default([]);

export const EXCLUSION_TESTABILITY_VALUES = [
  "TITLE_TESTABLE",
  "EVIDENCE_TESTABLE",
] as const;

export type ExclusionTestabilityValue =
  (typeof EXCLUSION_TESTABILITY_VALUES)[number];

export const exclusionTestabilitySchema = z.enum(EXCLUSION_TESTABILITY_VALUES);

const evidenceRefSchema = z.object({
  claim: z.string(),
  sourceIds: z.array(z.string()).optional().default([]),
  note: optionalString,
  provenanceClasses: z
    .array(z.enum(["CUSTOMER_EVIDENCE", "WEB_EVIDENCE", "MODEL_INFERENCE"]))
    .optional()
    .default([]),
  kind: z.enum(["FACT", "INFERENCE"]).optional(),
});

const criterionDraftSchema = z.object({
  name: z.string().min(1),
  criterionType: z.string().min(1),
  description: optionalString,
  operator: z.string().optional().default("EXISTS"),
  targetValue: z.unknown().optional(),
  importance: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
    .optional()
    .default("MEDIUM"),
  isRequired: z.boolean().optional().default(false),
  isDisqualifier: z.boolean().optional().default(false),
  exclusionTestability: exclusionTestabilitySchema.nullable().optional(),
  researchGuidance: optionalString,
});

/** Plain string or structured negative signal with optional testability. */
const negativeRoleSignalEntrySchema = z.union([
  z.string(),
  z.object({
    text: z.string().optional(),
    signal: z.string().optional(),
    name: z.string().optional(),
    exclusionTestability: exclusionTestabilitySchema.nullable().optional(),
    isDisqualifying: z.boolean().optional(),
    disqualifying: z.boolean().optional(),
  }),
]);

export const personaAiDraftSchema = z.object({
  name: z.string().trim().min(1),
  likelyTitles: stringList,
  departmentFunction: optionalString,
  seniority: optionalString,
  roleSummary: optionalString,
  primaryResponsibilities: stringList,
  ownershipAreas: stringList,
  kpisAndAccountabilities: stringList,
  organizationalPressures: stringList,
  painPoints: stringList,
  desiredOutcomesFromSolution: stringList,
  buyingRole: optionalString,
  decisionInfluence: optionalString,
  positiveRoleSignals: stringList,
  negativeRoleSignals: z
    .array(negativeRoleSignalEntrySchema)
    .optional()
    .default([]),
  likelyObjections: stringList,
  terminology: stringList,
  messagingNotes: stringList,
  impact: optionalString,
  talkingPoints: z.array(z.string()).optional(),
  needsFromHire: z.array(z.string()).optional(),
  candidateConcerns: z.array(z.string()).optional(),
  involvement: z.enum(["DIRECT", "INDIRECT"]).nullable().optional(),
  interviewStage: optionalString,
  evaluates: z.array(z.string()).optional(),
  communicationApproach: z.array(z.string()).optional(),
  personaSpecificPositioning: stringList,
  proofPointsToEmphasize: stringList,
  researchGuidance: stringList,
  criteria: z.array(criterionDraftSchema).optional().default([]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
  provenanceAssessments: z
    .array(
      z.object({
        claim: z.string(),
        provenanceClasses: z.array(
          z.enum(["CUSTOMER_EVIDENCE", "WEB_EVIDENCE", "MODEL_INFERENCE"]),
        ),
        note: optionalString,
      }),
    )
    .optional()
    .default([]),
});

export const personaAiResponseSchema = z.object({
  personaDraft: personaAiDraftSchema,
});

export type PersonaAiDraft = z.infer<typeof personaAiDraftSchema>;
export type PersonaAiResponse = z.infer<typeof personaAiResponseSchema>;

function normalizePersonaDraft(value: unknown, coercedFields: Set<string>): unknown {
  if (!value || typeof value !== "object") return value ?? {};
  const draft = { ...(value as Record<string, unknown>) };
  draft.confidence = normalizeConfidenceValue(
    draft.confidence,
    coercedFields,
    "personaDraft.confidence",
  );
  draft.evidenceRefs = normalizeEvidenceRefs(
    draft.evidenceRefs,
    coercedFields,
    "personaDraft.evidenceRefs",
    { provenanceClasses: true },
  );
  return draft;
}

/** Defensive parse — normalizes ambiguous model output before strict validation. */
export function parsePersonaAiResponse(
  raw: unknown,
): StructuredParseResult<PersonaAiResponse> {
  const coercedFields = new Set<string>();
  if (!raw || typeof raw !== "object") {
    return {
      data: personaAiResponseSchema.parse({ personaDraft: { name: "Unknown" } }),
      coercedFields: [],
    };
  }

  const root = normalizeAbsentNulls(raw) as Record<string, unknown>;
  const normalized = {
    personaDraft: normalizePersonaDraft(root.personaDraft, coercedFields),
  };

  return {
    data: personaAiResponseSchema.parse(normalized),
    coercedFields: summarizeCoercedFields(coercedFields),
  };
}

export const PERSONA_SYNTHESIS_PROMPT_VERSION = "11";
