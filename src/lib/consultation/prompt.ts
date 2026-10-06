import type { AiMessage } from "@/lib/ai/types";
import type { CareerStage } from "@/lib/consultation/career-stage";
import {
  CONSULTATION_PLAN_DECISION_PROMPT_VERSION,
  CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
  CONSULTATION_PROMPT_VERSION,
  type ApplicationLearningsForCoach,
  type AskedConsultationQuestion,
  type CoachCompanyResearch,
  type CoachHiringTeamRole,
  type InterviewerPrepPayload,
  type SeekerStatedFactPayload,
} from "@/lib/consultation/contract";
import type { RecentRole } from "@/lib/consultation/recent-roles";
import type { ApprovedAnswerEvidence } from "@/lib/consultation/harper-library";
import type { ConsultationPlanDecision } from "@/lib/consultation/plan-split";
import {
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
  CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import { CONSULTATION_PLAN_DECISION_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-decision";
import { CONSULTATION_PLAN_WRITING_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-writing";
import { consultationConfig } from "@/lib/product-config/consultation";

function coachSystem() {
  return `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_COACH_SYSTEM_INSTRUCTIONS}`;
}

function extractSystem() {
  return `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS}`;
}

function polishSystem(words = 150) {
  return `Prompt version: ${CONSULTATION_PROMPT_VERSION}

${CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS}

Write the spoken answer in about ${words} words. For a complex or multi-part question, also return 3 to 5 key points: short bullets with the names, numbers, and steps to mention if the interviewer asks for more.`;
}

function decisionSystem() {
  return `Prompt version: ${CONSULTATION_PLAN_DECISION_PROMPT_VERSION}

${CONSULTATION_PLAN_DECISION_INSTRUCTIONS}`;
}

function writingSystem() {
  return `Prompt version: ${CONSULTATION_PLAN_WRITING_PROMPT_VERSION}

${CONSULTATION_PLAN_WRITING_INSTRUCTIONS}`;
}

type CoachMessageInput = {
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
  approvedAnswers?: readonly ApprovedAnswerEvidence[];
  companyResearch: CoachCompanyResearch | null;
  askedQuestions: AskedConsultationQuestion[];
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
  focusTargetKey?: string | null;
  interviewerPrep?: InterviewerPrepPayload | null;
  qualityFeedback?: string[];
};

function coachUserMessages(input: CoachMessageInput): AiMessage[] {
  return [
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        careerStage: input.careerStage,
        recentRoles: input.recentRoles,
        personalProfileItems: input.profileItems,
        approvedAnswers: input.approvedAnswers ?? [],
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

export function buildConsultationCoachMessages(input: CoachMessageInput): AiMessage[] {
  return [{ role: "system", content: coachSystem() }, ...coachUserMessages(input)];
}

export function buildConsultationPlanDecisionMessages(
  input: CoachMessageInput,
): AiMessage[] {
  return [{ role: "system", content: decisionSystem() }, ...coachUserMessages(input)];
}

export function buildConsultationPlanWritingMessages(
  input: CoachMessageInput,
  decision: ConsultationPlanDecision,
): AiMessage[] {
  return [
    { role: "system", content: writingSystem() },
    ...coachUserMessages(input),
    { role: "user", content: JSON.stringify({ decision }) },
  ];
}

/** Replace the coach system prompt with the production lean decision instructions. */
export function productionPlanDecisionMessages(
  coachMessages: AiMessage[],
): AiMessage[] {
  return [
    { role: "system", content: decisionSystem() },
    ...coachMessages.filter((message) => message.role !== "system"),
  ];
}

/** Replace the coach system prompt and append the decision for the writing call. */
export function productionPlanWritingMessages(
  coachMessages: AiMessage[],
  decision: ConsultationPlanDecision,
): AiMessage[] {
  return [
    { role: "system", content: writingSystem() },
    ...coachMessages.filter((message) => message.role !== "system"),
    { role: "user", content: JSON.stringify({ decision }) },
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
  approvedAnswers?: ReadonlyArray<{
    id: string;
    question: string;
    content: string;
    approvedAt: string;
    sourceApplicationId: string;
  }>;
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
  spokenAnswerWords?: number;
}): AiMessage[] {
  const seekerReplies =
    input.seekerReplies?.map((reply) => reply.trim()).filter(Boolean) ??
    input.answer
      .split("\n")
      .map((reply) => reply.trim())
      .filter(Boolean);
  return [
    { role: "system", content: polishSystem(input.spokenAnswerWords) },
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
        approvedAnswers: input.approvedAnswers ?? [],
        seekerRepliesTakePrecedenceOverPriorApprovedAnswer:
          (input.approvedAnswers?.length ?? 0) > 0,
        strengtheningNeeds: input.strengtheningNeeds,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}
