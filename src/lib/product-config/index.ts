/**
 * Product configuration: vocabulary, brand, and feature visibility.
 * Client-safe entry. Deployment values are in `@/lib/product-config/deployment`.
 */
export {
  compensationCopy,
  countedNoun,
  criterionFlagLabels,
  criterionFlags,
  nounForCount,
  scoringDimensionLabel,
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
export { applicationSummaryConfig } from "./application-summary";
export { applicationAssetConfig } from "./application-assets";
export type { ApplicationAssetTypeValue } from "./application-assets";
