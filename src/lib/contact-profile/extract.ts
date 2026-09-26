import {
  LINKEDIN_PASTE_SOURCE,
  linkedInExtractedSchema,
  type LinkedInExtracted,
} from "@/lib/contact-profile/contract";

const SECTION_HEADINGS = [
  "About",
  "Activity",
  "Awards",
  "Certifications",
  "Courses",
  "Education",
  "Experience",
  "Honors",
  "Interests",
  "Languages",
  "Licenses",
  "Organizations",
  "Patents",
  "Projects",
  "Publications",
  "Recommendations",
  "Skills",
  "Volunteering",
];

/** Matches "Licenses & certifications" and "Honors & awards" as one heading. */
const HEADING_TAIL = "(?:\\s*&[^\\n]*)?";

const DATE_LINE = /\b(19\d{2}|20\d{2}|present)\b/i;

function fact(text: string | null | undefined) {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) return null;
  return {
    text: value,
    kind: "FACT" as const,
    provenance: [{ sourceId: LINKEDIN_PASTE_SOURCE }],
  };
}

function facts(values: string[], limit: number) {
  return values
    .map((value) => fact(value))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, limit);
}

function section(text: string, heading: string): string {
  const stop = SECTION_HEADINGS.join("|");
  const pattern = new RegExp(
    `(?:^|\\n)${heading}${HEADING_TAIL}\\n([\\s\\S]*?)(?=\\n(?:${stop})${HEADING_TAIL}\\n|$)`,
    "i",
  );
  return text.match(pattern)?.[1]?.trim() ?? "";
}

function isHeading(line: string): boolean {
  return new RegExp(`^(?:${SECTION_HEADINGS.join("|")})${HEADING_TAIL}$`, "i").test(
    line,
  );
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The name, headline, and location block above the first section heading. */
function topBlock(text: string): string[] {
  const all = lines(text);
  const stop = all.findIndex((line) => isHeading(line));
  return stop === -1 ? all : all.slice(0, stop);
}

export function extractLinkedInFacts(pasted: string): LinkedInExtracted {
  const text = pasted.replace(/\r\n/g, "\n").trim();
  const experience = lines(section(text, "Experience"));
  const education = lines(section(text, "Education"));
  const about = lines(section(text, "About"));
  const skills = lines(section(text, "Skills"));
  const certifications = [
    ...lines(section(text, "Licenses")),
    ...lines(section(text, "Certifications")),
  ];
  const top = topBlock(text);

  const titleLine =
    top.find((line) =>
      /\b(manager|director|lead|engineer|recruiter|partner|officer|analyst|specialist|head)\b/i.test(
        line,
      ),
    ) ?? experience[1] ?? null;
  const employerLine =
    top.find((line) => /\bat\b/i.test(line)) ??
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
      const dates =
        experience.slice(index + 1, index + 4).find((item) => DATE_LINE.test(item)) ??
        null;
      if (employer) priorRoles.push({ employer, title, dates: fact(dates) });
    }
  }

  const extracted = {
    headline: fact(top[1]),
    about: fact(about.join(" ")),
    currentTitle: fact(titleLine?.replace(/\s+at\s+.+$/i, "")),
    currentEmployer: fact(
      employerLine
        ?.replace(/^.*\bat\s+/i, "")
        .replace(/\s*·.+$/, "")
        .replace(/\s*(full-time|part-time).+$/i, ""),
    ),
    currentTenure: fact(tenureLine),
    priorRoles: priorRoles.slice(0, 8),
    education: facts(education, 6),
    certifications: facts(certifications, 12),
    skills: facts(skills, 40),
    statedFocus: facts(about, 6),
  };
  return linkedInExtractedSchema.parse(extracted);
}
