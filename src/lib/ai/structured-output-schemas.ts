import type { z } from "zod";
import { offerValidationSchema } from "@/lib/campaign/offer-validation-contract";
import { contactResearchAiResultSchema } from "@/lib/contact-research/contract";
import { claimValidationSchema } from "@/lib/email-generation/claim-validation-contract";
import { emailDraftGenerationSchema } from "@/lib/email-generation/contract";
import { emailFactSelectionResultSchema } from "@/lib/email-generation/fact-selection-contract";
import { replyClassificationSchema } from "@/lib/email-generation/reply-contract";
import {
  icpInterpretationResultSchema,
  interpretationResultSchema,
} from "@/lib/interpretation/schema";
import { personaAiResponseSchema } from "@/lib/persona-research/contract";
import { productAiResponseSchema } from "@/lib/product-research/contract";
import { jobRequirementAiResultSchema } from "@/lib/job-requirement/schema";
import { companyResearchAiResultSchema } from "@/lib/research/assessment";
import { productSourceDiscoverySchema } from "@/lib/research/source-discovery-contract";
import { aiScoringAssessmentSchema } from "@/lib/scoring/assessment";
import { titleSuggestionAiResultSchema } from "@/lib/scoring/title-suggestion-contract";
import {
  consultationPlanSchema,
  consultationExtractSchema,
} from "@/lib/consultation/contract";
import { hiringTeamIdentificationSchema } from "@/lib/hiring-team/contract";

export type StructuredOutputSchemaEntry = {
  schemaName: string;
  schema: z.ZodType;
  usageOperations: readonly (
    | "PRODUCT_SYNTHESIS"
    | "PERSONA_SYNTHESIS"
    | "CONTACT_SCORING"
    | "ICP_INTERPRETATION"
    | "PERSONA_INTERPRETATION"
    | "CONTACT_RESEARCH_SYNTHESIS"
    | "RESEARCH_SYNTHESIS"
    | "PRODUCT_WEB_SEARCH"
    | "EMAIL_DRAFT_CREATED"
    | "EMAIL_COMPANY_FACT_SELECTION"
    | "CAMPAIGN_OFFER_VALIDATED"
    | "EMAIL_REPLY_CLASSIFIED"
    | "PERSONA_WEB_SEARCH"
    | "TITLE_SUGGESTION"
    | "JOB_REQUIREMENT_PARSE"
    | "CONSULTATION")[];
};

/**
 * Authoritative registry for every production generateStructured response schema.
 * Production call sites consume entries through structuredOutputRequest; tests walk
 * this same registry and reject unregistered call sites.
 */
export const STRUCTURED_OUTPUT_SCHEMAS = {
  productSynthesis: {
    schemaName: "product_setup_synthesis",
    schema: productAiResponseSchema,
    usageOperations: ["PRODUCT_SYNTHESIS"],
  },
  personaSynthesis: {
    schemaName: "persona_setup_synthesis",
    schema: personaAiResponseSchema,
    usageOperations: ["PERSONA_SYNTHESIS"],
  },
  hiringTeamIdentification: {
    schemaName: "hiring_team_identification",
    schema: hiringTeamIdentificationSchema,
    usageOperations: ["PERSONA_SYNTHESIS"],
  },
  contactScoring: {
    schemaName: "AiScoringAssessment",
    schema: aiScoringAssessmentSchema,
    usageOperations: ["CONTACT_SCORING"],
  },
  titleSuggestion: {
    schemaName: "title_suggestion",
    schema: titleSuggestionAiResultSchema,
    usageOperations: ["TITLE_SUGGESTION"],
  },
  icpInterpretation: {
    schemaName: "icp_interpretation",
    schema: icpInterpretationResultSchema,
    usageOperations: ["ICP_INTERPRETATION"],
  },
  personaInterpretation: {
    schemaName: "persona_interpretation",
    schema: interpretationResultSchema,
    usageOperations: ["PERSONA_INTERPRETATION"],
  },
  contactResearch: {
    schemaName: "contact_role_research",
    schema: contactResearchAiResultSchema,
    usageOperations: ["CONTACT_RESEARCH_SYNTHESIS"],
  },
  jobRequirement: {
    schemaName: "job_requirement_parse",
    schema: jobRequirementAiResultSchema,
    usageOperations: ["JOB_REQUIREMENT_PARSE"],
  },
  companyResearch: {
    schemaName: "CompanyResearchAiResult",
    schema: companyResearchAiResultSchema,
    usageOperations: ["RESEARCH_SYNTHESIS"],
  },
  productSourceDiscovery: {
    schemaName: "product_source_discovery",
    schema: productSourceDiscoverySchema,
    usageOperations: ["PRODUCT_WEB_SEARCH", "PERSONA_WEB_SEARCH"],
  },
  emailDraftGeneration: {
    schemaName: "email_draft_generation",
    schema: emailDraftGenerationSchema,
    usageOperations: ["EMAIL_DRAFT_CREATED"],
  },
  emailCompanyFactSelection: {
    schemaName: "email_company_fact_selection",
    schema: emailFactSelectionResultSchema,
    usageOperations: ["EMAIL_COMPANY_FACT_SELECTION"],
  },
  campaignOfferValidation: {
    schemaName: "campaign_offer_validation",
    schema: offerValidationSchema,
    usageOperations: ["CAMPAIGN_OFFER_VALIDATED"],
  },
  emailClaimValidation: {
    schemaName: "email_claim_validation",
    schema: claimValidationSchema,
    usageOperations: ["EMAIL_DRAFT_CREATED"],
  },
  consultationPlan: {
    schemaName: "consultation_plan",
    schema: consultationPlanSchema,
    usageOperations: ["CONSULTATION"],
  },
  consultationExtract: {
    schemaName: "consultation_extract",
    schema: consultationExtractSchema,
    usageOperations: ["CONSULTATION"],
  },
  prospectReplyClassification: {
    schemaName: "prospect_reply_classification",
    schema: replyClassificationSchema,
    usageOperations: ["EMAIL_REPLY_CLASSIFIED"],
  },
} as const satisfies Record<string, StructuredOutputSchemaEntry>;

export type StructuredOutputSchemaKey = keyof typeof STRUCTURED_OUTPUT_SCHEMAS;

export function structuredOutputRequest<K extends StructuredOutputSchemaKey>(
  key: K,
): {
  schema: (typeof STRUCTURED_OUTPUT_SCHEMAS)[K]["schema"];
  schemaName: string;
} {
  const entry = STRUCTURED_OUTPUT_SCHEMAS[key];
  return { schema: entry.schema, schemaName: entry.schemaName };
}
