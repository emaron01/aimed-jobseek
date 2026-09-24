import { z } from "zod";

const scorecardItemSchema = z.object({
  text: z.string(),
  inferred: z.boolean(),
});

export const jobRequirementAiResultSchema = z.object({
  title: z.string().nullable(),
  companyName: z.string().nullable(),
  location: z.string().nullable(),
  workArrangement: z.string().nullable(),
  employmentType: z.string().nullable(),
  seniority: z.string().nullable(),
  compensationRange: z.string().nullable(),
  reportingLine: z.string().nullable(),
  responsibilities: z.array(z.string()),
  requiredItems: z.array(z.string()),
  preferredItems: z.array(z.string()),
  scorecard: z.object({
    missionText: z.string().nullable(),
    missionInferred: z.boolean(),
    outcomes: z.array(scorecardItemSchema),
    competencies: z.array(scorecardItemSchema),
  }),
  namedContacts: z
    .array(
      z.object({
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        title: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
      }),
    )
    .default([]),
});

export type JobRequirementAiResult = z.infer<typeof jobRequirementAiResultSchema>;
