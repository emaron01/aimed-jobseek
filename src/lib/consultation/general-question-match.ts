import { sameRequirementMeaning } from "@/lib/consultation/assess";
import type { InterviewTypeTag } from "@/lib/consultation/contract";
import { questionIntentClass } from "@/lib/consultation/question-detection";
import { questionNearDuplicate } from "@/lib/consultation/questions";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";

function normalizedQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * questionNearDuplicate without an intent-class-only match.
 * Text equality, long containment, and same requirement meaning still count.
 */
export function questionTextNearDuplicate(left: string, right: string): boolean {
  if (!questionNearDuplicate(left, right)) return false;
  const a = normalizedQuestion(left);
  const b = normalizedQuestion(right);
  if (a && a === b) return true;
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length <= b.length ? a : b;
    if (shorter.length >= 24) return true;
  }
  if (sameRequirementMeaning(left, right)) return true;
  const leftIntent = questionIntentClass(left);
  const rightIntent = questionIntentClass(right);
  if (leftIntent && leftIntent === rightIntent) return false;
  return false;
}

export function interviewerQuestionMatchesGeneral(input: {
  interviewerText: string;
  interviewerTag?: InterviewTypeTag | null;
  generalText: string;
  generalTag?: InterviewTypeTag | null;
}): boolean {
  const interviewerTag = input.interviewerTag ?? null;
  const generalTag = input.generalTag ?? null;
  if (interviewerTag && generalTag && interviewerTag !== generalTag) return false;
  return questionTextNearDuplicate(input.interviewerText, input.generalText);
}

export function matchingGeneralQuestion(
  interviewer: { text: string; tag?: InterviewTypeTag | null },
  generalQuestions: readonly ConsultationQaItem[],
): ConsultationQaItem | null {
  const text = interviewer.text.trim();
  if (!text) return null;
  return (
    generalQuestions.find((item) =>
      interviewerQuestionMatchesGeneral({
        interviewerText: text,
        interviewerTag: interviewer.tag,
        generalText: item.question,
        generalTag: item.interviewTypeTag,
      }),
    ) ?? null
  );
}

/**
 * Person-prep cards for one interviewer. Each card is the question that is
 * actually on that person. Likely questions render their own text, so these
 * cards are not swapped for a General question and are not hidden by one.
 */
export function displayedPersonQuestions(input: {
  personQuestions: readonly ConsultationQaItem[];
}): ConsultationQaItem[] {
  const seen = new Set<string>();
  const shown: ConsultationQaItem[] = [];
  for (const item of input.personQuestions) {
    if (seen.has(item.questionTurnId)) continue;
    seen.add(item.questionTurnId);
    shown.push(item);
  }
  return shown;
}

/** How many person items match a General question but already have their own answer. */
export function alreadyAnsweredGeneralDuplicateCount(input: {
  personItems: ReadonlyArray<{ text: string; tag?: InterviewTypeTag | null; item?: ConsultationQaItem | null }>;
  generalQuestions: readonly ConsultationQaItem[];
}): number {
  let count = 0;
  for (const person of input.personItems) {
    if (!personItemHasOwnAnswer(person.item)) continue;
    if (
      matchingGeneralQuestion(
        { text: person.text, tag: person.tag },
        input.generalQuestions,
      )
    ) {
      count += 1;
    }
  }
  return count;
}

/** A person card that already has a reply or a stored answer stays its own record. */
export function personItemHasOwnAnswer(
  item: ConsultationQaItem | null | undefined,
): boolean {
  if (!item) return false;
  return (
    item.seekerAnswers.some((answer) => answer.body.trim().length > 0) ||
    Boolean(item.talkingPoint) ||
    Boolean(item.resumeBullet) ||
    item.statements.length > 0
  );
}
