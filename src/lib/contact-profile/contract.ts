import { z } from "zod";

export const CONTACT_PROFILE_PROMPT_VERSION = "3";
export const LINKEDIN_PASTE_SOURCE = "linkedin-paste";

const factItem = z.object({
  text: z.string().trim().min(1),
  kind: z.literal("FACT"),
  provenance: z.array(z.object({ sourceId: z.string() })).min(1),
});

const inferenceItem = z.object({
  text: z.string().trim().min(1),
  kind: z.literal("INFERENCE"),
});

/** One role from the pasted text, with the description and accomplishments it carried. */
const workExperienceItem = z.object({
  employer: factItem.nullable(),
  title: factItem.nullable(),
  dates: factItem.nullable(),
  location: factItem.nullable(),
  description: factItem.nullable(),
  accomplishments: z.array(factItem),
});

/** Fields added after the first release default so already-stored extracts still parse. */
export const linkedInExtractedSchema = z.object({
  headline: factItem.nullable().default(null),
  about: factItem.nullable().default(null),
  currentTitle: factItem.nullable(),
  currentEmployer: factItem.nullable(),
  currentTenure: factItem.nullable(),
  workExperience: z.array(workExperienceItem).default([]),
  /** Superseded by workExperience. Still read so extracts saved in the old shape load. */
  priorRoles: z
    .array(
      z.object({
        employer: factItem,
        title: factItem.nullable(),
        dates: factItem.nullable().default(null),
      }),
    )
    .default([]),
  education: z.array(factItem),
  certifications: z.array(factItem).default([]),
  skills: z.array(factItem).default([]),
  statedFocus: z.array(factItem),
});

export type LinkedInExtracted = z.infer<typeof linkedInExtractedSchema>;
export type InterviewerWorkExperience = z.infer<typeof workExperienceItem>;

/**
 * Work experience from an extract of either shape. Extracts saved before the
 * model extraction kept roles in priorRoles, so those are read the same way.
 */
export function interviewerWorkExperience(
  extracted: LinkedInExtracted,
): InterviewerWorkExperience[] {
  if (extracted.workExperience.length > 0) return extracted.workExperience;
  const legacy = extracted.priorRoles.map((role) => ({
    employer: role.employer,
    title: role.title,
    dates: role.dates,
    location: null,
    description: null,
    accomplishments: [],
  }));
  if (!extracted.currentEmployer && !extracted.currentTitle) return legacy;
  return [
    {
      employer: extracted.currentEmployer,
      title: extracted.currentTitle,
      dates: extracted.currentTenure,
      location: null,
      description: null,
      accomplishments: [],
    },
    ...legacy,
  ];
}

/**
 * Model output for reading a pasted interviewer profile. Plain strings keep the
 * structured response reliable; empty strings mean the text did not contain it.
 */
export const interviewerExtractionSchema = z.object({
  headline: z.string(),
  about: z.string(),
  currentTitle: z.string(),
  currentEmployer: z.string(),
  currentTenure: z.string(),
  workExperience: z.array(
    z.object({
      employer: z.string(),
      title: z.string(),
      dates: z.string(),
      location: z.string(),
      description: z.string(),
      accomplishments: z.array(z.string()),
    }),
  ),
  education: z.array(z.string()),
  certifications: z.array(z.string()),
  skills: z.array(z.string()),
  statedFocus: z.array(z.string()),
});

export type InterviewerExtractionResult = z.infer<
  typeof interviewerExtractionSchema
>;

export const commonGroundItemSchema = z.object({
  text: z.string().trim().min(1),
  seekerSource: z.string().trim().min(1),
  contactSource: z.string().trim().min(1),
});

export type CommonGroundItem = z.infer<typeof commonGroundItemSchema>;

export const individualProfileSchema = z.object({
  caresAbout: z.array(inferenceItem),
  talkingPoints: z.array(inferenceItem),
  /** What their work experience suggests they value and emphasize. Empty when too thin. */
  likelyToValue: z.array(inferenceItem),
});

export type IndividualProfileDraft = z.infer<typeof individualProfileSchema>;

export const individualProfileRecordSchema = z.object({
  caresAbout: z.array(inferenceItem),
  talkingPoints: z.array(inferenceItem),
  likelyToValue: z.array(inferenceItem).default([]),
  commonGround: z.array(commonGroundItemSchema),
  promptVersion: z.string(),
});

export type IndividualProfileRecord = z.infer<typeof individualProfileRecordSchema>;
