import { z } from "zod";

export const RESUME_ASSET_PROMPT_VERSION = "4";
export const COVER_LETTER_ASSET_PROMPT_VERSION = "7";
export const ASSET_CLAIM_VALIDATION_PROMPT_VERSION = "2";

export const assetSupportSchema = z.object({
  sourceId: z.string().trim().min(1),
  quote: z.string().trim().min(1),
});

export const assetClaimSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  supports: z.array(assetSupportSchema).min(1),
});

export const resumeExperienceSchema = z.object({
  roleId: z.string().trim().min(1),
  employer: z.string(),
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  location: z.string().nullable(),
  hidden: z.boolean(),
  bullets: z.array(assetClaimSchema),
});

export const resumeAssetContentSchema = z.object({
  type: z.literal("RESUME"),
  header: z.object({
    name: assetClaimSchema,
    contactDetails: z.array(assetClaimSchema),
  }),
  summary: z.array(assetClaimSchema).min(1),
  experience: z.array(resumeExperienceSchema),
  skills: z.array(assetClaimSchema),
  education: z.array(assetClaimSchema),
  credentials: z.array(assetClaimSchema),
});

export const coverLetterAssetContentSchema = z.object({
  type: z.literal("COVER_LETTER"),
  salutation: z.string().trim().min(1),
  paragraphs: z.array(assetClaimSchema).min(3).max(4),
  signoff: z.string().trim().min(1),
  signerName: z.string().trim().min(1),
});

export const applicationAssetContentSchema = z.discriminatedUnion("type", [
  resumeAssetContentSchema,
  coverLetterAssetContentSchema,
]);

export const assetClaimValidationSchema = z.object({
  violations: z.array(
    z.object({
      claimId: z.string(),
      reason: z.string(),
    }),
  ),
});

export type AssetSupport = z.infer<typeof assetSupportSchema>;
export type AssetClaim = z.infer<typeof assetClaimSchema>;
export type ResumeAssetContent = z.infer<typeof resumeAssetContentSchema>;
export type CoverLetterAssetContent = z.infer<
  typeof coverLetterAssetContentSchema
>;
export type ApplicationAssetContent = z.infer<
  typeof applicationAssetContentSchema
>;
export type AssetClaimValidation = z.infer<typeof assetClaimValidationSchema>;

export function assetClaims(content: ApplicationAssetContent): AssetClaim[] {
  if (content.type === "COVER_LETTER") return content.paragraphs;
  return [
    content.header.name,
    ...content.header.contactDetails,
    ...content.summary,
    ...content.experience.flatMap((role) => role.bullets),
    ...content.skills,
    ...content.education,
    ...content.credentials,
  ];
}
