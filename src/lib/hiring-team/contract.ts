import { z } from "zod";

export const HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION = "1";

const claimSchema = z.object({
  claim: z.string(),
  kind: z.enum(["FACT", "INFERENCE"]),
});

export const hiringTeamIdentificationSchema = z.object({
  roles: z.array(
    z.object({
      name: z.string(),
      likelyTitles: z.array(z.string()),
      department: z.string().nullable(),
      involvement: z.enum(["DIRECT", "INDIRECT"]),
      whyInvolved: z.string(),
      evidence: z.array(claimSchema),
    }),
  ),
});

export type HiringTeamIdentificationResult = z.infer<
  typeof hiringTeamIdentificationSchema
>;
