/**
 * Harper role-expertise coaching fill (Batch D6 / model-split).
 * Step A chooses questions (consultation / terra); Step B writes suggested
 * answers (consultation reply / luna).
 */

import { z } from "zod";
import {
  employerResearchModelInput,
  loadApplicationEmployerResearch,
  type EmployerResearchModelInput,
} from "@/lib/application/employer-research-reader";
import {
  fingerprintPaidCallInputs,
  findPaidCallReceipt,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext } from "@/lib/ai/types";
import {
  createAiProvider,
  getConsultationAiConfig,
  getConsultationAiProvider,
  getConsultationReplyAiProvider,
  isConsultationAiConfigured,
  isConsultationReplyAiConfigured,
} from "@/lib/ai";
import {
  ASK_HARPER_PLACEHOLDER_ANSWER,
  askHarperAnswerCloseness,
  askHarperAnswerKind,
  askHarperAttemptProse,
  askHarperUnpassedDraft,
  chooseAskHarperFallbackAnswer,
  composedPointOfViewAnswer,
} from "@/lib/consultation/ask-harper-answer";
import type { CareerStage } from "@/lib/consultation/career-stage";
import {
  harperLibraryContentHash,
  loadApprovedAnswersForTargets,
  type ApprovedAnswerEvidence,
} from "@/lib/consultation/harper-library";
import {
  ASK_HARPER_TARGET_PREFIX,
  PERSON_PREP_TARGET_PREFIX,
  ROLE_EXPERTISE_TARGET_PREFIX,
  interviewTypeTagSchema,
  type AskedConsultationQuestion,
  type InterviewTypeTag,
} from "@/lib/consultation/contract";
import {
  composeInterviewAnswerFromParts,
  containsFrameworkOrPartLabel,
  resultStatesOutcome,
  type AnswerPartsGrounding,
} from "@/lib/consultation/polish-parts";
import {
  looksLikeCareerWalkThrough,
  looksLikeContextFreeTemplateQuestion,
} from "@/lib/consultation/question-detection";
import {
  questionDuplicatesAsked,
  questionNearDuplicate,
  resolveInterviewTypeTag,
} from "@/lib/consultation/questions";
import type { RecentRole } from "@/lib/consultation/recent-roles";
import {
  ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS,
  ROLE_EXPERTISE_QUESTIONS_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content/role-expertise";
import { consultationConfig } from "@/lib/product-config/consultation";
import { parseStringArray } from "@/lib/research";
import { aiCallTracking } from "@/lib/usage/ai-call";
import { prisma } from "@/lib/prisma-client";
import type { Prisma } from "@prisma/client";

/** Bumped for questions/answers model-split (schema + prompt structure). */
export const ROLE_EXPERTISE_PROMPT_VERSION = "3";
/**
 * Answers step only. Bump when the answers instructions change.
 * Questions stay on ROLE_EXPERTISE_PROMPT_VERSION, so a bump here does not
 * invalidate a stored questions receipt or rewrite stored suggested answers.
 */
export const ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION = "6";

export const COACHING_SET_MIN = 20;
export const COACHING_SET_MAX = 25;

export const roleExpertiseQuestionChoiceSchema = z.object({
  text: z.string(),
  interviewTypeTag: interviewTypeTagSchema,
});

export const roleExpertiseQuestionsResultSchema = z.object({
  questions: z.array(roleExpertiseQuestionChoiceSchema),
});

export const roleExpertiseAnswerPartsSchema = z.object({
  text: z.string(),
  answerFramework: z.enum(["CAR", "STAR"]),
  challenge: z.string().nullable(),
  situation: z.string().nullable(),
  task: z.string().nullable(),
  action: z.string(),
  result: z.string(),
  followUpQuestion: z.string().nullable(),
});

export const roleExpertiseAnswersResultSchema = z.object({
  answers: z.array(roleExpertiseAnswerPartsSchema),
});

/** Combined question+answer shape used after merge / by validators. */
export const roleExpertiseQuestionSchema = z.object({
  text: z.string(),
  interviewTypeTag: interviewTypeTagSchema,
  answerFramework: z.enum(["CAR", "STAR"]),
  challenge: z.string().nullable(),
  situation: z.string().nullable(),
  task: z.string().nullable(),
  action: z.string(),
  result: z.string(),
});

/** @deprecated Prefer roleExpertiseQuestionsResultSchema; kept for receipt migration parse. */
export const roleExpertiseResultSchema = z.object({
  questions: z.array(roleExpertiseQuestionSchema),
});

export type RoleExpertiseQuestionChoice = z.infer<
  typeof roleExpertiseQuestionChoiceSchema
>;
export type RoleExpertiseQuestionsResult = z.infer<
  typeof roleExpertiseQuestionsResultSchema
>;
export type RoleExpertiseAnswerParts = z.infer<
  typeof roleExpertiseAnswerPartsSchema
>;
export type RoleExpertiseAnswersResult = z.infer<
  typeof roleExpertiseAnswersResultSchema
>;
export type RoleExpertiseQuestion = z.infer<typeof roleExpertiseQuestionSchema>;
export type RoleExpertiseResult = z.infer<typeof roleExpertiseResultSchema>;

export type CountedCoachingQuestion = {
  text: string;
  targetKey: string | null;
  followUp?: boolean;
};

/** Top-level General coaching only — not follow-ups, not interviewer-prep. */
export function isCountedCoachingQuestion(
  question: CountedCoachingQuestion,
): boolean {
  if (question.followUp) return false;
  const key = question.targetKey ?? "";
  if (key.startsWith(PERSON_PREP_TARGET_PREFIX)) return false;
  if (key.startsWith(ASK_HARPER_TARGET_PREFIX)) return false;
  return true;
}

export function isRoleExpertiseTargetKey(targetKey: string | null): boolean {
  return Boolean(targetKey?.startsWith(ROLE_EXPERTISE_TARGET_PREFIX));
}

export function countNonRoleExpertiseQuestions(
  questions: CountedCoachingQuestion[],
): number {
  return questions.filter(
    (question) =>
      isCountedCoachingQuestion(question) &&
      !isRoleExpertiseTargetKey(question.targetKey),
  ).length;
}

export function countAllCountedCoachingQuestions(
  questions: CountedCoachingQuestion[],
): number {
  return questions.filter(isCountedCoachingQuestion).length;
}

/**
 * G = counted non-role-expertise after the gap plan.
 * Fill band: [max(0, 20−G), max(0, 25−G)].
 */
export function roleExpertiseFillRange(G: number): {
  minCount: number;
  maxCount: number;
} {
  return {
    minCount: Math.max(0, COACHING_SET_MIN - G),
    maxCount: Math.max(0, COACHING_SET_MAX - G),
  };
}

export type RoleExpertiseJobInputs = {
  title: string | null;
  companyName: string | null;
  seniority: string | null;
  location: string | null;
  workArrangement: string | null;
  requiredItems: unknown;
  preferredItems: unknown;
  responsibilities: unknown;
  scorecardJson: unknown;
};

function scorecardFingerprintSlice(scorecardJson: unknown) {
  if (!scorecardJson || typeof scorecardJson !== "object") {
    return { mission: null, outcomes: [], competencies: [] };
  }
  const card = scorecardJson as {
    mission?: { text?: unknown };
    outcomes?: Array<{ text?: unknown }>;
    competencies?: Array<{ text?: unknown }>;
  };
  return {
    mission:
      typeof card.mission?.text === "string" ? card.mission.text.trim() : null,
    outcomes: (card.outcomes ?? [])
      .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
      .filter(Boolean),
    competencies: (card.competencies ?? [])
      .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
      .filter(Boolean),
  };
}

/** Job inputs plus employer research. Profile changes do not change this fingerprint. */
export function roleExpertiseJobFingerprint(
  job: RoleExpertiseJobInputs,
  employerResearch: EmployerResearchModelInput | null = null,
): string {
  return fingerprintPaidCallInputs({
    promptVersion: ROLE_EXPERTISE_PROMPT_VERSION,
    schemaName: "role_expertise_questions",
    title: job.title?.trim() || null,
    employer: job.companyName?.trim() || null,
    seniority: job.seniority?.trim() || null,
    location: job.location?.trim() || null,
    workArrangement: job.workArrangement?.trim() || null,
    requiredItems: parseStringArray(job.requiredItems),
    preferredItems: parseStringArray(job.preferredItems),
    responsibilities: parseStringArray(job.responsibilities),
    scorecard: scorecardFingerprintSlice(job.scorecardJson),
    employerResearch,
  });
}

/** Chosen questions plus the selected approved answers, or an explicit empty list. */
export function roleExpertiseAnswersFingerprint(
  questions: RoleExpertiseQuestionChoice[],
  approvedAnswers?: ReadonlyArray<{
    statementId: string | null;
    contentHash: string | null;
  } | null>,
  employerResearch: EmployerResearchModelInput | null = null,
): string {
  return fingerprintPaidCallInputs({
    promptVersion: ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION,
    schemaName: "role_expertise_answers",
    questions: questions.map((question) => ({
      text: question.text.trim(),
      interviewTypeTag: question.interviewTypeTag,
    })),
    approvedAnswers: approvedAnswers ?? [],
    employerResearch,
  });
}

function employerResearchFromJobSources(
  jobSources: Record<string, unknown>,
): EmployerResearchModelInput | null {
  const value = jobSources.employerResearch;
  if (!value || typeof value !== "object") return null;
  return value as EmployerResearchModelInput;
}

async function roleExpertiseJobSources(
  organizationId: string,
  campaignId: string,
  job: RoleExpertiseJobInputs,
): Promise<Record<string, unknown>> {
  const employerResearch = await employerResearchForCampaign(
    organizationId,
    campaignId,
  );
  return {
    title: job.title,
    employer: job.companyName,
    seniority: job.seniority,
    location: job.location,
    workArrangement: job.workArrangement,
    requiredItems: parseStringArray(job.requiredItems),
    preferredItems: parseStringArray(job.preferredItems),
    responsibilities: parseStringArray(job.responsibilities),
    scorecard: scorecardFingerprintSlice(job.scorecardJson),
    employerResearch,
  };
}

/** Question-selection messages production sends on the first attempt. */
export async function roleExpertiseQuestionMessages(input: {
  organizationId: string;
  campaignId: string;
  job: RoleExpertiseJobInputs;
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
  recentRoles: RecentRole[];
  careerStage: CareerStage;
  qualityFeedback?: string[];
}) {
  const jobSources = await roleExpertiseJobSources(
    input.organizationId,
    input.campaignId,
    input.job,
  );
  return buildRoleExpertiseQuestionsMessages({
    minCount: input.minCount,
    maxCount: input.maxCount,
    askedQuestions: input.askedQuestions,
    chronologyAlreadyAsked: input.chronologyAlreadyAsked,
    recentRoles: input.recentRoles,
    careerStage: input.careerStage,
    jobSources,
    qualityFeedback: input.qualityFeedback,
  });
}

async function employerResearchForCampaign(
  organizationId: string,
  campaignId: string,
): Promise<EmployerResearchModelInput | null> {
  const view = await loadApplicationEmployerResearch({
    organizationId,
    campaignId,
  });
  return view ? employerResearchModelInput(view) : null;
}

/** Ask Harper stores one General question. The tag is required by the answers schema and is not shown. */
export const ASK_HARPER_INTERVIEW_TYPE_TAG = "focused_competency" as const;

export function askHarperTargetKey(questionText: string): string {
  const text = questionText.trim();
  const slug = stableRoleExpertiseSlug(text);
  const hash = fingerprintPaidCallInputs({ text }).slice(0, 12);
  return `${ASK_HARPER_TARGET_PREFIX}${slug}-${hash}`;
}

/** One receipt per question text on this application, separate from the batch answers receipt. */
export function askHarperSubjectKey(campaignId: string, questionText: string): string {
  return `ask-harper:${campaignId}:${fingerprintPaidCallInputs({
    text: questionText.trim(),
  })}`;
}

export function stableRoleExpertiseSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "question";
}

function fieldText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function followUpText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const text = (value as { followUpQuestion?: unknown }).followUpQuestion;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function answerPartsFromQuestion(
  question: RoleExpertiseQuestion,
): AnswerPartsGrounding | null {
  if (question.answerFramework === "CAR") {
    const challenge = fieldText(question.challenge);
    const action = fieldText(question.action);
    const result = fieldText(question.result);
    if (!challenge || !action || !result) return null;
    return { answerFramework: "CAR", challenge, action, result };
  }
  const situation = fieldText(question.situation);
  const task = fieldText(question.task);
  const action = fieldText(question.action);
  const result = fieldText(question.result);
  if (!situation || !task || !action || !result) return null;
  return { answerFramework: "STAR", situation, task, action, result };
}

export function composedAnswerFromRoleExpertiseQuestion(
  question: RoleExpertiseQuestion,
): { content: string; grounding: AnswerPartsGrounding } | null {
  const grounding = answerPartsFromQuestion(question);
  if (!grounding) return null;
  if (!resultStatesOutcome(grounding.result)) return null;
  const parts =
    grounding.answerFramework === "CAR"
      ? [grounding.challenge ?? "", grounding.action, grounding.result]
      : [
          grounding.situation ?? "",
          grounding.task ?? "",
          grounding.action,
          grounding.result,
        ];
  for (const part of parts) {
    if (containsFrameworkOrPartLabel(part)) return null;
  }
  const content = composeInterviewAnswerFromParts(parts);
  if (!content.trim() || containsFrameworkOrPartLabel(content)) return null;
  return { content, grounding };
}

export type ValidatedRoleExpertiseQuestion = {
  text: string;
  targetKey: string;
  interviewTypeTag: InterviewTypeTag;
  content: string;
  grounding: AnswerPartsGrounding;
  followUpQuestion: string | null;
};

export type ValidatedRoleExpertiseQuestionChoice = {
  text: string;
  targetKey: string;
  interviewTypeTag: InterviewTypeTag;
};

function withUsageAttempt(
  usage: AiCallUsageContext | undefined,
  step: string,
  attemptIndex: number,
): AiCallUsageContext | undefined {
  if (!usage) return undefined;
  return {
    ...usage,
    metadata: {
      ...(usage.metadata ?? {}),
      step,
      attempt: attemptIndex + 1,
    },
  };
}

export function validateRoleExpertiseQuestionChoices(input: {
  questions: RoleExpertiseQuestionChoice[];
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
}): { valid: ValidatedRoleExpertiseQuestionChoice[]; issues: string[] } {
  const issues: string[] = [];
  const valid: ValidatedRoleExpertiseQuestionChoice[] = [];
  const usedSlugs = new Set<string>();
  let walkThroughKept = false;

  for (const raw of input.questions) {
    const text = raw.text.trim();
    if (!text) {
      issues.push("A role-expertise question was empty.");
      continue;
    }
    if (looksLikeContextFreeTemplateQuestion(text)) {
      issues.push("Drop context-free template questions.");
      continue;
    }
    if (questionDuplicatesAsked(text, input.askedQuestions)) {
      issues.push("Do not repeat or rephrase askedQuestions.");
      continue;
    }
    if (valid.some((item) => questionNearDuplicate(item.text, text))) {
      issues.push("Do not emit near-duplicate role-expertise questions.");
      continue;
    }
    const isWalkThrough = looksLikeCareerWalkThrough(text);
    if (isWalkThrough && (input.chronologyAlreadyAsked || walkThroughKept)) {
      issues.push(
        "Include the career walk-through only once and only when chronologyAlreadyAsked is false.",
      );
      continue;
    }
    if (
      /\bwhole career\b/i.test(text) ||
      /\bfirst job\b/i.test(text) ||
      /\bfrom the beginning\b/i.test(text) ||
      /\bentire career\b/i.test(text)
    ) {
      issues.push(
        "The career walk-through must cover only recentRoles, never the whole career or first job.",
      );
      continue;
    }

    const slug = stableRoleExpertiseSlug(text);
    let targetKey = `${ROLE_EXPERTISE_TARGET_PREFIX}${slug}`;
    let n = 2;
    while (usedSlugs.has(targetKey)) {
      targetKey = `${ROLE_EXPERTISE_TARGET_PREFIX}${slug}-${n}`;
      n += 1;
    }
    usedSlugs.add(targetKey);

    const interviewTypeTag = resolveInterviewTypeTag({
      targetKey: isWalkThrough ? "chronology" : targetKey,
      text,
      modelTag: raw.interviewTypeTag,
    });

    valid.push({ text, targetKey, interviewTypeTag });
    if (isWalkThrough) walkThroughKept = true;
  }

  if (input.maxCount === 0) {
    if (valid.length > 0) {
      issues.push("maxCount is 0; return no role-expertise questions.");
    }
    return { valid: [], issues };
  }

  if (valid.length < input.minCount) {
    issues.push(
      `Return at least ${input.minCount} and at most ${input.maxCount} role-expertise questions.`,
    );
  }
  if (valid.length > input.maxCount) {
    issues.push(
      `Return at most ${input.maxCount} role-expertise questions (got ${valid.length}).`,
    );
    return {
      valid: valid.slice(0, input.maxCount),
      issues,
    };
  }
  return { valid, issues };
}

export function validateRoleExpertiseQuestions(input: {
  questions: RoleExpertiseQuestion[];
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
}): { valid: ValidatedRoleExpertiseQuestion[]; issues: string[] } {
  const choiceChecked = validateRoleExpertiseQuestionChoices({
    questions: input.questions.map((question) => ({
      text: question.text,
      interviewTypeTag: question.interviewTypeTag,
    })),
    minCount: input.minCount,
    maxCount: input.maxCount,
    askedQuestions: input.askedQuestions,
    chronologyAlreadyAsked: input.chronologyAlreadyAsked,
  });
  const issues = [...choiceChecked.issues];
  const valid: ValidatedRoleExpertiseQuestion[] = [];

  for (const choice of choiceChecked.valid) {
    const raw = input.questions.find(
      (question) => question.text.trim() === choice.text,
    );
    if (!raw) {
      issues.push("Every chosen question needs a matching suggested answer.");
      continue;
    }
    const composed = composedAnswerFromRoleExpertiseQuestion({
      ...raw,
      text: choice.text,
      interviewTypeTag: choice.interviewTypeTag,
    });
    if (!composed) {
      issues.push(
        "Every question needs a suggested answer with all CAR or STAR parts, a result that states an outcome, and no framework or part labels.",
      );
      continue;
    }
    valid.push({
      text: choice.text,
      targetKey: choice.targetKey,
      interviewTypeTag: choice.interviewTypeTag,
      content: composed.content,
      grounding: composed.grounding,
      followUpQuestion: followUpText(raw),
    });
  }

  if (input.maxCount === 0) {
    return { valid: [], issues };
  }
  if (valid.length < input.minCount) {
    issues.push(
      `Return at least ${input.minCount} and at most ${input.maxCount} role-expertise questions with suggested answers.`,
    );
  }
  if (valid.length > input.maxCount) {
    return {
      valid: valid.slice(0, input.maxCount),
      issues,
    };
  }
  return { valid, issues };
}

function mergeQuestionsWithAnswers(
  choices: ValidatedRoleExpertiseQuestionChoice[],
  answers: RoleExpertiseAnswerParts[],
): Array<RoleExpertiseQuestion & { followUpQuestion: string | null }> {
  const byText = new Map(
    answers.map((answer) => [answer.text.trim().toLowerCase(), answer]),
  );
  return choices.map((choice) => {
    const answer =
      byText.get(choice.text.toLowerCase()) ??
      answers.find(
        (item) =>
          questionNearDuplicate(item.text, choice.text) ||
          item.text.trim() === choice.text,
      );
    if (!answer) {
      return {
        text: choice.text,
        interviewTypeTag: choice.interviewTypeTag,
        answerFramework: "CAR" as const,
        challenge: null,
        situation: null,
        task: null,
        action: "",
        result: "",
        followUpQuestion: null,
      };
    }
    return {
      text: choice.text,
      interviewTypeTag: choice.interviewTypeTag,
      answerFramework: answer.answerFramework,
      challenge: answer.challenge,
      situation: answer.situation,
      task: answer.task,
      action: answer.action,
      result: answer.result,
      followUpQuestion: followUpText(answer),
    };
  });
}

export function buildRoleExpertiseQuestionsMessages(input: {
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
  recentRoles: RecentRole[];
  careerStage: CareerStage;
  jobSources: Record<string, unknown>;
  qualityFeedback?: string[];
}) {
  return [
    {
      role: "system" as const,
      content: `Prompt version: ${ROLE_EXPERTISE_PROMPT_VERSION}

${ROLE_EXPERTISE_QUESTIONS_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        minCount: input.minCount,
        maxCount: input.maxCount,
        chronologyAlreadyAsked: input.chronologyAlreadyAsked,
        careerStage: input.careerStage,
        recentRoles: input.recentRoles,
        askedQuestions: input.askedQuestions,
        jobSources: input.jobSources,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}

export function buildRoleExpertiseAnswersMessages(input: {
  questions: ValidatedRoleExpertiseQuestionChoice[];
  careerStage: CareerStage;
  jobSources: Record<string, unknown>;
  profileItems: unknown[];
  approvedAnswers?: readonly ApprovedAnswerEvidence[];
  qualityFeedback?: string[];
}) {
  return [
    {
      role: "system" as const,
      content: `Prompt version: ${ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION}

${ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        careerStage: input.careerStage,
        questions: input.questions.map((question) => ({
          text: question.text,
          interviewTypeTag: question.interviewTypeTag,
        })),
        approvedAnswers: input.approvedAnswers ?? [],
        jobSources: input.jobSources,
        personalProfileItems: input.profileItems,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}

export function isRoleExpertiseQuestionsResultUsable(
  result: RoleExpertiseQuestionsResult,
  bounds: { minCount: number; maxCount: number },
): boolean {
  if (bounds.maxCount === 0) return true;
  const { valid } = validateRoleExpertiseQuestionChoices({
    questions: result.questions,
    minCount: bounds.minCount,
    maxCount: bounds.maxCount,
    askedQuestions: [],
    chronologyAlreadyAsked: false,
  });
  return valid.length >= Math.min(bounds.minCount, bounds.maxCount);
}

export function isRoleExpertiseAnswersResultUsable(
  result: RoleExpertiseAnswersResult,
  choices: ValidatedRoleExpertiseQuestionChoice[],
): boolean {
  if (choices.length === 0) return true;
  const merged = mergeQuestionsWithAnswers(choices, result.answers);
  const { valid } = validateRoleExpertiseQuestions({
    questions: merged,
    minCount: choices.length,
    maxCount: choices.length,
    askedQuestions: [],
    chronologyAlreadyAsked: false,
  });
  return valid.length >= Math.min(1, choices.length);
}

/** @deprecated Prefer isRoleExpertiseQuestionsResultUsable. */
export function isRoleExpertiseResultUsable(
  result: RoleExpertiseResult,
  bounds: { minCount: number; maxCount: number },
): boolean {
  if (bounds.maxCount === 0) return true;
  const { valid } = validateRoleExpertiseQuestions({
    questions: result.questions,
    minCount: bounds.minCount,
    maxCount: bounds.maxCount,
    askedQuestions: [],
    chronologyAlreadyAsked: false,
  });
  return valid.length >= Math.min(bounds.minCount, bounds.maxCount);
}

function parseStoredQuestions(json: unknown): RoleExpertiseQuestionsResult {
  const asQuestions = roleExpertiseQuestionsResultSchema.safeParse(json);
  if (asQuestions.success) return asQuestions.data;
  // Legacy combined receipt: strip answer fields.
  const legacy = roleExpertiseResultSchema.parse(json);
  return {
    questions: legacy.questions.map((question) => ({
      text: question.text,
      interviewTypeTag: question.interviewTypeTag,
    })),
  };
}

async function generateRoleExpertiseQuestionsStep(input: {
  organizationId: string;
  campaignId: string;
  job: RoleExpertiseJobInputs;
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
  recentRoles: RecentRole[];
  careerStage: CareerStage;
  jobSources: Record<string, unknown>;
  usage?: AiCallUsageContext;
}): Promise<
  | {
      ok: true;
      choices: ValidatedRoleExpertiseQuestionChoice[];
      skipped: boolean;
      keptAfterPartial: number | null;
    }
  | { ok: false; message: string; skipped: boolean }
> {
  if (!isConsultationAiConfigured()) {
    return {
      ok: false,
      skipped: false,
      message: "Consultation AI is not configured for role-expertise questions.",
    };
  }

  const fingerprint = roleExpertiseJobFingerprint(
    input.job,
    employerResearchFromJobSources(input.jobSources),
  );
  let qualityFeedback: string[] = [];
  let lastValid: ValidatedRoleExpertiseQuestionChoice[] = [];

  try {
    const gated = await runPaidStructuredCall<RoleExpertiseQuestionsResult>({
      organizationId: input.organizationId,
      operation: "ROLE_EXPERTISE_QUESTIONS",
      subjectKey: input.campaignId,
      inputFingerprint: fingerprint,
      parseStored: parseStoredQuestions,
      isResultUsable: (stored) =>
        isRoleExpertiseQuestionsResultUsable(stored, {
          minCount: input.minCount,
          maxCount: input.maxCount,
        }),
      callProvider: async () => {
        let data: RoleExpertiseQuestionsResult = { questions: [] };
        for (
          let attempt = 0;
          attempt <= consultationConfig.qualityRegenerationAttempts;
          attempt += 1
        ) {
          const attemptUsage = withUsageAttempt(
            input.usage,
            "role_expertise_questions",
            attempt,
          );
          const roleExpertiseModel = process.env.ROLE_EXPERTISE_AI_MODEL?.trim();
          const questionsProvider = roleExpertiseModel
            ? createAiProvider({
                ...getConsultationAiConfig(),
                model: roleExpertiseModel,
              })
            : getConsultationAiProvider();
          const response = await questionsProvider.generateStructured({
            ...structuredOutputRequest("roleExpertiseQuestions"),
            ...(attemptUsage ? aiCallTracking(attemptUsage) : {}),
            messages: buildRoleExpertiseQuestionsMessages({
              minCount: input.minCount,
              maxCount: input.maxCount,
              askedQuestions: input.askedQuestions,
              chronologyAlreadyAsked: input.chronologyAlreadyAsked,
              recentRoles: input.recentRoles,
              careerStage: input.careerStage,
              jobSources: input.jobSources,
              qualityFeedback,
            }),
            parseOutput: (raw) => ({
              data: roleExpertiseQuestionsResultSchema.parse(raw),
              coercedFields: [],
            }),
          });
          data = response.data;
          const checked = validateRoleExpertiseQuestionChoices({
            questions: data.questions,
            minCount: input.minCount,
            maxCount: input.maxCount,
            askedQuestions: input.askedQuestions,
            chronologyAlreadyAsked: input.chronologyAlreadyAsked,
          });
          lastValid = checked.valid;
          const lastAttempt =
            attempt === consultationConfig.qualityRegenerationAttempts;
          if (checked.issues.length === 0) {
            return {
              questions: checked.valid.map((item) => ({
                text: item.text,
                interviewTypeTag: item.interviewTypeTag,
              })),
            };
          }
          if (lastAttempt) {
            return {
              questions: checked.valid.map((item) => ({
                text: item.text,
                interviewTypeTag: item.interviewTypeTag,
              })),
            };
          }
          qualityFeedback = checked.issues;
        }
        return data;
      },
    });

    const checked = validateRoleExpertiseQuestionChoices({
      questions: gated.data.questions,
      minCount: input.minCount,
      maxCount: input.maxCount,
      askedQuestions: input.askedQuestions,
      chronologyAlreadyAsked: input.chronologyAlreadyAsked,
    });
    const kept = checked.valid.length;
    const partial =
      checked.issues.length > 0 || kept < input.minCount ? kept : null;
    return {
      ok: true,
      choices: checked.valid,
      skipped: gated.skipped,
      keptAfterPartial: partial,
    };
  } catch (error) {
    if (lastValid.length > 0) {
      return {
        ok: true,
        choices: lastValid,
        skipped: false,
        keptAfterPartial: lastValid.length,
      };
    }
    return {
      ok: false,
      skipped: false,
      message:
        error instanceof Error
          ? error.message
          : "Role-expertise questions could not be generated.",
    };
  }
}

function validateAnswersForMode(
  questions: RoleExpertiseQuestion[],
  mode: "story" | "point-of-view" | undefined,
): { valid: ValidatedRoleExpertiseQuestion[]; issues: string[] } {
  if (mode !== "point-of-view") {
    return validateRoleExpertiseQuestions({
      questions,
      minCount: questions.length,
      maxCount: questions.length,
      askedQuestions: [],
      chronologyAlreadyAsked: false,
    });
  }
  const choiceChecked = validateRoleExpertiseQuestionChoices({
    questions: questions.map((question) => ({
      text: question.text,
      interviewTypeTag: question.interviewTypeTag,
    })),
    minCount: questions.length,
    maxCount: questions.length,
    askedQuestions: [],
    chronologyAlreadyAsked: false,
  });
  const issues = [...choiceChecked.issues];
  const valid: ValidatedRoleExpertiseQuestion[] = [];
  for (const choice of choiceChecked.valid) {
    const raw = questions.find((question) => question.text.trim() === choice.text);
    if (!raw) {
      issues.push("Every chosen question needs a matching suggested answer.");
      continue;
    }
    const composed = composedPointOfViewAnswer(raw);
    if (!composed) {
      issues.push(
        "A point-of-view answer needs the seeker's view in the answer, without a required outcome.",
      );
      continue;
    }
    valid.push({
      text: choice.text,
      targetKey: choice.targetKey,
      interviewTypeTag: choice.interviewTypeTag,
      content: composed.content,
      grounding: composed.grounding,
      followUpQuestion: followUpText(raw),
    });
  }
  return { valid, issues };
}

function unansweredRoleExpertiseQuestion(
  choice: ValidatedRoleExpertiseQuestionChoice,
): ValidatedRoleExpertiseQuestion {
  return {
    text: choice.text,
    targetKey: choice.targetKey,
    interviewTypeTag: choice.interviewTypeTag,
    content: "",
    grounding: { answerFramework: "CAR", action: "", result: "" },
    followUpQuestion: null,
  };
}

function answerForChoice(
  answers: readonly RoleExpertiseAnswerParts[],
  text: string,
): RoleExpertiseAnswerParts | undefined {
  const key = text.trim().toLowerCase();
  return (
    answers.find((answer) => answer.text.trim().toLowerCase() === key) ??
    answers.find(
      (answer) =>
        questionNearDuplicate(answer.text, text) || answer.text.trim() === text.trim(),
    )
  );
}

/**
 * Best-practice fill uses the same question kinds as Ask Harper.
 * A story question still needs every CAR or STAR part and an outcome.
 * A point-of-view, approach, or knowledge question does not.
 */
function draftIsRawProfileFact(
  content: string,
  sourceTexts: readonly string[],
): boolean {
  const normalized = content.replace(/[.!?]+$/g, "").trim().toLowerCase();
  if (!normalized || normalized === ASK_HARPER_PLACEHOLDER_ANSWER.toLowerCase()) {
    return true;
  }
  return sourceTexts.some(
    (source) => source.replace(/[.!?]+$/g, "").trim().toLowerCase() === normalized,
  );
}

function bestPracticePassingDraft(
  choice: ValidatedRoleExpertiseQuestionChoice,
  answer: RoleExpertiseAnswerParts | undefined,
  sourceTexts: readonly string[],
): { question: ValidatedRoleExpertiseQuestion; issue: string | null } {
  const kind = askHarperAnswerKind(choice.text);
  const issue =
    kind === "story"
      ? "Every question needs a suggested answer with all CAR or STAR parts, a result that states an outcome, and no framework or part labels."
      : "A point-of-view answer needs the seeker's view in the answer, without a required outcome.";
  if (!answer) return { question: unansweredRoleExpertiseQuestion(choice), issue };
  const raw = {
    text: choice.text,
    interviewTypeTag: choice.interviewTypeTag,
    answerFramework: answer.answerFramework,
    challenge: answer.challenge,
    situation: answer.situation,
    task: answer.task,
    action: answer.action,
    result: answer.result,
  };
  const story = composedAnswerFromRoleExpertiseQuestion(raw);
  if (
    story &&
    !draftIsRawProfileFact(story.content, sourceTexts) &&
    (kind === "story" || kind === "point-of-view")
  ) {
    return {
      question: {
        text: choice.text,
        targetKey: choice.targetKey,
        interviewTypeTag: choice.interviewTypeTag,
        content: story.content,
        grounding: story.grounding,
        followUpQuestion: followUpText(answer),
      },
      issue: null,
    };
  }
  if (kind === "point-of-view") {
    const pointOfView = composedPointOfViewAnswer(raw);
    if (pointOfView && !draftIsRawProfileFact(pointOfView.content, sourceTexts)) {
      return {
        question: {
          text: choice.text,
          targetKey: choice.targetKey,
          interviewTypeTag: choice.interviewTypeTag,
          content: pointOfView.content,
          grounding: pointOfView.grounding,
          followUpQuestion: followUpText(answer),
        },
        issue: null,
      };
    }
  }
  return { question: unansweredRoleExpertiseQuestion(choice), issue };
}

function bestPracticeDraftForChoice(
  choice: ValidatedRoleExpertiseQuestionChoice,
  answer: RoleExpertiseAnswerParts | undefined,
  sourceTexts: readonly string[],
): ValidatedRoleExpertiseQuestion {
  const passed = bestPracticePassingDraft(choice, answer, sourceTexts);
  if (!passed.issue && passed.question.content.trim()) return passed.question;
  const kind = askHarperAnswerKind(choice.text);
  const content = answer
    ? askHarperUnpassedDraft({ answer, kind, sourceTexts }) ||
      askHarperAttemptProse(answer)
    : "";
  if (!content) return unansweredRoleExpertiseQuestion(choice);
  return {
    text: choice.text,
    targetKey: choice.targetKey,
    interviewTypeTag: choice.interviewTypeTag,
    content,
    grounding: {
      answerFramework: answer?.answerFramework ?? "CAR",
      action: content,
      result: "",
    },
    followUpQuestion: followUpText(answer),
  };
}

function answerHasDraftMaterial(answer: RoleExpertiseAnswerParts): boolean {
  const parts = [
    answer.challenge,
    answer.situation,
    answer.task,
    answer.action,
    answer.result,
  ];
  return parts.some((part) => {
    const text = part?.trim() ?? "";
    return text.length > 0 && text !== ASK_HARPER_PLACEHOLDER_ANSWER;
  });
}

function bestPracticeAnswersReceiptIsUsable(
  stored: RoleExpertiseAnswersResult,
  choices: ValidatedRoleExpertiseQuestionChoice[],
): boolean {
  if (choices.length === 0) return true;
  if (stored.answers.length === 0) return false;
  return stored.answers.some(answerHasDraftMaterial);
}

function mappedAnswers(questions: ValidatedRoleExpertiseQuestion[]) {
  return questions.map((item) => ({
    text: item.text,
    answerFramework: item.grounding.answerFramework,
    challenge: item.grounding.challenge ?? null,
    situation: item.grounding.situation ?? null,
    task: item.grounding.task ?? null,
    action: item.grounding.action,
    result: item.grounding.result,
    followUpQuestion: item.followUpQuestion,
  }));
}

function normalizeAnswer(
  answer: Omit<RoleExpertiseAnswerParts, "followUpQuestion"> & {
    followUpQuestion?: string | null;
  },
): RoleExpertiseAnswerParts {
  return {
    text: answer.text,
    answerFramework: answer.answerFramework,
    challenge: answer.challenge ?? null,
    situation: answer.situation ?? null,
    task: answer.task ?? null,
    action: answer.action ?? "",
    result: answer.result ?? "",
    followUpQuestion: followUpText(answer),
  };
}

function askHarperSourceTexts(
  profileItems: readonly unknown[],
  approvedAnswers: ReadonlyArray<{ content?: string | null }>,
  jobSources: Record<string, unknown>,
): string[] {
  const texts: string[] = [];
  for (const item of profileItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as { kind?: unknown; text?: unknown };
    if (row.kind !== "FACT" || typeof row.text !== "string") continue;
    const text = row.text.trim();
    if (text) texts.push(text);
  }
  for (const answer of approvedAnswers) {
    const content = answer.content?.trim() ?? "";
    if (content) texts.push(content);
  }
  for (const key of ["title", "employer"] as const) {
    const value = jobSources[key];
    if (typeof value === "string" && value.trim()) texts.push(value.trim());
  }
  return texts;
}

async function generateRoleExpertiseAnswersStep(input: {
  organizationId: string;
  campaignId: string;
  choices: ValidatedRoleExpertiseQuestionChoice[];
  careerStage: CareerStage;
  jobSources: Record<string, unknown>;
  profileItems: unknown[];
  usage?: AiCallUsageContext;
  /** Defaults to the campaign so the batch fill keeps one receipt. Ask Harper passes a per-question key. */
  subjectKey?: string;
  /**
   * Ask Harper passes one kind. The best-practice fill leaves this unset and
   * classifies each question the same way. Point-of-view answers do not need
   * a story outcome. A parsed answer is stored so an identical question does
   * not pay again, and a failed check still keeps the closest real attempt.
   */
  answerMode?: "story" | "point-of-view";
}): Promise<
  | {
      ok: true;
      questions: ValidatedRoleExpertiseQuestion[];
      skipped: boolean;
      keptAfterPartial: number | null;
    }
  | { ok: false; message: string; skipped: boolean }
> {
  if (input.choices.length === 0) {
    return {
      ok: true,
      questions: [],
      skipped: true,
      keptAfterPartial: null,
    };
  }
  if (!isConsultationReplyAiConfigured()) {
    return {
      ok: false,
      skipped: false,
      message:
        "Consultation reply AI is not configured for role-expertise answers.",
    };
  }

  const choicePayload = input.choices.map((choice) => ({
    text: choice.text,
    interviewTypeTag: choice.interviewTypeTag,
  }));
  const approvedAnswers = await loadApprovedAnswersForTargets({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    targets: input.choices.map((choice) => ({
      key: choice.targetKey,
      text: choice.text,
    })),
  });
  const fingerprint = roleExpertiseAnswersFingerprint(
    choicePayload,
    approvedAnswers.map((answer) => ({
      statementId: answer.statementId,
      contentHash: harperLibraryContentHash(answer.content),
    })),
    employerResearchFromJobSources(input.jobSources),
  );
  let qualityFeedback: string[] = [];
  let lastValid: ValidatedRoleExpertiseQuestion[] = [];
  const sourceTexts = askHarperSourceTexts(
    input.profileItems,
    approvedAnswers,
    input.jobSources,
  );

  try {
    const gated = await runPaidStructuredCall<RoleExpertiseAnswersResult>({
      organizationId: input.organizationId,
      operation: "ROLE_EXPERTISE_ANSWERS",
      subjectKey: input.subjectKey ?? input.campaignId,
      inputFingerprint: fingerprint,
      parseStored: (json) => roleExpertiseAnswersResultSchema.parse(json),
      isResultUsable: (stored) =>
        input.answerMode
          ? stored.answers.length > 0
          : bestPracticeAnswersReceiptIsUsable(stored, input.choices),
      callProvider: async () => {
        let data: RoleExpertiseAnswersResult = { answers: [] };
        const failedAttempts: RoleExpertiseAnswerParts[] = [];
        const attemptSets: RoleExpertiseAnswerParts[][] = [];
        for (
          let attempt = 0;
          attempt <= consultationConfig.qualityRegenerationAttempts;
          attempt += 1
        ) {
          const attemptUsage = withUsageAttempt(
            input.usage,
            "role_expertise_answers",
            attempt,
          );
          const response =
            await getConsultationReplyAiProvider().generateStructured({
              ...structuredOutputRequest("roleExpertiseAnswers"),
              ...(attemptUsage ? aiCallTracking(attemptUsage) : {}),
              messages: buildRoleExpertiseAnswersMessages({
                questions: input.choices,
                careerStage: input.careerStage,
                jobSources: input.jobSources,
                profileItems: input.profileItems,
                approvedAnswers,
                qualityFeedback,
              }),
              parseOutput: (raw) => ({
                data: roleExpertiseAnswersResultSchema.parse(raw),
                coercedFields: [],
              }),
            });
          data = {
            answers: response.data.answers.map((answer) => normalizeAnswer(answer)),
          };
          attemptSets.push(data.answers);
          if (input.answerMode && data.answers[0]) failedAttempts.push(data.answers[0]);
          const merged = mergeQuestionsWithAnswers(input.choices, data.answers);
          const checked = input.answerMode
            ? validateAnswersForMode(merged, input.answerMode)
            : (() => {
                const issues: string[] = [];
                const valid: ValidatedRoleExpertiseQuestion[] = [];
                for (const choice of input.choices) {
                  const judged = bestPracticePassingDraft(
                    choice,
                    answerForChoice(data.answers, choice.text),
                    sourceTexts,
                  );
                  if (judged.issue) issues.push(judged.issue);
                  else valid.push(judged.question);
                }
                return { valid, issues };
              })();
          lastValid = checked.valid;
          const lastAttempt =
            attempt === consultationConfig.qualityRegenerationAttempts;
          if (checked.issues.length === 0) {
            return { answers: mappedAnswers(checked.valid) };
          }
          if (lastAttempt) {
            if (!input.answerMode) {
              return {
                answers: input.choices.map((choice) => {
                  const passed = checked.valid.find(
                    (question) => question.text === choice.text,
                  );
                  if (passed) return mappedAnswers([passed])[0]!;
                  const attempts = attemptSets
                    .map((set) => answerForChoice(set, choice.text))
                    .filter((answer): answer is RoleExpertiseAnswerParts =>
                      Boolean(answer),
                    );
                  const earlierPass = [...attempts].reverse().find((answer) => {
                    const judged = bestPracticePassingDraft(choice, answer, sourceTexts);
                    return !judged.issue && judged.question.content.trim().length > 0;
                  });
                  if (earlierPass) return normalizeAnswer(earlierPass);
                  const chosen = chooseAskHarperFallbackAnswer({
                    attempts,
                    kind: askHarperAnswerKind(choice.text),
                    sourceTexts,
                  });
                  return chosen
                    ? normalizeAnswer(chosen.attempt)
                    : {
                        text: choice.text,
                        answerFramework: "CAR" as const,
                        challenge: null,
                        situation: null,
                        task: null,
                        action: "",
                        result: "",
                        followUpQuestion: null,
                      };
                }),
              };
            }
            const chosen = chooseAskHarperFallbackAnswer({
              attempts: failedAttempts,
              kind: input.answerMode,
              sourceTexts,
            });
            const stored =
              chosen?.attempt ??
              [...failedAttempts].sort(
                (left, right) =>
                  askHarperAnswerCloseness(right, input.answerMode!) -
                  askHarperAnswerCloseness(left, input.answerMode!),
              )[0];
            return { answers: stored ? [normalizeAnswer(stored)] : [] };
          }
          qualityFeedback = checked.issues;
        }
        return data;
      },
    });

    if (!input.answerMode) {
      const questions = input.choices.map((choice) =>
        bestPracticeDraftForChoice(
          choice,
          answerForChoice(gated.data.answers, choice.text),
          sourceTexts,
        ),
      );
      const withDraft = questions.filter((question) => question.content.trim()).length;
      return {
        ok: true,
        questions,
        skipped: gated.skipped,
        keptAfterPartial: withDraft < input.choices.length ? withDraft : null,
      };
    }
    const merged = mergeQuestionsWithAnswers(input.choices, gated.data.answers);
    const checked = validateAnswersForMode(merged, input.answerMode);
    if (input.answerMode && checked.valid.length === 0) {
      const choice = input.choices[0];
      const answer = gated.data.answers[0];
      const content = answer
        ? askHarperUnpassedDraft({
            answer,
            kind: input.answerMode,
            sourceTexts,
          }) || askHarperAttemptProse(answer)
        : "";
      if (choice && content) {
        return {
          ok: true,
          questions: [
            {
              text: choice.text,
              targetKey: choice.targetKey,
              interviewTypeTag: choice.interviewTypeTag,
              content,
              grounding: {
                answerFramework: answer.answerFramework,
                action: content,
                result: "",
              },
              followUpQuestion: followUpText(answer),
            },
          ],
          skipped: gated.skipped,
          keptAfterPartial: 1,
        };
      }
    }
    const kept = checked.valid.length;
    const partial =
      checked.issues.length > 0 || kept < input.choices.length ? kept : null;
    return {
      ok: true,
      questions: checked.valid,
      skipped: gated.skipped,
      keptAfterPartial: partial,
    };
  } catch {
    if (lastValid.length > 0 && input.answerMode) {
      return {
        ok: true,
        questions: lastValid,
        skipped: false,
        keptAfterPartial: lastValid.length,
      };
    }
    if (!input.answerMode) {
      return {
        ok: true,
        questions: input.choices.map((choice) => {
          const recovered = lastValid.find((question) => question.text === choice.text);
          return recovered ?? unansweredRoleExpertiseQuestion(choice);
        }),
        skipped: false,
        keptAfterPartial: lastValid.length,
      };
    }
    if (input.answerMode) {
      return {
        ok: true,
        questions: [],
        skipped: false,
        keptAfterPartial: 0,
      };
    }
    return {
      ok: true,
      questions: input.choices.map(unansweredRoleExpertiseQuestion),
      skipped: false,
      keptAfterPartial: 0,
    };
  }
}

/**
 * One seeker-written question through the existing role-expertise answers step
 * (writing model, Harper library, fact-preservation checks, paid-call gate).
 * Does not run the questions step and does not change that prompt.
 */
export async function generateAskHarperSuggestedAnswer(input: {
  organizationId: string;
  campaignId: string;
  questionText: string;
  careerStage: CareerStage;
  job: RoleExpertiseJobInputs;
  profileItems: unknown[];
}): Promise<
  | { ok: true; question: ValidatedRoleExpertiseQuestion; skipped: boolean }
  | { ok: false; message: string }
> {
  const text = input.questionText.trim();
  if (!text) {
    return { ok: false, message: "A role-expertise question was empty." };
  }
  const kind = askHarperAnswerKind(text);
  const employerResearch = await employerResearchForCampaign(
    input.organizationId,
    input.campaignId,
  );
  const jobSources = {
    title: input.job.title,
    employer: input.job.companyName,
    seniority: input.job.seniority,
    location: input.job.location,
    workArrangement: input.job.workArrangement,
    requiredItems: parseStringArray(input.job.requiredItems),
    preferredItems: parseStringArray(input.job.preferredItems),
    responsibilities: parseStringArray(input.job.responsibilities),
    scorecard: scorecardFingerprintSlice(input.job.scorecardJson),
    employerResearch,
  };
  const answersStep = await generateRoleExpertiseAnswersStep({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    choices: [
      {
        text,
        targetKey: askHarperTargetKey(text),
        interviewTypeTag: ASK_HARPER_INTERVIEW_TYPE_TAG,
      },
    ],
    careerStage: input.careerStage,
    jobSources,
    profileItems: input.profileItems,
    subjectKey: askHarperSubjectKey(input.campaignId, text),
    answerMode: kind,
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      category: "CONSULTATION",
      operation: "CONSULTATION_REPLY",
      metadata: { step: "role_expertise_answers", attempt: 1 },
    },
  });
  if (!answersStep.ok || !answersStep.questions[0]) {
    return {
      ok: false,
      message: answersStep.ok
        ? "Role-expertise answers could not be generated."
        : answersStep.message,
    };
  }
  const question = answersStep.questions[0];
  return {
    ok: true,
    skipped: answersStep.skipped,
    question: {
      ...question,
      text,
      targetKey: askHarperTargetKey(text),
      interviewTypeTag: ASK_HARPER_INTERVIEW_TYPE_TAG,
    },
  };
}

export async function generateRoleExpertiseWithModel(input: {
  organizationId: string;
  campaignId: string;
  job: RoleExpertiseJobInputs;
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
  recentRoles: RecentRole[];
  careerStage: CareerStage;
  profileItems: unknown[];
  usage?: AiCallUsageContext;
}): Promise<
  | {
      ok: true;
      questions: ValidatedRoleExpertiseQuestion[];
      skipped: boolean;
      questionsSkipped: boolean;
      answersSkipped: boolean;
      keptAfterPartial: number | null;
    }
  | { ok: false; message: string; skipped: boolean }
> {
  if (input.maxCount === 0) {
    return {
      ok: true,
      questions: [],
      skipped: true,
      questionsSkipped: true,
      answersSkipped: true,
      keptAfterPartial: null,
    };
  }

  const jobSources = await roleExpertiseJobSources(
    input.organizationId,
    input.campaignId,
    input.job,
  );

  const questionsStep = await generateRoleExpertiseQuestionsStep({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    job: input.job,
    minCount: input.minCount,
    maxCount: input.maxCount,
    askedQuestions: input.askedQuestions,
    chronologyAlreadyAsked: input.chronologyAlreadyAsked,
    recentRoles: input.recentRoles,
    careerStage: input.careerStage,
    jobSources,
    usage: input.usage
      ? {
          ...input.usage,
          operation: "CONSULTATION",
          metadata: {
            ...(input.usage.metadata ?? {}),
            step: "role_expertise_questions",
          },
        }
      : {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          category: "CONSULTATION",
          operation: "CONSULTATION",
          metadata: { step: "role_expertise_questions", attempt: 1 },
        },
  });
  if (!questionsStep.ok) {
    return {
      ok: false,
      skipped: false,
      message: questionsStep.message,
    };
  }

  const answersUsageBase: AiCallUsageContext = input.usage
    ? {
        ...input.usage,
        operation: "CONSULTATION_REPLY",
        metadata: {
          ...(input.usage.metadata ?? {}),
          step: "role_expertise_answers",
        },
      }
    : {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        category: "CONSULTATION",
        operation: "CONSULTATION_REPLY",
        metadata: { step: "role_expertise_answers", attempt: 1 },
      };

  const answersStep = await generateRoleExpertiseAnswersStep({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    choices: questionsStep.choices,
    careerStage: input.careerStage,
    jobSources,
    profileItems: input.profileItems,
    usage: answersUsageBase,
  });
  if (!answersStep.ok) {
    return {
      ok: true,
      questions: questionsStep.choices.map(unansweredRoleExpertiseQuestion),
      skipped: false,
      questionsSkipped: questionsStep.skipped,
      answersSkipped: false,
      keptAfterPartial: 0,
    };
  }

  const keptAfterPartial =
    questionsStep.keptAfterPartial != null ||
    answersStep.keptAfterPartial != null
      ? answersStep.questions.length
      : null;

  return {
    ok: true,
    questions: answersStep.questions,
    skipped: questionsStep.skipped && answersStep.skipped,
    questionsSkipped: questionsStep.skipped,
    answersSkipped: answersStep.skipped,
    keptAfterPartial,
  };
}

export async function storeRoleExpertiseQuestions(input: {
  organizationId: string;
  sessionId: string;
  questions: ValidatedRoleExpertiseQuestion[];
}): Promise<void> {
  for (const question of input.questions) {
    const existing = await prisma.consultationTurn.findFirst({
      where: {
        sessionId: input.sessionId,
        speaker: "CONSULTANT",
        targetKey: question.targetKey,
      },
      select: { id: true },
    });
    if (existing) continue;

    const latest = await prisma.consultationTurn.findFirst({
      where: { sessionId: input.sessionId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const sequence = (latest?.sequence ?? 0) + 1;
    const turn = await prisma.consultationTurn.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sequence,
        speaker: "CONSULTANT",
        body: question.text,
        targetKey: question.targetKey,
        followUp: false,
        questionContextJson: {
          requirementInterpretation: null,
          hiringTeamRoleId: "",
          whoCaresNote: "",
          interviewTypeTag: question.interviewTypeTag,
        } as Prisma.InputJsonValue,
      },
    });
    if (!question.content.trim()) continue;
    await prisma.consultationStatement.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        turnId: turn.id,
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: question.content,
        strengtheningNote: null,
        groundingJson: question.grounding as Prisma.InputJsonValue,
        promptVersion: ROLE_EXPERTISE_PROMPT_VERSION,
      },
    });
    const followUp = question.targetKey.startsWith(ASK_HARPER_TARGET_PREFIX)
      ? (question.followUpQuestion?.trim() ?? "")
      : "";
    if (!followUp) continue;
    await prisma.consultationTurn.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sequence: sequence + 1,
        speaker: "CONSULTANT",
        body: followUp,
        targetKey: question.targetKey,
        followUp: true,
        analysisJson: { replyToTurnId: turn.id } as Prisma.InputJsonValue,
        questionContextJson: {
          requirementInterpretation: null,
          hiringTeamRoleId: "",
          whoCaresNote: "",
          interviewTypeTag: question.interviewTypeTag,
        } as Prisma.InputJsonValue,
      },
    });
  }
}

export async function hasUsableRoleExpertiseReceipt(input: {
  organizationId: string;
  campaignId: string;
  job: RoleExpertiseJobInputs;
  minCount: number;
  maxCount: number;
}): Promise<boolean> {
  const employerResearch = await employerResearchForCampaign(
    input.organizationId,
    input.campaignId,
  );
  const fingerprint = roleExpertiseJobFingerprint(input.job, employerResearch);
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: "ROLE_EXPERTISE_QUESTIONS",
    subjectKey: input.campaignId,
  });
  if (!receipt || receipt.inputHash !== fingerprint) return false;
  try {
    const stored = parseStoredQuestions(receipt.resultJson);
    return isRoleExpertiseQuestionsResultUsable(stored, {
      minCount: input.minCount,
      maxCount: input.maxCount,
    });
  } catch {
    return false;
  }
}
