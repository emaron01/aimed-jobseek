import type { CandidateProfile, ProfileExperienceRole } from "@/lib/product-research/candidate-profile";
import { applicationAssetConfig } from "@/lib/product-config";

export type DatePrecision = "month" | "year";

export type ParsedExperienceDate = {
  year: number;
  month: number | null;
  precision: DatePrecision;
  raw: string;
  present: boolean;
};

export type ExtractedRoleDates = {
  startDate: string;
  endDate: string | null;
};

const MONTH_NAMES = applicationAssetConfig.dateDisplay.monthNames.map((name) =>
  name.toLowerCase(),
);
const MONTH_ABBREVIATIONS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
] as const;
const ABBREV_TO_MONTH: Record<(typeof MONTH_ABBREVIATIONS)[number], number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const PRESENT_LABELS = new Set(
  [
    applicationAssetConfig.dateDisplay.currentRoleLabel,
    "Present",
    "Current",
    "Now",
    "Today",
  ].map((label) => label.toLowerCase()),
);

const MONTH_TOKEN = MONTH_NAMES.concat(MONTH_ABBREVIATIONS).join("|");
const DATE_TOKEN = `(?:(?:${MONTH_TOKEN})\\.?\\s+\\d{4}|\\d{4}-\\d{1,2}|\\d{1,2}/\\d{4}|\\d{4})`;
const PRESENT_TOKEN = "Present|Current|Now|Today";
const RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN})[ \\t]*(?:[–—−-]|to)[ \\t]*(${DATE_TOKEN}|${PRESENT_TOKEN})`,
  "gi",
);

function monthFromName(value: string): number | null {
  const token = value.toLowerCase().replace(/\.$/, "");
  const named = MONTH_NAMES.indexOf(token);
  if (named >= 0) return named + 1;
  if (token in ABBREV_TO_MONTH) {
    return ABBREV_TO_MONTH[token as (typeof MONTH_ABBREVIATIONS)[number]];
  }
  return null;
}

export function parseExperienceDate(value: string): ParsedExperienceDate | null {
  const raw = value.trim();
  if (!raw) return null;
  if (PRESENT_LABELS.has(raw.toLowerCase())) {
    return {
      year: 0,
      month: null,
      precision: "month",
      raw,
      present: true,
    };
  }
  const monthYear = raw.match(
    new RegExp(`^(${MONTH_TOKEN})\\.?\\s+(\\d{4})$`, "i"),
  );
  if (monthYear) {
    const month = monthFromName(monthYear[1] ?? "");
    const year = Number(monthYear[2]);
    if (!month || !Number.isInteger(year)) return null;
    return { year, month, precision: "month", raw, present: false };
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    if (!Number.isInteger(year) || month < 1 || month > 12) return null;
    return { year, month, precision: "month", raw, present: false };
  }
  const slash = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const year = Number(slash[2]);
    if (!Number.isInteger(year) || month < 1 || month > 12) return null;
    return { year, month, precision: "month", raw, present: false };
  }
  const yearOnly = raw.match(/^(\d{4})$/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (!Number.isInteger(year)) return null;
    return { year, month: null, precision: "year", raw, present: false };
  }
  return null;
}

export function experienceDateToMonthIndex(
  parsed: ParsedExperienceDate,
  bound: "start" | "end",
  asOf: Date,
): number | null {
  if (parsed.present) {
    return asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  }
  if (parsed.precision === "month" && parsed.month != null) {
    return parsed.year * 12 + parsed.month - 1;
  }
  if (parsed.precision === "year") {
    return bound === "start" ? parsed.year * 12 + 11 : parsed.year * 12;
  }
  return null;
}

export function experienceDateToMaximumMonthIndex(
  parsed: ParsedExperienceDate,
  bound: "start" | "end",
  asOf: Date,
): number | null {
  if (parsed.present) {
    return asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  }
  if (parsed.precision === "month" && parsed.month != null) {
    return parsed.year * 12 + parsed.month - 1;
  }
  if (parsed.precision === "year") {
    return bound === "start" ? parsed.year * 12 : parsed.year * 12 + 11;
  }
  return null;
}

export function extractDateRangesFromText(
  text: string,
): Array<{ startDate: string; endDate: string | null; index: number }> {
  const ranges: Array<{ startDate: string; endDate: string | null; index: number }> =
    [];
  for (const match of text.matchAll(RANGE_PATTERN)) {
    const startRaw = match[1]?.trim() ?? "";
    const endRaw = match[2]?.trim() ?? "";
    const start = parseExperienceDate(startRaw);
    const end = parseExperienceDate(endRaw);
    if (!start || !end || match.index == null) continue;
    ranges.push({
      startDate: start.raw,
      endDate: end.present ? end.raw : end.raw,
      index: match.index,
    });
  }
  return ranges;
}

function nearestRange(
  haystack: string,
  terms: string[],
  ranges: Array<{ startDate: string; endDate: string | null; index: number }>,
  maxDistance: number,
): ExtractedRoleDates | null {
  if (ranges.length === 0 || terms.length === 0) return null;
  let best: { distance: number; range: (typeof ranges)[number] } | null = null;
  const lower = haystack.toLowerCase();
  for (const term of terms) {
    let from = 0;
    while (from < lower.length) {
      const found = lower.indexOf(term, from);
      if (found < 0) break;
      for (const range of ranges) {
        const distance = Math.abs(range.index - found);
        if (!best || distance < best.distance) {
          best = { distance, range };
        }
      }
      from = found + term.length;
    }
  }
  if (!best || best.distance > maxDistance) return null;
  return { startDate: best.range.startDate, endDate: best.range.endDate };
}

export function fillMissingRoleDates(
  profile: CandidateProfile,
  sources: Array<{ sourceId: string; text: string }>,
): {
  profile: CandidateProfile;
  filled: Array<{ roleId: string; startDate: string | null; endDate: string | null }>;
} {
  const filled: Array<{
    roleId: string;
    startDate: string | null;
    endDate: string | null;
  }> = [];
  const experience = profile.experience.map((role) => {
    const missingStart = !role.startDate?.trim();
    const missingEnd = !role.endDate?.trim();
    if (!missingStart && !missingEnd) return role;
    const employer = role.employer?.trim().toLowerCase();
    const title = role.title?.trim().toLowerCase();
    let extracted: ExtractedRoleDates | null = null;
    for (const source of sources) {
      const ranges = extractDateRangesFromText(source.text);
      if (employer && employer.length >= 3) {
        extracted = nearestRange(source.text, [employer], ranges, 160);
      }
      if (!extracted && title && title.length >= 3) {
        extracted = nearestRange(source.text, [title], ranges, 80);
      }
      if (extracted) break;
    }
    if (!extracted) return role;
    const next: ProfileExperienceRole = {
      ...role,
      startDate: missingStart ? extracted.startDate : role.startDate,
      endDate: missingEnd ? extracted.endDate : role.endDate,
    };
    filled.push({
      roleId: role.id,
      startDate: next.startDate,
      endDate: next.endDate,
    });
    return next;
  });
  if (filled.length === 0) {
    return { profile, filled };
  }
  return { profile: { ...profile, experience }, filled };
}

export function sourcesHaveExtractableDates(
  sources: Array<{ text: string }>,
): boolean {
  return sources.some((source) => extractDateRangesFromText(source.text).length > 0);
}
