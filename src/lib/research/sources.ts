import {
  assertSafeExternalHttpUrl,
  safeFetchHttp,
} from "@/lib/research/url-safety";
import { isJobBoardHost } from "@/lib/application/company-website";
import {
  distinctiveTokens,
  hostIsAnchorOrSubdomain,
  hostIsApprovedNews,
  hostIsDeniedSister,
  isHomepageResearchUrl,
  researchSourceHost,
} from "@/lib/research/source-policy";
import type {
  CompanyResearchInput,
  ResearchSource,
} from "@/lib/research/types";
import { brandUserAgent } from "@/lib/product-config";

export type SourceExcerpt = {
  url: string;
  title: string | null;
  text: string;
};

export type RetrievedEvidenceBundle = {
  sources: ResearchSource[];
  excerpts: SourceExcerpt[];
  /** Homepage HTML for a later job-focus link lookup. Not sent to the model. */
  homepageHtml?: string | null;
  homepageUrl?: string | null;
  /**
   * Other company domains linked from the anchor host's own pages.
   * Stored on the research timing record. Not a new column.
   */
  sisterHosts?: string[];
};

/** True when at least one first-party page returned usable body text. */
export function hasFirstPartyWebsiteEvidence(
  bundle: RetrievedEvidenceBundle,
): boolean {
  return bundle.excerpts.some((excerpt) => excerpt.text.trim().length > 0);
}

/** Combined excerpt budget sent to research synthesis. */
export const WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET = 16_000;

/** Per-page extraction cap before budget ranking. */
export const WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP = 4_000;

/** Homepage shorter than this triggers one-hop canonical-domain follow. */
export const STUB_HOMEPAGE_MAX_CHARS = 200;

export type WebsitePageSlot =
  | "jobFocus"
  | "leadership"
  | "about"
  | "careers"
  | "products"
  | "company"
  | "homepage";

/**
 * Fill combined budget from highest-value pages first.
 * Key company pages sit with the job-focus page, still inside the 16,000-character budget.
 */
export const WEBSITE_PAGE_BUDGET_RANK: WebsitePageSlot[] = [
  "jobFocus",
  "leadership",
  "products",
  "about",
  "careers",
  "company",
  "homepage",
];

export type CompanyKeyPageKind = "leadership" | "about" | "careers";

const KEY_PAGE_PATTERN: Record<CompanyKeyPageKind, RegExp> = {
  leadership: /leadership|executive[-_\s]?team|management[-_\s]?team|our[-_\s]?team/i,
  about: /\babout(?:[-_\s]?us)?\b|who[-_\s]?we[-_\s]?are|our[-_\s]?company/i,
  careers: /careers|culture|our[-_\s]?mission|\bmission\b|\bvalues\b|life[-_\s]?at|working[-_\s]?(?:at|here)/i,
};

/**
 * Abstract source retrieval — keeps CompanyResearch independent of
 * vendor-specific browsing features.
 */
export interface CompanySourceRetriever {
  retrieve(input: CompanyResearchInput): Promise<RetrievedEvidenceBundle>;
}

function normalizeWebsiteCandidate(
  website: string | null,
  domain: string | null,
): string | null {
  if (website?.trim()) {
    const value = website.trim();
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return `https://${value.replace(/^\/\//, "")}`;
  }
  if (domain?.trim()) return `https://${domain.trim()}`;
  return null;
}

function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Same site or subdomain relationship — not a cross-domain alias. */
export function sameRegistrableDomain(hostA: string, hostB: string): boolean {
  const a = normalizeHostname(hostA);
  const b = normalizeHostname(hostB);
  if (a === b) return true;
  if (a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return true;
  return false;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

export function htmlToTextSnippet(
  html: string,
  maxLen = WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP,
): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLen);
}

function isHtmlContentType(contentType: string): boolean {
  if (!contentType) return true;
  return (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml") ||
    contentType.includes("text/plain")
  );
}

export type FetchedWebsitePage = {
  slot: WebsitePageSlot;
  url: string;
  title: string | null;
  text: string;
  html: string;
};

function extractHttpsLinks(html: string): string[] {
  const links: string[] = [];
  const hrefRe = /<a[^>]+href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html))) {
    links.push(match[1]!);
  }
  const bareRe = /https:\/\/[^\s"'<>]+/gi;
  while ((match = bareRe.exec(html))) {
    links.push(match[0]!);
  }
  return links;
}

/**
 * Stub-homepage canonical follow: one obvious HTTPS link on a different
 * registrable domain. One hop only; caller must not recurse.
 */
export function parseStubCanonicalUrl(
  html: string,
  storedUrl: string,
): string | null {
  let stored: URL;
  try {
    stored = new URL(storedUrl);
  } catch {
    return null;
  }

  const seen = new Set<string>();
  for (const raw of extractHttpsLinks(html)) {
    if (!raw.trim().toLowerCase().startsWith("https://")) continue;

    let resolved: URL;
    try {
      resolved = new URL(raw.trim(), storedUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:") continue;

    const safety = assertSafeExternalHttpUrl(resolved.href);
    if (!safety.ok) continue;
    if (sameRegistrableDomain(resolved.hostname, stored.hostname)) continue;
    if (seen.has(safety.href)) continue;
    seen.add(safety.href);
    return safety.href;
  }
  return null;
}

function urlsMatch(left: string, right: string): boolean {
  return left.replace(/\/$/, "").toLowerCase() === right.replace(/\/$/, "").toLowerCase();
}

/**
 * Same-host page linked from the homepage whose path or anchor text names the
 * part of the company (job focus, or the posting when the focus is not known yet).
 * Homepages and off-site links are skipped. One best match.
 */
export function selectJobFocusPageUrl(input: {
  html: string;
  pageUrl: string;
  anchorHost: string | null;
  subject: string;
}): string | null {
  const tokens = distinctiveTokens(input.subject);
  if (!input.anchorHost || tokens.length === 0) return null;

  const hrefRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let best: { url: string; score: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(input.html))) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(raw, input.pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") continue;
    const host = researchSourceHost(resolved.href);
    if (!host || !hostIsAnchorOrSubdomain(host, input.anchorHost)) continue;
    const safety = assertSafeExternalHttpUrl(resolved.href);
    if (!safety.ok) continue;
    if (isHomepageResearchUrl(safety.href)) continue;
    if (urlsMatch(safety.href, input.pageUrl)) continue;

    const anchorText = match[2]!.replace(/<[^>]+>/g, " ");
    const haystack = `${resolved.pathname} ${anchorText}`.toLowerCase();
    const score = tokens.filter((token) => haystack.includes(token)).length;
    if (score === 0) continue;
    if (!best || score > best.score) best = { url: safety.href, score };
  }
  return best?.url ?? null;
}

/**
 * Anchor-host page linked from the homepage for leadership, about, or careers.
 * One best match per kind. Stays on the anchor host. No web search.
 */
export function selectCompanyKeyPageUrl(input: {
  html: string;
  pageUrl: string;
  anchorHost: string | null;
  kind: CompanyKeyPageKind;
  skipUrls?: string[];
}): string | null {
  if (!input.anchorHost) return null;
  const hrefRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let best: { url: string; score: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(input.html))) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(raw, input.pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") continue;
    const host = researchSourceHost(resolved.href);
    if (!host || !hostIsAnchorOrSubdomain(host, input.anchorHost)) continue;
    const safety = assertSafeExternalHttpUrl(resolved.href);
    if (!safety.ok) continue;
    if (isHomepageResearchUrl(safety.href)) continue;
    if (urlsMatch(safety.href, input.pageUrl)) continue;
    if ((input.skipUrls ?? []).some((existing) => urlsMatch(existing, safety.href))) {
      continue;
    }
    const anchorText = match[2]!.replace(/<[^>]+>/g, " ");
    const haystack = `${resolved.pathname} ${anchorText}`;
    if (input.kind === "about" && KEY_PAGE_PATTERN.leadership.test(haystack)) {
      continue;
    }
    if (!KEY_PAGE_PATTERN[input.kind].test(haystack)) continue;
    const score = (haystack.match(KEY_PAGE_PATTERN[input.kind]) ?? []).length;
    if (!best || score > best.score) best = { url: safety.href, score };
  }
  return best?.url ?? null;
}

/**
 * Sister sites are other domains linked from an anchor-host page.
 * Social, news, and job-board hosts are not sister sites.
 * The list is stored on the research timing JSON, not a new column.
 */
export function sisterHostsFromPageHtml(input: {
  html: string;
  pageUrl: string;
  anchorHost: string | null;
}): string[] {
  if (!input.anchorHost) return [];
  const hosts = new Set<string>();
  const hrefRe = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(input.html))) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(raw, input.pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") continue;
    const host = researchSourceHost(resolved.href);
    if (!host) continue;
    if (hostIsAnchorOrSubdomain(host, input.anchorHost)) continue;
    if (hostIsApprovedNews(host) || hostIsDeniedSister(host) || isJobBoardHost(host)) {
      continue;
    }
    hosts.add(host);
  }
  return [...hosts];
}

export function allocateExcerptBudget(
  pages: Array<{
    slot: WebsitePageSlot;
    url: string;
    title: string | null;
    text: string;
  }>,
  totalBudget = WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
): SourceExcerpt[] {
  const bySlot = new Map(pages.map((page) => [page.slot, page]));
  const excerpts: SourceExcerpt[] = [];
  let remaining = totalBudget;

  for (const slot of WEBSITE_PAGE_BUDGET_RANK) {
    const page = bySlot.get(slot);
    if (!page || remaining <= 0) continue;
    const take = Math.min(page.text.length, remaining);
    if (take <= 0) continue;
    excerpts.push({
      url: page.url,
      title: page.title,
      text: page.text.slice(0, take),
    });
    remaining -= take;
  }

  return excerpts;
}

async function fetchWebsitePage(
  url: string,
  slot: WebsitePageSlot,
  timeoutMs: number,
  perPageCap = WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP,
): Promise<FetchedWebsitePage | null> {
  const safety = assertSafeExternalHttpUrl(url);
  if (!safety.ok) return null;

  try {
    const response = await safeFetchHttp(safety.href, {
      timeoutMs,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": brandUserAgent("CompanyResearch"),
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!isHtmlContentType(contentType)) return null;

    const html = await response.text();
    const text = htmlToTextSnippet(html, perPageCap);
    if (!text) return null;

    const finalUrl = response.url || safety.href;
    const finalSafety = assertSafeExternalHttpUrl(finalUrl);
    if (!finalSafety.ok) return null;

    return {
      slot,
      url: finalSafety.href,
      title: extractTitle(html),
      text,
      html,
    };
  } catch {
    return null;
  }
}

async function fetchFirstPathOk(
  origin: string,
  slot: WebsitePageSlot,
  paths: string[],
  timeoutMs: number,
): Promise<FetchedWebsitePage | null> {
  for (const path of paths) {
    let target: string;
    try {
      target = new URL(path, origin).href;
    } catch {
      continue;
    }
    const page = await fetchWebsitePage(target, slot, timeoutMs);
    if (page) return page;
  }
  return null;
}

/**
 * Budget-preserving multi-page first-party retrieval.
 * Exported for measurement probes comparing legacy single-page behavior.
 */
export async function retrieveWebsiteEvidence(
  input: CompanyResearchInput,
  options?: { timeoutMs?: number },
): Promise<RetrievedEvidenceBundle> {
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const storedUrl = normalizeWebsiteCandidate(
    input.website,
    input.normalizedDomain,
  );
  if (!storedUrl) {
    return { sources: [], excerpts: [] };
  }

  const homepage = await fetchWebsitePage(storedUrl, "homepage", timeoutMs);
  if (!homepage) {
    return { sources: [], excerpts: [] };
  }

  let origin = homepage.url;
  const pages: FetchedWebsitePage[] = [homepage];

  if (homepage.text.length < STUB_HOMEPAGE_MAX_CHARS) {
    const canonical = parseStubCanonicalUrl(homepage.html, storedUrl);
    if (canonical) {
      const canonicalHome = await fetchWebsitePage(
        canonical,
        "homepage",
        timeoutMs,
      );
      if (canonicalHome) {
        origin = canonicalHome.url;
        const idx = pages.findIndex((p) => p.slot === "homepage");
        if (idx >= 0) pages[idx] = canonicalHome;
        else pages.push(canonicalHome);
      }
    }
  }

  const homePage = pages.find((page) => page.slot === "homepage") ?? homepage;
  const anchorHost = researchSourceHost(homePage.url);
  const subject = [input.postingTitle, input.postingText]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const jobFocusUrl = selectJobFocusPageUrl({
    html: homePage.html,
    pageUrl: homePage.url,
    anchorHost,
    subject,
  });
  const jobFocusPage = jobFocusUrl
    ? await fetchWebsitePage(jobFocusUrl, "jobFocus", timeoutMs)
    : null;
  if (jobFocusPage) pages.push(jobFocusPage);

  const skipUrls = pages.map((page) => page.url);
  for (const kind of ["leadership", "about", "careers"] as const) {
    const url = selectCompanyKeyPageUrl({
      html: homePage.html,
      pageUrl: homePage.url,
      anchorHost,
      kind,
      skipUrls,
    });
    if (!url) continue;
    const page = await fetchWebsitePage(url, kind, timeoutMs);
    if (!page) continue;
    pages.push(page);
    skipUrls.push(page.url);
  }

  const hasSlot = (slot: WebsitePageSlot) => pages.some((page) => page.slot === slot);
  const [products, about, company] = await Promise.all([
    hasSlot("products")
      ? Promise.resolve(null)
      : fetchFirstPathOk(
          origin,
          "products",
          ["/products", "/solutions", "/services"],
          timeoutMs,
        ),
    hasSlot("about")
      ? Promise.resolve(null)
      : fetchFirstPathOk(origin, "about", ["/about", "/about-us"], timeoutMs),
    hasSlot("company")
      ? Promise.resolve(null)
      : fetchFirstPathOk(origin, "company", ["/company"], timeoutMs),
  ]);

  for (const page of [products, about, company]) {
    if (page) pages.push(page);
  }

  const deduped = new Map<string, FetchedWebsitePage>();
  for (const page of pages) {
    const key = page.url.replace(/\/$/, "").toLowerCase();
    const existing = deduped.get(key);
    if (!existing || page.text.length > existing.text.length) {
      deduped.set(key, page);
    }
  }

  const uniquePages = [...deduped.values()];
  const excerpts = allocateExcerptBudget(uniquePages);
  if (excerpts.length === 0) {
    return { sources: [], excerpts: [] };
  }

  const retrievedAt = new Date().toISOString();
  const excerptUrls = new Set(
    excerpts.map((e) => e.url.replace(/\/$/, "").toLowerCase()),
  );

  const sources: ResearchSource[] = uniquePages
    .filter((page) =>
      excerptUrls.has(page.url.replace(/\/$/, "").toLowerCase()),
    )
    .map((page) => ({
      url: page.url,
      title: page.title,
      publisher: null,
      sourceType: "COMPANY_WEBSITE" as const,
      retrievedAt,
      supports: [],
    }));

  const keptHome = pages.find((page) => page.slot === "homepage") ?? homepage;
  const sisterHosts = [
    ...new Set(
      pages.flatMap((page) =>
        sisterHostsFromPageHtml({
          html: page.html,
          pageUrl: page.url,
          anchorHost,
        }),
      ),
    ),
  ];
  return {
    sources,
    excerpts,
    homepageHtml: keptHome.html,
    homepageUrl: keptHome.url,
    sisterHosts,
  };
}

/**
 * Fetch one anchor-host job-focus page linked from homepage HTML.
 * Used after the model names the part of the company, when the posting
 * text did not already select that link. Stays inside the per-page cap.
 */
export async function fetchJobFocusPageFromHomepage(input: {
  html: string;
  pageUrl: string;
  anchorHost: string | null;
  subject: string;
  timeoutMs?: number;
  skipUrls?: string[];
}): Promise<RetrievedEvidenceBundle | null> {
  const url = selectJobFocusPageUrl({
    html: input.html,
    pageUrl: input.pageUrl,
    anchorHost: input.anchorHost,
    subject: input.subject,
  });
  if (!url) return null;
  if ((input.skipUrls ?? []).some((existing) => urlsMatch(existing, url))) {
    return null;
  }
  const page = await fetchWebsitePage(
    url,
    "jobFocus",
    input.timeoutMs ?? 12_000,
  );
  if (!page) return null;
  const retrievedAt = new Date().toISOString();
  return {
    sources: [
      {
        url: page.url,
        title: page.title,
        publisher: null,
        sourceType: "COMPANY_WEBSITE",
        retrievedAt,
        supports: [],
      },
    ],
    excerpts: [{ url: page.url, title: page.title, text: page.text }],
  };
}

/** Legacy single-page fetch — used only for before/after retrieval probes. */
export async function retrieveLegacySinglePageEvidence(
  input: CompanyResearchInput,
  options?: { timeoutMs?: number },
): Promise<RetrievedEvidenceBundle> {
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const url = normalizeWebsiteCandidate(input.website, input.normalizedDomain);
  if (!url) return { sources: [], excerpts: [] };

  const page = await fetchWebsitePage(
    url,
    "homepage",
    timeoutMs,
    WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
  );
  if (!page) return { sources: [], excerpts: [] };

  const retrievedAt = new Date().toISOString();
  return {
    sources: [
      {
        url: page.url,
        title: page.title,
        publisher: null,
        sourceType: "COMPANY_WEBSITE",
        retrievedAt,
        supports: [],
      },
    ],
    excerpts: [{ url: page.url, title: page.title, text: page.text }],
  };
}

/**
 * Default retriever: multi-page first-party website evidence with a fixed
 * combined excerpt budget. Uses SSRF-safe fetch (see module comment in tests).
 */
export class WebsiteSourceRetriever implements CompanySourceRetriever {
  constructor(private readonly timeoutMs = 12_000) {}

  async retrieve(input: CompanyResearchInput): Promise<RetrievedEvidenceBundle> {
    return retrieveWebsiteEvidence(input, { timeoutMs: this.timeoutMs });
  }
}

let activeRetriever: CompanySourceRetriever = new WebsiteSourceRetriever();

export function setCompanySourceRetriever(
  retriever: CompanySourceRetriever,
): void {
  activeRetriever = retriever;
}

export function getCompanySourceRetriever(): CompanySourceRetriever {
  return activeRetriever;
}
