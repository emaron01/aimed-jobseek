/**
 * Product configuration: vocabulary, brand, and feature visibility.
 * Client-safe entry. Deployment values are in `@/lib/product-config/deployment`.
 */
export {
  countedNoun,
  nounForCount,
  vocab,
  vocabExamples,
} from "./vocabulary";
export type {
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
