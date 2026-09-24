import { z } from "zod";

export const RESUME_ASSET_PROMPT_VERSION = "4";
export const COVER_LETTER_ASSET_PROMPT_VERSION = "11";
export const OUTREACH_EMAIL_PROMPT_VERSION = "5";
export const OUTREACH_LINKEDIN_NOTE_PROMPT_VERSION = "5";
export const OUTREACH_LINKEDIN_INMAIL_PROMPT_VERSION = "5";
export const ASSET_CLAIM_VALIDATION_PROMPT_VERSION = "4";

export const assetSupportSchema = z.object({
  sourceId: z.string().trim().min(1),
  quote: z.string().trim().min(1),
});

export const assetClaimSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  supports: z.array(assetSupportSchema).min(1),
});

/** Ask or redirect lines may have no factual citation. */
export const outreachClaimSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  supports: z.array(assetSupportSchema),
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

const coverLetterParagraphSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  supports: z.array(assetSupportSchema),
});

export const coverLetterAssetContentSchema = z.object({
  type: z.literal("COVER_LETTER"),
  salutation: z.string().trim().min(1),
  paragraphs: z.array(coverLetterParagraphSchema).min(3).max(4),
  signoff: z.string().trim().min(1),
  signerName: z.string().trim().min(1),
});

export const emailAssetContentSchema = z.object({
  type: z.literal("EMAIL"),
  subject: z.string().trim().min(1),
  greeting: z.string().trim().min(1),
  paragraphs: z.array(outreachClaimSchema).min(1),
  signoff: z.string().trim().min(1),
  signerName: z.string().trim().min(1),
});

export const linkedinNoteAssetContentSchema = z.object({
  type: z.literal("LINKEDIN_CONNECTION_NOTE"),
  greeting: z.string().trim().min(1),
  body: outreachClaimSchema,
});

export const linkedinInmailAssetContentSchema = z.object({
  type: z.literal("LINKEDIN_INMAIL"),
  subject: z.string().trim().min(1),
  greeting: z.string().trim().min(1),
  paragraphs: z.array(outreachClaimSchema).min(1),
});

export const applicationAssetContentSchema = z.discriminatedUnion("type", [
  resumeAssetContentSchema,
  coverLetterAssetContentSchema,
  emailAssetContentSchema,
  linkedinNoteAssetContentSchema,
  linkedinInmailAssetContentSchema,
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
export type AssetClaim = z.infer<typeof outreachClaimSchema>;
export type ResumeAssetContent = z.infer<typeof resumeAssetContentSchema>;
export type CoverLetterAssetContent = z.infer<
  typeof coverLetterAssetContentSchema
>;
export type EmailAssetContent = z.infer<typeof emailAssetContentSchema>;
export type LinkedinNoteAssetContent = z.infer<
  typeof linkedinNoteAssetContentSchema
>;
export type LinkedinInmailAssetContent = z.infer<
  typeof linkedinInmailAssetContentSchema
>;
export type ApplicationAssetContent = z.infer<
  typeof applicationAssetContentSchema
>;
export type AssetClaimValidation = z.infer<typeof assetClaimValidationSchema>;

export function assetClaims(content: ApplicationAssetContent): AssetClaim[] {
  if (content.type === "COVER_LETTER" || content.type === "EMAIL") {
    return content.paragraphs;
  }
  if (content.type === "LINKEDIN_INMAIL") return content.paragraphs;
  if (content.type === "LINKEDIN_CONNECTION_NOTE") return [content.body];
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

export function composeOutreachText(content: ApplicationAssetContent): {
  subject: string | null;
  body: string;
} {
  if (content.type === "EMAIL") {
    return {
      subject: content.subject,
      body: [
        content.greeting,
        "",
        ...content.paragraphs.map((claim) => claim.text),
        "",
        content.signoff,
        content.signerName,
      ].join("\n"),
    };
  }
  if (content.type === "LINKEDIN_CONNECTION_NOTE") {
    return {
      subject: null,
      body: `${content.greeting} ${content.body.text}`.trim(),
    };
  }
  if (content.type === "LINKEDIN_INMAIL") {
    return {
      subject: content.subject,
      body: [content.greeting, ...content.paragraphs.map((claim) => claim.text)]
        .join("\n\n")
        .trim(),
    };
  }
  return { subject: null, body: "" };
}
