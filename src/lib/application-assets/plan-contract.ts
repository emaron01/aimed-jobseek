import { z } from "zod";

export const PRESENTATION_PLAN_PROMPT_VERSION = "1";

const recommendationSchema = z.object({
  text: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  roleId: z.string().nullable(),
});

export const resumePresentationPlanSchema = z.object({
  type: z.literal("RESUME"),
  leadingRoleIds: z.array(z.string().trim().min(1)).min(1),
  featuredStories: z.array(z.string().trim().min(1)).min(1),
  summaryAngle: z.string().trim().min(1),
  earlierExperienceHeading: z.string().trim().min(1),
  condensedRoleIds: z.array(z.string().trim().min(1)),
  recommendations: z.array(recommendationSchema).min(1),
});

export const coverLetterPresentationPlanSchema = z.object({
  type: z.literal("COVER_LETTER"),
  angle: z.string().trim().min(1),
  storiesToUse: z.array(z.string().trim().min(1)).min(1),
  gapHandling: z.string().trim().min(1),
  recommendations: z.array(recommendationSchema).min(1),
});

export const presentationPlanSchema = z.discriminatedUnion("type", [
  resumePresentationPlanSchema,
  coverLetterPresentationPlanSchema,
]);

export type ResumePresentationPlan = z.infer<typeof resumePresentationPlanSchema>;
export type CoverLetterPresentationPlan = z.infer<
  typeof coverLetterPresentationPlanSchema
>;
export type PresentationPlan = z.infer<typeof presentationPlanSchema>;
