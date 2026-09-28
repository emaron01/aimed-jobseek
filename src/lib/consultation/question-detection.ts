/**
 * Detection-only helpers for Harper question quality gates.
 * Patterns here reject or classify model output; they must never be used to
 * generate canned question text shown to the seeker.
 */

function normalizedQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True only for a career-chronology walk-through: the seeker's roles or career
 * in sequence. Behavioral "walk me through your experience/background with X"
 * and from→to stories about a metric or process are not chronology.
 */
export function looksLikeCareerWalkThrough(text: string): boolean {
  const n = normalizedQuestion(text);
  if (!n) return false;

  if (/\bcareer walk(?:\s*through)?\b/.test(n)) return true;

  const guidesThrough = /\bwalk(?: me)? through\b/.test(n);
  if (!guidesThrough) return false;

  // Career / roles / path / progression — not bare "experience" or "background".
  if (/\b(?:career|roles?|path|progression)\b/.test(n)) return true;

  // Classic employer-sequence: "Starting with Merion … walk me through …
  // accomplishments … why you moved on to OpenText."
  if (
    /\bstarting with\b/.test(n) &&
    /\b(?:accomplishments?|roles?|moved on|left|next)\b/.test(n)
  ) {
    return true;
  }

  // from … to … only when the subject is still career/roles sequence.
  if (
    /\bfrom\b.+\bto\b/.test(n) &&
    /\b(?:career|roles?|accomplishments?|moved on|each role)\b/.test(n)
  ) {
    return true;
  }

  return false;
}

/** Shared intent class used for near-duplicate detection (no guessing). */
export function questionIntentClass(
  text: string,
  targetKey?: string | null,
): "chronology" | null {
  if (targetKey === "chronology" || looksLikeCareerWalkThrough(text)) {
    return "chronology";
  }
  return null;
}

/**
 * Context-free STAR / template question with no named subject
 * (gap, requirement, employer, or topic). Rejected and dropped — never replaced.
 */
export function looksLikeContextFreeTemplateQuestion(text: string): boolean {
  const n = normalizedQuestion(text);
  if (!n) return false;
  const classicStar =
    /\btell me what happened\b/.test(n) &&
    /\bwhat you did\b/.test(n) &&
    /\bresult\b/.test(n);
  const bareStarPrompt =
    /^(?:can you |could you |please )?(?:walk me through|tell me about|describe) (?:a time|an example|a situation)(?: when you)?(?:\.|$)/.test(
      n,
    );
  if (!classicStar && !bareStarPrompt) return false;
  const remainder = n
    .replace(/\btell me what happened\b/g, " ")
    .replace(/\bwhat you did\b/g, " ")
    .replace(/\bwhat the result was\b/g, " ")
    .replace(/\bwhat was the result\b/g, " ")
    .replace(/\bwalk me through\b/g, " ")
    .replace(/\btell me about\b/g, " ")
    .replace(/\bdescribe\b/g, " ")
    .replace(/\ba time\b/g, " ")
    .replace(/\ban example\b/g, " ")
    .replace(/\ba situation\b/g, " ")
    .replace(/\bwhen you\b/g, " ")
    .replace(/\b(?:can you|could you|please|and|the|a|an|or)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder.length < 8;
}
