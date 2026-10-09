import type { AiMessage } from "@/lib/ai/types";
import type { ApprovedInterviewAnswer } from "@/lib/application-summary/approved-answers";
import { APPLICATION_SUMMARY_PROMPT_VERSION } from "@/lib/application-summary/contract";
import { DEFAULT_LIKELY_QUESTIONS_PER_PERSON } from "@/lib/application-summary/likely-question-limit";
import type { CheatSheetInterviewerContext } from "@/lib/application-summary/people";
import type { CareerStage } from "@/lib/consultation/career-stage";
import { applicationSummaryGuidanceSystemInstructions } from "@/lib/prompt-content/application-summary";
import { consultationConfig } from "@/lib/product-config";

export function buildApplicationSummaryGuidanceMessages(input: {
  sources: Array<{ id: string; text: string; category: string }>;
  people: Array<{
    sectionKey: string;
    roleId: string;
    contactId: string | null;
    heading: string;
    roleName: string;
    titles: string[];
    sectionKind: string;
  }>;
  mode: "shell" | "person";
  careerStage?: CareerStage;
  qualityFeedback?: string[];
  approvedAnswers?: ApprovedInterviewAnswer[];
  likelyQuestionMax?: number;
  interviewer?: CheatSheetInterviewerContext | null;
}): AiMessage[] {
  const likelyQuestionMax =
    input.likelyQuestionMax ?? DEFAULT_LIKELY_QUESTIONS_PER_PERSON;
  return [
    {
      role: "system",
      content: `Prompt version: ${APPLICATION_SUMMARY_PROMPT_VERSION}

${applicationSummaryGuidanceSystemInstructions(likelyQuestionMax)}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        allowedSources: input.sources,
        mode: input.mode,
        ...(input.mode === "person" && input.careerStage
          ? { careerStage: input.careerStage }
          : {}),
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        people: input.people,
        ...(input.mode === "person"
          ? {
              approvedAnswers: input.approvedAnswers ?? [],
              interviewer: input.interviewer ?? null,
            }
          : {}),
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}
