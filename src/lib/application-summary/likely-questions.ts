import type {
  CheatSheetCoachItem,
  CheatSheetPersonSection,
} from "@/lib/application-summary/contract";
import type { ApprovedInterviewAnswer } from "@/lib/application-summary/approved-answers";
import {
  CHEAT_SHEET_TARGET_PREFIX,
  CHRONOLOGY_TARGET_KEY,
  type InterviewTypeTag,
} from "@/lib/consultation/contract";
import {
  looksLikeCareerWalkThrough,
  resolveInterviewTypeTag,
} from "@/lib/consultation/questions";
import { questionTextNearDuplicate } from "@/lib/consultation/general-question-match";
import { replyToTurnIdFromAnalysis } from "@/lib/consultation/qa-view";
import { careerWalkThroughAlreadyAsked } from "@/lib/consultation/question-detection";

const WHO_TAG_ORDER: InterviewTypeTag[] = [
  "screening",
  "chronological_walk_through",
  "focused_competency",
  "reference_check_prep",
];

function fieldText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function whoTagRank(tag: InterviewTypeTag | undefined): number {
  const resolved = tag ?? "focused_competency";
  const index = WHO_TAG_ORDER.indexOf(resolved);
  return index >= 0 ? index : WHO_TAG_ORDER.indexOf("focused_competency");
}

/** Invisible WHO order for likely questions (missing tag → focused_competency). */
export function sortLikelyQuestionsByWhoTag(
  items: CheatSheetCoachItem[],
): CheatSheetCoachItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rank =
        whoTagRank(left.item.interviewTypeTag) -
        whoTagRank(right.item.interviewTypeTag);
      if (rank !== 0) return rank;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

/** Shared one-walk-through check across coach, role-expertise, and Cheat Sheet. */
export function harperAlreadyAskedCareerWalkThrough(
  turns: Array<{ speaker: string; targetKey: string | null; body: string }>,
): boolean {
  return careerWalkThroughAlreadyAsked(turns);
}

/**
 * A person likely question needs its own wording and a tag.
 * The answer is copied from an approved statement, or left blank.
 */
export function validateLikelyQuestionItem(item: CheatSheetCoachItem): string[] {
  const issues: string[] = [];
  if (!item.interviewTypeTag) {
    issues.push(
      "Every likelyQuestions item requires interviewTypeTag (screening, chronological_walk_through, focused_competency, or reference_check_prep).",
    );
  }
  if (!fieldText(item.prompt)) {
    issues.push("A likely question is missing its text.");
  }
  return issues;
}

export function validatePersonSectionLikelyQuestions(
  section: Pick<CheatSheetPersonSection, "likelyQuestions">,
): string[] {
  const issues: string[] = [];
  for (const [index, item] of section.likelyQuestions.entries()) {
    for (const issue of validateLikelyQuestionItem(item)) {
      issues.push(`likelyQuestions[${index}]: ${issue}`);
    }
  }
  return issues;
}

export type PersonLikelyQuestionDraft = {
  prompt: string;
  approvedAnswerId?: string | null;
  interviewTypeTag?: InterviewTypeTag | null;
  id?: string;
};

function isCareerWalkThroughItem(item: {
  prompt: string;
  interviewTypeTag?: InterviewTypeTag | null;
}): boolean {
  return (
    item.interviewTypeTag === "chronological_walk_through" ||
    looksLikeCareerWalkThrough(item.prompt)
  );
}

function clearedAnswer(sampleAnswer: string | null): Pick<
  CheatSheetCoachItem,
  | "sampleAnswer"
  | "harperQuestion"
  | "answerFramework"
  | "challenge"
  | "situation"
  | "task"
  | "action"
  | "result"
  | "generalQuestionId"
  | "supports"
> {
  return {
    sampleAnswer,
    harperQuestion: null,
    answerFramework: null,
    challenge: null,
    situation: null,
    task: null,
    action: null,
    result: null,
    generalQuestionId: null,
    supports: [],
  };
}

/**
 * Keep the model's question text. Copy an approved answer only when its id
 * matches. An unknown or null id leaves the answer blank. Drop a career
 * walk-through when Harper has already asked one. Writer order is kept.
 */
export function resolvePersonLikelyQuestions(input: {
  likelyQuestions: readonly PersonLikelyQuestionDraft[];
  harperAskedCareerWalkThrough: boolean;
  approvedAnswers: readonly ApprovedInterviewAnswer[];
}): CheatSheetCoachItem[] {
  const answers = new Map(
    input.approvedAnswers
      .filter((answer) => answer.id.trim() && answer.content.trim())
      .map((answer) => [answer.id.trim(), answer.content]),
  );
  const items: CheatSheetCoachItem[] = [];
  for (const raw of input.likelyQuestions) {
    const prompt = fieldText(raw.prompt);
    if (!prompt) continue;
    const modelTag = (raw.interviewTypeTag ??
      "focused_competency") as InterviewTypeTag;
    const interviewTypeTag = resolveInterviewTypeTag({
      targetKey: looksLikeCareerWalkThrough(prompt) ? CHRONOLOGY_TARGET_KEY : "",
      text: prompt,
      modelTag,
    });
    const approvedId = fieldText(raw.approvedAnswerId);
    const copied = approvedId ? answers.get(approvedId) : undefined;
    items.push({
      id: raw.id,
      prompt,
      interviewTypeTag,
      ...clearedAnswer(copied ?? null),
    });
  }
  if (!input.harperAskedCareerWalkThrough) return items;
  return items.filter((item) => !isCareerWalkThroughItem(item));
}

/**
 * Question ids the seeker edited (a saved sample), answered, or approved.
 * A skipped reply does not keep the question.
 */
export function seekerKeptLikelyQuestionIds(input: {
  questionIds: readonly string[];
  turns: ReadonlyArray<{
    id: string;
    speaker: string;
    targetKey: string | null;
    skipped?: boolean;
    analysisJson?: unknown;
  }>;
  statements: ReadonlyArray<{
    turnId: string;
    kind: string;
  }>;
}): Set<string> {
  const wanted = new Set(input.questionIds.map((id) => id.trim()).filter(Boolean));
  const questionIdFromTarget = (targetKey: string | null | undefined): string | null => {
    if (!targetKey?.startsWith(CHEAT_SHEET_TARGET_PREFIX)) return null;
    const id = targetKey.slice(CHEAT_SHEET_TARGET_PREFIX.length).trim();
    return wanted.has(id) ? id : null;
  };
  const consultantTurnToQuestion = new Map<string, string>();
  for (const turn of input.turns) {
    if (turn.speaker !== "CONSULTANT") continue;
    const questionId = questionIdFromTarget(turn.targetKey);
    if (questionId) consultantTurnToQuestion.set(turn.id, questionId);
  }
  const kept = new Set<string>();
  for (const statement of input.statements) {
    if (statement.kind !== "INTERVIEW_ANSWER") continue;
    const questionId = consultantTurnToQuestion.get(statement.turnId);
    if (questionId) kept.add(questionId);
  }
  for (const turn of input.turns) {
    if (turn.speaker !== "SEEKER" || turn.skipped) continue;
    const direct = questionIdFromTarget(turn.targetKey);
    if (direct) {
      kept.add(direct);
      continue;
    }
    const pinned = replyToTurnIdFromAnalysis(turn.analysisJson);
    const questionId = pinned ? consultantTurnToQuestion.get(pinned) : undefined;
    if (questionId) kept.add(questionId);
  }
  return kept;
}

/**
 * Questions the seeker has answered or kept stay exactly as stored.
 * New questions fill the remaining slots up to max, skipping near-duplicates
 * of questions already on the list. A stored Harper reference with no guide
 * answer from the seeker is not kept.
 * Seeker-kept questions stay even when they already exceed max.
 */
export function mergePersonLikelyQuestions(input: {
  existing: CheatSheetCoachItem[];
  incoming: CheatSheetCoachItem[];
  seekerKeptIds?: ReadonlySet<string>;
  max: number;
}): CheatSheetCoachItem[] {
  const seekerKeptIds = input.seekerKeptIds ?? new Set<string>();
  const limit = Number.isInteger(input.max) && input.max > 0 ? input.max : 0;
  const kept = input.existing.filter((item) => {
    const id = item.id?.trim();
    return Boolean(id && seekerKeptIds.has(id));
  });
  const result: CheatSheetCoachItem[] = [...kept];
  for (const item of input.incoming) {
    if (result.length >= limit) break;
    const prompt = item.prompt.trim();
    if (!prompt) continue;
    if (result.some((existing) => questionTextNearDuplicate(existing.prompt, prompt))) {
      continue;
    }
    result.push(item);
  }
  return result;
}
