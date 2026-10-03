import type { ResearchSource } from "@/lib/research/types";

/** Approved business-news hosts. Every other non-anchor host is dropped before save. */
export const APPROVED_RESEARCH_NEWS_HOSTS = [
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "forbes.com",
  "techcrunch.com",
  "businesswire.com",
  "prnewswire.com",
] as const;

/** Hard cap on web searches for one employer-research run. */
export const MAX_EMPLOYER_RESEARCH_SEARCHES = 3;

export function researchSourceHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function hostIsAnchorOrSubdomain(
  host: string,
  anchorHost: string | null | undefined,
): boolean {
  const anchor = anchorHost?.trim().replace(/^www\./i, "").toLowerCase();
  if (!anchor) return false;
  return host === anchor || host.endsWith(`.${anchor}`);
}

export function hostIsApprovedNews(host: string): boolean {
  return APPROVED_RESEARCH_NEWS_HOSTS.some(
    (root) => host === root || host.endsWith(`.${root}`),
  );
}

function subjectNeedles(names: Array<string | null | undefined>): string[] {
  return names
    .map((name) => name?.trim().toLowerCase() ?? "")
    .filter((name) => name.length >= 3);
}

/** Title, publisher, citation labels, or retrieved page text names the company or its job focus. */
export function textNamesCompanyOrJobFocus(
  text: string,
  names: Array<string | null | undefined>,
): boolean {
  const haystack = text.toLowerCase();
  return subjectNeedles(names).some((needle) => haystack.includes(needle));
}

export function employerSearchBudget(policyMax: number): number {
  const requested = Number.isFinite(policyMax) ? policyMax : MAX_EMPLOYER_RESEARCH_SEARCHES;
  return Math.min(MAX_EMPLOYER_RESEARCH_SEARCHES, Math.max(1, requested));
}

export function shouldRunAnotherEmployerSearch(input: {
  searchesUsed: number;
  budget: number;
  enough: boolean;
}): boolean {
  return !input.enough && input.searchesUsed < input.budget;
}

/**
 * Anchor-host evidence is enough to stop searching when a cited page on the
 * anchor host (or its subdomain) supports company highlights, and, when a
 * posting was supplied, also supports the identified job-focus section.
 * Uncited anchor pages do not count. Non-anchor pages do not count.
 */
export function anchorHostEvidenceEnough(input: {
  anchorHost: string | null;
  sources: ResearchSource[];
  companySummary: string | null;
  whatTheySell: string | null;
  jobFocus: string | null;
  jobFocusDetail: string | null;
  postingProvided: boolean;
}): boolean {
  const anchorSources = input.sources.filter((source) => {
    const host = researchSourceHost(source.url);
    return (
      host != null &&
      hostIsAnchorOrSubdomain(host, input.anchorHost) &&
      source.supports.length > 0
    );
  });
  if (anchorSources.length === 0) return false;

  const supports = (field: string) =>
    anchorSources.some((source) => source.supports.includes(field));
  const highlightsPresent = Boolean(
    input.companySummary?.trim() || input.whatTheySell?.trim(),
  );
  const highlightsCited =
    highlightsPresent && (supports("companySummary") || supports("whatTheySell"));
  if (!highlightsCited) return false;
  if (!input.postingProvided) return true;

  const focusPresent = Boolean(input.jobFocus?.trim() && input.jobFocusDetail?.trim());
  const focusCited = supports("jobFocus") || supports("jobFocusDetail");
  return focusPresent && focusCited;
}
