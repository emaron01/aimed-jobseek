import { z } from "zod";
import { RESEARCH_SOURCE_TYPES } from "@/lib/research/types";

export const researchSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  sourceType: z.enum(RESEARCH_SOURCE_TYPES),
  retrievedAt: z.string().min(1),
  supports: z.array(z.string()),
});

export const companyResearchAiResultSchema = z.object({
  companySummary: z.string().nullable(),
  whatTheySell: z.string().nullable(),
  customerTypes: z.array(z.string()),
  primaryMarkets: z.array(z.string()),
  businessModel: z.string().nullable(),
  estimatedAov: z.string().nullable(),
  aovReasoning: z.string().nullable(),
  companySizeContext: z.string().nullable(),
  relevantTechnologies: z.array(z.string()),
  buyingSignals: z.array(z.string()),
  hiringSignals: z.array(z.string()),
  riskSignals: z.array(z.string()),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  /** Identity certainty — AMBIGUOUS forces partial/low-confidence handling. */
  identityCertainty: z.enum(["HIGH", "MEDIUM", "LOW", "AMBIGUOUS"]).optional(),
  sources: z.array(researchSourceSchema),
});

export type CompanyResearchAiResult = z.infer<
  typeof companyResearchAiResultSchema
>;
