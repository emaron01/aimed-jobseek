import type { AiMessage } from "@/lib/ai/types";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import { consultationConfig } from "@/lib/product-config/consultation";

export function buildConsultationCoachMessages(input: {
  questions: Array<{ targetKey: string; text: string }>;
  gaps: Array<{ text: string; strength: string; strategy: string | null }>;
  hiringTeam: Array<{ name: string; whyThisRoleMatters: string | null }>;
  stretch: boolean;
}): AiMessage[] {
  const system = `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_COACH_SYSTEM_INSTRUCTIONS}`;
  const user = JSON.stringify({
    consultantName: consultationConfig.displayName,
    stretch: input.stretch,
    hiringTeam: input.hiringTeam,
    gaps: input.gaps,
    questions: input.questions,
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildConsultationExtractMessages(input: {
  answer: string;
  requirement: string | null;
  competencies: Array<{ id: string; text: string }>;
}): AiMessage[] {
  const system = `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS}`;
  const user = JSON.stringify({
    answer: input.answer,
    requirement: input.requirement,
    competencies: input.competencies,
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
