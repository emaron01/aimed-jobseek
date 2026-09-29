import { z } from "zod";

export const INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION = "1";

export const interviewThankYouClarifyingQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        text: z.string().trim().min(1),
      }),
    )
    .max(2),
});

export type InterviewThankYouClarifyingQuestions = z.infer<
  typeof interviewThankYouClarifyingQuestionsSchema
>;
