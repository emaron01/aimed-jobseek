/**
 * Bind each answers-step draft to the question id it was written for,
 * and keep one copy of the model's sentences.
 */

export type ProfilePlaceSource = {
  employer?: string | null;
  title?: string | null;
  text?: string | null;
  itemType?: string | null;
};

const SCHOOL_WORD = /\b(university|college|school|institute|academy)\b/i;
const PROJECT_WORD = /\bprojects?\b/i;

export function profilePlaceNames(items: readonly ProfilePlaceSource[]): string[] {
  const names = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length >= 2) names.add(trimmed);
  };
  for (const item of items) {
    add(item.employer ?? "");
    for (const value of [item.title ?? "", item.text ?? ""]) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (SCHOOL_WORD.test(trimmed)) {
        add(trimmed);
        for (const part of trimmed.split(/[,.]/)) {
          if (SCHOOL_WORD.test(part)) add(part);
        }
      }
      if (PROJECT_WORD.test(trimmed)) {
        add(trimmed);
        for (const part of trimmed.split(/[,.]/)) {
          if (PROJECT_WORD.test(part)) add(part);
        }
      }
    }
  }
  return [...names];
}

export function storyGroundedInProfile(
  content: string,
  names: readonly string[],
): boolean {
  if (names.length === 0) return false;
  const lower = content.toLowerCase();
  return names.some((name) => name.length >= 2 && lower.includes(name.toLowerCase()));
}

/** A workplace, school, or project named with "at" that the profile does not contain. */
export function storyNamesUnknownPlace(
  content: string,
  names: readonly string[],
): boolean {
  const known = (place: string) => {
    const left = place.toLowerCase();
    return names.some((name) => {
      const right = name.toLowerCase();
      return left.includes(right) || right.includes(left);
    });
  };
  for (const match of content.matchAll(
    /\bat\s+(?:the\s+)?([A-Z][\w&.'’+-]*(?:\s+[A-Z][\w&.'’+-]*){0,4})/gi,
  )) {
    const place = match[1]?.trim() ?? "";
    if (place.length < 3) continue;
    if (!known(place)) return true;
  }
  return false;
}

function sentenceKey(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nearlySameSentence(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 24 || right.length < 24) return false;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return longer.includes(shorter);
}

/** Keep the first copy of a sentence and drop one that repeats or nearly repeats it. */
export function dropRepeatedSentences(content: string): string {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const kept: string[] = [];
  const keys: string[] = [];
  for (const sentence of sentences) {
    const key = sentenceKey(sentence);
    if (!key) continue;
    if (keys.some((earlier) => nearlySameSentence(earlier, key))) continue;
    keys.push(key);
    kept.push(sentence);
  }
  return kept.join(" ");
}

export function matchAnswersByQuestionId<T extends { questionId?: string | null }>(
  choices: readonly { targetKey: string }[],
  answers: readonly T[],
): { matched: Array<T | undefined>; unknownIds: string[] } {
  const known = new Set(choices.map((choice) => choice.targetKey));
  const byId = new Map<string, T>();
  const unknownIds: string[] = [];
  for (const answer of answers) {
    const id = answer.questionId?.trim() ?? "";
    if (!id || !known.has(id) || byId.has(id)) {
      unknownIds.push(id || "(missing)");
      continue;
    }
    byId.set(id, answer);
  }
  return {
    matched: choices.map((choice) => byId.get(choice.targetKey)),
    unknownIds,
  };
}

export function normalizeKeyPoints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function keyPointsFromGrounding(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return normalizeKeyPoints((value as { keyPoints?: unknown }).keyPoints);
}

/** True after the seeker saved their own draft text or key points. */
export function groundingSeekerEdited(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as { seekerEdited?: unknown }).seekerEdited === true;
}

export function keyPointsText(points: readonly string[] | null | undefined): string {
  return (points ?? []).join("\n");
}

/**
 * The text Regenerate sends to polish.
 * A seeker-owned draft uses the saved answer. A Harper draft uses the stored
 * reply context, or the turn body when that context is absent.
 */
export function draftRegenerationAnswer(input: {
  seekerEdited: boolean;
  content: string;
  turnBody: string;
  answerContext: string | null;
}): string {
  if (input.seekerEdited) return input.content.trim();
  return input.answerContext?.trim() || input.turnBody.trim();
}

/** Keep the stored grounding and mark the draft as the seeker's. */
export function withSeekerEditedGrounding(
  existing: unknown,
  keyPoints?: readonly string[] | null,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const points =
    keyPoints == null ? keyPointsFromGrounding(existing) : normalizeKeyPoints(keyPoints);
  return {
    ...base,
    seekerEdited: true,
    keyPoints: points,
  };
}

export function questionLooksMultipart(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const marks = trimmed.match(/\?/g)?.length ?? 0;
  if (marks > 1) return true;
  return /\b(and|plus)\b/i.test(trimmed) && trimmed.split(/\s+/).length >= 12;
}
