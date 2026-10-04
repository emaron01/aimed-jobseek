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
 * The homepage and its leadership, about, and careers pages are sent before other pages, still inside the 16,000-character budget.
 */
export const WEBSITE_PAGE_BUDGET_RANK: WebsitePageSlot[] = [
  "homepage",
  "leadership",
  "about",
  "careers",
  "jobFocus",
  "products",
  "company",
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
 * Prefer the section page itself over a deeper page that only contains the
 * word in a parent directory. /service/about/ beats /service/about/offices/.
 */
function keyPageScore(
  pathname: string,
  anchorText: string,
  kind: CompanyKeyPageKind,
): number {
  const segments = pathname.split("/").filter(Boolean);
  const last = (segments[segments.length - 1] ?? "").toLowerCase();
  if (
    kind === "about" &&
    KEY_PAGE_PATTERN.leadership.test(`${last} ${anchorText}`)
  ) {
    return 0;
  }
  const haystack = `${pathname} ${anchorText}`;
  if (!KEY_PAGE_PATTERN[kind].test(haystack)) return 0;
  let score = KEY_PAGE_PATTERN[kind].test(pathname) ? 10 : 0;
  if (last && KEY_PAGE_PATTERN[kind].test(last)) {
    score += 100 - Math.min(segments.length, 8);
  }
  if (KEY_PAGE_PATTERN[kind].test(anchorText)) score += 20;
  return score;
}

const KEY_PAGE_FALLBACK_PATHS: Record<CompanyKeyPageKind, string[]> = {
  leadership: [
    "/leadership",
    "/leadership-team",
    "/our-team",
    "/team",
    "/about/leadership-team",
    "/service/about/leadership-team",
  ],
  about: ["/about", "/about-us", "/company/about", "/service/about"],
  careers: [
    "/careers",
    "/culture",
    "/life-at",
    "/service/careers",
    "/service/careers/our-mission",
  ],
};

/**
 * Anchor-host page linked from a fetched company page for leadership, about,
 * or careers. One best match per kind. Stays on the anchor host. No web search.
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
    const score = keyPageScore(resolved.pathname, anchorText, input.kind);
    if (score === 0) continue;
    if (!best || score > best.score) best = { url: safety.href, score };
  }
  return best?.url ?? null;
}

/** A company-name token shorter than this does not identify a sister site. "csc" counts. */
const SISTER_SITE_MIN_TOKEN_LENGTH = 3;

/**
 * Words too generic to identify a company. A linked domain that shares only
 * one of these with the company name or the anchor domain is not a sister site.
 */
const SISTER_SITE_GENERIC_TOKENS = new Set([
  "and",
  "capital",
  "cloud",
  "co",
  "companies",
  "company",
  "consultants",
  "consulting",
  "corp",
  "corporation",
  "digital",
  "enterprise",
  "enterprises",
  "finance",
  "financial",
  "global",
  "group",
  "health",
  "healthcare",
  "holding",
  "holdings",
  "inc",
  "incorporated",
  "industries",
  "industry",
  "international",
  "limited",
  "llc",
  "ltd",
  "management",
  "media",
  "network",
  "networks",
  "official",
  "online",
  "partner",
  "partners",
  "plc",
  "service",
  "services",
  "software",
  "solution",
  "solutions",
  "system",
  "systems",
  "tech",
  "technologies",
  "technology",
  "the",
  "ventures",
  "world",
]);

const SISTER_SITE_GENERIC_BY_LENGTH = [...SISTER_SITE_GENERIC_TOKENS].sort(
  (left, right) => right.length - left.length || left.localeCompare(right),
);

/** Public suffixes of more than one label. The registrable label is the label before these. */
const SISTER_SITE_MULTI_PART_SUFFIXES = [
  "ac.uk",
  "co.in",
  "co.jp",
  "co.nz",
  "co.uk",
  "co.za",
  "com.au",
  "com.br",
  "com.hk",
  "com.mx",
  "com.sg",
  "com.tr",
  "net.au",
  "org.au",
  "org.uk",
];

function registrableDomainLabel(host: string): string {
  const bare = host.trim().replace(/^www\./i, "").toLowerCase().replace(/\.$/, "");
  const parts = bare.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  const joined = parts.join(".");
  const suffix = SISTER_SITE_MULTI_PART_SUFFIXES.find(
    (item) => joined === item || joined.endsWith(`.${item}`),
  );
  if (suffix) {
    const head = joined.slice(0, joined.length - suffix.length).replace(/\.$/, "");
    const headParts = head.split(".").filter(Boolean);
    return headParts[headParts.length - 1] ?? "";
  }
  return parts.length >= 2 ? parts[parts.length - 2]! : "";
}

function isDistinctiveSisterToken(token: string): boolean {
  return (
    token.length >= SISTER_SITE_MIN_TOKEN_LENGTH &&
    !SISTER_SITE_GENERIC_TOKENS.has(token)
  );
}

function longestGenericAffix(value: string): string | null {
  for (const word of SISTER_SITE_GENERIC_BY_LENGTH) {
    if (value.length <= word.length) continue;
    if (value.startsWith(word) || value.endsWith(word)) return word;
  }
  return null;
}

/**
 * Distinctive tokens from a company name or a registrable domain label.
 * Split on non-alphanumeric characters, then peel generic words from either
 * end of a concatenated label (cscglobal yields csc).
 */
function sisterSiteNameTokens(value: string): string[] {
  const pieces = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = new Set<string>();
  for (const piece of pieces) {
    if (isDistinctiveSisterToken(piece)) tokens.add(piece);
    let rest = piece;
    for (let pass = 0; pass < 8 && rest.length > SISTER_SITE_MIN_TOKEN_LENGTH; pass += 1) {
      const generic = longestGenericAffix(rest);
      if (!generic) break;
      rest = rest.startsWith(generic)
        ? rest.slice(generic.length)
        : rest.slice(0, -generic.length);
      if (isDistinctiveSisterToken(rest)) tokens.add(rest);
    }
  }
  return [...tokens];
}

function linkedDomainSharesCompanyName(
  host: string,
  companyName: string | null,
  anchorHost: string,
): boolean {
  const label = registrableDomainLabel(host);
  if (!isDistinctiveSisterToken(label)) return false;
  const tokens = [
    ...sisterSiteNameTokens(companyName ?? ""),
    ...sisterSiteNameTokens(registrableDomainLabel(anchorHost)),
  ];
  return tokens.some((token) => label === token || label.startsWith(token));
}

/**
 * Sister sites are other domains linked from an anchor-host page that share a
 * distinctive name token with the company name or the anchor's registrable
 * domain. Social, news, and job-board hosts are never sister sites.
 * The list is stored on the research timing JSON, not a new column.
 */
export function sisterHostsFromPageHtml(input: {
  html: string;
  pageUrl: string;
  anchorHost: string | null;
  companyName?: string | null;
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
    if (!linkedDomainSharesCompanyName(host, input.companyName ?? null, input.anchorHost)) {
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

    // Blocked, missing, or unreachable: skip this page and keep the others.
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!isHtmlContentType(contentType)) return null;

    const html = await response.text();
    const text = htmlToTextSnippet(html, perPageCap);
    // A blocked or non-HTML response already returned null. A script-rendered
    // page with no visible text and no links cannot be read or followed.
    if (!text && !/<a\b[^>]*href=/i.test(html)) return null;

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
  const hasSlot = (slot: WebsitePageSlot) => pages.some((page) => page.slot === slot);
  const remember = (page: FetchedWebsitePage | null) => {
    if (!page) return;
    pages.push(page);
    skipUrls.push(page.url);
  };
  for (const kind of ["leadership", "about", "careers"] as const) {
    const url = selectCompanyKeyPageUrl({
      html: homePage.html,
      pageUrl: homePage.url,
      anchorHost,
      kind,
      skipUrls,
    });
    if (!url) continue;
    remember(await fetchWebsitePage(url, kind, timeoutMs));
  }

  // Leadership and culture links often live on the about page, not the homepage.
  const aboutPage = pages.find((page) => page.slot === "about");
  if (aboutPage) {
    for (const kind of ["leadership", "careers"] as const) {
      if (hasSlot(kind)) continue;
      const url = selectCompanyKeyPageUrl({
        html: aboutPage.html,
        pageUrl: aboutPage.url,
        anchorHost,
        kind,
        skipUrls,
      });
      if (!url) continue;
      remember(await fetchWebsitePage(url, kind, timeoutMs));
    }
  }

  for (const kind of ["leadership", "about", "careers"] as const) {
    if (hasSlot(kind)) continue;
    remember(
      await fetchFirstPathOk(origin, kind, KEY_PAGE_FALLBACK_PATHS[kind], timeoutMs),
    );
  }
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
          companyName: input.name,
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
