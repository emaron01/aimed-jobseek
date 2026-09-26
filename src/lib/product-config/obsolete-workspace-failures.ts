/**
 * Fail-closed messages removed by flag-and-save. They must never render as
 * current workspace errors, including leftover rows on existing applications.
 */
import { applicationAssetConfig } from "./application-assets";
import { consultationConversationCopy } from "./consultation";

export const obsoleteWorkspaceFailurePhrases = Object.freeze([
  "The asset was not saved because its claims did not pass verification",
  "Retry after reviewing the violations.",
  applicationAssetConfig.labels.verificationFailed,
  "Consultation planning did not return a usable plan. Retry consultation.",
  consultationConversationCopy.planUnusable,
  "Consultation answer analysis did not return a fully grounded story.",
  "did not pass checks",
  "not enough to save",
  "did not pass verification",
  "could not be grounded",
  "Clarifying questions could not be written.",
  "Thank-you questions could not be written.",
]);

export function isObsoleteWorkspaceFailure(
  message: string | null | undefined,
): boolean {
  const haystack = message?.trim().toLowerCase();
  if (!haystack) return false;
  return obsoleteWorkspaceFailurePhrases.some((phrase) =>
    haystack.includes(phrase.toLowerCase()),
  );
}

export function sanitizeWorkspaceFailure(
  message: string | null | undefined,
): string | null {
  const trimmed = message?.trim() ?? "";
  if (!trimmed || isObsoleteWorkspaceFailure(trimmed)) return null;
  return trimmed;
}
