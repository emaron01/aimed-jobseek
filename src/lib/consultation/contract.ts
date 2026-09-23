import { z } from "zod";

export const CONSULTATION_PROMPT_VERSION = "2";

const strengthSchema = z.enum(["STRONG", "PARTIAL", "NONE"]);
const strategyModeSchema = z.enum([
  "PROVE_WITH_STORY",
  "REFRAME_ADJACENT",
  "ACKNOWLEDGE",
]);

export const consultationPlanSchema = z.object({
  commentary: z.string(),
  assessments: z.array(
    z.object({
      targetKey: z.string(),
      strength: strengthSchema,
      supportingFactIds: z.array(z.string()),
      relevantRoleIds: z.array(z.string()),
      explanation: z.string(),
      strategyMode: strategyModeSchema,
      strategy: z.string(),
    }),
  ),
  questions: z.array(
    z.object({
      targetKey: z.string(),
      text: z.string(),
    }),
  ),
});

export const consultationExtractSchema = z.object({
  facts: z.array(
    z.object({
      text: z.string(),
    }),
  ),
  story: z
    .object({
      situation: z.string().nullable(),
      task: z.string().nullable(),
      action: z.string().nullable(),
      result: z.string().nullable(),
    })
    .nullable(),
  demonstratedTargets: z.array(
    z.object({
      targetKey: z.string(),
      explanation: z.string(),
    }),
  ),
  missingStarElements: z.array(
    z.enum(["SITUATION", "TASK", "ACTION", "RESULT", "METRIC"]),
  ),
  followUpQuestion: z.string().nullable(),
});

export type ConsultationPlanResult = z.infer<typeof consultationPlanSchema>;
export type ConsultationExtractResult = z.infer<typeof consultationExtractSchema>;
