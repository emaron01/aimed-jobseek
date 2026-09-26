import type { AiMessage } from "@/lib/ai/types";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
  CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_STATEMENT_GROUNDING_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import { consultationConfig } from "@/lib/product-config/consultation";

function coachSystem() {
  return `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_COACH_SYSTEM_INSTRUCTIONS}`;
}

function extractSystem() {
  return `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS}`;
}

function polishSystem() {
  return `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS}`;
}

function groundingSystem() {
  return `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_STATEMENT_GROUNDING_SYSTEM_INSTRUCTIONS}`;
}

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
  }>;
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
  focusTargetKey?: string | null;
  qualityFeedback?: string[];
}): AiMessage[] {
  return [
    { role: "system", content: coachSystem() },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        personalProfileItems: input.profileItems,
        targets: input.targets,
        hiringTeam: input.hiringTeam.map((role) => ({
          id: role.id,
          name: role.name,
          likelyTitles: role.likelyTitles,
          whyThisRoleMatters: role.whyThisRoleMatters,
        })),
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        chronologyRequested: input.chronologyRequested,
        coveredTargetKeys: input.coveredTargetKeys,
        focusTargetKey: input.focusTargetKey ?? null,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}

export function buildConsultationExtractMessages(input: {
  answer: string;
  question: string;
  target: { key: string; kind: string; text: string } | null;
  targets: Array<{ key: string; kind: string; text: string }>;
  qualityFeedback?: string[];
}): AiMessage[] {
  return [
    { role: "system", content: extractSystem() },
    {
      role: "user",
      content: JSON.stringify({
        interviewAnswerMaxWords: consultationConfig.interviewAnswerMaxWords,
        availableTargets: input.targets,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        question: input.question,
        target: input.target,
        answer: input.answer,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
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
    { role: "system", content: polishSystem() },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        interviewAnswerMetaLanguage:
          consultationConfig.interviewAnswerMetaLanguage,
        interviewAnswerMaxWords: consultationConfig.interviewAnswerMaxWords,
        allowedSources: input.sources,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        answer: input.answer,
        story: input.story,
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
    { role: "system", content: groundingSystem() },
    {
      role: "user",
      content: JSON.stringify({
        allowedSources: input.sources,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        statement: input.statement,
        kind: input.kind,
      }),
    },
  ];
}
