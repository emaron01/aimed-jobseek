/**
 * Production URL safety for outbound fetches (SSRF hardening).
 * Shared by company website retrieval and product research.
 */

import { brandUserAgent } from "@/lib/product-config";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function ipv4ToInt(host: string): number | null {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return (
    ((parts[0]! << 24) >>> 0) +
    ((parts[1]! << 16) >>> 0) +
    ((parts[2]! << 8) >>> 0) +
    (parts[3]! >>> 0)
  );
}

function isPrivateOrReservedIpv4(host: string): boolean {
  const n = ipv4ToInt(host);
  if (n == null) return false;
  // Mask then >>> 0 so comparisons work for high octets (192.x, 169.x, etc.)
  // where JS bitwise ops yield signed int32 values.
  const a = (n & 0xff000000) >>> 0;
  const ab = (n & 0xffff0000) >>> 0;
  const abc12 = (n & 0xfff00000) >>> 0;
  const abc10 = (n & 0xffc00000) >>> 0;
  // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10 (CGNAT)
  if (a === 0x00000000) return true;
  if (a === 0x0a000000) return true;
  if (a === 0x7f000000) return true;
  if (ab === 0xa9fe0000) return true;
  if (abc12 === 0xac100000) return true;
  if (ab === 0xc0a80000) return true;
  if (abc10 === 0x64400000) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host === "::1" || host.startsWith("[")) return true;
  if (isIpv4(host) && isPrivateOrReservedIpv4(host)) return true;
  // IPv6 local/link-local (simplified)
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
      return true;
    }
  }
  return false;
}

export type UrlSafetyResult =
  | { ok: true; href: string }
  | { ok: false; reason: string };

/**
 * Validate an absolute http(s) URL is safe to fetch from the server.
 * Does not resolve DNS — hostname/IP literal checks only.
 */
export function assertSafeExternalHttpUrl(raw: string): UrlSafetyResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Empty URL." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with credentials are not allowed." };
  }
  if (!url.hostname) {
    return { ok: false, reason: "URL hostname is required." };
  }
  if (isBlockedHostname(url.hostname)) {
    return { ok: false, reason: "Internal or private network URLs are blocked." };
  }

  return { ok: true, href: url.href };
}

/**
 * Fetch with manual redirect following and per-hop URL safety checks.
 */
export async function safeFetchHttp(
  initialUrl: string,
  init?: RequestInit & { maxRedirects?: number; timeoutMs?: number },
): Promise<Response> {
  const maxRedirects = init?.maxRedirects ?? 5;
  const timeoutMs = init?.timeoutMs ?? 12_000;
  let current = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safety = assertSafeExternalHttpUrl(current);
    if (!safety.ok) {
      throw new Error(safety.reason);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(safety.href, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain",
          "User-Agent":
            (init?.headers as Record<string, string> | undefined)?.[
              "User-Agent"
            ] ?? brandUserAgent("SafeFetch"),
          ...(init?.headers as Record<string, string> | undefined),
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Redirect without Location header.");
        }
        current = new URL(location, safety.href).href;
        continue;
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Too many redirects.");
}