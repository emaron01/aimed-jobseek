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
  reason: string;
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
  reason: z.string().min(1).optional(),
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
  /\b(?:ftc|frc|fll|first tech challenge|first robotics|first inspir(?:e|es)|student team|student robotics|grades?\s*\d|high[- ]school|community[- ]supported|not (?:a )?commercial)\b/i;
const COMMERCIAL_INDUSTRY =
  /\b(?:warehouse|fulfillment|robotics|robots?|saas|software|healthcare|hospital|logistics|manufacturing|fintech)\b/i;
const ROLE_OR_SENIORITY =
  /\b(?:senior|staff|principal|junior|intern|lead|director|manager|engineer|recruiter|title|product engineer)\b/i;
const STUDENT_SCALE =
  /\b(?:\d+\s+students?|student team|grades?\s*\d|high[- ]school team)\b/i;
const COMMERCIAL_SCALE =
  /\b(?:\d[\d,]*\s+employees?|growth[- ]stage|seed|series\s+[a-d]|headcount|enterprise|scale[- ]up)\b/i;
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
          !ROLE_OR_SENIORITY.test(token) &&
          ![
            "about",
            "their",
            "which",
            "company",
            "employer",
            "location",
            "experience",
            "requirements",
            "preferred",
            "responsibilities",
          ].includes(token),
      ),
  );
}

function fillReason(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function postingIndustryLabel(text: string): string | null {
  const matches = text.match(new RegExp(COMMERCIAL_INDUSTRY.source, "gi")) ?? [];
  const unique = [...new Set(matches.map((item) => item.toLowerCase()))].filter(
    (token) => !ROLE_OR_SENIORITY.test(token),
  );
  if (unique.length === 0) return null;
  const preferredOrder = [
    "warehouse",
    "fulfillment",
    "logistics",
    "manufacturing",
    "healthcare",
    "hospital",
    "fintech",
    "saas",
    "software",
    "robotics",
  ];
  const industry = unique
    .map((token) => (token === "robots" ? "robotics" : token))
    .filter((token, index, all) => all.indexOf(token) === index)
    .sort((left, right) => {
      const leftRank = preferredOrder.indexOf(left);
      const rightRank = preferredOrder.indexOf(right);
      return (leftRank === -1 ? preferredOrder.length : leftRank) -
        (rightRank === -1 ? preferredOrder.length : rightRank);
    })
    .slice(0, 3)
    .join(" ");
  return fillReason(employerIdentityCopy.kinds.commercialCompany, { industry });
}

function researchIndustryLabel(text: string): string | null {
  if (/\b(?:high[- ]school|grades?\s*\d)\b/i.test(text) && STUDENT_ORG.test(text)) {
    return employerIdentityCopy.kinds.highSchoolTeam;
  }
  if (STUDENT_ORG.test(text)) return employerIdentityCopy.kinds.studentTeam;
  return postingIndustryLabel(text);
}

function postingSizeLabel(text: string): string | null {
  const match = text.match(COMMERCIAL_SCALE);
  return match ? snippet(match[0]) : null;
}

function researchSizeLabel(text: string): string | null {
  const preferred = [
    /\b(?:\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+students?\b/i,
    /\bhigh[- ]school team\b/i,
    /\bstudent team\b/i,
    /\bgrades?\s*\d+(?:\s*[-–]\s*\d+)?\b/i,
  ];
  for (const pattern of preferred) {
    const match = text.match(pattern);
    if (match) return snippet(match[0]);
  }
  return postingSizeLabel(text);
}

function check(
  key: IdentityCheckKey,
  status: IdentityCheckStatus,
  postingEvidence: string | null,
  researchEvidence: string | null,
  reason: string,
): IdentityCheck {
  return { key, status, postingEvidence, researchEvidence, reason };
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
  const postingLabel = postingIndustryLabel(posting);
  const researchLabel = researchIndustryLabel(research);
  const researchStudent = STUDENT_ORG.test(research);
  const postingTokens = industryTokens(posting);
  const researchTokens = industryTokens(research);
  const overlap = [...postingTokens].filter((token) => researchTokens.has(token));
  if (!postingLabel) {
    return check(
      "industry",
      "NOT_STATED",
      null,
      researchLabel,
      employerIdentityCopy.notStatedInPosting,
    );
  }
  if (researchStudent && postingLabel) {
    return check(
      "industry",
      "MISMATCH",
      postingLabel,
      researchLabel,
      fillReason(employerIdentityCopy.reasonTemplates.industryCompare, {
        posting: postingLabel,
        research: researchLabel ?? employerIdentityCopy.kinds.studentTeam,
      }),
    );
  }
  if (overlap.length >= 2 && researchLabel) {
    return check(
      "industry",
      "MATCH",
      postingLabel,
      researchLabel,
      fillReason(employerIdentityCopy.reasonTemplates.industryMatch, {
        shared: postingLabel,
      }),
    );
  }
  if (!researchLabel) {
    return check(
      "industry",
      "NOT_STATED",
      postingLabel,
      null,
      employerIdentityCopy.notStatedInResearch,
    );
  }
  if (overlap.length === 0) {
    return check(
      "industry",
      "MISMATCH",
      postingLabel,
      researchLabel,
      fillReason(employerIdentityCopy.reasonTemplates.industryCompare, {
        posting: postingLabel,
        research: researchLabel,
      }),
    );
  }
  return check(
    "industry",
    "MATCH",
    postingLabel,
    researchLabel,
    fillReason(employerIdentityCopy.reasonTemplates.industryMatch, {
      shared: postingLabel,
    }),
  );
}

function checkLocation(
  postingLocation: string,
  researchLocation: string,
): IdentityCheck {
  const postingPlaces = extractLocations(postingLocation);
  const researchPlaces = extractLocations(researchLocation);
  if (postingPlaces.length === 0) {
    return check(
      "location",
      "NOT_STATED",
      null,
      researchPlaces[0] ?? null,
      employerIdentityCopy.notStatedInPosting,
    );
  }
  if (researchPlaces.length === 0) {
    return check(
      "location",
      "NOT_STATED",
      postingPlaces[0] ?? null,
      null,
      employerIdentityCopy.notStatedInResearch,
    );
  }
  if (locationsOverlap(postingPlaces, researchPlaces)) {
    return check(
      "location",
      "MATCH",
      postingPlaces[0] ?? null,
      researchPlaces[0] ?? null,
      fillReason(employerIdentityCopy.reasonTemplates.locationMatch, {
        shared: postingPlaces[0] ?? "",
      }),
    );
  }
  return check(
    "location",
    "MISMATCH",
    postingPlaces[0] ?? null,
    researchPlaces[0] ?? null,
    fillReason(employerIdentityCopy.reasonTemplates.locationCompare, {
      posting: postingPlaces[0] ?? "",
      research: researchPlaces[0] ?? "",
    }),
  );
}

function checkSize(
  posting: string,
  research: string,
): IdentityCheck {
  const postingLabel = postingSizeLabel(posting);
  const researchLabel = researchSizeLabel(research);
  if (!postingLabel) {
    return check(
      "sizeOrStage",
      "NOT_STATED",
      null,
      researchLabel,
      employerIdentityCopy.notStatedInPosting,
    );
  }
  const researchStudent = Boolean(research.match(STUDENT_SCALE));
  if (researchStudent && researchLabel) {
    return check(
      "sizeOrStage",
      "MISMATCH",
      postingLabel,
      researchLabel,
      fillReason(employerIdentityCopy.reasonTemplates.sizeCompare, {
        posting: postingLabel,
        research: researchLabel,
      }),
    );
  }
  if (COMMERCIAL_SCALE.test(research) && researchLabel) {
    return check(
      "sizeOrStage",
      "MATCH",
      postingLabel,
      researchLabel,
      fillReason(employerIdentityCopy.reasonTemplates.sizeMatch, {
        shared: postingLabel,
      }),
    );
  }
  if (!researchLabel) {
    return check(
      "sizeOrStage",
      "NOT_STATED",
      postingLabel,
      null,
      employerIdentityCopy.notStatedInResearch,
    );
  }
  return check(
    "sizeOrStage",
    "NOT_STATED",
    postingLabel,
    researchLabel,
    employerIdentityCopy.notStatedInResearch,
  );
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
  if (postingDomains.length === 0) {
    return check(
      "website",
      "NOT_STATED",
      null,
      researchDomains[0] ?? null,
      employerIdentityCopy.notStatedInPosting,
    );
  }
  if (researchDomains.length === 0 && !EDUCATION_HOST.test(research)) {
    return check(
      "website",
      "NOT_STATED",
      postingDomains[0] ?? null,
      null,
      employerIdentityCopy.notStatedInResearch,
    );
  }
  const researchEducation =
    researchDomains.some((domain) => EDUCATION_HOST.test(domain)) ||
    EDUCATION_HOST.test(research);
  const overlap = researchDomains.find((domain) => postingDomains.includes(domain));
  if (overlap) {
    return check(
      "website",
      "MATCH",
      postingDomains[0] ?? null,
      overlap,
      fillReason(employerIdentityCopy.reasonTemplates.websiteMatch, {
        shared: overlap,
      }),
    );
  }
  const suppliedDomains = extractDomains(suppliedWebsite ?? "");
  if (
    suppliedDomains.length > 0 &&
    researchDomains.length > 0 &&
    !researchDomains.some((domain) => suppliedDomains.includes(domain))
  ) {
    return check(
      "website",
      "MISMATCH",
      suppliedDomains[0] ?? null,
      researchDomains[0] ?? null,
      fillReason(employerIdentityCopy.reasonTemplates.websiteCompare, {
        posting: suppliedDomains[0] ?? "",
        research: researchDomains[0] ?? "",
      }),
    );
  }
  if ((postingDomains.length > 0 || suppliedDomains.length > 0) && researchEducation) {
    const researchHost = researchDomains[0] ?? snippet(research) ?? "";
    return check(
      "website",
      "MISMATCH",
      postingDomains[0] ?? suppliedDomains[0] ?? null,
      snippet(researchDomains[0] ?? research),
      fillReason(employerIdentityCopy.reasonTemplates.websiteCompare, {
        posting: postingDomains[0] ?? suppliedDomains[0] ?? "",
        research: researchHost,
      }),
    );
  }
  return check(
    "website",
    "NOT_STATED",
    postingDomains[0] ?? null,
    researchDomains[0] ?? null,
    employerIdentityCopy.notStatedInResearch,
  );
}

export function verifyEmployerIdentity(input: {
  posting: PostingIdentityInput;
  research: ResearchIdentityInput;
}): IdentityVerification {
  const postingBusinessText = corpus([
    input.posting.rawText,
    input.posting.companyName,
    input.posting.location,
    input.posting.compensationRange,
  ]);
  const postingWebsiteText = corpus([
    input.posting.rawText,
    input.posting.companyName,
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
    checkIndustry(postingBusinessText, researchText),
    checkLocation(
      corpus([input.posting.location, input.posting.rawText]),
      corpus([input.research.location, researchText]),
    ),
    checkSize(postingBusinessText, researchText),
    checkWebsite(
      postingWebsiteText,
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

function hydrateCheck(check: z.infer<typeof identityCheckSchema>): IdentityCheck {
  return {
    ...check,
    reason: check.reason?.trim() || fallbackCheckReason(check),
  };
}

function fallbackCheckReason(check: {
  status: IdentityCheckStatus;
  postingEvidence: string | null;
  researchEvidence: string | null;
}): string {
  if (check.status === "NOT_STATED" && !check.postingEvidence) {
    return employerIdentityCopy.notStatedInPosting;
  }
  if (check.status === "NOT_STATED") {
    return employerIdentityCopy.notStatedInResearch;
  }
  if (check.status === "MATCH") {
    return fillReason(employerIdentityCopy.reasonTemplates.industryMatch, {
      shared: check.postingEvidence ?? check.researchEvidence ?? "",
    });
  }
  return fillReason(employerIdentityCopy.reasonTemplates.industryCompare, {
    posting: check.postingEvidence ?? employerIdentityCopy.notStatedInPosting,
    research: check.researchEvidence ?? employerIdentityCopy.notStatedInResearch,
  });
}

export function parseIdentityVerification(
  value: unknown,
): IdentityVerification | null {
  if (value == null) return null;
  const parsed = identityVerificationSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    checks: parsed.data.checks.map(hydrateCheck),
  };
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
