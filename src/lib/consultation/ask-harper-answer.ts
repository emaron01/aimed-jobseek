/**
 * Ask Harper question shape. Story questions keep the CAR/STAR outcome checks.
 * Opinion, approach, philosophy, and knowledge questions are a point of view
 * and do not need a story result. The answers prompt is unchanged.
 */
import {
  composeInterviewAnswerFromParts,
  containsFrameworkOrPartLabel,
  type AnswerPartsGrounding,
} from "@/lib/consultation/polish-parts";

type PointOfViewParts = {
  answerFramework: "CAR" | "STAR";
  challenge: string | null;
  situation: string | null;
  task: string | null;
  action: string;
  result: string;
};

const STORY_QUESTION =
  /\b(?:how did you|what did you|tell me about|walk me through|give (?:me )?(?:an|one) example|describe (?:a|an|the) (?:time|situation|example)|time when|situation where)\b/i;

const INTERROGATIVE =
  /^(?:what|whats|what's|how|why|who|when|where|which|whose|do|does|did|can|could|would|should|is|are|was|were)\b/i;

export type AskHarperAnswerKind = "story" | "point-of-view";

export function askHarperAnswerKind(questionText: string): AskHarperAnswerKind {
  return STORY_QUESTION.test(questionText.trim()) ? "story" : "point-of-view";
}

/** Empty or meaningless text is not an interview question and must not call the model. */
export function isRealAskHarperQuestion(questionText: string): boolean {
  const value = questionText.trim();
  if (!/[a-z]/i.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (value.includes("?")) return true;
  if (INTERROGATIVE.test(value)) return true;
  return askHarperAnswerKind(value) === "story";
}

function partText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Point-of-view draft from the non-result parts. A story result is not required
 * and is not included, so a short or invented outcome cannot reject the answer.
 */
export function composedPointOfViewAnswer(
  question: PointOfViewParts,
): { content: string; grounding: AnswerPartsGrounding } | null {
  const parts =
    question.answerFramework === "STAR"
      ? [partText(question.situation), partText(question.task), partText(question.action)]
      : [partText(question.challenge), partText(question.action)];
  const usable = parts.filter(Boolean);
  if (usable.length === 0) return null;
  if (usable.some((part) => containsFrameworkOrPartLabel(part))) return null;
  const content = composeInterviewAnswerFromParts(usable);
  if (!content.trim() || containsFrameworkOrPartLabel(content)) return null;
  if (content.split(/\s+/).filter(Boolean).length < 4) return null;
  return {
    content,
    grounding: {
      answerFramework: question.answerFramework,
      challenge: partText(question.challenge),
      situation: partText(question.situation),
      task: partText(question.task),
      action: partText(question.action) || content,
      result: "",
    },
  };
}

/** Draft made only from facts the seeker already stated. Adds no employers, numbers, or outcomes. */
export function askHarperBestAvailableDraft(
  profileItems: readonly unknown[],
): string {
  const facts: string[] = [];
  for (const item of profileItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as { kind?: unknown; text?: unknown };
    if (row.kind !== "FACT" || typeof row.text !== "string") continue;
    const text = row.text.trim();
    if (text && !facts.includes(text)) facts.push(text);
  }
  if (facts.length === 0) {
    return "I would answer this from my own point of view, without adding a result I have not stated.";
  }
  return composeInterviewAnswerFromParts(facts);
}
