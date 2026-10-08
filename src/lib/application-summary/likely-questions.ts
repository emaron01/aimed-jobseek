import type {
  CheatSheetCoachItem,
  CheatSheetPersonSection,
} from "@/lib/application-summary/contract";
import {
  CHEAT_SHEET_TARGET_PREFIX,
  CHRONOLOGY_TARGET_KEY,
  type AnswerFramework,
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

function partsGroundingFromItem(
  item: CheatSheetCoachItem,
): AnswerPartsGrounding | null {
  if (item.answerFramework !== "CAR" && item.answerFramework !== "STAR") {
    return null;
  }
  if (item.answerFramework === "CAR") {
    const challenge = fieldText(item.challenge);
    const action = fieldText(item.action);
    const result = fieldText(item.result);
    if (!challenge || !action || !result) return null;
    return { answerFramework: "CAR", challenge, action, result };
  }
  const situation = fieldText(item.situation);
  const task = fieldText(item.task);
  const action = fieldText(item.action);
  const result = fieldText(item.result);
  if (!situation || !task || !action || !result) return null;
  return { answerFramework: "STAR", situation, task, action, result };
}

export function composeSampleAnswerFromParts(item: CheatSheetCoachItem): string {
  const grounding = partsGroundingFromItem(item);
  if (!grounding) return fieldText(item.sampleAnswer);
  if (grounding.answerFramework === "CAR") {
    return composeInterviewAnswerFromParts([
      grounding.challenge ?? "",
      grounding.action,
      grounding.result,
    ]);
  }
  return composeInterviewAnswerFromParts([
    grounding.situation ?? "",
    grounding.task ?? "",
    grounding.action,
    grounding.result,
  ]);
}

function scanLabels(...fields: Array<string | null | undefined>): string | null {
  for (const field of fields) {
    if (field && containsFrameworkOrPartLabel(field)) {
      return "Do not name CAR, STAR, or label parts (Challenge:, Situation:, Task:, Action:, Result:) in any field.";
    }
  }
  return null;
}

export const LIKELY_QUESTION_MIN = 4;
export const LIKELY_QUESTION_MAX = 12;

/** A General question the person-section writer may reference by id or targetKey. */
export type SuppliedGeneralQuestion = {
  id: string;
  text: string;
  interviewTypeTag?: InterviewTypeTag | null;
  targetKey?: string | null;
};

/**
 * 4–12 is a save. Fewer than 4 retries once, then the shorter list is kept.
 * More than 12 is never accepted.
 */
export function personLikelyQuestionCountDecision(
  count: number,
  attemptIndex: number,
): "save" | "retry" | "accept-short" {
  if (count > LIKELY_QUESTION_MAX) return "retry";
  if (count >= LIKELY_QUESTION_MIN) return "save";
  return attemptIndex < 1 ? "retry" : "accept-short";
}

/**
 * Quality issues for one likely-questions item (reuses D2 tag overrides + D3 checks).
 * A reference to a General question does not need its own sample answer.
 */
export function validateLikelyQuestionItem(item: CheatSheetCoachItem): string[] {
  const issues: string[] = [];
  if (fieldText(item.generalQuestionId)) {
    if (!item.interviewTypeTag) {
      issues.push(
        "Every likelyQuestions item requires interviewTypeTag (screening, chronological_walk_through, focused_competency, or reference_check_prep).",
      );
    }
    if (!fieldText(item.prompt)) {
      issues.push("A referenced General question is missing its text.");
    }
    return issues;
  }
  if (!item.interviewTypeTag) {
    issues.push(
      "Every likelyQuestions item requires interviewTypeTag (screening, chronological_walk_through, focused_competency, or reference_check_prep).",
    );
  }
  const harperQuestion = fieldText(item.harperQuestion);
  const sampleAnswer = fieldText(item.sampleAnswer);
  const hasParts =
    item.answerFramework === "CAR" || item.answerFramework === "STAR";

  if (harperQuestion) {
    if (sampleAnswer || hasParts) {
      issues.push(
        "When harperQuestion is set, sampleAnswer and answer parts must be null.",
      );
    }
    const labelIssue = scanLabels(item.prompt, item.harperQuestion);
    if (labelIssue) issues.push(labelIssue);
    return issues;
  }

  if (!hasParts) {
    issues.push(
      'Return answerFramework "CAR" or "STAR" with each required part as its own field for sampleAnswer items.',
    );
    return issues;
  }

  if (item.answerFramework === "CAR") {
    if (!fieldText(item.challenge)) {
      issues.push("The challenge part was missing or empty.");
    }
    if (!fieldText(item.action)) {
      issues.push("The action part was missing or empty.");
    }
    if (!fieldText(item.result)) {
      issues.push("The result part was missing or empty.");
    }
  } else {
    if (!fieldText(item.situation)) {
      issues.push("The situation part was missing or empty.");
    }
    if (!fieldText(item.task)) {
      issues.push("The task part was missing or empty.");
    }
    if (!fieldText(item.action)) {
      issues.push("The action part was missing or empty.");
    }
    if (!fieldText(item.result)) {
      issues.push("The result part was missing or empty.");
    }
  }

  if (fieldText(item.result) && !resultStatesOutcome(item.result ?? "")) {
    issues.push(
      "The result must state what changed or what happened because of the person's action. A number is welcome when the facts include one but is never required.",
    );
  }

  const labelIssue = scanLabels(
    item.prompt,
    item.challenge,
    item.situation,
    item.task,
    item.action,
    item.result,
    item.sampleAnswer,
  );
  if (labelIssue) issues.push(labelIssue);
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

function normalizeOneLikelyQuestion(item: CheatSheetCoachItem): CheatSheetCoachItem {
  const modelTag = (item.interviewTypeTag ??
    "focused_competency") as InterviewTypeTag;
  const interviewTypeTag = resolveInterviewTypeTag({
    targetKey: looksLikeCareerWalkThrough(item.prompt)
      ? CHRONOLOGY_TARGET_KEY
      : "",
    text: item.prompt,
    modelTag,
  });
  const harperQuestion = fieldText(item.harperQuestion) || null;
  if (harperQuestion) {
    return {
      ...item,
      interviewTypeTag,
      harperQuestion,
      sampleAnswer: null,
      answerFramework: null,
      challenge: null,
      situation: null,
      task: null,
      action: null,
      result: null,
    };
  }
  const composed = composeSampleAnswerFromParts(item);
  return {
    ...item,
    interviewTypeTag,
    harperQuestion: null,
    sampleAnswer: composed || fieldText(item.sampleAnswer) || null,
    answerFramework: (item.answerFramework ?? null) as AnswerFramework | null,
    challenge: fieldText(item.challenge) || null,
    situation: fieldText(item.situation) || null,
    task: fieldText(item.task) || null,
    action: fieldText(item.action) || null,
    result: fieldText(item.result) || null,
  };
}

function suppliedGeneralQuestions(
  questions: readonly SuppliedGeneralQuestion[],
): Map<string, SuppliedGeneralQuestion> {
  const byId = new Map<string, SuppliedGeneralQuestion>();
  for (const question of questions) {
    const id = question.id.trim();
    if (id) byId.set(id, question);
    const targetKey = question.targetKey?.trim() ?? "";
    if (targetKey) byId.set(targetKey, question);
  }
  return byId;
}

function hasOwnQuestionContent(item: CheatSheetCoachItem): boolean {
  if (!fieldText(item.prompt)) return false;
  if (fieldText(item.harperQuestion)) return true;
  if (item.answerFramework === "CAR" || item.answerFramework === "STAR") return true;
  return fieldText(item.sampleAnswer).length > 0;
}

function isCareerWalkThroughItem(item: CheatSheetCoachItem): boolean {
  return (
    item.interviewTypeTag === "chronological_walk_through" ||
    looksLikeCareerWalkThrough(item.prompt)
  );
}

/**
 * Resolve General-question references, compose new questions, and drop a
 * chronological walk-through (new or referenced) when Harper already asked it.
 * Writer order is kept. The walk-through filter can leave fewer than 4 items;
 * the caller then retries once and saves the shorter list.
 */
export function resolvePersonLikelyQuestions(input: {
  likelyQuestions: CheatSheetCoachItem[];
  harperAskedCareerWalkThrough: boolean;
  generalQuestions?: readonly SuppliedGeneralQuestion[];
}): { items: CheatSheetCoachItem[]; unusedReferenceIds: string[] } {
  const supplied = suppliedGeneralQuestions(input.generalQuestions ?? []);
  const unusedReferenceIds: string[] = [];
  const items: CheatSheetCoachItem[] = [];
  for (const raw of input.likelyQuestions) {
    const referenceId = fieldText(raw.generalQuestionId);
    if (referenceId) {
      const match = supplied.get(referenceId);
      if (!match || !fieldText(match.text)) {
        unusedReferenceIds.push(referenceId);
        if (hasOwnQuestionContent(raw)) {
          items.push(
            normalizeOneLikelyQuestion({ ...raw, generalQuestionId: null }),
          );
        }
        continue;
      }
      items.push(
        normalizeOneLikelyQuestion({
          ...raw,
          generalQuestionId: match.id,
          prompt: match.text,
          interviewTypeTag: (match.interviewTypeTag ??
            raw.interviewTypeTag ??
            "focused_competency") as InterviewTypeTag,
          sampleAnswer: null,
          harperQuestion: null,
          answerFramework: null,
          challenge: null,
          situation: null,
          task: null,
          action: null,
          result: null,
        }),
      );
      continue;
    }
    items.push(normalizeOneLikelyQuestion({ ...raw, generalQuestionId: null }));
  }
  const filtered = input.harperAskedCareerWalkThrough
    ? items.filter((item) => !isCareerWalkThroughItem(item))
    : items;
  return { items: filtered, unusedReferenceIds };
}

/**
 * Compose sample answers, apply D2 tag overrides, and drop a duplicate career
 * walk-through when Harper already asked chronology. Keeps writer order.
 */
export function normalizePersonSectionLikelyQuestions(input: {
  likelyQuestions: CheatSheetCoachItem[];
  harperAskedCareerWalkThrough: boolean;
  generalQuestions?: readonly SuppliedGeneralQuestion[];
}): CheatSheetCoachItem[] {
  return resolvePersonLikelyQuestions(input).items;
}

function referencedGeneralId(item: CheatSheetCoachItem): string | null {
  const id = item.generalQuestionId?.trim();
  return id ? id : null;
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
 * The writer's new list replaces the stored one.
 * A question the seeker edited, answered, or approved stays, including when
 * the writer omitted it or wrote a new version of it.
 * The writer's 4–12 range applies to `incoming` before this merge.
 */
export function mergePersonLikelyQuestions(input: {
  existing: CheatSheetCoachItem[];
  incoming: CheatSheetCoachItem[];
  seekerKeptIds?: ReadonlySet<string>;
}): CheatSheetCoachItem[] {
  const seekerKeptIds = input.seekerKeptIds ?? new Set<string>();
  const protectedItems = input.existing.filter((item) => {
    const id = item.id?.trim();
    return Boolean(id && seekerKeptIds.has(id));
  });
  const usedProtected = new Set<string>();
  const result: CheatSheetCoachItem[] = [];

  const matchesProtected = (item: CheatSheetCoachItem): CheatSheetCoachItem | null => {
    const generalId = referencedGeneralId(item);
    if (generalId) {
      const byGeneral = protectedItems.find((existing) => {
        const id = existing.id?.trim() ?? "";
        return !usedProtected.has(id) && referencedGeneralId(existing) === generalId;
      });
      if (byGeneral) return byGeneral;
    }
    const prompt = item.prompt.trim();
    return (
      protectedItems.find((existing) => {
        const id = existing.id?.trim() ?? "";
        return !usedProtected.has(id) && questionTextNearDuplicate(existing.prompt, prompt);
      }) ?? null
    );
  };

  const alreadyListed = (item: CheatSheetCoachItem): boolean => {
    const generalId = referencedGeneralId(item);
    if (generalId && result.some((existing) => referencedGeneralId(existing) === generalId)) {
      return true;
    }
    const prompt = item.prompt.trim();
    return result.some((existing) => questionTextNearDuplicate(existing.prompt, prompt));
  };

  for (const item of input.incoming) {
    const kept = matchesProtected(item);
    if (kept) {
      usedProtected.add(kept.id?.trim() ?? "");
      if (!alreadyListed(kept)) result.push(kept);
      continue;
    }
    if (alreadyListed(item)) continue;
    result.push(item);
  }
  for (const item of protectedItems) {
    const id = item.id?.trim() ?? "";
    if (usedProtected.has(id) || alreadyListed(item)) continue;
    result.push(item);
  }
  return result;
}
