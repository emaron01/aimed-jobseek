import type { AiMessage } from "@/lib/ai/types";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import { consultationConfig } from "@/lib/product-config/consultation";

export function buildConsultationCoachMessages(input: {
  targets: Array<{ key: string; kind: string; text: string }>;
  profileItems: Array<{
    id: string;
    kind: string;
    text: string;
    itemType: string;
    employer?: string | null;
    title?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    roleId?: string | null;
  }>;
  hiringTeam: Array<{ name: string; whyThisRoleMatters: string | null }>;
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
}): AiMessage[] {
  const system = `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_COACH_SYSTEM_INSTRUCTIONS}`;
  const user = JSON.stringify({
    consultantName: consultationConfig.displayName,
    targets: input.targets,
    personalProfileItems: input.profileItems,
    hiringTeam: input.hiringTeam,
    chronologyRequested: input.chronologyRequested,
    coveredTargetKeys: input.coveredTargetKeys,
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildConsultationExtractMessages(input: {
  answer: string;
  question: string;
  target: { key: string; kind: string; text: string } | null;
  targets: Array<{ key: string; kind: string; text: string }>;
}): AiMessage[] {
  const system = `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS}`;
  const user = JSON.stringify({
    answer: input.answer,
    question: input.question,
    target: input.target,
    availableTargets: input.targets,
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
