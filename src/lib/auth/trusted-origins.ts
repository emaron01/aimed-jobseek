/**
 * Host / origin helpers for reverse-proxy + custom-domain cutovers.
 * Node-safe (no server-only) so next.config.ts and Better Auth can share it.
 *
 * After pointing APP_URL at a custom domain, Render may still send
 * `x-forwarded-host: <service>.onrender.com` while the browser Origin is the
 * custom host. Next.js Server Actions CSRF rejects that mismatch unless the
 * Origin host is listed in `experimental.serverActions.allowedOrigins`.
 */

const RENDER_LEGACY_HOST = "aimed-jobseek.onrender.com";

export function hostFromAbsoluteUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const host = new URL(value).host;
    return host || null;
  } catch {
    return null;
  }
}

/** Include bare + www twins so either form of the public host is accepted. */
export function expandHostVariants(host: string): string[] {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return [];
  const out = new Set<string>([normalized]);
  if (normalized.startsWith("www.")) {
    out.add(normalized.slice(4));
  } else if (
    normalized.includes(".") &&
    !normalized.startsWith("localhost") &&
    !/^\d{1,3}(\.\d{1,3}){3}(?::\d+)?$/.test(normalized)
  ) {
    out.add(`www.${normalized}`);
  }
  return [...out];
}

/**
 * Hostnames Next.js may see as Server Action `Origin` after a domain cutover.
 * Includes APP_URL / BETTER_AUTH_URL hosts (and www twins) plus the legacy
 * Render hostname that often remains as `x-forwarded-host`.
 */
export function serverActionAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const hosts = new Set<string>();
  for (const key of ["APP_URL", "NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL"] as const) {
    const host = hostFromAbsoluteUrl(env[key]);
    if (!host) continue;
    for (const variant of expandHostVariants(host)) {
      hosts.add(variant);
    }
  }
  hosts.add(RENDER_LEGACY_HOST);
  return [...hosts];
}

/**
 * Absolute origins for Better Auth CSRF (`trustedOrigins`).
 * Same host set as Server Actions, with https (http only for localhost).
 */
export function authTrustedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const origins = new Set<string>();
  for (const host of serverActionAllowedOrigins(env)) {
    const scheme =
      host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
    origins.add(`${scheme}://${host}`);
  }
  return [...origins];
}

export const RENDER_LEGACY_APP_HOST = RENDER_LEGACY_HOST;
