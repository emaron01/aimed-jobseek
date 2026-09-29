import type { AiMessage } from "@/lib/ai/types";
import { INTERVIEW_THANK_YOU_CLARIFY_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import {
  consultationConfig,
  interviewConfig,
} from "@/lib/product-config";
import { INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION } from "./contract";

export function buildInterviewThankYouClarifyingMessages(input: {
  notes: string;
  qualityFeedback: string[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION}\n\n${INTERVIEW_THANK_YOU_CLARIFY_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        notes: input.notes,
        maxQuestions: interviewConfig.thankYouClarifyingQuestionLimit,
        qualityFeedback: input.qualityFeedback,
        responseShape: {
          questions: [{ id: "string", text: "one-sentence question" }],
        },
      }),
    },
  ];
}
