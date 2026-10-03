import type { AiMessage } from "@/lib/ai/types";
import type { CareerStage } from "@/lib/consultation/career-stage";
import {
  CONSULTATION_PROMPT_VERSION,
  type ApplicationLearningsForCoach,
  type AskedConsultationQuestion,
  type CoachCompanyResearch,
  type CoachHiringTeamRole,
  type InterviewerPrepPayload,
  type SeekerStatedFactPayload,
} from "@/lib/consultation/contract";
import type { RecentRole } from "@/lib/consultation/recent-roles";
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
  careerStage: CareerStage;
  recentRoles: RecentRole[];
  hiringTeam: CoachHiringTeamRole[];
  /** When no Hiring Manager role exists yet — learnings stay on the application. */
  applicationLearningsPendingHiringManager?: ApplicationLearningsForCoach | null;
  seekerStatedFacts: SeekerStatedFactPayload[];
  companyResearch: CoachCompanyResearch | null;
  askedQuestions: AskedConsultationQuestion[];
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
  focusTargetKey?: string | null;
  interviewerPrep?: InterviewerPrepPayload | null;
  qualityFeedback?: string[];
}): AiMessage[] {
  return [
    { role: "system", content: coachSystem() },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        careerStage: input.careerStage,
        recentRoles: input.recentRoles,
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
          applicationLearnings: role.applicationLearnings ?? null,
          people: role.people.map((person) => ({
            contactId: person.contactId,
            name: person.name,
            title: person.title,
            employer: person.employer,
            linkedInUrl: person.linkedInUrl,
            roleConfirmed: person.roleConfirmed,
            persona: person.persona,
            linkedIn: person.linkedIn,
            recordedNotes: person.recordedNotes,
            interviewStages: person.interviewStages,
            prepOpening: person.prepOpening,
            interviewLearnings: person.interviewLearnings,
            applicationLearnings: person.applicationLearnings ?? null,
            applicationLearningsBackground:
              person.applicationLearningsBackground ?? null,
          })),
        })),
        applicationLearningsPendingHiringManager:
          input.applicationLearningsPendingHiringManager ?? null,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        askedQuestions: input.askedQuestions,
        chronologyRequested: input.chronologyRequested,
        coveredTargetKeys: input.coveredTargetKeys,
        focusTargetKey: input.focusTargetKey ?? null,
        interviewerPrep: input.interviewerPrep ?? null,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}

export function buildConsultationExtractMessages(input: {
  answer: string;
  seekerReplies?: string[];
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
  targetStrength?: "STRONG" | "PARTIAL" | "NONE" | null;
  supportingEvidence?: string[];
  followUpAlreadyUsed?: boolean;
}): AiMessage[] {
  const seekerReplies =
    input.seekerReplies?.map((reply) => reply.trim()).filter(Boolean) ??
    input.answer
      .split("\n")
      .map((reply) => reply.trim())
      .filter(Boolean);
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
        targetStrength: input.targetStrength ?? null,
        supportingEvidence: input.supportingEvidence ?? [],
        answer: input.answer,
        seekerReplies,
        latestReplyTakesPrecedence: true,
        qualityFeedback: input.qualityFeedback ?? [],
        followUpAlreadyUsed: input.followUpAlreadyUsed === true,
      }),
    },
  ];
}

export function buildConsultationPolishMessages(input: {
  answer: string;
  seekerReplies?: string[];
  story: {
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
  };
  declinedFollowUp: boolean;
  confirmedGap?: boolean;
  whyThisCompany?: boolean;
  strengtheningNeeds: string[];
  qualityFeedback?: string[];
  target?: { key: string; kind: string; text: string } | null;
  targetStrength?: "STRONG" | "PARTIAL" | "NONE" | null;
  supportingEvidence?: string[];
  priorApprovedAnswer?: {
    statementId: string;
    question: string;
    content: string;
  } | null;
  companyResearch?: {
    companySummary: string | null;
    whatTheySell: string | null;
    businessModel: string | null;
    companySizeContext: string | null;
    hiringSignals: string[];
    riskSignals: string[];
    jobFocus: string | null;
    jobFocusDetail: string | null;
  } | null;
  voiceSamples?: Array<{ label: string; sampleText: string }>;
  careerStage: CareerStage;
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
  const seekerReplies =
    input.seekerReplies?.map((reply) => reply.trim()).filter(Boolean) ??
    input.answer
      .split("\n")
      .map((reply) => reply.trim())
      .filter(Boolean);
  return [
    { role: "system", content: polishSystem() },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        careerStage: input.careerStage,
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
        seekerReplies,
        latestReplyTakesPrecedence: true,
        story: input.story,
        declinedFollowUp: input.declinedFollowUp,
        confirmedGap: input.confirmedGap === true,
        whyThisCompany: input.whyThisCompany === true,
        ...(input.whyThisCompany
          ? { companyResearch: input.companyResearch ?? null }
          : {}),
        target: input.target ?? null,
        targetStrength: input.targetStrength ?? null,
        supportingEvidence: input.supportingEvidence ?? [],
        priorApprovedAnswer: input.priorApprovedAnswer ?? null,
        seekerRepliesTakePrecedenceOverPriorApprovedAnswer: Boolean(
          input.priorApprovedAnswer,
        ),
        strengtheningNeeds: input.strengtheningNeeds,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}
