import type {
  CheatSheetCoachItem,
  CheatSheetPersonSection,
} from "@/lib/application-summary/contract";
import {
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

/**
 * Quality issues for one likely-questions item (reuses D2 tag overrides + D3 checks).
 */
export function validateLikelyQuestionItem(item: CheatSheetCoachItem): string[] {
  const issues: string[] = [];
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

/**
 * Compose sample answers, apply D2 tag overrides, drop duplicate career
 * walk-through when Harper already asked chronology, and WHO-sort.
 */
export function normalizePersonSectionLikelyQuestions(input: {
  likelyQuestions: CheatSheetCoachItem[];
  harperAskedCareerWalkThrough: boolean;
}): CheatSheetCoachItem[] {
  let items = input.likelyQuestions.map(normalizeOneLikelyQuestion);
  if (input.harperAskedCareerWalkThrough) {
    items = items.filter(
      (item) =>
        item.interviewTypeTag !== "chronological_walk_through" &&
        !looksLikeCareerWalkThrough(item.prompt),
    );
  }
  return sortLikelyQuestionsByWhoTag(items);
}
