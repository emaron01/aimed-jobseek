/**
 * Ask Harper question shape. Story questions keep the CAR/STAR outcome checks.
 * Opinion, approach, philosophy, and knowledge questions are a point of view
 * and do not need a story result. When those checks still fail, the draft is
 * the closest model answer with invented claims removed.
 */
import {
  composeInterviewAnswerFromParts,
  narrativeAnswerParts,
  containsFrameworkOrPartLabel,
  resultStatesOutcome,
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
  const parts = narrativeAnswerParts({
    situation: question.situation,
    challenge: question.challenge,
    task: question.task,
    action: question.action,
  }).slice(0, 4);
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

/** Meta sentence the fallback must never show. */
export const ASK_HARPER_PLACEHOLDER_ANSWER =
  "I would answer this from my own point of view, without adding a result I have not stated.";

function povParts(question: PointOfViewParts): string[] {
  return question.answerFramework === "STAR"
    ? [partText(question.situation), partText(question.task), partText(question.action)]
    : [partText(question.challenge), partText(question.action)];
}

function storyParts(question: PointOfViewParts): string[] {
  return [...povParts(question), partText(question.result)];
}

function storyAnswerPasses(question: PointOfViewParts): boolean {
  const parts = storyParts(question);
  if (parts.some((part) => !part)) return false;
  if (!resultStatesOutcome(partText(question.result))) return false;
  if (parts.some((part) => containsFrameworkOrPartLabel(part))) return false;
  const content = composeInterviewAnswerFromParts(parts);
  return Boolean(content.trim()) && !containsFrameworkOrPartLabel(content);
}

/**
 * Higher is closer to the checks that would accept the answer.
 * A passing answer scores 1000. Otherwise the score counts present parts,
 * the absence of framework labels, an outcome on a story, and words up to 4.
 */
export function askHarperAnswerCloseness(
  question: PointOfViewParts,
  kind: AskHarperAnswerKind,
): number {
  if (kind === "story") {
    if (storyAnswerPasses(question)) return 1000;
    const parts = storyParts(question);
    let score = 0;
    score += parts.filter(Boolean).length * 25;
    if (parts.every((part) => !part || !containsFrameworkOrPartLabel(part))) {
      score += 200;
    }
    if (resultStatesOutcome(partText(question.result))) score += 100;
    const words = parts.join(" ").split(/\s+/).filter(Boolean).length;
    score += Math.min(words, 4) * 10;
    return score;
  }
  if (composedPointOfViewAnswer(question)) return 1000;
  const parts = povParts(question);
  const text = parts.filter(Boolean).join(" ");
  let score = 0;
  if (text.trim()) score += 100;
  if (text.trim() && parts.every((part) => !part || !containsFrameworkOrPartLabel(part))) {
    score += 200;
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  score += Math.min(words, 4) * 10;
  return score;
}

function sourceBlob(sourceTexts: readonly string[]): string {
  return sourceTexts.join("\n").toLowerCase();
}

const FIRST_PERSON = /\b(?:i|me|my|we|our)\b|\bmy\s+team\b/i;
const NAME_STOP_WORDS = new Set(["i", "me", "my", "we", "our", "the", "a", "an", "at"]);

function isFirstPersonClaim(sentence: string): boolean {
  return FIRST_PERSON.test(sentence);
}

/**
 * Unsupported personal claim: a first-person sentence that contains a number
 * or a name/employer that is not already in the seeker's sources. General
 * expertise, including numbers and names, is kept.
 */
function withoutTerminalPunctuation(value: string): string {
  return value.replace(/[.!?]+$/g, "").trim();
}

function isPlaceholderSentence(sentence: string): boolean {
  return (
    withoutTerminalPunctuation(sentence) ===
    withoutTerminalPunctuation(ASK_HARPER_PLACEHOLDER_ANSWER)
  );
}

function sentenceIsUnsupportedPersonalClaim(sentence: string, sources: string): boolean {
  const value = sentence.trim();
  if (!value) return true;
  if (isPlaceholderSentence(value)) return true;
  if (!isFirstPersonClaim(value)) return false;
  const numbers = value.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  if (numbers.some((number) => !sources.includes(number.toLowerCase()))) return true;
  // The first word is the sentence capital, not a name. Scanning it dropped
  // usable first-person drafts such as "Leading indicators I would use...".
  const afterFirstWord = value.replace(/^\W*\w+/, "");
  const names = afterFirstWord.match(/\b[A-Z][A-Za-z0-9]+\b/g) ?? [];
  return names.some(
    (name) =>
      !NAME_STOP_WORDS.has(name.toLowerCase()) && !sources.includes(name.toLowerCase()),
  );
}

function isRawProfileFact(text: string, sourceTexts: readonly string[]): boolean {
  const normalized = text.replace(/[.!?]+$/g, "").trim().toLowerCase();
  if (!normalized) return false;
  return sourceTexts.some(
    (source) => source.replace(/[.!?]+$/g, "").trim().toLowerCase() === normalized,
  );
}

function attemptSentences(answer: PointOfViewParts): string[] {
  return narrativeAnswerParts(answer)
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      if (!sentence) return false;
      return !isPlaceholderSentence(sentence);
    });
}

/**
 * Every non-placeholder sentence in the attempt, including a result.
 * Used when claim-stripping leaves nothing, so the closest attempt is still
 * stored instead of an empty draft.
 */
export function askHarperAttemptProse(answer: PointOfViewParts): string {
  return composeInterviewAnswerFromParts(attemptSentences(answer));
}

/**
 * Model prose for a failed attempt. Removes the placeholder sentence and
 * first-person claims that contain a number, employer, or name not in the
 * seeker's sources. General expertise is kept. The result is included for both
 * point-of-view and story questions, then the same claim filter applies, so a
 * view or outcome written only in the result is not discarded.
 * Returns "" when nothing usable remains, including when the remainder is only
 * one raw profile fact. Callers then keep askHarperAttemptProse.
 */
function storyOpenings(answer: PointOfViewParts): string[] {
  return [partText(answer.situation), partText(answer.challenge)].filter(Boolean);
}

export function askHarperUnpassedDraft(input: {
  answer: PointOfViewParts;
  kind: AskHarperAnswerKind;
  sourceTexts: readonly string[];
}): string {
  const sources = sourceBlob(input.sourceTexts);
  const sentences = attemptSentences(input.answer).filter(
    (sentence) => !sentenceIsUnsupportedPersonalClaim(sentence, sources),
  );
  let content = composeInterviewAnswerFromParts(sentences);
  if (input.kind === "story") {
    for (const opening of [...storyOpenings(input.answer)].reverse()) {
      const needle = opening.toLowerCase().slice(0, 40);
      if (!needle || content.toLowerCase().includes(needle)) continue;
      content = composeInterviewAnswerFromParts([opening, content]);
    }
  }
  if (!content.trim() || isPlaceholderSentence(content)) return "";
  if (isRawProfileFact(content, input.sourceTexts)) return "";
  return content;
}

export function chooseAskHarperFallbackAnswer<T extends PointOfViewParts>(input: {
  attempts: readonly T[];
  kind: AskHarperAnswerKind;
  sourceTexts: readonly string[];
}): { attempt: T; content: string } | null {
  const ranked = input.attempts
    .map((attempt, index) => ({
      attempt,
      index,
      score: askHarperAnswerCloseness(attempt, input.kind),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  for (const candidate of ranked) {
    const content = askHarperUnpassedDraft({
      answer: candidate.attempt,
      kind: input.kind,
      sourceTexts: input.sourceTexts,
    });
    if (content) return { attempt: candidate.attempt, content };
  }
  for (const candidate of ranked) {
    const content = askHarperAttemptProse(candidate.attempt);
    if (content) return { attempt: candidate.attempt, content };
  }
  return null;
}
