import type { AiMessage } from "@/lib/ai/types";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
  CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_STATEMENT_GROUNDING_SYSTEM_INSTRUCTIONS,
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
  hiringTeam: Array<{
    id: string;
    name: string;
    likelyTitles: string[];
    whyThisRoleMatters: string | null;
    personaContext: unknown;
  }>;
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
  qualityFeedback?: string[];
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
    bannedPhrases: consultationConfig.bannedPhrases,
    qualityFeedback: input.qualityFeedback ?? [],
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
  qualityFeedback?: string[];
}): AiMessage[] {
  const system = `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS}`;
  const user = JSON.stringify({
    answer: input.answer,
    question: input.question,
    target: input.target,
    availableTargets: input.targets,
    bannedPhrases: consultationConfig.bannedPhrases,
    interviewAnswerMaxWords: consultationConfig.interviewAnswerMaxWords,
    qualityFeedback: input.qualityFeedback ?? [],
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildConsultationPolishMessages(input: {
  answer: string;
  story: {
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
  };
  sources: Array<{ id: string; text: string }>;
  declinedFollowUp: boolean;
  strengtheningNeeds: string[];
  qualityFeedback?: string[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        answer: input.answer,
        story: input.story,
        allowedSources: input.sources,
        bannedPhrases: consultationConfig.bannedPhrases,
        interviewAnswerBannedPhrases:
          consultationConfig.interviewAnswerBannedPhrases,
        interviewAnswerMaxWords:
          consultationConfig.interviewAnswerMaxWords,
        declinedFollowUp: input.declinedFollowUp,
        strengtheningNeeds: input.strengtheningNeeds,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}

export function buildConsultationStatementGroundingMessages(input: {
  statement: string;
  kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
  sources: Array<{ id: string; text: string }>;
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_STATEMENT_GROUNDING_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        statement: input.statement,
        kind: input.kind,
        allowedSources: input.sources,
      }),
    },
  ];
}
