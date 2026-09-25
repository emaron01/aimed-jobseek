import {
  LINKEDIN_PASTE_SOURCE,
  linkedInExtractedSchema,
  type LinkedInExtracted,
} from "@/lib/contact-profile/contract";

function fact(text: string | null | undefined) {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) return null;
  return {
    text: value,
    kind: "FACT" as const,
    provenance: [{ sourceId: LINKEDIN_PASTE_SOURCE }],
  };
}

function section(text: string, heading: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)${heading}\\n([\\s\\S]*?)(?=\\n(?:Experience|Education|Skills|About|Licenses|Honors|Languages|Interests)\\n|$)`,
    "i",
  );
  return text.match(pattern)?.[1]?.trim() ?? "";
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function extractLinkedInFacts(pasted: string): LinkedInExtracted {
  const text = pasted.replace(/\r\n/g, "\n").trim();
  const experience = lines(section(text, "Experience"));
  const education = lines(section(text, "Education"));
  const about = lines(section(text, "About"));
  const headline = lines(text).slice(0, 6);

  const titleLine =
    headline.find((line) =>
      /\b(manager|director|lead|engineer|recruiter|partner|officer|analyst|specialist|head)\b/i.test(
        line,
      ),
    ) ?? experience[1] ?? null;
  const employerLine =
    headline.find((line) => /\bat\b/i.test(line)) ??
    experience.find((line) => /·|full-time|part-time|present/i.test(line)) ??
    experience[0] ??
    null;
  const tenureLine =
    experience.find((line) =>
      /\b(20\d{2}|present|mos?|yrs?|years?|months?)\b/i.test(line),
    ) ?? null;

  const priorRoles: LinkedInExtracted["priorRoles"] = [];
  for (let index = 0; index < experience.length; index += 1) {
    const line = experience[index]!;
    if (index === 0) continue;
    if (/\b(20\d{2}|present|full-time|part-time)\b/i.test(line)) continue;
    const next = experience[index + 1] ?? "";
    if (/\b(manager|director|lead|engineer|recruiter|partner|officer|analyst)\b/i.test(line)) {
      const employer = fact(next && !/\b20\d{2}\b/.test(next) ? next : line);
      const title = fact(line);
      if (employer) priorRoles.push({ employer, title });
    }
  }

  const extracted = {
    currentTitle: fact(titleLine?.replace(/\s+at\s+.+$/i, "")),
    currentEmployer: fact(
      employerLine
        ?.replace(/^.*\bat\s+/i, "")
        .replace(/\s*·.+$/, "")
        .replace(/\s*(full-time|part-time).+$/i, ""),
    ),
    currentTenure: fact(tenureLine),
    priorRoles: priorRoles.slice(0, 8),
    education: education
      .map((line) => fact(line))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 6),
    statedFocus: about
      .map((line) => fact(line))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 6),
  };
  return linkedInExtractedSchema.parse(extracted);
}
