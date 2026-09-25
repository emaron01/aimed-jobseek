import { z } from "zod";

export const NEXT_STEP_PROMPT_VERSION = "2";

export const applicationNextStepSchema = z.object({
  text: z.string().trim().min(1).max(320),
});

export type ApplicationNextStep = z.infer<typeof applicationNextStepSchema>;
