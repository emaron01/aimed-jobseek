import type { ConsultationQaItem } from "@/lib/consultation/qa-view";

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
  return (
    isExactSeekerAnswer(content, seekerAnswers) ||
    isJoinedSeekerAnswers(content, seekerAnswers) ||
    isSeekerAnswerFragment(content, seekerAnswers)
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
  if (!item.talkingPoint || !item.resumeBullet) return true;
  if (isRawSeekerResult(item.talkingPoint.content, answers)) return true;
  if (isRawSeekerResult(item.resumeBullet.content, answers)) return true;
  return resultIgnoresLatestAnswer(item.talkingPoint.content, answers);
}
