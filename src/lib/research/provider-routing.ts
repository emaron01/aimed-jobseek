/**
 * Routing helpers for progressive company research stages.
 */

export const WEBSITE_FETCH_UNAVAILABLE_FOCUS =
  "Official company website could not be retrieved (blocked, empty, or unavailable). Use web search for company highlights and the part of the company this job serves.";

/** Skip website-only synthesis when there is nothing to synthesize and search is available. */
export function shouldSkipWebsiteOnlySynthesis(input: {
  hasFirstPartyEvidence: boolean;
  webSearchAvailable: boolean;
}): boolean {
  return input.webSearchAvailable && !input.hasFirstPartyEvidence;
}
