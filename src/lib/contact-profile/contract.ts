import { z } from "zod";

export const CONTACT_PROFILE_PROMPT_VERSION = "1";
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

export const linkedInExtractedSchema = z.object({
  currentTitle: factItem.nullable(),
  currentEmployer: factItem.nullable(),
  currentTenure: factItem.nullable(),
  priorRoles: z.array(
    z.object({
      employer: factItem,
      title: factItem.nullable(),
    }),
  ),
  education: z.array(factItem),
  statedFocus: z.array(factItem),
});

export type LinkedInExtracted = z.infer<typeof linkedInExtractedSchema>;

export const commonGroundItemSchema = z.object({
  text: z.string().trim().min(1),
  seekerSource: z.string().trim().min(1),
  contactSource: z.string().trim().min(1),
});

export type CommonGroundItem = z.infer<typeof commonGroundItemSchema>;

export const individualProfileSchema = z.object({
  caresAbout: z.array(inferenceItem),
  talkingPoints: z.array(inferenceItem),
});

export type IndividualProfileDraft = z.infer<typeof individualProfileSchema>;

export const individualProfileRecordSchema = z.object({
  caresAbout: z.array(inferenceItem),
  talkingPoints: z.array(inferenceItem),
  commonGround: z.array(commonGroundItemSchema),
  promptVersion: z.string(),
});

export type IndividualProfileRecord = z.infer<typeof individualProfileRecordSchema>;
