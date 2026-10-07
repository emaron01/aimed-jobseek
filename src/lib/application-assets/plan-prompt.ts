import type { AiMessage } from "@/lib/ai/types";
import {
  COVER_LETTER_PRESENTATION_PLAN_PROMPT_VERSION,
  RESUME_PRESENTATION_PLAN_PROMPT_VERSION,
} from "@/lib/application-assets/plan-contract";
import {
  COVER_LETTER_PRESENTATION_PLAN_INSTRUCTIONS,
  RESUME_PRESENTATION_PLAN_INSTRUCTIONS,
} from "@/lib/prompt-content/presentation-plan";
import {
  applicationAssetConfig,
  consultationConfig,
} from "@/lib/product-config";

export function buildPresentationPlanMessages(input: {
  type: "RESUME" | "COVER_LETTER";
  application: { title: string | null; employer: string | null };
  roles: Array<{
    id: string;
    title: string | null;
    employer: string | null;
    startDate: string | null;
    endDate: string | null;
    yearsSinceEnd: number | null;
  }>;
  stories: Array<{ id: string; result: string }>;
  assessments: Array<{ text: string; strength: string; explanation: string }>;
  adjustmentNote: string | null;
  qualityFeedback: string[];
}): AiMessage[] {
  const instructions =
    input.type === "RESUME"
      ? RESUME_PRESENTATION_PLAN_INSTRUCTIONS
      : COVER_LETTER_PRESENTATION_PLAN_INSTRUCTIONS;
  const promptVersion =
    input.type === "RESUME"
      ? RESUME_PRESENTATION_PLAN_PROMPT_VERSION
      : COVER_LETTER_PRESENTATION_PLAN_PROMPT_VERSION;
  return [
    {
      role: "system",
      content: `Prompt version: ${promptVersion}\n\n${instructions}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        application: input.application,
        roles: input.roles,
        stories: input.type === "RESUME" ? [] : input.stories,
        assessments: input.assessments,
        earlierExperienceYears:
          applicationAssetConfig.presentation.earlierExperienceYears,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        type: input.type,
        adjustmentNote: input.adjustmentNote,
        qualityFeedback: input.qualityFeedback,
      }),
    },
  ];
}
