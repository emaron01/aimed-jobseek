import { compensationConfig } from "@/lib/product-config/compensation";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";

export type StatedEmployerCompensationForm = {
  targetAnnualEarningsMin: string;
  targetAnnualEarningsTarget: string;
  targetHourlyRateMin: string;
  targetHourlyRateTarget: string;
  compensationCurrency: string;
  employmentTypes: string;
  annualEarningsMinimumRequired: string;
  hourlyRateMinimumRequired: string;
  employmentTypeRequired: string;
};

type PayUnit = "ANNUAL" | "HOURLY";

type FoundAmount = {
  value: number;
  index: number;
  unit: PayUnit | null;
};

export function emptyStatedEmployerCompensation(): StatedEmployerCompensationForm {
  return {
    targetAnnualEarningsMin: "",
    targetAnnualEarningsTarget: "",
    targetHourlyRateMin: "",
    targetHourlyRateTarget: "",
    compensationCurrency: compensationConfig.defaultCurrency,
    employmentTypes: "",
    annualEarningsMinimumRequired: "",
    hourlyRateMinimumRequired: "",
    employmentTypeRequired: "",
  };
}

function numberToInput(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function windowAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + length + 48);
  return text.slice(start, end);
}

function unitInWindow(window: string): PayUnit | null {
  const hourly = /\b(hourly|per\s+hour|an\s+hour|\/\s*hr\b|\/\s*hour)\b/i.test(window);
  const annual = /\b(annual(?:ly)?|per\s+year|a\s+year|\/\s*yr\b|\/\s*year|salary|\bote\b)\b/i.test(window);
  if (hourly && !annual) return "HOURLY";
  if (annual && !hourly) return "ANNUAL";
  return null;
}

function isHard(window: string): boolean {
  return /\b(must|required|non-negotiable|only)\b/i.test(window);
}

function findAmounts(text: string): FoundAmount[] {
  const pattern =
    /(?:USD|EUR|GBP|US\$|\$|€|£)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*([kK])?/g;
  const found: FoundAmount[] = [];
  for (const match of text.matchAll(pattern)) {
    const token = match[0] ?? "";
    const index = match.index ?? 0;
    const window = windowAround(text, index, token.length);
    const marked = /[$€£]|USD|EUR|GBP/i.test(token) || Boolean(match[3]);
    const unit = unitInWindow(window);
    if (!marked && !unit) continue;
    const digits = (match[1] ?? "").replace(/,/g, "");
    let value = Number(digits);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (match[3]) value *= 1000;
    if (!unit && value >= 1900 && value <= 2100 && !match[1]?.includes(",") && !match[3]) {
      continue;
    }
    const resolved = unit ?? (value >= 1000 ? "ANNUAL" : value < 500 ? "HOURLY" : null);
    if (!resolved) continue;
    found.push({ value, index, unit: resolved });
  }
  return found;
}

function assignUnit(
  amounts: FoundAmount[],
  text: string,
): { minimum: string; target: string; hard: boolean } {
  if (amounts.length === 0) return { minimum: "", target: "", hard: false };
  const ordered = [...amounts].sort((a, b) => a.index - b.index);
  const hard = ordered.some((amount) =>
    isHard(windowAround(text, amount.index, String(amount.value).length)),
  );
  if (ordered.length >= 2) {
    const between = ordered.slice(0, 2);
    const gap = text.slice(between[0]!.index, between[1]!.index);
    if (/\b(between|to|and)\b|–|—|-/i.test(gap)) {
      const lower = Math.min(between[0]!.value, between[1]!.value);
      const higher = Math.max(between[0]!.value, between[1]!.value);
      return {
        minimum: numberToInput(lower),
        target: numberToInput(higher),
        hard,
      };
    }
  }
  const minimumAmount = ordered.find((amount) =>
    /\b(at least|minimum|no less than)\b/i.test(
      text.slice(Math.max(0, amount.index - 40), amount.index),
    ),
  );
  if (minimumAmount) {
    return { minimum: numberToInput(minimumAmount.value), target: "", hard };
  }
  return { minimum: "", target: numberToInput(ordered[0]!.value), hard: false };
}

export function statedEmployerCompensationFromNotes(
  notes: string,
): StatedEmployerCompensationForm {
  const result = emptyStatedEmployerCompensation();
  const text = notes.trim();
  if (!text) return result;

  const types: string[] = [];
  const fullTime = /full[-\s]?time/i.exec(text);
  const partTime = /part[-\s]?time/i.exec(text);
  if (fullTime) types.push("FULL_TIME");
  if (partTime) types.push("PART_TIME");
  result.employmentTypes = types.join(",");
  const employmentHard = [fullTime, partTime].some(
    (match) => match && isHard(windowAround(text, match.index, match[0].length)),
  );
  if (types.length > 0 && employmentHard) {
    result.employmentTypeRequired = "true";
  }

  const amounts = findAmounts(text);
  const annual = assignUnit(
    amounts.filter((amount) => amount.unit === "ANNUAL"),
    text,
  );
  const hourly = assignUnit(
    amounts.filter((amount) => amount.unit === "HOURLY"),
    text,
  );
  result.targetAnnualEarningsMin = annual.minimum;
  result.targetAnnualEarningsTarget = annual.target;
  result.targetHourlyRateMin = hourly.minimum;
  result.targetHourlyRateTarget = hourly.target;
  if (annual.hard && annual.minimum) result.annualEarningsMinimumRequired = "true";
  if (hourly.hard && hourly.minimum) result.hourlyRateMinimumRequired = "true";
  if (/€|\bEUR\b/i.test(text)) result.compensationCurrency = "EUR";
  else if (/£|\bGBP\b/i.test(text)) result.compensationCurrency = "GBP";
  else if (annual.minimum || annual.target || hourly.minimum || hourly.target) {
    result.compensationCurrency = compensationConfig.defaultCurrency;
  }
  return result;
}

export function statedEmployerCompensationFromProfile(
  profile: CandidateProfile,
): StatedEmployerCompensationForm {
  const notes = [
    profile.compensation?.text ?? "",
    ...profile.direction.careerGoals.map((item) => item.text ?? ""),
    profile.positioning?.text ?? "",
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  return statedEmployerCompensationFromNotes(notes.join("\n"));
}
