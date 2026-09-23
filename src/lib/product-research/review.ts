/**
 * Candidate profile review helpers: source lead-in, form parse, and field labels.
 */

import {
  emptyCandidateProfile,
  isNearEmptyCandidateProfile,
  parseCandidateProfile,
  parseCandidateProfileSafe,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";
import { PRODUCT_URL_UNREADABLE_MESSAGE } from "@/lib/product-research/extraction-quality";
import { vocab } from "@/lib/product-config";

export type ProductReviewSource = {
  id: string;
  sourceType: string;
  displayName: string;
  originalUrl?: string | null;
  filename?: string | null;
  status?: string | null;
  errorSafe?: string | null;
  extractedCharCount?: number | null;
};

export const CANDIDATE_PROFILE_FIELD_PATHS = [
  "identity.name",
  "identity.headline",
  "identity.location",
  "identity.workArrangementPreference",
  "identity.relocationOpenness",
  "positioning",
  "direction.targetTitles",
  "direction.seniority",
  "direction.functions",
  "direction.careerGoals",
  "experience",
  "skills",
  "problemsSolved",
  "differentiators",
  "education",
  "credentials",
  "domainVocabulary",
  "gaps",
] as const;

export type CandidateProfileFieldPath =
  (typeof CANDIDATE_PROFILE_FIELD_PATHS)[number];

export const CANDIDATE_PROFILE_FIELD_LABELS: Record<
  CandidateProfileFieldPath | "name" | "websiteUrl",
  string
> = {
  name: `${vocab.product.Singular} name`,
  websiteUrl: "Personal site, portfolio, or GitHub URL",
  "identity.name": "Name",
  "identity.headline": "Current headline",
  "identity.location": "Location",
  "identity.workArrangementPreference": "Work arrangement preference",
  "identity.relocationOpenness": "Relocation openness",
  positioning: "Positioning statement",
  "direction.targetTitles": "Target titles",
  "direction.seniority": "Seniority",
  "direction.functions": "Functions",
  "direction.careerGoals": "Career goals",
  experience: "Experience",
  skills: "Skills and competencies",
  problemsSolved: "Problems solved for employers",
  differentiators: "Differentiators",
  education: "Education",
  credentials: "Credentials",
  domainVocabulary: "Domain vocabulary",
  gaps: "Gaps",
};

export const CANDIDATE_PROFILE_FIELD_HINTS: Record<
  CandidateProfileFieldPath | "name" | "websiteUrl",
  string
> = {
  name: `The ${vocab.product.singular} name as you want it shown in ${vocab.campaign.plural} and generated documents.`,
  websiteUrl:
    "Personal site, portfolio, or GitHub. Do not use a LinkedIn URL — paste that profile text instead.",
  "identity.headline": "Current title or how you describe your work today.",
  "identity.name": "Your name as it should appear on the profile.",
  "identity.location": "City and region, if stated.",
  "identity.workArrangementPreference":
    "Remote, hybrid, on-site, or other arrangement you stated.",
  "identity.relocationOpenness": "Whether you are open to relocating, if stated.",
  positioning: `The candidate's value proposition — written in plain language, not resume phrasing.`,
  "direction.targetTitles": "One target title per line.",
  "direction.seniority": "Seniority the materials support.",
  "direction.functions": "One function per line.",
  "direction.careerGoals": "One goal per line.",
  experience: "Roles from the materials. Do not invent dates or employers.",
  skills: "One skill per line.",
  problemsSolved: "One problem per line.",
  differentiators: "One differentiator per line.",
  education: "One education item per line.",
  credentials: "One credential per line.",
  domainVocabulary: "One term per line.",
  gaps: "Missing dates, achievements without results, or unclear scope.",
};

export function parseCandidateProfileFromFormData(
  formData: FormData,
): CandidateProfile {
  const raw = String(formData.get("candidateProfileJson") ?? "").trim();
  if (!raw) {
    throw new Error("Candidate profile is missing from the review form.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Candidate profile form data is not valid JSON.");
  }
  const result = parseCandidateProfileSafe(parsed);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.profile;
}

/** @deprecated Use parseCandidateProfileFromFormData */
export function productDraftFromFormData(formData: FormData): CandidateProfile {
  return parseCandidateProfileFromFormData(formData);
}

export function stringifyProfileSection(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function sectionValue(
  profile: CandidateProfile,
  path: CandidateProfileFieldPath,
): unknown {
  switch (path) {
    case "identity.name":
      return profile.identity.name;
    case "identity.headline":
      return profile.identity.headline;
    case "identity.location":
      return profile.identity.location;
    case "identity.workArrangementPreference":
      return profile.identity.workArrangementPreference;
    case "identity.relocationOpenness":
      return profile.identity.relocationOpenness;
    case "positioning":
      return profile.positioning;
    case "direction.targetTitles":
      return profile.direction.targetTitles;
    case "direction.seniority":
      return profile.direction.seniority;
    case "direction.functions":
      return profile.direction.functions;
    case "direction.careerGoals":
      return profile.direction.careerGoals;
    case "experience":
      return profile.experience;
    case "skills":
      return profile.skills;
    case "problemsSolved":
      return profile.problemsSolved;
    case "differentiators":
      return profile.differentiators;
    case "education":
      return profile.education;
    case "credentials":
      return profile.credentials;
    case "domainVocabulary":
      return profile.domainVocabulary;
    case "gaps":
      return profile.gaps;
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}

export function diffCandidateProfileFields(
  original: CandidateProfile | null,
  next: CandidateProfile,
): string[] {
  const baseline = original ?? emptyCandidateProfile();
  const edited: string[] = [];
  for (const path of CANDIDATE_PROFILE_FIELD_PATHS) {
    if (
      stringifyProfileSection(sectionValue(baseline, path)) !==
      stringifyProfileSection(sectionValue(next, path))
    ) {
      edited.push(path);
    }
  }
  return edited;
}

/** @deprecated Use diffCandidateProfileFields */
export function diffProductDraftFields(
  original: CandidateProfile | null,
  next: CandidateProfile,
): string[] {
  return diffCandidateProfileFields(original, next);
}

export function emptyProductDraft(): CandidateProfile {
  return emptyCandidateProfile();
}

export function isNearEmptyProductDraft(
  draft: unknown,
): boolean {
  const parsed = parseCandidateProfileSafe(draft);
  if (!parsed.ok) {
    if (!draft || typeof draft !== "object") return true;
    return true;
  }
  return isNearEmptyCandidateProfile(parsed.profile);
}

function joinReadable(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function countPhrase(
  count: number,
  one: string,
  many: (n: number) => string,
): string | null {
  if (count <= 0) return null;
  if (count === 1) return one;
  return many(count);
}

export function describeReadSources(sources: ProductReviewSource[]): {
  sentence: string;
  names: string[];
} {
  const usable = sources.filter(
    (source) =>
      source.status !== "FAILED" && source.sourceType !== "FAILED_URL",
  );
  const names = usable.map((source) => {
    if (source.sourceType === "URL" || source.sourceType === "WEB_SEARCH") {
      return source.displayName || source.originalUrl || "Website";
    }
    if (source.sourceType === "UPLOADED_DOCUMENT") {
      return source.filename || source.displayName || "Uploaded document";
    }
    return source.displayName;
  });

  const urls = usable.filter(
    (s) => s.sourceType === "URL" || s.sourceType === "WEB_SEARCH",
  ).length;
  const uploads = usable.filter((s) => s.sourceType === "UPLOADED_DOCUMENT").length;
  const notes = usable.filter((s) => s.sourceType === "USER_NOTE").length;
  const pastes = usable.filter((s) => s.sourceType === "PASTED_TEXT").length;

  const parts = [
    countPhrase(urls, "your site", (n) => `${n} pages from your site`),
    countPhrase(
      uploads,
      "1 uploaded document",
      (n) => `${n} uploaded documents`,
    ),
    countPhrase(notes, "your notes", (n) => `${n} notes`),
    countPhrase(pastes, "pasted content", (n) => `${n} pasted excerpts`),
  ].filter((part): part is string => Boolean(part));

  const sentence =
    parts.length === 0
      ? "We read the material you provided."
      : `We read ${joinReadable(parts)}.`;

  return { sentence, names };
}

export type ProductSourceLead = {
  kind: "read_ok" | "failed_read";
  sentence: string;
  detail: string | null;
  names: string[];
  failedUrls: Array<{
    url: string;
    extractedCharCount: number | null;
    errorSafe: string | null;
  }>;
};

export function describeProductSourceLead(input: {
  sources: ProductReviewSource[];
  draft?: unknown;
}): ProductSourceLead {
  const failedUrls = input.sources
    .filter(
      (source) =>
        source.sourceType === "URL" &&
        (source.status === "FAILED" || Boolean(source.errorSafe)),
    )
    .map((source) => ({
      url: source.originalUrl || source.displayName || "the supplied URL",
      extractedCharCount: source.extractedCharCount ?? null,
      errorSafe: source.errorSafe ?? null,
    }));

  const acquired = input.sources.filter(
    (source) =>
      source.status !== "FAILED" &&
      !(source.sourceType === "URL" && source.errorSafe),
  );
  const nearEmpty = isNearEmptyProductDraft(input.draft ?? null);

  if (failedUrls.length > 0 && (acquired.length === 0 || nearEmpty)) {
    const first = failedUrls[0];
    const extracted =
      first.extractedCharCount != null
        ? ` Extracted ${first.extractedCharCount} characters from ${first.url}.`
        : ` From ${first.url}.`;
    return {
      kind: "failed_read",
      sentence: PRODUCT_URL_UNREADABLE_MESSAGE,
      detail: `${extracted} Paste resume or LinkedIn text into the paste field and try again.`,
      names: [],
      failedUrls,
    };
  }

  if (nearEmpty) {
    return {
      kind: "failed_read",
      sentence: `We could not build a usable ${vocab.product.singular} from the material available.`,
      detail:
        "Almost every field was unknown. Paste resume or LinkedIn text into the paste field and try again.",
      names: describeReadSources(acquired).names,
      failedUrls,
    };
  }

  const ok = describeReadSources(acquired);
  return {
    kind: "read_ok",
    sentence: ok.sentence,
    detail: null,
    names: ok.names,
    failedUrls,
  };
}

export function sourceLabelForId(
  sourceId: string,
  sources: ProductReviewSource[],
): string {
  const match = sources.find((source) => source.id === sourceId);
  if (!match) return "Source";
  if (match.sourceType === "UPLOADED_DOCUMENT") {
    return match.filename || match.displayName;
  }
  return match.displayName;
}

export function storedProfileFromJson(raw: unknown): CandidateProfile | null {
  const parsed = parseCandidateProfileSafe(raw);
  return parsed.ok ? parsed.profile : null;
}

export { parseCandidateProfile, emptyCandidateProfile };
