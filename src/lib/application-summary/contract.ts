import { z } from "zod";

export const APPLICATION_SUMMARY_PROMPT_VERSION = "11";

export const CHEAT_SHEET_SECTION_KINDS = [
  "RECRUITER",
  "HIRING_MANAGER",
  "EXECUTIVE",
  "CROSS_FUNCTIONAL",
] as const;

export type CheatSheetSectionKind = (typeof CHEAT_SHEET_SECTION_KINDS)[number];

const supportSchema = z.object({
  sourceId: z.string(),
  quote: z.string(),
});

const guidanceItemSchema = z.object({
  text: z.string(),
  supports: z.array(supportSchema).optional().default([]),
});

export const cheatSheetCoachItemSchema = z.object({
  id: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
  sampleAnswer: z.string().nullable().optional(),
  harperQuestion: z.string().nullable().optional(),
  supports: z.array(supportSchema).optional().default([]),
});

const caresAboutItemSchema = z.object({
  text: z.string(),
  seekerConnection: z.string().optional().default(""),
  supports: z.array(supportSchema).optional().default([]),
});

const questionToAskSchema = z.object({
  text: z.string(),
  followUps: z.array(z.string()).optional().default([]),
  supports: z.array(supportSchema).optional().default([]),
});

const storyVariationSchema = z.object({
  angle: z.string(),
  text: z.string(),
  supports: z.array(supportSchema).optional().default([]),
});

export const cheatSheetStorySchema = z.object({
  storyId: z.string(),
  headline: z.string(),
  situation: z.string(),
  answers: z
    .array(
      z.object({
        requirement: z.string(),
        question: z.string(),
      }),
    )
    .max(6)
    .optional()
    .default([]),
  variations: z.array(storyVariationSchema).max(4).optional().default([]),
});

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function coercePersonSection(value: unknown): unknown {
  const row = record(value);
  if (!row) return value;
  const bestMaterial = Array.isArray(row.bestMaterial) ? row.bestMaterial : [];
  const caresAbout = Array.isArray(row.caresAbout)
    ? row.caresAbout.map((item) => {
        const entry = record(item);
        if (!entry) return item;
        return {
          ...entry,
          seekerConnection:
            typeof entry.seekerConnection === "string"
              ? entry.seekerConnection
              : "",
        };
      })
    : row.caresAbout;
  const questionsToAsk = Array.isArray(row.questionsToAsk)
    ? row.questionsToAsk.map((item) => {
        const entry = record(item);
        if (!entry) return item;
        return {
          ...entry,
          followUps: Array.isArray(entry.followUps) ? entry.followUps : [],
        };
      })
    : row.questionsToAsk;
  const positioning =
    Array.isArray(row.positioningStatements) && row.positioningStatements.length > 0
      ? row.positioningStatements
      : bestMaterial;
  const keyStatements =
    Array.isArray(row.keyStatements) && row.keyStatements.length > 0
      ? row.keyStatements
      : bestMaterial;
  return {
    ...row,
    caresAbout,
    questionsToAsk,
    positioningStatements: positioning,
    keyStatements,
  };
}

function coerceOverview(value: unknown): unknown {
  const row = record(value);
  if (!row) return value;
  const thirty = record(row.thirtySecondFit);
  return {
    ...row,
    companyBackground: row.companyBackground,
    jobRequirements: Array.isArray(row.jobRequirements) ? row.jobRequirements : [],
    whereSeekerShines: Array.isArray(row.whereSeekerShines)
      ? row.whereSeekerShines
      : thirty
        ? [thirty]
        : [],
  };
}

export const cheatSheetPersonSectionGenerateSchema = z.object({
  sectionKey: z.string(),
  roleId: z.string(),
  contactId: z.string().nullable(),
  heading: z.string(),
  sectionKind: z.enum(CHEAT_SHEET_SECTION_KINDS),
  caresAbout: z.array(caresAboutItemSchema).min(1).max(6),
  positioningStatements: z.array(guidanceItemSchema).min(1).max(6),
  keyStatements: z.array(guidanceItemSchema).min(1).max(6),
  likelyQuestions: z.array(cheatSheetCoachItemSchema).min(1).max(6),
  questionsToAsk: z.array(questionToAskSchema).min(1).max(6),
});

export const cheatSheetPersonSectionSchema = z.preprocess(
  coercePersonSection,
  cheatSheetPersonSectionGenerateSchema.extend({
    bestMaterial: z.array(guidanceItemSchema).optional().default([]),
    storyIds: z.array(z.string()).optional().default([]),
    recruiter: z.unknown().nullable().optional(),
    hiringManager: z.unknown().nullable().optional(),
    executive: z.unknown().nullable().optional(),
    crossFunctional: z.unknown().nullable().optional(),
    linkedinAddendum: z.unknown().nullable().optional(),
    /** Hash of inputs used to generate this section; skip regen when unchanged. */
    inputHash: z.string().optional(),
  }),
);

export const applicationSummaryOverviewGenerateSchema = z.object({
  companyBackground: z.object({
    text: z.string().trim().min(1),
    supports: z.array(supportSchema).optional().default([]),
  }),
  jobRequirements: z.array(guidanceItemSchema).min(1).max(8),
  whereSeekerShines: z.array(guidanceItemSchema).min(1).max(6),
});

export const applicationSummaryOverviewSchema = z.preprocess(
  coerceOverview,
  applicationSummaryOverviewGenerateSchema.extend({
    thirtySecondFit: guidanceItemSchema.optional(),
    careerRecap: guidanceItemSchema.optional(),
    gapsToPrepare: z.array(cheatSheetCoachItemSchema).optional().default([]),
  }),
);

export const applicationSummaryShellSchema = z.object({
  overview: applicationSummaryOverviewGenerateSchema,
});

export const applicationSummaryGuidanceGenerateSchema = z.object({
  overview: applicationSummaryOverviewGenerateSchema.optional(),
  people: z.array(cheatSheetPersonSectionGenerateSchema),
});

export const applicationSummaryGuidanceSchema = z.object({
  overview: applicationSummaryOverviewSchema.optional(),
  stories: z.array(cheatSheetStorySchema).optional().default([]),
  people: z.array(cheatSheetPersonSectionSchema),
});

export type ApplicationSummaryGuidance = z.infer<
  typeof applicationSummaryGuidanceSchema
>;
export type CheatSheetPersonSection = z.infer<typeof cheatSheetPersonSectionSchema>;
export type CheatSheetStory = z.infer<typeof cheatSheetStorySchema>;
export type CheatSheetCoachItem = z.infer<typeof cheatSheetCoachItemSchema>;
export type CheatSheetCaresAboutItem = z.infer<typeof caresAboutItemSchema>;
export type CheatSheetQuestionToAsk = z.infer<typeof questionToAskSchema>;
