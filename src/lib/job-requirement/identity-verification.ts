import { z } from "zod";
import { employerIdentityCopy } from "@/lib/product-config";

export const IDENTITY_CHECK_KEYS = [
  "industry",
  "location",
  "sizeOrStage",
  "website",
] as const;

export type IdentityCheckKey = (typeof IDENTITY_CHECK_KEYS)[number];
export type IdentityCheckStatus = "MATCH" | "MISMATCH" | "NOT_STATED";
export type IdentityVerdict = "MATCHED" | "AMBIGUOUS";
export type IdentityConfirmationValue = "PENDING" | "CONFIRMED" | "REJECTED";

export type IdentityCheck = {
  key: IdentityCheckKey;
  status: IdentityCheckStatus;
  postingEvidence: string | null;
  researchEvidence: string | null;
};

export type IdentityCandidate = {
  name: string;
  summary: string | null;
  whatTheyDo: string | null;
  location: string | null;
  sizeOrStage: string | null;
  website: string | null;
};

export type IdentityVerification = {
  verdict: IdentityVerdict;
  candidate: IdentityCandidate;
  checks: IdentityCheck[];
};

const identityCheckSchema = z.object({
  key: z.enum(IDENTITY_CHECK_KEYS),
  status: z.enum(["MATCH", "MISMATCH", "NOT_STATED"]),
  postingEvidence: z.string().nullable(),
  researchEvidence: z.string().nullable(),
});

export const identityVerificationSchema = z.object({
  verdict: z.enum(["MATCHED", "AMBIGUOUS"]),
  candidate: z.object({
    name: z.string(),
    summary: z.string().nullable(),
    whatTheyDo: z.string().nullable(),
    location: z.string().nullable(),
    sizeOrStage: z.string().nullable(),
    website: z.string().nullable(),
  }),
  checks: z.array(identityCheckSchema).min(1),
});

export type PostingIdentityInput = {
  rawText: string;
  title?: string | null;
  companyName?: string | null;
  location?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  compensationRange?: string | null;
  suppliedEmployerWebsite?: string | null;
};

export type ResearchIdentityInput = {
  companyName?: string | null;
  companySummary?: string | null;
  whatTheySell?: string | null;
  businessModel?: string | null;
  companySizeContext?: string | null;
  location?: string | null;
  website?: string | null;
  identityAmbiguous?: boolean;
  researchSources?: unknown;
};

const STUDENT_ORG =
  /\b(?:ftc|frc|fll|first tech challenge|first robotics|first inspir(?:e|es)|student team|student robotics|grades?\s*9|high[- ]school|community[- ]supported|not (?:a )?commercial)\b/i;
const COMMERCIAL_EMPLOYMENT =
  /\b(?:full[- ]time|part[- ]time|warehouse|production|compensation|salary|senior|staff|principal|\$\d)\b/i;
const STUDENT_SCALE =
  /\b(?:\d+\s+students?|student team|grades?\s*\d|high[- ]school team)\b/i;
const COMMERCIAL_SCALE =
  /\b(?:\d[\d,]*\s+employees?|growth[- ]stage|seed|series\s+[a-d]|headcount|enterprise)\b/i;
const EDUCATION_HOST =
  /\b(?:firstinspires\.org|ftc-events|firstinspires|schoolwires|edublogs)\b/i;

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function snippet(text: string | null | undefined, max = 180): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function corpus(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join("\n");
}

function extractDomains(text: string): string[] {
  const found = new Set<string>();
  const email = text.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi);
  for (const match of email) {
    const host = match[1]?.toLowerCase();
    if (host) found.add(host.replace(/^www\./, ""));
  }
  const urls = text.matchAll(/\bhttps?:\/\/(?:www\.)?([A-Z0-9.-]+\.[A-Z]{2,})/gi);
  for (const match of urls) {
    const host = match[1]?.toLowerCase();
    if (host) found.add(host.replace(/^www\./, ""));
  }
  const bare = text.matchAll(/\b(?:website|site|url)\s*[:]\s*(?:https?:\/\/)?(?:www\.)?([A-Z0-9.-]+\.[A-Z]{2,})/gi);
  for (const match of bare) {
    const host = match[1]?.toLowerCase();
    if (host) found.add(host.replace(/^www\./, ""));
  }
  return [...found];
}

function extractLocations(text: string): string[] {
  const matches = text.match(
    /\b([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,2}),\s*([A-Z]{2}|[A-Z][a-z]+)\b/g,
  );
  return (matches ?? []).map((item) => normalized(item));
}

function locationsOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  return left.some((a) =>
    right.some((b) => {
      const aParts = a.split(/[,\s]+/).filter((part) => part.length >= 2);
      const bParts = b.split(/[,\s]+/).filter((part) => part.length >= 2);
      return aParts.some((part) => bParts.includes(part) && part.length >= 3);
    }),
  );
}

function industryTokens(text: string): Set<string> {
  return new Set(
    normalized(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 5 &&
          !["about", "their", "which", "company", "employer", "location"].includes(
            token,
          ),
      ),
  );
}

function researchSourceText(sources: unknown): string {
  if (!Array.isArray(sources)) return "";
  return sources
    .map((source) => {
      if (!source || typeof source !== "object") return "";
      const row = source as Record<string, unknown>;
      return [row.url, row.title, row.supports]
        .flatMap((value) =>
          Array.isArray(value)
            ? value.filter((item): item is string => typeof item === "string")
            : typeof value === "string"
              ? [value]
              : [],
        )
        .join(" ");
    })
    .join("\n");
}

function firstResearchWebsite(sources: unknown, website?: string | null): string | null {
  if (website?.trim()) return website.trim();
  const domains = extractDomains(researchSourceText(sources));
  return domains[0] ?? null;
}

function checkIndustry(
  posting: string,
  research: string,
): IdentityCheck {
  const postingCommercial = COMMERCIAL_EMPLOYMENT.test(posting);
  const researchStudent = STUDENT_ORG.test(research);
  const postingTokens = industryTokens(posting);
  const researchTokens = industryTokens(research);
  const overlap = [...postingTokens].filter((token) => researchTokens.has(token));
  if (postingCommercial && researchStudent) {
    return {
      key: "industry",
      status: "MISMATCH",
      postingEvidence: snippet(posting.match(COMMERCIAL_EMPLOYMENT)?.[0] ?? posting),
      researchEvidence: snippet(research.match(STUDENT_ORG)?.[0] ?? research),
    };
  }
  if (overlap.length >= 2) {
    return {
      key: "industry",
      status: "MATCH",
      postingEvidence: snippet(overlap.slice(0, 4).join(", ")),
      researchEvidence: snippet(overlap.slice(0, 4).join(", ")),
    };
  }
  if (!research.trim() || researchTokens.size === 0) {
    return {
      key: "industry",
      status: "NOT_STATED",
      postingEvidence: snippet(posting),
      researchEvidence: null,
    };
  }
  if (postingCommercial && research.trim() && overlap.length === 0 && researchStudent) {
    return {
      key: "industry",
      status: "MISMATCH",
      postingEvidence: snippet(posting),
      researchEvidence: snippet(research),
    };
  }
  return {
    key: "industry",
    status: overlap.length > 0 ? "MATCH" : "NOT_STATED",
    postingEvidence: snippet(posting),
    researchEvidence: snippet(research),
  };
}

function checkLocation(
  postingLocation: string,
  researchLocation: string,
): IdentityCheck {
  const postingPlaces = extractLocations(postingLocation);
  const researchPlaces = extractLocations(researchLocation);
  if (postingPlaces.length === 0 || researchPlaces.length === 0) {
    return {
      key: "location",
      status: "NOT_STATED",
      postingEvidence: snippet(postingLocation) || null,
      researchEvidence: snippet(researchLocation) || null,
    };
  }
  if (locationsOverlap(postingPlaces, researchPlaces)) {
    return {
      key: "location",
      status: "MATCH",
      postingEvidence: postingPlaces[0] ?? null,
      researchEvidence: researchPlaces[0] ?? null,
    };
  }
  return {
    key: "location",
    status: "MISMATCH",
    postingEvidence: postingPlaces[0] ?? snippet(postingLocation),
    researchEvidence: researchPlaces[0] ?? snippet(researchLocation),
  };
}

function checkSize(
  posting: string,
  research: string,
): IdentityCheck {
  const postingCommercial =
    COMMERCIAL_EMPLOYMENT.test(posting) || COMMERCIAL_SCALE.test(posting);
  const researchStudent = STUDENT_SCALE.test(research) || STUDENT_ORG.test(research);
  const researchCommercial = COMMERCIAL_SCALE.test(research);
  if (postingCommercial && researchStudent) {
    return {
      key: "sizeOrStage",
      status: "MISMATCH",
      postingEvidence: snippet(posting.match(COMMERCIAL_EMPLOYMENT)?.[0] ?? posting),
      researchEvidence: snippet(research.match(STUDENT_SCALE)?.[0] ?? research.match(STUDENT_ORG)?.[0] ?? research),
    };
  }
  if (researchCommercial && postingCommercial) {
    return {
      key: "sizeOrStage",
      status: "MATCH",
      postingEvidence: snippet(posting.match(COMMERCIAL_EMPLOYMENT)?.[0] ?? posting),
      researchEvidence: snippet(research.match(COMMERCIAL_SCALE)?.[0] ?? research),
    };
  }
  return {
    key: "sizeOrStage",
    status: "NOT_STATED",
    postingEvidence: snippet(posting) || null,
    researchEvidence: snippet(research) || null,
  };
}

function checkWebsite(
  posting: string,
  research: string,
  suppliedWebsite?: string | null,
): IdentityCheck {
  const postingDomains = extractDomains(
    corpus([posting, suppliedWebsite]),
  );
  const researchDomains = extractDomains(research);
  if (postingDomains.length === 0 && researchDomains.length === 0) {
    return {
      key: "website",
      status: "NOT_STATED",
      postingEvidence: null,
      researchEvidence: null,
    };
  }
  const researchEducation =
    researchDomains.some((domain) => EDUCATION_HOST.test(domain)) ||
    EDUCATION_HOST.test(research);
  const overlap = researchDomains.find((domain) => postingDomains.includes(domain));
  if (overlap) {
    return {
      key: "website",
      status: "MATCH",
      postingEvidence: postingDomains[0] ?? null,
      researchEvidence: overlap,
    };
  }
  const suppliedDomains = extractDomains(suppliedWebsite ?? "");
  if (
    suppliedDomains.length > 0 &&
    researchDomains.length > 0 &&
    !researchDomains.some((domain) => suppliedDomains.includes(domain))
  ) {
    return {
      key: "website",
      status: "MISMATCH",
      postingEvidence: suppliedDomains[0] ?? null,
      researchEvidence: researchDomains[0] ?? null,
    };
  }
  if ((postingDomains.length > 0 || suppliedDomains.length > 0) && researchEducation) {
    return {
      key: "website",
      status: "MISMATCH",
      postingEvidence: postingDomains[0] ?? suppliedDomains[0] ?? null,
      researchEvidence: snippet(researchDomains[0] ?? research),
    };
  }
  return {
    key: "website",
    status: "NOT_STATED",
    postingEvidence: postingDomains[0] ?? null,
    researchEvidence: researchDomains[0] ?? null,
  };
}

export function verifyEmployerIdentity(input: {
  posting: PostingIdentityInput;
  research: ResearchIdentityInput;
}): IdentityVerification {
  const postingText = corpus([
    input.posting.rawText,
    input.posting.title,
    input.posting.companyName,
    input.posting.location,
    input.posting.employmentType,
    input.posting.seniority,
    input.posting.compensationRange,
    input.posting.suppliedEmployerWebsite,
  ]);
  const researchText = corpus([
    input.research.companySummary,
    input.research.whatTheySell,
    input.research.businessModel,
    input.research.companySizeContext,
    input.research.location,
    input.research.website,
    researchSourceText(input.research.researchSources),
  ]);
  const checks: IdentityCheck[] = [
    checkIndustry(postingText, researchText),
    checkLocation(
      corpus([input.posting.location, input.posting.rawText]),
      corpus([input.research.location, researchText]),
    ),
    checkSize(postingText, researchText),
    checkWebsite(
      postingText,
      researchText,
      input.posting.suppliedEmployerWebsite,
    ),
  ];
  const mismatched = checks.some((check) => check.status === "MISMATCH");
  const verdict: IdentityVerdict =
    input.research.identityAmbiguous || mismatched ? "AMBIGUOUS" : "MATCHED";
  return {
    verdict,
    candidate: {
      name: input.research.companyName?.trim() || input.posting.companyName?.trim() || "",
      summary: input.research.companySummary?.trim() || null,
      whatTheyDo: input.research.whatTheySell?.trim() || null,
      location: input.research.location?.trim() || extractLocations(researchText)[0] || null,
      sizeOrStage: input.research.companySizeContext?.trim() || null,
      website: firstResearchWebsite(input.research.researchSources, input.research.website),
    },
    checks,
  };
}

export function parseIdentityVerification(
  value: unknown,
): IdentityVerification | null {
  if (value == null) return null;
  const parsed = identityVerificationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function mayUseEmployerResearch(input: {
  confirmation?: IdentityConfirmationValue | null;
  verification?: IdentityVerification | null;
  identityAmbiguous?: boolean;
}): boolean {
  if (input.confirmation === "REJECTED") return false;
  if (input.confirmation === "CONFIRMED") return true;
  if (input.identityAmbiguous) return false;
  if (!input.verification) return false;
  return input.verification.verdict === "MATCHED";
}

export function identityMismatchReason(): string {
  return employerIdentityCopy.unmatched;
}

export function identityStaleReason(): string {
  return employerIdentityCopy.staleDependents;
}

export function researchIdentityInput(research: {
  companySummary?: string | null;
  whatTheySell?: string | null;
  businessModel?: string | null;
  companySizeContext?: string | null;
  identityAmbiguous?: boolean;
  researchSources?: unknown;
  company?: { name?: string | null; location?: string | null; website?: string | null } | null;
}): ResearchIdentityInput {
  return {
    companyName: research.company?.name ?? null,
    companySummary: research.companySummary ?? null,
    whatTheySell: research.whatTheySell ?? null,
    businessModel: research.businessModel ?? null,
    companySizeContext: research.companySizeContext ?? null,
    location: research.company?.location ?? null,
    website: research.company?.website ?? null,
    identityAmbiguous: research.identityAmbiguous === true,
    researchSources: research.researchSources,
  };
}

export function postingIdentityInput(requirement: {
  rawText: string;
  title?: string | null;
  companyName?: string | null;
  location?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  compensationRange?: string | null;
  suppliedEmployerWebsite?: string | null;
}): PostingIdentityInput {
  return {
    rawText: requirement.rawText,
    title: requirement.title,
    companyName: requirement.companyName,
    location: requirement.location,
    employmentType: requirement.employmentType,
    seniority: requirement.seniority,
    compensationRange: requirement.compensationRange,
    suppliedEmployerWebsite: requirement.suppliedEmployerWebsite,
  };
}

export function usableEmployerResearch<
  T extends {
    identityAmbiguous?: boolean;
    companySummary?: string | null;
    whatTheySell?: string | null;
    businessModel?: string | null;
    companySizeContext?: string | null;
    researchSources?: unknown;
  },
>(
  requirement: {
    identityConfirmation?: IdentityConfirmationValue | null;
    identityVerificationJson?: unknown;
    rawText?: string | null;
    title?: string | null;
    companyName?: string | null;
    location?: string | null;
    employmentType?: string | null;
    seniority?: string | null;
    compensationRange?: string | null;
    suppliedEmployerWebsite?: string | null;
    company?: { name?: string | null; location?: string | null; website?: string | null } | null;
  },
  research: T | null,
): T | null {
  if (!research) return null;
  if (requirement.identityConfirmation === "REJECTED") return null;
  if (requirement.identityConfirmation === "CONFIRMED") return research;
  if (research.identityAmbiguous === true) return null;
  const stored = parseIdentityVerification(requirement.identityVerificationJson);
  const verification =
    stored ??
    (requirement.rawText
      ? verifyEmployerIdentity({
          posting: postingIdentityInput({
            rawText: requirement.rawText,
            title: requirement.title,
            companyName: requirement.companyName,
            location: requirement.location,
            employmentType: requirement.employmentType,
            seniority: requirement.seniority,
            compensationRange: requirement.compensationRange,
            suppliedEmployerWebsite: requirement.suppliedEmployerWebsite,
          }),
          research: researchIdentityInput({
            ...research,
            company: requirement.company,
          }),
        })
      : null);
  if (
    mayUseEmployerResearch({
      confirmation: requirement.identityConfirmation,
      verification,
      identityAmbiguous: false,
    })
  ) {
    return research;
  }
  return null;
}
