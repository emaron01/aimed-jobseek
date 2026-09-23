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
