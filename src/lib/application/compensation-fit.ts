import {
  compensationConfig,
  employmentTypeLabel,
  isEmploymentTypeCode,
  type EmploymentTypeCode,
} from "@/lib/product-config/compensation";
import { compensationCopy } from "@/lib/product-config/vocabulary";

export type PayUnit = "ANNUAL" | "HOURLY";

export type EmployerCompensationProfile = {
  targetAnnualEarningsMin: number | null;
  targetAnnualEarningsTarget: number | null;
  targetHourlyRateMin: number | null;
  targetHourlyRateTarget: number | null;
  compensationCurrency: string | null;
  employmentTypes: EmploymentTypeCode[];
  annualEarningsMinimumRequired: boolean;
  hourlyRateMinimumRequired: boolean;
  employmentTypeRequired: boolean;
};

export type CompensationFitOutcome = {
  criterionId: null;
  name: string;
  evidenceClass: "LIST_DATA";
  isRequired: boolean;
  isDisqualifier: false;
  assessment: "NO_FIT" | "STRONG" | "UNKNOWN";
  evidenceOutcome: "CONTRADICTED" | "SUPPORTED" | null;
  reasoning: string;
  evidence: string | null;
  source: string | null;
  limitedPublicEvidence: false;
  mustHaveMiss: boolean;
  dealBreakerHit: false;
  preferenceMiss: boolean;
  estimated: boolean;
};

type StatedPay = {
  unit: PayUnit | "UNKNOWN";
  minimum: number;
  maximum: number;
  currency: string | null;
  raw: string;
};

export function emptyEmployerCompensationProfile(): EmployerCompensationProfile {
  return {
    targetAnnualEarningsMin: null,
    targetAnnualEarningsTarget: null,
    targetHourlyRateMin: null,
    targetHourlyRateTarget: null,
    compensationCurrency: null,
    employmentTypes: [],
    annualEarningsMinimumRequired: false,
    hourlyRateMinimumRequired: false,
    employmentTypeRequired: false,
  };
}

export function parseEmploymentTypeCodes(value: unknown): EmploymentTypeCode[] {
  const raw: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) raw.push(String(entry));
  } else if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parseEmploymentTypeCodes(parsed);
    } catch {
      // comma-separated codes
    }
    raw.push(...trimmed.split(","));
  }
  const codes: EmploymentTypeCode[] = [];
  for (const entry of raw) {
    const code = entry.trim();
    if (isEmploymentTypeCode(code) && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

export function parseStatedEmploymentTypes(text: string | null | undefined): EmploymentTypeCode[] {
  if (!text?.trim()) return [];
  const codes: EmploymentTypeCode[] = [];
  if (/full[-\s]?time/i.test(text)) codes.push("FULL_TIME");
  if (/part[-\s]?time/i.test(text)) codes.push("PART_TIME");
  return codes;
}

function annualHours(): number {
  const hours = compensationConfig.annualHoursForEstimate;
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Annual hours for compensation estimates must be a positive number.");
  }
  return hours;
}

function parseAmounts(text: string): number[] {
  const pattern =
    /(?:USD|EUR|GBP|US\$|\$|€|£)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*([kK])?/gi;
  const values: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const token = match[0] ?? "";
    const digits = (match[1] ?? "").replace(/,/g, "");
    let value = Number(digits);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (match[2]) value *= 1000;
    const hasMoneyMark = /[$€£]|USD|EUR|GBP/i.test(token) || Boolean(match[2]);
    if (
      !hasMoneyMark &&
      !match[1]?.includes(",") &&
      value >= 1900 &&
      value <= 2100
    ) {
      continue;
    }
    values.push(value);
  }
  return values;
}

function statedCurrency(text: string): string | null {
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/\$|\bUSD\b|US\$/i.test(text)) return "USD";
  return null;
}

function statedUnit(text: string, amounts: number[]): PayUnit | "UNKNOWN" {
  const hourly = /\b(hourly|per\s+hour|an\s+hour|\/\s*hr\b|\/\s*hour)\b/i.test(text);
  const annual = /\b(annual(?:ly)?|per\s+year|a\s+year|\/\s*yr\b|\/\s*year|salary|\bote\b)\b/i.test(text);
  const max = Math.max(...amounts);
  if (hourly && !annual) return "HOURLY";
  if (annual && !hourly) return "ANNUAL";
  if (hourly && annual) return max >= 1000 ? "ANNUAL" : "HOURLY";
  if (max >= 1000) return "ANNUAL";
  if (max < 500) return "HOURLY";
  return "UNKNOWN";
}

export function parseStatedCompensation(text: string | null | undefined): StatedPay | null {
  if (!text?.trim()) return null;
  const amounts = parseAmounts(text);
  if (amounts.length === 0) return null;
  return {
    unit: statedUnit(text, amounts),
    minimum: Math.min(...amounts),
    maximum: Math.max(...amounts),
    currency: statedCurrency(text),
    raw: text.trim(),
  };
}

function seekerCurrency(profile: EmployerCompensationProfile): string {
  const code = profile.compensationCurrency?.trim();
  return code || compensationConfig.defaultCurrency;
}

function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    }).format(rounded);
  } catch {
    return `${rounded} ${currency}`;
  }
}

function toUnit(
  amount: number,
  from: PayUnit,
  to: PayUnit,
): { value: number; estimated: boolean } {
  if (from === to) return { value: amount, estimated: false };
  const hours = annualHours();
  if (from === "HOURLY" && to === "ANNUAL") {
    return { value: amount * hours, estimated: true };
  }
  return { value: amount / hours, estimated: true };
}

function belowMinimum(postingMaximum: number, minimum: number): boolean {
  return Math.round(postingMaximum * 100) < Math.round(minimum * 100);
}

function baseOutcome(
  name: string,
  evidence: string,
  assessment: CompensationFitOutcome["assessment"],
): CompensationFitOutcome {
  return {
    criterionId: null,
    name,
    evidenceClass: "LIST_DATA",
    isRequired: false,
    isDisqualifier: false,
    assessment,
    evidenceOutcome:
      assessment === "NO_FIT"
        ? "CONTRADICTED"
        : assessment === "STRONG"
          ? "SUPPORTED"
          : null,
    reasoning: evidence,
    evidence,
    source: null,
    limitedPublicEvidence: false,
    mustHaveMiss: false,
    dealBreakerHit: false,
    preferenceMiss: false,
    estimated: false,
  };
}

function floorForPosting(
  profile: EmployerCompensationProfile,
  unit: PayUnit,
): { amount: number; unit: PayUnit; hard: boolean } | null {
  if (unit === "ANNUAL" && profile.targetAnnualEarningsMin != null) {
    return {
      amount: profile.targetAnnualEarningsMin,
      unit: "ANNUAL",
      hard: profile.annualEarningsMinimumRequired,
    };
  }
  if (unit === "HOURLY" && profile.targetHourlyRateMin != null) {
    return {
      amount: profile.targetHourlyRateMin,
      unit: "HOURLY",
      hard: profile.hourlyRateMinimumRequired,
    };
  }
  if (profile.targetAnnualEarningsMin != null) {
    return {
      amount: profile.targetAnnualEarningsMin,
      unit: "ANNUAL",
      hard: profile.annualEarningsMinimumRequired,
    };
  }
  if (profile.targetHourlyRateMin != null) {
    return {
      amount: profile.targetHourlyRateMin,
      unit: "HOURLY",
      hard: profile.hourlyRateMinimumRequired,
    };
  }
  return null;
}

function compensationOutcome(
  profile: EmployerCompensationProfile,
  compensationRange: string | null | undefined,
): CompensationFitOutcome {
  const stated = parseStatedCompensation(compensationRange);
  if (!stated) {
    return baseOutcome(
      compensationCopy.compensationSignal,
      compensationCopy.notStated,
      "UNKNOWN",
    );
  }

  const currency = seekerCurrency(profile);
  if (stated.currency && stated.currency !== currency) {
    return baseOutcome(
      compensationCopy.compensationSignal,
      `Posting currency ${stated.currency} differs from ${currency}. Amounts were not compared.`,
      "UNKNOWN",
    );
  }

  if (stated.unit === "UNKNOWN") {
    return baseOutcome(
      compensationCopy.compensationSignal,
      `${compensationCopy.unitUnrecognized} Posting states ${stated.raw}.`,
      "UNKNOWN",
    );
  }

  const floor = floorForPosting(profile, stated.unit);
  if (!floor) {
    return baseOutcome(
      compensationCopy.compensationSignal,
      `Posting states ${stated.raw}. No minimum is set.`,
      "UNKNOWN",
    );
  }

  const converted = toUnit(stated.maximum, stated.unit, floor.unit);
  const miss = belowMinimum(converted.value, floor.amount);
  const minimumLabel = formatMoney(floor.amount, currency);
  const comparedLabel = formatMoney(converted.value, currency);
  const period = floor.unit === "ANNUAL" ? "annual" : "hourly";
  const relation = miss
    ? "is below"
    : "is at or above";
  const sentence = converted.estimated
    ? `${compensationCopy.estimate}: posting maximum ${formatMoney(stated.maximum, currency)} ${stated.unit === "HOURLY" ? "per hour" : "per year"} is about ${comparedLabel} ${period === "annual" ? "per year" : "per hour"}, which ${relation} the ${period} minimum of ${minimumLabel}.`
    : `Posting maximum ${comparedLabel} ${relation} the ${period} minimum of ${minimumLabel}.`;

  const outcome = baseOutcome(
    compensationCopy.compensationSignal,
    sentence,
    miss ? "NO_FIT" : "STRONG",
  );
  outcome.estimated = converted.estimated;
  outcome.source = converted.estimated ? compensationCopy.estimate : null;
  outcome.isRequired = floor.hard;
  outcome.mustHaveMiss = miss && floor.hard;
  outcome.preferenceMiss = miss && !floor.hard;
  return outcome;
}

function labels(codes: EmploymentTypeCode[]): string {
  return codes.map((code) => employmentTypeLabel(code)).join(", ");
}

function employmentOutcome(
  profile: EmployerCompensationProfile,
  employmentType: string | null | undefined,
): CompensationFitOutcome {
  const stated = parseStatedEmploymentTypes(employmentType);
  if (stated.length === 0) {
    return baseOutcome(
      compensationCopy.employmentTypeLabel,
      compensationCopy.notStated,
      "UNKNOWN",
    );
  }
  if (profile.employmentTypes.length === 0) {
    return baseOutcome(
      compensationCopy.employmentTypeLabel,
      `Posting states ${labels(stated)}. No employment type is selected.`,
      "UNKNOWN",
    );
  }
  const matches = stated.some((code) => profile.employmentTypes.includes(code));
  if (matches) {
    return baseOutcome(
      compensationCopy.employmentTypeLabel,
      `Posting states ${labels(stated)}, which matches the selected employment type.`,
      "STRONG",
    );
  }
  const outcome = baseOutcome(
    compensationCopy.employmentTypeLabel,
    `Posting states ${labels(stated)}. Selected employment type is ${labels(profile.employmentTypes)}.`,
    "NO_FIT",
  );
  outcome.isRequired = profile.employmentTypeRequired;
  outcome.mustHaveMiss = profile.employmentTypeRequired;
  outcome.preferenceMiss = !profile.employmentTypeRequired;
  return outcome;
}

export function compareEmployerCompensation(input: {
  profile: EmployerCompensationProfile;
  compensationRange: string | null | undefined;
  employmentType: string | null | undefined;
}): CompensationFitOutcome[] {
  return [
    compensationOutcome(input.profile, input.compensationRange),
    employmentOutcome(input.profile, input.employmentType),
  ];
}

export function compensationSignalMiss(outcomes: CompensationFitOutcome[]): boolean {
  return outcomes.some((outcome) => outcome.mustHaveMiss || outcome.preferenceMiss);
}
