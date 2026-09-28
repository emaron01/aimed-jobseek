import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { gapDecisionFromAnalysis } from "@/lib/consultation/standing";

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isExactSeekerAnswer(
  content: string,
  seekerAnswers: readonly string[],
): boolean {
  const result = normalized(content);
  if (!result) return false;
  return seekerAnswers.some((answer) => normalized(answer) === result);
}

export function isJoinedSeekerAnswers(
  content: string,
  seekerAnswers: readonly string[],
): boolean {
  if (seekerAnswers.length < 2) return false;
  const result = normalized(content);
  if (!result) return true;
  return (
    result === normalized(seekerAnswers.join("\n")) ||
    result === normalized(seekerAnswers.join(" "))
  );
}

export function isSeekerAnswerFragment(
  content: string,
  seekerAnswers: readonly string[],
): boolean {
  const result = normalized(content);
  if (result.length < 24) return false;
  return seekerAnswers.some((answer) => {
    const haystack = normalized(answer);
    return haystack !== result && haystack.includes(result);
  });
}

/** Nearly-verbatim restatement of a seeker reply (not polished coaching). */
export function isParaphrasedSeekerReply(
  content: string,
  seekerAnswers: readonly string[],
): boolean {
  const result = normalized(content);
  if (!result) return false;
  // Existing polish contract allows a short first-person frame around the reply.
  if (/^in my words\b/.test(result)) return false;
  const tokenize = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 4),
    );
  const alphaNorm = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const resultAlpha = alphaNorm(content);
  const resultTokens = tokenize(content);
  if (resultTokens.size < 5 || resultAlpha.length < 40) return false;
  for (const answer of seekerAnswers) {
    const a = normalized(answer);
    if (a.length < 40) continue;
    // Fixture / polish may label the raw reply ("result: …") without rewriting it.
    if (/^result\b/.test(result) && result.includes(a)) continue;
    const answerAlpha = alphaNorm(answer);
    if (!answerAlpha || answerAlpha.length < 40) continue;
    if (resultAlpha === answerAlpha) return true;
    const lengthDelta =
      Math.abs(resultAlpha.length - answerAlpha.length) /
      Math.max(resultAlpha.length, answerAlpha.length);
    // Nearly verbatim only: tiny length change + near-identical token set.
    if (lengthDelta > 0.08) continue;
    const answerTokens = tokenize(answer);
    if (answerTokens.size < 5) continue;
    let intersection = 0;
    for (const token of resultTokens) {
      if (answerTokens.has(token)) intersection += 1;
    }
    const union = resultTokens.size + answerTokens.size - intersection;
    if (union > 0 && intersection / union >= 0.95) return true;
  }
  return false;
}

/**
 * Result talks about the question / framing instead of answering with experience.
 * Example: "Clarified that a company statement needed to be reframed as an interview question."
 */
export function isQuestionMetaCommentary(content: string): boolean {
  const text = normalized(content);
  if (!text) return false;
  const metaAboutQuestion =
    /\b(clarified that|reframed|reframe|needed to be (?:an )?interview question|company statement|this (?:gap|question|requirement) (?:is|was|needed)|not (?:really )?a (?:skill|requirement)|should (?:be|have been) (?:asked|reframed))\b/.test(
      text,
    );
  if (!metaAboutQuestion) return false;
  // Allow genuine experience that happens to mention "question" in passing.
  const hasExperienceSignal =
    /\b(i (?:led|built|owned|ran|cut|grew|shipped|managed|closed)|my (?:team|role|work)|at \w+)\b/.test(
      text,
    );
  return !hasExperienceSignal;
}

export function resultIgnoresLatestAnswer(
  content: string,
  seekerAnswers: readonly string[],
): boolean {
  if (seekerAnswers.length < 2) return false;
  const result = normalized(content);
  const latest = normalized(seekerAnswers[seekerAnswers.length - 1] ?? "");
  const tokens = latest.split(" ").filter((token) => token.length >= 6);
  if (tokens.length < 2) return false;
  const hits = tokens.filter((token) => result.includes(token));
  return hits.length <= 1;
}

export function isRawSeekerResult(
  content: string,
  seekerAnswers: readonly string[],
): boolean {
  if (isQuestionMetaCommentary(content)) return true;
  return (
    isExactSeekerAnswer(content, seekerAnswers) ||
    isJoinedSeekerAnswers(content, seekerAnswers) ||
    isSeekerAnswerFragment(content, seekerAnswers) ||
    isParaphrasedSeekerReply(content, seekerAnswers)
  );
}

export function shouldEnqueueConsultationResultRepair(input: {
  needsRepair: boolean;
  busy: boolean;
  latestSeekerAnswerAt: Date | string | null;
  lastRepairAttemptAt: Date | string | null;
  lastRepairSucceeded?: boolean;
  stalePromptVersion?: boolean;
}): boolean {
  if (!input.needsRepair || input.busy) return false;
  if (!input.lastRepairAttemptAt) return true;
  if (input.stalePromptVersion && input.lastRepairSucceeded) return true;
  if (!input.latestSeekerAnswerAt) return false;
  const latestAnswer = new Date(input.latestSeekerAnswerAt).getTime();
  const lastRepair = new Date(input.lastRepairAttemptAt).getTime();
  if (!Number.isFinite(latestAnswer) || !Number.isFinite(lastRepair)) {
    return false;
  }
  return latestAnswer > lastRepair;
}

export function consultationItemNeedsResultRepair(
  item: ConsultationQaItem,
): boolean {
  const answers = item.seekerAnswers
    .map((answer) => answer.body.trim())
    .filter(Boolean);
  if (answers.length === 0) return false;
  const decision = gapDecisionFromAnalysis(
    item.seekerAnswers.at(-1)?.analysisJson,
  );
  if (decision === "incomplete") return false;
  if (decision === "no_evidence") {
    if (!item.talkingPoint) return true;
    if (isRawSeekerResult(item.talkingPoint.content, answers)) return true;
    return resultIgnoresLatestAnswer(item.talkingPoint.content, answers);
  }
  if (!item.talkingPoint || !item.resumeBullet) return true;
  if (isRawSeekerResult(item.talkingPoint.content, answers)) return true;
  if (isRawSeekerResult(item.resumeBullet.content, answers)) return true;
  return resultIgnoresLatestAnswer(item.talkingPoint.content, answers);
}
