import { z } from "zod";

export const CONSULTATION_PROMPT_VERSION = "1";

export const consultationCoachSchema = z.object({
  commentary: z.string(),
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
});

export type ConsultationCoachResult = z.infer<typeof consultationCoachSchema>;
export type ConsultationExtractResult = z.infer<typeof consultationExtractSchema>;
