import type { AiMessage } from "@/lib/ai/types";
import {
  CONSULTATION_PROMPT_VERSION,
  type AskedConsultationQuestion,
  type CoachCompanyResearch,
  type CoachHiringTeamRole,
  type SeekerStatedFactPayload,
} from "@/lib/consultation/contract";
import {
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
  CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS,
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
  hiringTeam: CoachHiringTeamRole[];
  seekerStatedFacts: SeekerStatedFactPayload[];
  companyResearch: CoachCompanyResearch | null;
  askedQuestions: AskedConsultationQuestion[];
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
        seekerStatedFacts: input.seekerStatedFacts,
        companyResearch: input.companyResearch,
        targets: input.targets,
      }),
    },
    // Hiring Team context follows the Personal Profile and company research
    // so that prefix stays cacheable as people and personas are added.
    {
      role: "user",
      content: JSON.stringify({
        hiringTeam: input.hiringTeam.map((role) => ({
          id: role.id,
          name: role.name,
          likelyTitles: role.likelyTitles,
          whyThisRoleMatters: role.whyThisRoleMatters,
          personaBuilt: role.personaBuilt,
          generalPersona: role.persona,
          people: role.people,
        })),
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        askedQuestions: input.askedQuestions,
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
  qualityFeedback?: string[];
}): AiMessage[] {
  return [
    { role: "system", content: extractSystem() },
    {
      role: "user",
      content: JSON.stringify({
        interviewAnswerMaxWords: consultationConfig.interviewAnswerMaxWords,
        personalProfileItems: input.profileItems,
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
  declinedFollowUp: boolean;
  confirmedGap?: boolean;
  strengtheningNeeds: string[];
  qualityFeedback?: string[];
  voiceSamples?: Array<{ label: string; sampleText: string }>;
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
        personalProfileItems: input.profileItems,
        voiceSamples: input.voiceSamples ?? [],
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        answer: input.answer,
        story: input.story,
        declinedFollowUp: input.declinedFollowUp,
        confirmedGap: input.confirmedGap === true,
        strengtheningNeeds: input.strengtheningNeeds,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}
