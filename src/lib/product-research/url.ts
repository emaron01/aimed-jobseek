/**
 * URL / content identity helpers for Product source deduplication.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

/**
 * Normalize a URL for identity comparison.
 * Collapses scheme/www/trailing slash/fragments/obvious tracking params.
 * Does not over-collapse genuinely different paths/query pages.
 */
export const LINKEDIN_PROFILE_BLOCKED_MESSAGE =
  "LinkedIn blocks automated reading. Paste your LinkedIn profile text instead of a LinkedIn URL.";

export function isLinkedInProfileUrl(raw: string): boolean {
  const normalized = normalizeProductSourceUrl(raw);
  if (!normalized) return false;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function normalizeProductSourceUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let withScheme = trimmed;
  if (!/^https?:\/\//i.test(withScheme)) {
    withScheme = `https://${withScheme.replace(/^\/\//, "")}`;
  }
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  let host = url.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);

  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams(sorted).toString();

  let path = url.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  return `https://${host}${path}${qs ? `?${qs}` : ""}`;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  hash.update(typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input));
  return hash.digest("hex");
}

export function createCorrelationId(): string {
  return `psr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
