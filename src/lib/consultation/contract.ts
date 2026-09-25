import { z } from "zod";

export const CONSULTATION_PROMPT_VERSION = "11";

export const WHY_THIS_COMPANY_TARGET_KEY = "why-this-company";
export const PERSON_PREP_TARGET_PREFIX = "person-prep:";

const strengthSchema = z.enum(["STRONG", "PARTIAL", "NONE"]);
const strategyModeSchema = z.enum([
  "PROVE_WITH_STORY",
  "REFRAME_ADJACENT",
  "ACKNOWLEDGE",
]);

export const consultationBriefingSchema = z.object({
  overall: z.string(),
  strongestAngles: z.array(z.string()).min(2).max(3),
  importantGaps: z.array(z.string()).min(2).max(3),
  storyPlan: z.array(z.string()).min(1).max(5),
});

export const consultationPlanSchema = z.object({
  commentary: z.string(),
  briefing: consultationBriefingSchema,
  closingNote: z.string().nullable(),
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
      requirementInterpretation: z.string().nullable(),
      hiringTeamRoleId: z.string(),
      whoCaresNote: z.string(),
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
  coaching: z.string().nullable().optional(),
  followUpQuestion: z.string().nullable(),
});

const statementSupportSchema = z.object({
  sourceId: z.string(),
  quote: z.string(),
});

const groundedStatementSchema = z.object({
  text: z.string(),
  claims: z.array(
    z.object({
      text: z.string(),
      supports: z.array(statementSupportSchema),
    }),
  ),
});

export const consultationPolishSchema = z.object({
  interviewAnswer: groundedStatementSchema,
  resumeBullet: groundedStatementSchema,
  strengtheningNote: z.string().nullable(),
});

export const consultationStatementGroundingSchema = groundedStatementSchema;

export type ConsultationPlanResult = z.infer<typeof consultationPlanSchema>;
export type ConsultationExtractResult = z.infer<typeof consultationExtractSchema>;
export type ConsultationPolishResult = z.infer<typeof consultationPolishSchema>;
export type ConsultationStatementGroundingResult = z.infer<
  typeof consultationStatementGroundingSchema
>;
