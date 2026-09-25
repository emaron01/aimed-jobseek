/**
 * Product configuration: vocabulary, brand, and feature visibility.
 * Client-safe entry. Deployment values are in `@/lib/product-config/deployment`.
 */
export {
  compensationCopy,
  applicationResearchCopy,
  applicationWorkspaceCopy,
  countedNoun,
  criterionFlagLabels,
  criterionFlags,
  employerIdentityCopy,
  icpLabels,
  nounForCount,
  organizationNameFromSeeker,
  scoringDimensionLabel,
  signupCopy,
  vocab,
  vocabExamples,
} from "./vocabulary";
export {
  EMPLOYMENT_TYPES,
  compensationConfig,
  employmentTypeLabel,
  isEmploymentTypeCode,
} from "./compensation";
export type { EmploymentTypeCode } from "./compensation";
export {
  consultationConfig,
  consultationConversationCopy,
  consultationStatementLabels,
  evidenceStrengthLabels,
  gapStrategyCopy,
} from "./consultation";
export type {
  CriterionFlagKey,
  NounForm,
  NounForms,
  VocabExampleKey,
  VocabKey,
} from "./vocabulary";
export {
  brand,
  brandUserAgent,
  referralShareMessage,
  supportMailtoHref,
} from "./brand";
export { FEATURE_FLAGS, anyListFeatureEnabled, features } from "./features";
export type { FeatureFlag } from "./features";
export { hiringTeamConfig } from "./hiring-team";
export {
  WORKSPACE_JOB_TYPES,
  workspaceJobCopy,
  workspaceProgressText,
  workspaceReadyText,
  workspaceSectionId,
  workspaceWaitKind,
} from "./workspace-jobs";
export type { WorkspaceWaitKind } from "./workspace-jobs";
export { applicationSummaryConfig } from "./application-summary";
export {
  interviewConfig,
  isApplicationInterviewingOrLater,
  isApplicationProgress,
  isInterviewFormat,
  isInterviewStageOutcome,
  isInterviewStageType,
} from "./interview";
export type {
  ApplicationProgressValue,
  InterviewFormatValue,
  InterviewStageOutcomeValue,
  InterviewStageTypeValue,
} from "./interview";
export { applicationAssetConfig } from "./application-assets";
export type { ApplicationAssetTypeValue } from "./application-assets";
export {
  connectionNoteBodyBudget,
  isOutreachAssetType,
  outreachConfig,
  outreachGreeting,
  outreachGroupKey,
  shouldIncludeRedirect,
} from "./outreach";
export type { OutreachAssetType } from "./outreach";
