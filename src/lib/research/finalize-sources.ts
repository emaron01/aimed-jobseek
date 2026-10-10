/**
 * Finalize company research sources for persistence (quality, not cost).
 * Keep official website + sources with supports; near-dedupe; rank.
 */

import {
  hostIsApprovedNews,
  hostIsEmployerSite,
  researchSourceHost,
  textNamesCompanyOrJobFocus,
} from "@/lib/research/source-policy";
import type { ResearchSource, ResearchSourceType } from "@/lib/research/types";
import type { SourceExcerpt } from "@/lib/research/sources";

function normalizeUrlKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isOfficialWebsite(
  source: ResearchSource,
  companyWebsiteUrl: string | null,
  companyDomain: string | null,
): boolean {
  if (source.sourceType === "COMPANY_WEBSITE") return true;
  const sourceHost = hostOf(source.url);
  if (!sourceHost) return false;
  if (companyDomain?.trim()) {
    const domain = companyDomain.trim().replace(/^www\./i, "").toLowerCase();
    if (sourceHost === domain || sourceHost.endsWith(`.${domain}`)) {
      return true;
    }
  }
  if (companyWebsiteUrl?.trim()) {
    const siteHost = hostOf(companyWebsiteUrl);
    if (siteHost && (sourceHost === siteHost || sourceHost.endsWith(`.${siteHost}`))) {
      return true;
    }
  }
  return false;
}

/**
 * Near-duplicate key: collapse same-story URLs (esp. LinkedIn posts) to one slot.
 */
export function researchSourceNearDedupeKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (host.includes("linkedin.com")) {
      if (parts[0] === "posts" || parts[0] === "pulse") {
        const author = (parts[1] ?? "unknown")
          .replace(/-activity-\d+.*$/i, "")
          .replace(/-\d{10,}.*$/i, "");
        return `${host}/posts/${author || "unknown"}`;
      }
      if (parts[0] === "company" || parts[0] === "in") {
        return `${host}/${parts.slice(0, 2).join("/")}`;
      }
    }
    // Same host + first two path segments (drops article id / slug tails when deep).
    if (parts.length >= 3 && /\d{5,}/.test(parts[parts.length - 1] ?? "")) {
      return `${host}/${parts.slice(0, 2).join("/")}`;
    }
    return `${host}/${parts.slice(0, 2).join("/")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function sourceTypeRank(type: ResearchSourceType): number {
  switch (type) {
    case "COMPANY_WEBSITE":
      return 50;
    case "NEWS":
      return 30;
    case "REVIEW_SITE":
      return 20;
    case "DIRECTORY":
      return 15;
    case "LINKEDIN":
      return 10;
    default:
      return 5;
  }
}

export function researchSourceQualityScore(
  source: ResearchSource,
  official: boolean,
): number {
  return (
    source.supports.length * 20 +
    sourceTypeRank(source.sourceType) +
    (official ? 25 : 0) +
    (source.supports.length > 0 ? 15 : 0)
  );
}

function sourceNamesSubject(
  source: ResearchSource,
  excerpts: SourceExcerpt[],
  names: Array<string | null | undefined>,
): boolean {
  const excerptText = excerpts
    .filter((excerpt) => excerpt.url === source.url)
    .map((excerpt) => excerpt.text)
    .join(" ");
  return textNamesCompanyOrJobFocus(
    [source.title, source.publisher, excerptText, ...source.supports]
      .filter((part) => part && part.trim())
      .join(" "),
    names,
  );
}

/**
 * Keep the anchor host and its subdomains.
 * Keep an approved news host only when the company name appears as a whole
 * word in the title, publisher, excerpt, or support labels.
 * The job focus alone does not admit a news page.
 * Drop every other host before save, including fundraisers and lookalikes.
 */
export function sourceKeptForEmployerResearch(input: {
  source: ResearchSource;
  anchorHost: string | null;
  sisterHosts?: readonly string[] | null;
  companyName?: string | null;
  jobFocus?: string | null;
  excerpts?: SourceExcerpt[];
}): boolean {
  const host = researchSourceHost(input.source.url);
  if (!host) return false;
  if (hostIsEmployerSite(host, input.anchorHost, input.sisterHosts)) return true;
  if (!hostIsApprovedNews(host)) return false;
  if (input.source.supports.length === 0) return false;
  return sourceNamesSubject(input.source, input.excerpts ?? [], [
    input.companyName,
  ]);
}

export function finalizeResearchSources(input: {
  sources: ResearchSource[];
  companyWebsiteUrl?: string | null;
  companyDomain?: string | null;
  companyName?: string | null;
  jobFocus?: string | null;
  excerpts?: SourceExcerpt[];
  sisterHosts?: readonly string[] | null;
  maxSources: number;
}): ResearchSource[] {
  const websiteUrl = input.companyWebsiteUrl ?? null;
  const domain = input.companyDomain ?? null;

  // Exact URL dedupe first.
  const exact = new Map<string, ResearchSource>();
  for (const source of input.sources) {
    const key = normalizeUrlKey(source.url);
    if (!key) continue;
    const existing = exact.get(key);
    if (!existing || source.supports.length > existing.supports.length) {
      exact.set(key, source);
    }
  }

  const anchorHost = domain?.trim() || hostOf(websiteUrl ?? "") || null;
  const candidates = [...exact.values()].filter((source) => {
    const official = isOfficialWebsite(source, websiteUrl, domain);
    if (!(official || source.supports.length > 0)) return false;
    return sourceKeptForEmployerResearch({
      source,
      anchorHost,
      sisterHosts: input.sisterHosts,
      companyName: input.companyName,
      jobFocus: input.jobFocus,
      excerpts: input.excerpts,
    });
  });

  // Near-dedupe: keep the best-scoring URL per story key.
  const byNear = new Map<string, ResearchSource>();
  for (const source of candidates) {
    const nearKey = researchSourceNearDedupeKey(source.url);
    const official = isOfficialWebsite(source, websiteUrl, domain);
    const score = researchSourceQualityScore(source, official);
    const existing = byNear.get(nearKey);
    if (!existing) {
      byNear.set(nearKey, source);
      continue;
    }
    const existingOfficial = isOfficialWebsite(existing, websiteUrl, domain);
    const existingScore = researchSourceQualityScore(existing, existingOfficial);
    if (score > existingScore) {
      byNear.set(nearKey, source);
    }
  }

  return [...byNear.values()]
    .map((source) => ({
      source,
      official: isOfficialWebsite(source, websiteUrl, domain),
    }))
    .sort((a, b) => {
      const scoreDiff =
        researchSourceQualityScore(b.source, b.official) -
        researchSourceQualityScore(a.source, a.official);
      if (scoreDiff !== 0) return scoreDiff;
      return a.source.url.localeCompare(b.source.url);
    })
    .map((row) => row.source)
    .slice(0, Math.max(1, input.maxSources));
}
