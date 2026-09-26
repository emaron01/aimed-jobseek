import { z } from "zod";

export const APPLICATION_SUMMARY_PROMPT_VERSION = "7";

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
  supports: z.array(supportSchema),
});

export const cheatSheetCoachItemSchema = z.object({
  id: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
  sampleAnswer: z.string().nullable().optional(),
  harperQuestion: z.string().nullable().optional(),
  supports: z.array(supportSchema),
});

const storyVariationSchema = z.object({
  angle: z.string(),
  text: z.string(),
  supports: z.array(supportSchema),
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
    .max(6),
  variations: z.array(storyVariationSchema).min(1).max(4),
});

export const cheatSheetPersonSectionSchema = z.object({
  sectionKey: z.string(),
  roleId: z.string(),
  contactId: z.string().nullable(),
  heading: z.string(),
  sectionKind: z.enum(CHEAT_SHEET_SECTION_KINDS),
  caresAbout: z.array(guidanceItemSchema).min(1).max(4),
  bestMaterial: z.array(guidanceItemSchema).min(1).max(4),
  likelyQuestions: z.array(cheatSheetCoachItemSchema).min(1).max(4),
  questionsToAsk: z.array(guidanceItemSchema).min(1).max(4),
  storyIds: z.array(z.string()).max(4),
  recruiter: z
    .object({
      sixtySecondSummary: guidanceItemSchema,
      whyThisCompany: guidanceItemSchema,
      whyThisRole: guidanceItemSchema,
      logistics: guidanceItemSchema,
      compensationReadiness: guidanceItemSchema,
      flagAnswers: z.array(cheatSheetCoachItemSchema).max(3),
    })
    .nullable(),
  hiringManager: z
    .object({
      scorecardOutcomes: z
        .array(
          z.object({
            outcome: z.string(),
            storyId: z.string().nullable(),
            note: z.string(),
          }),
        )
        .max(5),
      firstNinetyDays: guidanceItemSchema,
      drillDowns: z.array(cheatSheetCoachItemSchema).max(4),
      gaps: z.array(cheatSheetCoachItemSchema).max(3),
    })
    .nullable(),
  executive: z
    .object({
      strategy: guidanceItemSchema,
      judgment: guidanceItemSchema,
      businessImpact: guidanceItemSchema,
    })
    .nullable(),
  crossFunctional: z
    .object({
      howWorkedAcross: guidanceItemSchema,
      dayToDay: guidanceItemSchema,
    })
    .nullable(),
  linkedinAddendum: z
    .object({
      background: guidanceItemSchema,
      focus: guidanceItemSchema,
      seekerConnection: guidanceItemSchema,
    })
    .nullable()
    .optional(),
});

export const applicationSummaryOverviewSchema = z.object({
  thirtySecondFit: guidanceItemSchema,
  careerRecap: guidanceItemSchema,
  gapsToPrepare: z.array(cheatSheetCoachItemSchema).min(1).max(3),
});

export const applicationSummaryShellSchema = z.object({
  overview: applicationSummaryOverviewSchema,
  stories: z.array(cheatSheetStorySchema),
});

export const applicationSummaryGuidanceSchema = z.object({
  overview: applicationSummaryOverviewSchema.optional(),
  stories: z.array(cheatSheetStorySchema).default([]),
  people: z.array(cheatSheetPersonSectionSchema),
});

export type ApplicationSummaryGuidance = z.infer<
  typeof applicationSummaryGuidanceSchema
>;
export type CheatSheetPersonSection = z.infer<typeof cheatSheetPersonSectionSchema>;
export type CheatSheetStory = z.infer<typeof cheatSheetStorySchema>;
export type CheatSheetCoachItem = z.infer<typeof cheatSheetCoachItemSchema>;
