import { z } from "zod";

export const APPLICATION_SUMMARY_PROMPT_VERSION = "3";

const supportSchema = z.object({
  sourceId: z.string(),
  quote: z.string(),
});

const guidanceItemSchema = z.object({
  text: z.string(),
  supports: z.array(supportSchema),
});

export const applicationSummaryGuidanceSchema = z.object({
  coachingSummary: z.array(guidanceItemSchema),
  questionsToPrepare: z.array(guidanceItemSchema),
  questionsForDirectRoles: z.array(
    z.object({
      roleId: z.string(),
      roleName: z.string(),
      questions: z.array(guidanceItemSchema),
    }),
  ),
});

export type ApplicationSummaryGuidance = z.infer<
  typeof applicationSummaryGuidanceSchema
>;
