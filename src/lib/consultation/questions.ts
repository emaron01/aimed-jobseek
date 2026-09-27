import type { EvidenceAssessment } from "@/lib/consultation/assess";
import {
  openGaps,
  requirementMeaning,
  sameRequirementMeaning,
} from "@/lib/consultation/assess";
import {
  WHY_THIS_COMPANY_TARGET_KEY,
  type AskedConsultationQuestion,
} from "@/lib/consultation/contract";
import { replyToTurnIdFromAnalysis } from "@/lib/consultation/qa-view";
import { consultationConfig, consultationConversationCopy } from "@/lib/product-config/consultation";

export type PlannedQuestion = {
  targetKey: string;
  followUp: boolean;
  text: string;
  requirementInterpretation: string | null;
  hiringTeamRoleId: string;
  whoCaresNote: string;
};

export type DroppedQuestion = {
  targetKey: string;
  reason: string;
};

export type QuestionRoundPlan = {
  questions: PlannedQuestion[];
  dropped: DroppedQuestion[];
};

const SENIOR_ROLE =
  /\b(senior|staff|principal|director|lead|manager|head|vp|vice|executive|chief)\b/i;

export function seniorityWarrantsChronology(input: {
  seniority: string | null;
  title: string | null;
}): boolean {
  return SENIOR_ROLE.test(`${input.seniority ?? ""} ${input.title ?? ""}`);
}

export function validModelQuestion(text: string): boolean {
  return Boolean(text.trim());
}

function normalizedQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function questionNearDuplicate(left: string, right: string): boolean {
  const a = normalizedQuestion(left);
  const b = normalizedQuestion(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length <= b.length ? a : b;
    if (shorter.length >= 24) return true;
  }
  return sameRequirementMeaning(left, right);
}

export function questionDuplicatesAsked(
  text: string,
  askedQuestions: readonly AskedConsultationQuestion[],
): boolean {
  return askedQuestions.some((asked) => questionNearDuplicate(text, asked.text));
}

export function askedQuestionsFromTurns(
  turns: Array<{
    id: string;
    speaker: "CONSULTANT" | "SEEKER";
    body: string;
    targetKey: string | null;
    followUp: boolean;
    skipped: boolean;
    intent?: string | null;
    analysisJson?: unknown;
  }>,
): AskedConsultationQuestion[] {
  const asked: AskedConsultationQuestion[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "CONSULTANT") continue;
    if (turn.intent === "CLOSING") continue;
    const text = turn.body.trim();
    if (!text) continue;
    const answered = turns.some(
      (reply) =>
        reply.speaker === "SEEKER" &&
        !reply.skipped &&
        reply.body.trim().length > 0 &&
        (replyToTurnIdFromAnalysis(reply.analysisJson) === turn.id ||
          (!replyToTurnIdFromAnalysis(reply.analysisJson) &&
            Boolean(turn.targetKey) &&
            reply.targetKey === turn.targetKey)),
    );
    asked.push({
      text,
      answered,
      targetKey: turn.targetKey,
      followUp: turn.followUp,
    });
  }
  return asked;
}

function targetMeaning(text: string): string {
  return requirementMeaning(text);
}

export function looksLikeTemplatedUnseenQuestion(text: string): boolean {
  return /harper does not see/i.test(text);
}

export function questionNeedsRoleSource(input: {
  gapText: string;
  profileItems?: Array<{
    itemType?: string;
    title?: string | null;
    employer?: string | null;
    text: string;
  }>;
}): boolean {
  const mentionsYears = /\b\d+\s+years?\b/i.test(input.gapText);
  if (!mentionsYears && !/\bbackground\b/i.test(input.gapText)) return false;
  const tied = (input.profileItems ?? []).some(
    (item) =>
      item.itemType === "EXPERIENCE" &&
      Boolean(item.title?.trim() || item.employer?.trim()) &&
      sameRequirementMeaning(item.text, input.gapText),
  );
  return !tied;
}

type GapProfileItem = {
  itemType?: string;
  title?: string | null;
  employer?: string | null;
  text: string;
};

function withRoleSourceAsk(
  text: string,
  gap: Pick<EvidenceAssessment, "text">,
  profileItems?: GapProfileItem[],
): string {
  if (
    questionNeedsRoleSource({ gapText: gap.text, profileItems }) &&
    !/which roles?/i.test(text)
  ) {
    return `${text} Which roles did that come from?`;
  }
  return text;
}

export function defaultGapShareQuestion(
  gap: Pick<EvidenceAssessment, "key" | "text">,
  profileItems?: GapProfileItem[],
): string {
  if (gap.key === WHY_THIS_COMPANY_TARGET_KEY) {
    return consultationConversationCopy.whyThisCompanyQuestion;
  }
  return withRoleSourceAsk(
    "What in your background speaks to this?",
    gap,
    profileItems,
  );
}

export function questionTextForGap(
  gap: Pick<EvidenceAssessment, "key" | "text">,
  modelText?: string | null,
  profileItems?: GapProfileItem[],
): string {
  if (gap.key === WHY_THIS_COMPANY_TARGET_KEY) {
    return (
      modelText?.trim() || consultationConversationCopy.whyThisCompanyQuestion
    );
  }
  const written = modelText?.trim() ?? "";
  if (!written || looksLikeTemplatedUnseenQuestion(written)) {
    return "";
  }
  return withRoleSourceAsk(written, gap, profileItems);
}

export function matchConsultationFocus(input: {
  focusTargetKey?: string | null;
  focusNote?: string | null;
  targets: Array<{ key: string; text: string }>;
}): string | null {
  const keyed = input.focusTargetKey?.trim();
  if (keyed && input.targets.some((target) => target.key === keyed)) {
    return keyed;
  }
  const note = input.focusNote?.trim().toLowerCase() ?? "";
  if (!note) return null;
  const noteTokens = new Set(
    note
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
  let best: { key: string; score: number } | null = null;
  for (const target of input.targets) {
    const matched = target.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && noteTokens.has(token));
    const score = matched.length;
    const distinctive = matched.some((token) => token.length >= 6);
    if ((score >= 2 || (score >= 1 && distinctive)) && (!best || score > best.score)) {
      best = { key: target.key, score };
    }
  }
  return best?.key ?? null;
}

function questionForGap(input: {
  gap: EvidenceAssessment;
  modelQuestion:
    | {
        targetKey: string;
        text: string;
        requirementInterpretation: string | null;
        hiringTeamRoleId: string;
        whoCaresNote: string;
      }
    | undefined;
  hiringTeam: Array<{ id: string; name: string }>;
  rolesById: Map<string, { id: string; name: string }>;
  profileItems?: GapProfileItem[];
}): { question: PlannedQuestion } | { dropped: DroppedQuestion } {
  const { gap, modelQuestion } = input;
  const role =
    (modelQuestion
      ? input.rolesById.get(modelQuestion.hiringTeamRoleId)
      : undefined) ?? input.hiringTeam[0];
  if (!role) {
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          "No hiring-team role was available to attach this question to.",
      },
    };
  }
  const text = questionTextForGap(gap, modelQuestion?.text, input.profileItems);
  if (!text) {
    return {
      dropped: {
        targetKey: gap.key,
        reason: "The model did not return a question for this requirement.",
      },
    };
  }
  return {
    question: {
      targetKey: gap.key,
      followUp: false,
      text,
      requirementInterpretation:
        modelQuestion?.requirementInterpretation?.trim() || null,
      hiringTeamRoleId: role.id,
      whoCaresNote:
        modelQuestion?.whoCaresNote.trim() ||
        `${role.name} will hear the answer to this question.`,
    },
  };
}

export function selectGapsForRound(input: {
  assessments: EvidenceAssessment[];
  askedKeys: ReadonlySet<string>;
  skippedKeys: ReadonlySet<string>;
  focusTargetKey?: string | null;
  remainingQuestionSlots?: number;
}): EvidenceAssessment[] {
  const askedKeys = new Set(input.askedKeys);
  if (input.focusTargetKey) askedKeys.delete(input.focusTargetKey);
  const coveredMeanings = new Set(
    input.assessments
      .filter(
        (assessment) =>
          askedKeys.has(assessment.key) ||
          input.skippedKeys.has(assessment.key),
      )
      .map((assessment) => targetMeaning(assessment.text)),
  );
  const gaps = openGaps(input.assessments).filter(
    (gap) =>
      !askedKeys.has(gap.key) &&
      !input.skippedKeys.has(gap.key) &&
      !coveredMeanings.has(targetMeaning(gap.text)),
  );
  const focus = input.focusTargetKey
    ? input.assessments.find(
        (assessment) =>
          assessment.key === input.focusTargetKey &&
          assessment.strength !== "STRONG",
      )
    : undefined;
  if (focus) {
    if (!gaps.some((gap) => gap.key === focus.key)) {
      gaps.unshift(focus);
    } else {
      const remaining = gaps.filter((gap) => gap.key !== focus.key);
      gaps.splice(0, gaps.length, focus, ...remaining);
    }
  } else {
    const why = gaps.find((gap) => gap.key === WHY_THIS_COMPANY_TARGET_KEY);
    if (why) {
      const remaining = gaps.filter((gap) => gap.key !== WHY_THIS_COMPANY_TARGET_KEY);
      gaps.splice(0, gaps.length, why, ...remaining);
    }
  }
  const selected: EvidenceAssessment[] = [];
  const selectedMeanings = new Set<string>();
  const selectionLimit = Math.min(
    consultationConfig.roundSize,
    input.remainingQuestionSlots ?? consultationConfig.applicationQuestionLimit,
  );
  for (const gap of gaps) {
    if (selected.length >= selectionLimit) break;
    const meaning = targetMeaning(gap.text);
    if (selectedMeanings.has(meaning)) continue;
    selected.push(gap);
    selectedMeanings.add(meaning);
  }
  return selected;
}

export function planQuestionRound(input: {
  assessments: EvidenceAssessment[];
  modelQuestions: Array<{
    targetKey: string;
    text: string;
    requirementInterpretation: string | null;
    hiringTeamRoleId: string;
    whoCaresNote: string;
  }>;
  hiringTeam: Array<{ id: string; name: string }>;
  askedKeys: ReadonlySet<string>;
  skippedKeys: ReadonlySet<string>;
  includeChronology: boolean;
  chronologyAsked: boolean;
  askedQuestions?: readonly AskedConsultationQuestion[];
  focusTargetKey?: string | null;
  profileItems?: GapProfileItem[];
}): QuestionRoundPlan {
  const askedQuestions = input.askedQuestions ?? [];
  const remainingQuestionSlots = Math.max(
    0,
    consultationConfig.applicationQuestionLimit - askedQuestions.length,
  );
  const selected = selectGapsForRound({
    assessments: input.assessments,
    askedKeys: input.askedKeys,
    skippedKeys: input.skippedKeys,
    focusTargetKey: input.focusTargetKey,
    remainingQuestionSlots,
  });
  const byKey = new Map(
    input.modelQuestions
      .filter((question) => question.text.trim())
      .filter((question) => !questionDuplicatesAsked(question.text, askedQuestions))
      .map((question) => [question.targetKey, question]),
  );
  const rolesById = new Map(input.hiringTeam.map((role) => [role.id, role]));
  const questions: PlannedQuestion[] = [];
  const dropped: DroppedQuestion[] = [];
  if (remainingQuestionSlots === 0) {
    return { questions, dropped };
  }
  for (const gap of selected) {
    const result = questionForGap({
      gap,
      modelQuestion: byKey.get(gap.key),
      hiringTeam: input.hiringTeam,
      rolesById,
      profileItems: input.profileItems,
    });
    if ("dropped" in result) {
      dropped.push(result.dropped);
      continue;
    }
    if (questionDuplicatesAsked(result.question.text, askedQuestions)) {
      dropped.push({
        targetKey: gap.key,
        reason: "already-asked",
      });
      continue;
    }
    questions.push(result.question);
  }
  const chronologyAlreadyAsked =
    input.chronologyAsked ||
    askedQuestions.some((question) => question.targetKey === "chronology");
  if (
    input.includeChronology &&
    !chronologyAlreadyAsked &&
    questions.length === 0
  ) {
    const modelQuestion = byKey.get("chronology");
    const role = modelQuestion
      ? rolesById.get(modelQuestion.hiringTeamRoleId)
      : null;
    if (!modelQuestion || !role) {
      dropped.push({
        targetKey: "chronology",
        reason: "The model did not return a chronology question.",
      });
    } else if (questionDuplicatesAsked(modelQuestion.text, askedQuestions)) {
      dropped.push({
        targetKey: "chronology",
        reason: "already-asked",
      });
    } else {
      questions.push({
        targetKey: "chronology",
        followUp: false,
        text: modelQuestion.text.trim(),
        requirementInterpretation:
          modelQuestion.requirementInterpretation?.trim() || null,
        hiringTeamRoleId: role.id,
        whoCaresNote: modelQuestion.whoCaresNote.trim(),
      });
    }
  }
  return {
    questions: questions.slice(0, remainingQuestionSlots),
    dropped,
  };
}
