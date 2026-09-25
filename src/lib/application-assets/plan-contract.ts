import { z } from "zod";
import { applicationAssetConfig } from "@/lib/product-config/application-assets";

export const PRESENTATION_PLAN_PROMPT_VERSION = "2";

const recommendationSchema = z.object({
  text: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  roleId: z.string().trim().min(1).nullable(),
});

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    typeof item === "string" && item.trim() ? [item.trim()] : [],
  );
}

function normalizeRecommendations(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const row = item as Record<string, unknown>;
    const roleId =
      typeof row.roleId === "string" && row.roleId.trim()
        ? row.roleId.trim()
        : null;
    return { ...row, roleId };
  });
}

export function normalizeResumePresentationPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const row = raw as Record<string, unknown>;
  return {
    type: "RESUME",
    leadingRoleIds: stringList(row.leadingRoleIds),
    featuredStories: stringList(row.featuredStories),
    summaryAngle: typeof row.summaryAngle === "string" ? row.summaryAngle : "",
    earlierExperienceHeading:
      typeof row.earlierExperienceHeading === "string" &&
      row.earlierExperienceHeading.trim()
        ? row.earlierExperienceHeading.trim()
        : applicationAssetConfig.presentation.earlierExperienceHeading,
    condensedRoleIds: stringList(row.condensedRoleIds),
    recommendations: normalizeRecommendations(row.recommendations),
  };
}

export function normalizeCoverLetterPresentationPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const row = raw as Record<string, unknown>;
  return {
    type: "COVER_LETTER",
    angle: typeof row.angle === "string" ? row.angle : "",
    storiesToUse: stringList(row.storiesToUse),
    gapHandling: typeof row.gapHandling === "string" ? row.gapHandling : "",
    recommendations: normalizeRecommendations(row.recommendations),
  };
}

export const resumePresentationPlanSchema = z.object({
  type: z.literal("RESUME"),
  leadingRoleIds: z.array(z.string().trim().min(1)).min(1),
  featuredStories: z.array(z.string().trim().min(1)),
  summaryAngle: z.string().trim().min(1),
  earlierExperienceHeading: z.string().trim().min(1),
  condensedRoleIds: z.array(z.string().trim().min(1)),
  recommendations: z.array(recommendationSchema).min(1),
});

export const coverLetterPresentationPlanSchema = z.object({
  type: z.literal("COVER_LETTER"),
  angle: z.string().trim().min(1),
  storiesToUse: z.array(z.string().trim().min(1)),
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
