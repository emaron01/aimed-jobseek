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
  recentRoleYears: number;
  midRoleYears: number;
  olderRoleYears: number;
  recentBulletMin: number;
  recentBulletMax: number;
  recentPrimaryBulletMax: number;
  midBulletMin: number;
  midBulletMax: number;
  olderBulletMin: number;
  olderBulletMax: number;
  oldestRelevantBulletMin: number;
  oldestRelevantBulletMax: number;
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
  recentRoleYears: 5,
  midRoleYears: 10,
  olderRoleYears: 15,
  recentBulletMin: 3,
  recentBulletMax: 5,
  recentPrimaryBulletMax: 7,
  midBulletMin: 1,
  midBulletMax: 3,
  olderBulletMin: 0,
  olderBulletMax: 2,
  oldestRelevantBulletMin: 1,
  oldestRelevantBulletMax: 2,
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
    ...bulletBands(row, defaults),
  };
}

function bulletPair(
  minRaw: unknown,
  maxRaw: unknown,
  fallbackMin: number,
  fallbackMax: number,
): { min: number; max: number } {
  const min = wholeNumber(minRaw, fallbackMin, 0, 20);
  const max = wholeNumber(maxRaw, fallbackMax, 0, 20);
  if (min > max) return { min: fallbackMin, max: fallbackMax };
  return { min, max };
}

function bulletBands(
  row: Record<string, unknown>,
  defaults: HarperDraftSettings,
): Pick<
  HarperDraftSettings,
  | "recentRoleYears"
  | "midRoleYears"
  | "olderRoleYears"
  | "recentBulletMin"
  | "recentBulletMax"
  | "recentPrimaryBulletMax"
  | "midBulletMin"
  | "midBulletMax"
  | "olderBulletMin"
  | "olderBulletMax"
  | "oldestRelevantBulletMin"
  | "oldestRelevantBulletMax"
> {
  let recentRoleYears = wholeNumber(row.recentRoleYears, defaults.recentRoleYears, 1, 40);
  let midRoleYears = wholeNumber(row.midRoleYears, defaults.midRoleYears, 1, 60);
  let olderRoleYears = wholeNumber(row.olderRoleYears, defaults.olderRoleYears, 1, 80);
  if (!(recentRoleYears < midRoleYears && midRoleYears < olderRoleYears)) {
    recentRoleYears = defaults.recentRoleYears;
    midRoleYears = defaults.midRoleYears;
    olderRoleYears = defaults.olderRoleYears;
  }
  const recent = bulletPair(
    row.recentBulletMin,
    row.recentBulletMax,
    defaults.recentBulletMin,
    defaults.recentBulletMax,
  );
  const mid = bulletPair(
    row.midBulletMin,
    row.midBulletMax,
    defaults.midBulletMin,
    defaults.midBulletMax,
  );
  const older = bulletPair(
    row.olderBulletMin,
    row.olderBulletMax,
    defaults.olderBulletMin,
    defaults.olderBulletMax,
  );
  const oldestRelevant = bulletPair(
    row.oldestRelevantBulletMin,
    row.oldestRelevantBulletMax,
    defaults.oldestRelevantBulletMin,
    defaults.oldestRelevantBulletMax,
  );
  const recentPrimaryBulletMax = wholeNumber(
    row.recentPrimaryBulletMax,
    defaults.recentPrimaryBulletMax,
    0,
    20,
  );
  return {
    recentRoleYears,
    midRoleYears,
    olderRoleYears,
    recentBulletMin: recent.min,
    recentBulletMax: recent.max,
    recentPrimaryBulletMax,
    midBulletMin: mid.min,
    midBulletMax: mid.max,
    olderBulletMin: older.min,
    olderBulletMax: older.max,
    oldestRelevantBulletMin: oldestRelevant.min,
    oldestRelevantBulletMax: oldestRelevant.max,
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
