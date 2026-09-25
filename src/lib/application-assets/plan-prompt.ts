import type { AiMessage } from "@/lib/ai/types";
import { PRESENTATION_PLAN_PROMPT_VERSION } from "@/lib/application-assets/plan-contract";
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
  return [
    {
      role: "system",
      content: `Prompt version: ${PRESENTATION_PLAN_PROMPT_VERSION}\n\n${instructions}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        type: input.type,
        application: input.application,
        roles: input.roles,
        stories: input.stories,
        assessments: input.assessments,
        earlierExperienceYears:
          applicationAssetConfig.presentation.earlierExperienceYears,
        adjustmentNote: input.adjustmentNote,
        bannedPhrases: [
          ...consultationConfig.bannedPhrases,
          ...applicationAssetConfig.bannedPhrases,
        ],
        qualityFeedback: input.qualityFeedback,
      }),
    },
  ];
}
