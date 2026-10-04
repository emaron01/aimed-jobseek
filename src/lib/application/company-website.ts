import { JOB_BOARD_HOSTS, applicationWorkspaceCopy } from "@/lib/product-config/vocabulary";
import { normalizeDomain, normalizeWebsiteUrl } from "@/lib/research/normalize";

export type ParsedEmployerWebsite =
  | { ok: true; website: string; domain: string }
  | { ok: false; message: string };

export type EmployerWebsiteAnchor = {
  website: string;
  domain: string;
};

const ANCHOR_TIMING_KEY = "anchorHost";

function withScheme(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function parseHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(withScheme(trimmed));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

export function isJobBoardHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  return JOB_BOARD_HOSTS.some(
    (board) => host === board || host.endsWith(`.${board}`),
  );
}

/**
 * Prefill shown in the form. Keeps the posting host, including www.
 * A job-board posting does not become the company website.
 */
export function employerSitePrefillFromPostingUrl(
  postingUrl: string | null | undefined,
): string | null {
  if (!postingUrl?.trim()) return null;
  const url = parseHttpUrl(postingUrl);
  if (!url || isJobBoardHost(url.hostname)) return null;
  return `https://${url.hostname}`;
}

export function parseEmployerWebsite(
  raw: string | null | undefined,
): ParsedEmployerWebsite {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, message: applicationWorkspaceCopy.companyWebsiteRequired };
  }
  const url = parseHttpUrl(trimmed);
  if (!url) {
    return { ok: false, message: applicationWorkspaceCopy.companyWebsiteInvalid };
  }
  if (isJobBoardHost(url.hostname)) {
    return { ok: false, message: applicationWorkspaceCopy.companyWebsiteJobBoard };
  }
  const domain = normalizeDomain(url.hostname);
  const website = normalizeWebsiteUrl(url.hostname);
  if (!domain || !website) {
    return { ok: false, message: applicationWorkspaceCopy.companyWebsiteInvalid };
  }
  return { ok: true, website, domain };
}

function anchorFromStored(
  website: string | null | undefined,
  domain: string | null | undefined,
): EmployerWebsiteAnchor | null {
  const parsedWebsite = website?.trim() ? parseEmployerWebsite(website) : null;
  if (parsedWebsite?.ok) {
    return { website: parsedWebsite.website, domain: parsedWebsite.domain };
  }
  const parsedDomain = domain?.trim() ? parseEmployerWebsite(domain) : null;
  if (parsedDomain?.ok) {
    return { website: parsedDomain.website, domain: parsedDomain.domain };
  }
  return null;
}

/**
 * The site research is allowed to use. The seeker's site wins.
 * A job-board host is not an anchor.
 */
export function employerWebsiteAnchor(input: {
  suppliedEmployerWebsite?: string | null;
  companyWebsite?: string | null;
  companyDomain?: string | null;
}): EmployerWebsiteAnchor | null {
  return (
    anchorFromStored(input.suppliedEmployerWebsite, null) ??
    anchorFromStored(input.companyWebsite, input.companyDomain)
  );
}

export function anchorHostFromResearchTimings(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const entry = value[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const host = (entry as Record<string, unknown>)[ANCHOR_TIMING_KEY];
    if (typeof host === "string" && host.trim()) return host.trim().toLowerCase();
  }
  return null;
}

export function appendAnchorHostTiming(
  timings: unknown,
  anchorHost: string | null | undefined,
  sisterHosts?: readonly string[] | null,
): unknown {
  const host = anchorHost?.trim().toLowerCase();
  if (!host) return timings ?? null;
  const sisters = [
    ...new Set(
      (sisterHosts ?? [])
        .map((item) => item.trim().toLowerCase().replace(/^www\./, ""))
        .filter(Boolean),
    ),
  ];
  const existing = Array.isArray(timings) ? timings : [];
  return [
    ...existing,
    {
      [ANCHOR_TIMING_KEY]: host,
      ...(sisters.length > 0 ? { sisterHosts: sisters } : {}),
    },
  ];
}

export function sisterHostsFromResearchTimings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const entry = value[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const hosts = (entry as Record<string, unknown>).sisterHosts;
    if (!Array.isArray(hosts)) continue;
    const clean = hosts
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().toLowerCase());
    if (clean.length > 0) return clean;
  }
  return [];
}
