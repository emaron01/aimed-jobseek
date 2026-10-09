import { z } from "zod";
import { CRITERION_EVIDENCE_CLASSES } from "@/lib/criteria/evidence-class";
import { ICP_CRITERION_TIERS } from "@/lib/criteria/tier";
import {
  CRITERION_DATA_TYPES,
  CRITERION_IMPORTANCE,
  CRITERION_OPERATORS,
} from "@/lib/criteria/types";

export const interpretedCriterionSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  criterionType: z.string().min(1),
  dataType: z.enum(CRITERION_DATA_TYPES),
  operator: z.enum(CRITERION_OPERATORS),
  targetValue: z.unknown().optional(),
  minValue: z.unknown().optional(),
  maxValue: z.unknown().optional(),
  allowedValues: z.unknown().optional(),
  importance: z.enum(CRITERION_IMPORTANCE),
  isRequired: z.boolean(),
  isDisqualifier: z.boolean(),
  researchGuidance: z.string().nullable().optional(),
  evidenceClass: z.enum(CRITERION_EVIDENCE_CLASSES).optional(),
  /** AI proposal; app infers from firmographic vs signal rules when omitted. Never propose isMandatory. */
  tier: z.enum(ICP_CRITERION_TIERS).optional(),
  sortOrder: z.number().int().nonnegative(),
});

/** Persona interpretation — criteria only. */
export const interpretationResultSchema = z.object({
  criteria: z.array(interpretedCriterionSchema).min(1),
});

/** ICP interpretation — criteria plus a prose read-back. */
export const icpInterpretationResultSchema = z.object({
  understoodSummary: z.string().min(1),
  undetermined: z.array(z.string().min(1)).default([]),
  criteria: z.array(interpretedCriterionSchema).min(1),
});

export type InterpretationAiResult = z.infer<typeof interpretationResultSchema>;
export type IcpInterpretationAiResult = z.infer<
  typeof icpInterpretationResultSchema
>;

export function parseInterpretedCriteria(raw: unknown): InterpretationAiResult {
  return interpretationResultSchema.parse(raw);
}

export function parseIcpInterpretedCriteria(
  raw: unknown,
): IcpInterpretationAiResult {
  return icpInterpretationResultSchema.parse(raw);
}
