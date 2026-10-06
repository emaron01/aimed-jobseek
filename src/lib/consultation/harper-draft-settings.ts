/**
 * Harper draft controls stored in PlatformSetting key "harper.drafts".
 * Saving the row does not call a model or enqueue a job. Harper reads it
 * when it next plans or drafts.
 */

import { prisma } from "@/lib/prisma-client";

export const HARPER_DRAFT_SETTINGS_KEY = "harper.drafts";

export type HarperDraftSettings = {
  bestPracticeCount: number;
  questionLimit: number;
  gapWords: number;
  bestPracticeWords: number;
  whyThisCompanyWords: number;
  walkThroughWordsPerRole: number;
  walkThroughWordsTotal: number;
  resumeBulletWords: number;
};

export const DEFAULT_HARPER_DRAFT_SETTINGS: HarperDraftSettings = {
  bestPracticeCount: 8,
  questionLimit: 25,
  gapWords: 150,
  bestPracticeWords: 150,
  whyThisCompanyWords: 120,
  walkThroughWordsPerRole: 40,
  walkThroughWordsTotal: 200,
  resumeBulletWords: 30,
};

function wholeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function parseHarperDraftSettings(value: unknown): HarperDraftSettings {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const defaults = DEFAULT_HARPER_DRAFT_SETTINGS;
  return {
    bestPracticeCount: wholeNumber(row.bestPracticeCount, defaults.bestPracticeCount, 0, 100),
    questionLimit: wholeNumber(row.questionLimit, defaults.questionLimit, 0, 200),
    gapWords: wholeNumber(row.gapWords, defaults.gapWords, 1, 2000),
    bestPracticeWords: wholeNumber(
      row.bestPracticeWords,
      defaults.bestPracticeWords,
      1,
      2000,
    ),
    whyThisCompanyWords: wholeNumber(
      row.whyThisCompanyWords,
      defaults.whyThisCompanyWords,
      1,
      2000,
    ),
    walkThroughWordsPerRole: wholeNumber(
      row.walkThroughWordsPerRole,
      defaults.walkThroughWordsPerRole,
      1,
      2000,
    ),
    walkThroughWordsTotal: wholeNumber(
      row.walkThroughWordsTotal,
      defaults.walkThroughWordsTotal,
      1,
      2000,
    ),
    resumeBulletWords: wholeNumber(
      row.resumeBulletWords,
      defaults.resumeBulletWords,
      1,
      200,
    ),
  };
}

export function answerLengthInstruction(words: number): string {
  return `Write the spoken answer in about ${words} words. For a complex or multi-part question, also return 3 to 5 key points: short bullets with the names, numbers, and steps to mention if the interviewer asks for more.`;
}

export function lengthMargin(target: number): number {
  return Math.max(8, Math.round(target * 0.1));
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function exceedsLengthTarget(text: string, target: number): boolean {
  return wordCount(text) > target + lengthMargin(target);
}

export function spokenWordsForQuestion(input: {
  settings: HarperDraftSettings;
  text: string;
  targetKey: string;
  walkThrough: boolean;
  recentRoleCount?: number;
}): number {
  if (
    input.targetKey === "why-this-company" ||
    input.targetKey.startsWith("why-this-company")
  ) {
    return input.settings.whyThisCompanyWords;
  }
  if (input.walkThrough) {
    const perRole =
      input.settings.walkThroughWordsPerRole * Math.max(1, input.recentRoleCount ?? 1);
    return Math.min(input.settings.walkThroughWordsTotal, perRole);
  }
  if (input.targetKey.startsWith("role-expertise:")) {
    return input.settings.bestPracticeWords;
  }
  return input.settings.gapWords;
}

/** Best-practice count, capped by the questions still allowed under the overall limit. */
export function bestPracticeFillCount(
  nonBestPracticeAsked: number,
  settings: Pick<HarperDraftSettings, "bestPracticeCount" | "questionLimit"> = DEFAULT_HARPER_DRAFT_SETTINGS,
): number {
  const room = Math.max(0, settings.questionLimit - nonBestPracticeAsked);
  return Math.min(settings.bestPracticeCount, room);
}

export async function getHarperDraftSettings(): Promise<HarperDraftSettings> {
  const table = (
    prisma as unknown as {
      platformSetting?: {
        findUnique: (args: {
          where: { key: string };
        }) => Promise<{ value: unknown } | null>;
      };
    }
  ).platformSetting;
  if (!table?.findUnique) return { ...DEFAULT_HARPER_DRAFT_SETTINGS };
  const row = await table.findUnique({ where: { key: HARPER_DRAFT_SETTINGS_KEY } });
  return parseHarperDraftSettings(row?.value);
}
