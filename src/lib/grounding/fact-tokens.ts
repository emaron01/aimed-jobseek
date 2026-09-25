const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
  thousand: "1000",
  million: "1000000",
  billion: "1000000000",
};

export type FactDate = { year: number; month: number | null };

export type KnownNames = {
  employers: string[];
  titles: string[];
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeFactNumber(value: string): string {
  return asText(value).replace(/[$,%]/g, "").replace(/,/g, "").replace(/\.0+$/, "");
}

export function extractFactNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const match of asText(text).match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? []) {
    const normalized = normalizeFactNumber(match);
    if (normalized) found.add(normalized);
  }
  const lower = asText(text).toLowerCase();
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    if (pattern.test(lower)) found.add(value);
  }
  return [...found];
}

export function extractFactDates(text: string): FactDate[] {
  const found: FactDate[] = [];
  const seen = new Set<string>();
  const add = (year: number, month: number | null) => {
    const key = `${year}-${month ?? "x"}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ year, month });
  };
  const value = asText(text);
  for (const match of value.matchAll(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(19|20)\d{2}\b/gi,
  )) {
    const month = MONTHS[match[1]!.toLowerCase().replace(".", "")];
    const year = Number(match[0].slice(-4));
    if (month) add(year, month);
  }
  for (const match of value.matchAll(/\b((?:19|20)\d{2})-(0[1-9]|1[0-2])\b/g)) {
    add(Number(match[1]), Number(match[2]));
  }
  for (const match of value.matchAll(/\b((?:19|20)\d{2})\b/g)) {
    add(Number(match[1]), null);
  }
  return found;
}

export function dateAppearsInSource(date: FactDate, sourceDates: FactDate[]): boolean {
  return sourceDates.some(
    (item) =>
      item.year === date.year &&
      (date.month == null || item.month == null || item.month === date.month),
  );
}

export function nameAppearsInText(name: string, text: string): boolean {
  const needle = asText(name).replace(/\s+/g, " ").trim().toLowerCase();
  if (needle.length < 2) return false;
  const haystack = asText(text).replace(/\s+/g, " ").toLowerCase();
  if (haystack.includes(needle)) return true;
  const compact = needle.replace(/[.]/g, "");
  return compact.length >= 3 && haystack.replace(/[.]/g, "").includes(compact);
}

export function mentionedKnownNames(text: string, names: KnownNames): KnownNames {
  return {
    employers: names.employers.filter((name) => nameAppearsInText(name, text)),
    titles: names.titles.filter((name) => nameAppearsInText(name, text)),
  };
}

export type FactSupportResult = {
  ok: boolean;
  reason: string | null;
  mismatched: {
    numbers: string[];
    dates: FactDate[];
    employers: string[];
    titles: string[];
  };
};

export function factsSupportedBySources(
  claimText: string,
  sourceTexts: string[],
  known: KnownNames,
): FactSupportResult {
  const corpus = sourceTexts.join("\n");
  const sourceNumbers = new Set(sourceTexts.flatMap(extractFactNumbers));
  const sourceDates = sourceTexts.flatMap(extractFactDates);
  const claimNumbers = extractFactNumbers(claimText);
  const claimDates = extractFactDates(claimText);
  const mentioned = mentionedKnownNames(claimText, known);
  const mismatched = {
    numbers: claimNumbers.filter((value) => !sourceNumbers.has(value)),
    dates: claimDates.filter((date) => !dateAppearsInSource(date, sourceDates)),
    employers: mentioned.employers.filter((name) => !nameAppearsInText(name, corpus)),
    titles: mentioned.titles.filter((name) => !nameAppearsInText(name, corpus)),
  };
  const reasons: string[] = [];
  if (mismatched.numbers.length > 0) {
    reasons.push(`the number ${mismatched.numbers.join(", ")} is not in the source`);
  }
  if (mismatched.dates.length > 0) {
    reasons.push(
      `the date ${mismatched.dates
        .map((date) => (date.month ? `${date.year}-${String(date.month).padStart(2, "0")}` : String(date.year)))
        .join(", ")} is not in the source`,
    );
  }
  if (mismatched.employers.length > 0) {
    reasons.push(`the employer ${mismatched.employers.join(", ")} is not in the source`);
  }
  if (mismatched.titles.length > 0) {
    reasons.push(`the title ${mismatched.titles.join(", ")} is not in the source`);
  }
  return {
    ok: reasons.length === 0,
    reason: reasons.length > 0 ? reasons.join("; ") : null,
    mismatched,
  };
}

export function knownNamesFromProfile(profile: {
  experience: Array<{ employer?: string | null; title?: string | null }>;
}): KnownNames {
  const employers = new Set<string>();
  const titles = new Set<string>();
  for (const role of profile.experience) {
    if (role.employer?.trim()) employers.add(role.employer.trim());
    if (role.title?.trim()) titles.add(role.title.trim());
  }
  return { employers: [...employers], titles: [...titles] };
}

export function hasVisibleText(value: string | null | undefined): boolean {
  return Boolean(value?.replace(/\s+/g, " ").trim());
}
