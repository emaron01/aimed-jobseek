import type { AiMessage } from "@/lib/ai/types";
import { APPLICATION_SUMMARY_PROMPT_VERSION } from "@/lib/application-summary/contract";
import { APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { consultationConfig } from "@/lib/product-config";

export function buildApplicationSummaryGuidanceMessages(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  directRoles: Array<{ id: string; name: string }>;
  qualityFeedback?: string[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${APPLICATION_SUMMARY_PROMPT_VERSION}

${APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        allowedSources: input.sources,
        directHiringTeamRoles: input.directRoles,
        bannedPhrases: consultationConfig.bannedPhrases,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}
