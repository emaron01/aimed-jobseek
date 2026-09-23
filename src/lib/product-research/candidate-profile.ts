/**
 * Candidate profile stored on Product.profileJson.
 * Consultation answers (later) append FACT items with their own ProductSource.
 */

import { z } from "zod";

export const PROFILE_SCHEMA_VERSION = 1 as const;
export const PROFILE_FACT_KINDS = ["FACT", "INFERENCE"] as const;
export type ProfileFactKind = (typeof PROFILE_FACT_KINDS)[number];

export const provenanceRefSchema = z.object({
  sourceId: z.string().trim().min(1),
});

export type ProvenanceRef = z.infer<typeof provenanceRefSchema>;

export const profileFactItemSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.enum(PROFILE_FACT_KINDS),
    text: z.string(),
    provenance: z.array(provenanceRefSchema).default([]),
  })
  .superRefine((item, ctx) => {
    if (item.kind === "FACT" && item.provenance.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FACT items require at least one ProductSource provenance.",
        path: ["provenance"],
      });
    }
  });

export type ProfileFactItem = z.infer<typeof profileFactItemSchema>;

export const profileExperienceRoleSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.enum(PROFILE_FACT_KINDS),
    employer: z.string().nullable().optional().default(null),
    title: z.string().nullable().optional().default(null),
    startDate: z.string().nullable().optional().default(null),
    endDate: z.string().nullable().optional().default(null),
    location: z.string().nullable().optional().default(null),
    summary: z.string().nullable().optional().default(null),
    achievements: z.array(profileFactItemSchema).default([]),
    provenance: z.array(provenanceRefSchema).default([]),
  })
  .superRefine((role, ctx) => {
    if (role.kind === "FACT" && role.provenance.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FACT roles require at least one ProductSource provenance.",
        path: ["provenance"],
      });
    }
  });

export type ProfileExperienceRole = z.infer<typeof profileExperienceRoleSchema>;

export const profileGapSchema = z.object({
  id: z.string().trim().min(1),
  area: z.string().trim().min(1),
  detail: z.string().trim().min(1),
});

export type ProfileGap = z.infer<typeof profileGapSchema>;

const optionalFact = profileFactItemSchema.nullable().optional().default(null);

export const candidateProfileSchema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION).default(PROFILE_SCHEMA_VERSION),
  identity: z.object({
    name: optionalFact,
    headline: optionalFact,
    location: optionalFact,
    workArrangementPreference: optionalFact,
    relocationOpenness: optionalFact,
  }),
  positioning: optionalFact,
  direction: z.object({
    targetTitles: z.array(profileFactItemSchema).default([]),
    seniority: optionalFact,
    functions: z.array(profileFactItemSchema).default([]),
    careerGoals: z.array(profileFactItemSchema).default([]),
  }),
  experience: z.array(profileExperienceRoleSchema).default([]),
  skills: z.array(profileFactItemSchema).default([]),
  problemsSolved: z.array(profileFactItemSchema).default([]),
  differentiators: z.array(profileFactItemSchema).default([]),
  education: z.array(profileFactItemSchema).default([]),
  credentials: z.array(profileFactItemSchema).default([]),
  domainVocabulary: z.array(profileFactItemSchema).default([]),
  compensation: z
    .object({
      id: z.string().trim().min(1),
      kind: z.enum(PROFILE_FACT_KINDS),
      text: z.string().nullable().optional().default(null),
      provenance: z.array(provenanceRefSchema).default([]),
    })
    .nullable()
    .optional()
    .default(null)
    .superRefine((item, ctx) => {
      if (!item) return;
      if (item.kind === "FACT" && item.provenance.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "FACT compensation requires at least one ProductSource provenance.",
          path: ["provenance"],
        });
      }
    }),
  gaps: z.array(profileGapSchema).default([]),
});

export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

export function emptyCandidateProfile(): CandidateProfile {
  return candidateProfileSchema.parse({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    identity: {},
    direction: {},
  });
}

export function isCandidateProfile(value: unknown): value is CandidateProfile {
  return candidateProfileSchema.safeParse(value).success;
}

export function parseCandidateProfile(raw: unknown): CandidateProfile {
  return candidateProfileSchema.parse(raw);
}

export function parseCandidateProfileSafe(
  raw: unknown,
): { ok: true; profile: CandidateProfile } | { ok: false; error: string } {
  const parsed = candidateProfileSchema.safeParse(raw);
  if (parsed.success) return { ok: true, profile: parsed.data };
  return {
    ok: false,
    error:
      parsed.error.issues.map((issue) => issue.message).join("; ") ||
      "Invalid candidate profile.",
  };
}

export function isNearEmptyCandidateProfile(
  profile: CandidateProfile | null | undefined,
): boolean {
  if (!profile) return true;
  const hasIdentity = Boolean(
    profile.identity.name?.text?.trim() ||
      profile.identity.headline?.text?.trim(),
  );
  const hasExperience = profile.experience.some(
    (role) => role.employer?.trim() || role.title?.trim(),
  );
  const hasSkills = profile.skills.some((item) => item.text.trim());
  return !hasIdentity && !hasExperience && !hasSkills;
}

/** Product columns mirrored from the approved candidate profile. */
export function productFieldsFromCandidateProfile(profile: CandidateProfile): {
  name: string | null;
  description: string | null;
  valueProposition: string | null;
} {
  return {
    name: profile.identity.name?.text?.trim() || null,
    description: profile.identity.headline?.text?.trim() || null,
    valueProposition: profile.positioning?.text?.trim() || null,
  };
}

/**
 * Profile safe to send to outreach or document generation.
 * Compensation is private and never included.
 */
export function candidateProfileForGeneration(
  raw: unknown,
): Omit<CandidateProfile, "compensation"> | null {
  const parsed = candidateProfileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { compensation: _omitted, ...rest } = parsed.data;
  return rest;
}

/** Strip compensation from a stored profile or leftover JSON before generation. */
export function omitCompensationFromUnknown(raw: unknown): unknown {
  const parsed = candidateProfileForGeneration(raw);
  if (parsed) return parsed;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (!("compensation" in raw)) return raw;
  const { compensation: _omitted, ...rest } = raw as Record<string, unknown>;
  return rest;
}

export function profileContainsCompensation(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const compensation = (raw as { compensation?: unknown }).compensation;
  if (!compensation || typeof compensation !== "object") return false;
  const text = (compensation as { text?: unknown }).text;
  return typeof text === "string" && text.trim().length > 0;
}

export function flattenProfileTextsForEvidence(
  profile: Omit<CandidateProfile, "compensation">,
): string[] {
  const texts: string[] = [];
  const pushFact = (item: ProfileFactItem | null | undefined) => {
    if (item?.text?.trim()) texts.push(item.text.trim());
  };
  pushFact(profile.identity.name);
  pushFact(profile.identity.headline);
  pushFact(profile.identity.location);
  pushFact(profile.identity.workArrangementPreference);
  pushFact(profile.identity.relocationOpenness);
  pushFact(profile.positioning);
  profile.direction.targetTitles.forEach(pushFact);
  pushFact(profile.direction.seniority);
  profile.direction.functions.forEach(pushFact);
  profile.direction.careerGoals.forEach(pushFact);
  for (const role of profile.experience) {
    if (role.employer?.trim()) texts.push(role.employer.trim());
    if (role.title?.trim()) texts.push(role.title.trim());
    if (role.summary?.trim()) texts.push(role.summary.trim());
    role.achievements.forEach(pushFact);
  }
  profile.skills.forEach(pushFact);
  profile.problemsSolved.forEach(pushFact);
  profile.differentiators.forEach(pushFact);
  profile.education.forEach(pushFact);
  profile.credentials.forEach(pushFact);
  profile.domainVocabulary.forEach(pushFact);
  return texts;
}

export function factTexts(items: ProfileFactItem[]): string[] {
  return items.map((item) => item.text.trim()).filter(Boolean);
}
