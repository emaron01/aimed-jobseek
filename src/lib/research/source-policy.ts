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

/** Company-highlight topics the brief asks for before research may stop. */
export const HIGHLIGHT_COVERAGE_TOPICS = [
  "leadership",
  "recentNews",
  "ownershipOrFinancialHealth",
  "competitors",
] as const;

export type HighlightCoverageTopic = (typeof HIGHLIGHT_COVERAGE_TOPICS)[number];

export type ResearchExcerptHint = {
  url: string;
  title?: string | null;
  text?: string | null;
};

export type CoverageEvidenceInput = {
  anchorHost: string | null;
  sources: ResearchSource[];
  excerpts?: ResearchExcerptHint[];
  companySummary: string | null;
  whatTheySell: string | null;
  businessModel?: string | null;
  companySizeContext?: string | null;
  jobFocus: string | null;
  jobFocusDetail: string | null;
  postingProvided: boolean;
  postingText?: string | null;
  /** Topics named in a completed search that are still unsupported. */
  topicsRecordedNotFound?: HighlightCoverageTopic[];
};

const JOB_FOCUS_STOPWORDS = new Set([
  "about",
  "with",
  "from",
  "that",
  "this",
  "your",
  "have",
  "will",
  "role",
  "team",
  "company",
  "sales",
  "senior",
  "director",
  "manager",
  "experience",
  "required",
  "preferred",
  "years",
  "position",
  "their",
  "into",
  "over",
  "also",
  "using",
  "work",
  "working",
  "join",
  "opportunity",
  "including",
  "across",
  "within",
  "other",
  "such",
  "than",
  "them",
  "they",
  "been",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "would",
  "could",
  "should",
  "global",
  "services",
  "solutions",
  "products",
  "part",
  "serves",
  "business",
  "market",
  "markets",
]);

/**
 * A year alone is not news (copyright lines). Require a 2025–2026 event,
 * or an explicit "past 18 months". Today is within that window for 2025–2026.
 */
const TOPIC_PATTERNS: Record<HighlightCoverageTopic, RegExp> = {
  leadership:
    /\b(ceo|cfo|cto|coo|chief executive|chief financial|founder|president|leadership|executive team)\b/i,
  recentNews:
    /\bpast 18 months\b|(?:2025|2026)[\s\S]{0,80}(?:acqui\w*|partner\w*|launch\w*|layoff\w*|restructur\w*|announc\w*|appoint\w*|named|results|earnings)|(?:acqui\w*|partner\w*|launch\w*|layoff\w*|restructur\w*|announc\w*|appoint\w*|named|results|earnings)[\s\S]{0,80}(?:2025|2026)/i,
  ownershipOrFinancialHealth:
    /\b(ownership|owned by|subsidiary|parent company|private equity|publicly traded|nasdaq|nyse|revenue|profitable|funding|financial health)\b/i,
  competitors: /\b(competitors?|rivals?|competes with)\b/i,
};

const TOPIC_FOCUS_LABEL: Record<HighlightCoverageTopic, string> = {
  leadership: "leadership team and recent leadership changes",
  recentNews: "news from the past 18 months",
  ownershipOrFinancialHealth: "ownership or financial health",
  competitors: "main competitors",
};

function normalizeEvidenceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** True when the URL is the site root or a path whose last segment is home/index. */
export function isHomepageResearchUrl(url: string): boolean {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length === 0) return true;
    const last = segments[segments.length - 1]!.toLowerCase().replace(/\.html?$/, "");
    return last === "home" || last === "index";
  } catch {
    return false;
  }
}

/** Distinctive words used to tell a business, product, or service page from a homepage. */
export function distinctiveTokens(text: string): string[] {
  const found = text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  return [...new Set(found.filter((token) => !JOB_FOCUS_STOPWORDS.has(token)))];
}

/**
 * Job-focus detail that only restates the posting does not count as research
 * on that part of the company.
 */
export function jobFocusDetailIsOnlyPosting(
  detail: string,
  postingText: string | null | undefined,
): boolean {
  const posting = postingText?.trim();
  if (!posting) return false;
  const detailNorm = detail.toLowerCase().replace(/\s+/g, " ").trim();
  const postingNorm = posting.toLowerCase().replace(/\s+/g, " ").trim();
  if (!detailNorm) return true;
  if (postingNorm.includes(detailNorm)) return true;
  const words = detailNorm.match(/[a-z0-9]{4,}/g) ?? [];
  if (words.length === 0) return true;
  const postingWords = new Set(postingNorm.match(/[a-z0-9]{4,}/g) ?? []);
  const overlap = words.filter((word) => postingWords.has(word)).length;
  return overlap / words.length >= 0.85;
}

function citedSourceText(
  source: ResearchSource,
  excerpts: ResearchExcerptHint[],
): string {
  const key = normalizeEvidenceUrl(source.url);
  const excerpt = excerpts.find((item) => normalizeEvidenceUrl(item.url) === key);
  return `${source.title ?? ""} ${excerpt?.title ?? ""} ${excerpt?.text ?? ""}`;
}

function sourceSupportsTopic(
  input: CoverageEvidenceInput,
  topic: HighlightCoverageTopic,
): boolean {
  return input.sources.some((source) => {
    if (source.supports.length === 0) return false;
    const host = researchSourceHost(source.url);
    if (!host) return false;
    const allowed =
      hostIsAnchorOrSubdomain(host, input.anchorHost) || hostIsApprovedNews(host);
    if (!allowed) return false;
    return TOPIC_PATTERNS[topic].test(citedSourceText(source, input.excerpts ?? []));
  });
}

/**
 * A page about the part of the company the job serves:
 * on the anchor host, not a homepage, cited for job-focus detail, and its
 * path, title, or excerpt contains a distinctive word from the job focus.
 * Detail that only repeats the posting does not qualify.
 */
export function jobFocusDetailCovered(input: CoverageEvidenceInput): boolean {
  const detail = input.jobFocusDetail?.trim() ?? "";
  const focus = input.jobFocus?.trim() ?? "";
  if (!detail || !focus) return false;
  if (jobFocusDetailIsOnlyPosting(detail, input.postingText)) return false;
  const tokens = distinctiveTokens(focus);
  if (tokens.length === 0) return false;
  return input.sources.some((source) => {
    const host = researchSourceHost(source.url);
    if (!host || !hostIsAnchorOrSubdomain(host, input.anchorHost)) return false;
    if (source.supports.length === 0) return false;
    if (
      !source.supports.some((item) => item.toLowerCase() === "jobfocusdetail")
    ) {
      return false;
    }
    if (isHomepageResearchUrl(source.url)) return false;
    const haystack = `${source.url} ${citedSourceText(source, input.excerpts ?? [])}`.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });
}

export function missingHighlightTopics(
  input: CoverageEvidenceInput,
): HighlightCoverageTopic[] {
  const recorded = new Set(input.topicsRecordedNotFound ?? []);
  return HIGHLIGHT_COVERAGE_TOPICS.filter(
    (topic) => !recorded.has(topic) && !sourceSupportsTopic(input, topic),
  );
}

export function topicsAddressedBySearchFocus(
  focus: string,
): HighlightCoverageTopic[] {
  const text = focus.toLowerCase();
  const topics: HighlightCoverageTopic[] = [];
  if (text.includes("leadership")) topics.push("leadership");
  if (text.includes("news") || text.includes("18 months")) topics.push("recentNews");
  if (text.includes("ownership") || text.includes("financial")) {
    topics.push("ownershipOrFinancialHealth");
  }
  if (text.includes("competitor")) topics.push("competitors");
  return topics;
}

/** Search focus for topics still open, and for a missing job-focus page. */
export function coverageSearchFocus(input: {
  missingTopics: HighlightCoverageTopic[];
  jobFocus: string | null;
  needJobFocusPage: boolean;
}): string {
  const parts = input.missingTopics.map((topic) => TOPIC_FOCUS_LABEL[topic]);
  const sentences: string[] = [];
  if (parts.length > 0) {
    sentences.push(`Find cited evidence for: ${parts.join("; ")}.`);
  }
  if (input.needJobFocusPage) {
    const subject = input.jobFocus?.trim();
    sentences.push(
      subject
        ? `Find a page on the company website about ${subject}.`
        : "Find a page on the company website about the part of the company this job serves.",
    );
  }
  return (
    sentences.join(" ") ||
    "Company highlights and the part of the company this job serves."
  );
}

/**
 * Stop only when the brief is covered. A cited homepage is not enough.
 * With a posting, job-focus detail must come from a non-homepage anchor page
 * about that part of the company, and not only from the posting text.
 * Leadership, recent news, ownership or financial health, and competitors
 * must each be supported by a cited anchor or approved-news source, or
 * recorded as not found after a search that asked for them.
 */
export function anchorHostEvidenceEnough(input: CoverageEvidenceInput): boolean {
  const recorded = new Set(input.topicsRecordedNotFound ?? []);
  const topicsCovered = HIGHLIGHT_COVERAGE_TOPICS.every(
    (topic) => recorded.has(topic) || sourceSupportsTopic(input, topic),
  );
  if (!topicsCovered) return false;
  if (!input.postingProvided) return true;
  return jobFocusDetailCovered(input);
}
