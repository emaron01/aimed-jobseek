/**
 * Shared seeker-facing chrome: page titles, verbs, and designed view states.
 */
import { brand } from "./brand";
import { consultationConfig } from "./consultation";
import { vocab } from "./vocabulary";

export const polishCopy = Object.freeze({
  generate: "Generate",
  regenerate: "Regenerate",
  researchAndGenerate: "Research and generate",
  loading: "Loading this page…",
  errorTitle: "This did not load",
  errorBody: "Something went wrong while loading this page. Retry.",
  errorRetry: "Retry",
  trackerLoadFailed: "The application steps could not be loaded.",
  harperSuggestionsFailed: `${consultationConfig.displayName} could not load suggestions.`,
  settingsTitle: "Settings",
  settingsHelp: "Account, billing, and workspace preferences.",
  accountTitle: "Account settings",
  accountHelp: "Your name, email, and password.",
  voiceTitle: "Your voice",
  voiceHelp: "Writing samples for generated messages.",
  billingTitle: "Billing",
  homeTitle: "Home",
  homeHelp: `Your ${vocab.campaign.plural} and next steps.`,
  applicationsHelp: `Every ${vocab.campaign.singular} you are working on.`,
  signatureUnavailable:
    "The signature could not be loaded. Retry, or contact support if this continues.",
  offerNotes: "Offer notes",
  backToApplications: `Back to ${vocab.campaign.plural}`,
  factLabel: "Stated",
  inferredLabel: "Inferred",
  editedByYou: "Edited by you",
});

export function applicationPageTitle(
  page: string,
  applicationName: string,
): string {
  const pagePart = page.trim();
  const appPart = applicationName.trim();
  if (!pagePart) {
    throw new Error("A page title is required.");
  }
  if (!appPart) return `${pagePart} · ${brand.appName}`;
  return `${pagePart} · ${appPart}`;
}

export function productPageTitle(page: string): string {
  const pagePart = page.trim();
  if (!pagePart) {
    throw new Error("A page title is required.");
  }
  return pagePart;
}

/** Patterns that must not appear in seeker-facing copy. */
export const seekerFacingForbiddenPatterns = Object.freeze([
  { name: "queue", pattern: /\bqueue\b/i },
  { name: "validation", pattern: /\bvalidation\b/i },
  { name: "schema", pattern: /\bschema\b/i },
  { name: "enum", pattern: /\benum\b/i },
  { name: "worker", pattern: /\bworker\b/i },
  { name: "INFERENCE", pattern: /\bINFERENCE\b/ },
  { name: "consultation model", pattern: /consultation model/i },
  { name: "background job", pattern: /background job/i },
  { name: "raw id", pattern: /\bcm[a-z0-9]{20,}\b/ },
]);
