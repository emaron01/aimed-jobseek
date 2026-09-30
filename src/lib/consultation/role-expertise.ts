/**
 * Harper role-expertise coaching fill (Batch D6).
 * Fills the General coaching set to 20–25 questions after the gap plan.
 */

import { z } from "zod";
import {
  fingerprintPaidCallInputs,
  findPaidCallReceipt,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext } from "@/lib/ai/types";
import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import type { CareerStage } from "@/lib/consultation/career-stage";
import {
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
import { ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";
import { consultationConfig } from "@/lib/product-config/consultation";
import { parseStringArray } from "@/lib/research";
import { aiCallTracking } from "@/lib/usage/ai-call";
import { prisma } from "@/lib/prisma-client";
import type { Prisma } from "@prisma/client";

export const ROLE_EXPERTISE_PROMPT_VERSION = "2";

export const COACHING_SET_MIN = 20;
export const COACHING_SET_MAX = 25;

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

export const roleExpertiseResultSchema = z.object({
  questions: z.array(roleExpertiseQuestionSchema),
});

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

/** Job inputs only — profile changes do not change this fingerprint. */
export function roleExpertiseJobFingerprint(
  job: RoleExpertiseJobInputs,
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
  });
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
};

export function validateRoleExpertiseQuestions(input: {
  questions: RoleExpertiseQuestion[];
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
}): { valid: ValidatedRoleExpertiseQuestion[]; issues: string[] } {
  const issues: string[] = [];
  const valid: ValidatedRoleExpertiseQuestion[] = [];
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

    const composed = composedAnswerFromRoleExpertiseQuestion({
      ...raw,
      text,
      interviewTypeTag,
    });
    if (!composed) {
      issues.push(
        "Every question needs a suggested answer with all CAR or STAR parts, a result that states an outcome, and no framework or part labels.",
      );
      continue;
    }

    valid.push({
      text,
      targetKey,
      interviewTypeTag,
      content: composed.content,
      grounding: composed.grounding,
    });
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

function buildRoleExpertiseMessages(input: {
  minCount: number;
  maxCount: number;
  askedQuestions: AskedConsultationQuestion[];
  chronologyAlreadyAsked: boolean;
  recentRoles: RecentRole[];
  careerStage: CareerStage;
  jobSources: Record<string, unknown>;
  profileItems: unknown[];
  qualityFeedback?: string[];
}) {
  return [
    {
      role: "system" as const,
      content: `Prompt version: ${ROLE_EXPERTISE_PROMPT_VERSION}

${ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS}`,
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
        personalProfileItems: input.profileItems,
        qualityFeedback: input.qualityFeedback ?? [],
      }),
    },
  ];
}

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
      keptAfterPartial: number | null;
    }
  | { ok: false; message: string; skipped: boolean }
> {
  if (input.maxCount === 0) {
    return {
      ok: true,
      questions: [],
      skipped: true,
      keptAfterPartial: null,
    };
  }
  if (!isConsultationAiConfigured()) {
    return {
      ok: false,
      skipped: false,
      message: "Consultation AI is not configured for role-expertise questions.",
    };
  }

  const fingerprint = roleExpertiseJobFingerprint(input.job);
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
  };

  let qualityFeedback: string[] = [];
  let lastValid: ValidatedRoleExpertiseQuestion[] = [];
  let skipped = false;

  try {
    const gated = await runPaidStructuredCall<RoleExpertiseResult>({
      organizationId: input.organizationId,
      operation: "ROLE_EXPERTISE_QUESTIONS",
      subjectKey: input.campaignId,
      inputFingerprint: fingerprint,
      parseStored: (json) => roleExpertiseResultSchema.parse(json),
      isResultUsable: (stored) =>
        isRoleExpertiseResultUsable(stored, {
          minCount: input.minCount,
          maxCount: input.maxCount,
        }),
      callProvider: async () => {
        let data: RoleExpertiseResult = { questions: [] };
        for (
          let attempt = 0;
          attempt <= consultationConfig.qualityRegenerationAttempts;
          attempt += 1
        ) {
          const response = await getConsultationAiProvider().generateStructured({
            ...structuredOutputRequest("roleExpertiseQuestions"),
            ...(input.usage ? aiCallTracking(input.usage) : {}),
            messages: buildRoleExpertiseMessages({
              minCount: input.minCount,
              maxCount: input.maxCount,
              askedQuestions: input.askedQuestions,
              chronologyAlreadyAsked: input.chronologyAlreadyAsked,
              recentRoles: input.recentRoles,
              careerStage: input.careerStage,
              jobSources,
              profileItems: input.profileItems,
              qualityFeedback,
            }),
            parseOutput: (raw) => ({
              data: roleExpertiseResultSchema.parse(raw),
              coercedFields: [],
            }),
          });
          data = response.data;
          const checked = validateRoleExpertiseQuestions({
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
                answerFramework: item.grounding.answerFramework,
                challenge: item.grounding.challenge ?? null,
                situation: item.grounding.situation ?? null,
                task: item.grounding.task ?? null,
                action: item.grounding.action,
                result: item.grounding.result,
              })),
            };
          }
          if (lastAttempt) {
            // Keep every question that passed; never block Harper.
            return {
              questions: checked.valid.map((item) => ({
                text: item.text,
                interviewTypeTag: item.interviewTypeTag,
                answerFramework: item.grounding.answerFramework,
                challenge: item.grounding.challenge ?? null,
                situation: item.grounding.situation ?? null,
                task: item.grounding.task ?? null,
                action: item.grounding.action,
                result: item.grounding.result,
              })),
            };
          }
          qualityFeedback = checked.issues;
        }
        return data;
      },
    });

    skipped = gated.skipped;
    const checked = validateRoleExpertiseQuestions({
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
      questions: checked.valid,
      skipped,
      keptAfterPartial: partial,
    };
  } catch (error) {
    if (lastValid.length > 0) {
      return {
        ok: true,
        questions: lastValid,
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
  }
}

export async function hasUsableRoleExpertiseReceipt(input: {
  organizationId: string;
  campaignId: string;
  job: RoleExpertiseJobInputs;
  minCount: number;
  maxCount: number;
}): Promise<boolean> {
  const fingerprint = roleExpertiseJobFingerprint(input.job);
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: "ROLE_EXPERTISE_QUESTIONS",
    subjectKey: input.campaignId,
  });
  if (!receipt || receipt.inputHash !== fingerprint) return false;
  try {
    const stored = roleExpertiseResultSchema.parse(receipt.resultJson);
    return isRoleExpertiseResultUsable(stored, {
      minCount: input.minCount,
      maxCount: input.maxCount,
    });
  } catch {
    return false;
  }
}
