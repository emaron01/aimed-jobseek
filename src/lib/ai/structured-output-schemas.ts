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
  consultationPolishSchema,
  consultationStatementGroundingSchema,
} from "@/lib/consultation/contract";
import { hiringTeamIdentificationSchema } from "@/lib/hiring-team/contract";
import {
  applicationSummaryGuidanceSchema,
  applicationSummaryShellSchema,
  cheatSheetPersonSectionSchema,
} from "@/lib/application-summary/contract";
import {
  assetClaimValidationSchema,
  coverLetterAssetContentSchema,
  emailAssetContentSchema,
  linkedinInmailAssetContentSchema,
  linkedinNoteAssetContentSchema,
  resumeAssetContentSchema,
} from "@/lib/application-assets/contract";
import {
  coverLetterPresentationPlanSchema,
  resumePresentationPlanSchema,
} from "@/lib/application-assets/plan-contract";
import { applicationNextStepSchema } from "@/lib/application/next-step-contract";
import { individualProfileSchema } from "@/lib/contact-profile/contract";
import {
  interviewClarifyingQuestionsSchema,
  interviewGuideContentSchema,
  interviewThankYouClarifyingQuestionsSchema,
} from "@/lib/interview/contract";

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
    | "CONSULTATION"
    | "CONSULTATION_REPLY"
    | "APPLICATION_NEXT_STEP"
    | "APPLICATION_SUMMARY"
    | "INTERVIEW_GUIDE"
    | "HIRING_TEAM"
    | "CONTACT_PROFILE"
    | "APPLICATION_ASSET_GENERATION"
    | "EMAIL_GENERATION")[];
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
    usageOperations: ["PERSONA_SYNTHESIS", "HIRING_TEAM"],
  },
  hiringTeamIdentification: {
    schemaName: "hiring_team_identification",
    schema: hiringTeamIdentificationSchema,
    usageOperations: ["HIRING_TEAM"],
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
    usageOperations: ["CONSULTATION_REPLY"],
  },
  consultationPolish: {
    schemaName: "consultation_polish",
    schema: consultationPolishSchema,
    usageOperations: ["CONSULTATION_REPLY"],
  },
  consultationStatementGrounding: {
    schemaName: "consultation_statement_grounding",
    schema: consultationStatementGroundingSchema,
    usageOperations: ["CONSULTATION_REPLY"],
  },
  applicationSummaryGuidance: {
    schemaName: "application_summary_guidance",
    schema: applicationSummaryGuidanceSchema,
    usageOperations: ["APPLICATION_SUMMARY"],
  },
  applicationSummaryShell: {
    schemaName: "application_summary_shell",
    schema: applicationSummaryShellSchema,
    usageOperations: ["APPLICATION_SUMMARY"],
  },
  cheatSheetPersonSection: {
    schemaName: "cheat_sheet_person_section",
    schema: cheatSheetPersonSectionSchema,
    usageOperations: ["APPLICATION_SUMMARY"],
  },
  resumePresentationPlan: {
    schemaName: "resume_presentation_plan",
    schema: resumePresentationPlanSchema,
    usageOperations: ["CONSULTATION"],
  },
  coverLetterPresentationPlan: {
    schemaName: "cover_letter_presentation_plan",
    schema: coverLetterPresentationPlanSchema,
    usageOperations: ["CONSULTATION"],
  },
  applicationNextStep: {
    schemaName: "application_next_step",
    schema: applicationNextStepSchema,
    usageOperations: ["APPLICATION_NEXT_STEP"],
  },
  contactIndividualProfile: {
    schemaName: "contact_individual_profile",
    schema: individualProfileSchema,
    usageOperations: ["CONTACT_PROFILE"],
  },
  resumeAsset: {
    schemaName: "application_resume",
    schema: resumeAssetContentSchema,
    usageOperations: ["APPLICATION_ASSET_GENERATION"],
  },
  coverLetterAsset: {
    schemaName: "application_cover_letter",
    schema: coverLetterAssetContentSchema,
    usageOperations: ["APPLICATION_ASSET_GENERATION"],
  },
  outreachEmailAsset: {
    schemaName: "application_outreach_email",
    schema: emailAssetContentSchema,
    usageOperations: ["EMAIL_GENERATION"],
  },
  outreachLinkedinNoteAsset: {
    schemaName: "application_outreach_linkedin_note",
    schema: linkedinNoteAssetContentSchema,
    usageOperations: ["EMAIL_GENERATION"],
  },
  outreachLinkedinInmailAsset: {
    schemaName: "application_outreach_linkedin_inmail",
    schema: linkedinInmailAssetContentSchema,
    usageOperations: ["EMAIL_GENERATION"],
  },
  applicationAssetClaimValidation: {
    schemaName: "application_asset_claim_validation",
    schema: assetClaimValidationSchema,
    usageOperations: ["APPLICATION_ASSET_GENERATION"],
  },
  interviewClarifyingQuestions: {
    schemaName: "interview_clarifying_questions",
    schema: interviewClarifyingQuestionsSchema,
    usageOperations: ["INTERVIEW_GUIDE"],
  },
  interviewGuide: {
    schemaName: "interview_stage_guide",
    schema: interviewGuideContentSchema,
    usageOperations: ["INTERVIEW_GUIDE"],
  },
  interviewThankYouClarifyingQuestions: {
    schemaName: "interview_thank_you_clarifying_questions",
    schema: interviewThankYouClarifyingQuestionsSchema,
    usageOperations: ["INTERVIEW_GUIDE"],
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
