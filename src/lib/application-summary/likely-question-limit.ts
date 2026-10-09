/**
 * How many likely questions a person guide may show.
 * PlatformSetting key guide.likelyQuestionsPerPerson, value { "max": number }.
 * Missing or invalid rows use 8. Reading this does not call a model.
 */

import { prisma } from "@/lib/prisma-client";

export const LIKELY_QUESTIONS_PER_PERSON_KEY = "guide.likelyQuestionsPerPerson";
export const DEFAULT_LIKELY_QUESTIONS_PER_PERSON = 8;

export function parseLikelyQuestionsPerPerson(value: unknown): number {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const raw = row.max;
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return DEFAULT_LIKELY_QUESTIONS_PER_PERSON;
  }
  return parsed;
}

export async function getLikelyQuestionsPerPerson(): Promise<number> {
  const table = (
    prisma as unknown as {
      platformSetting?: {
        findUnique: (args: {
          where: { key: string };
        }) => Promise<{ value: unknown } | null>;
      };
    }
  ).platformSetting;
  if (!table?.findUnique) return DEFAULT_LIKELY_QUESTIONS_PER_PERSON;
  const row = await table.findUnique({
    where: { key: LIKELY_QUESTIONS_PER_PERSON_KEY },
  });
  if (!row) return DEFAULT_LIKELY_QUESTIONS_PER_PERSON;
  return parseLikelyQuestionsPerPerson(row.value);
}
