/**
 * Deployment-specific brand values, read from the environment on every call.
 * Missing or malformed values throw; there are no defaults. Production boot
 * calls `assertBrandDeploymentConfig` from `src/instrumentation.ts`.
 *
 * Node-safe (no `server-only`) so scripts can use it. Never import from a
 * client component: these variables are not exposed to the browser.
 */

export const BRAND_DEPLOYMENT_ENV = Object.freeze({
  appUrl: "APP_URL",
  marketingUrl: "MARKETING_URL",
  supportEmail: "SUPPORT_EMAIL",
});

export type BrandDeployment = Readonly<{
  /** Origin of the signed-in app, no trailing slash. */
  appUrl: string;
  /** Hostname of `appUrl`. */
  appDomain: string;
  /** Origin of the public marketing site, no trailing slash. */
  marketingUrl: string;
  /** Hostname of `marketingUrl` without a leading `www.`. */
  marketingDomain: string;
  supportEmail: string;
}>;

export class BrandConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandConfigError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readRequired(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new BrandConfigError(`${name} is required.`);
  }
  return value;
}

function parseOrigin(
  env: Record<string, string | undefined>,
  name: string,
): URL {
  const raw = readRequired(env, name);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BrandConfigError(`${name} must be an absolute URL (got "${raw}").`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BrandConfigError(`${name} must use http or https (got "${raw}").`);
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new BrandConfigError(`${name} must use https in production (got "${raw}").`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new BrandConfigError(
      `${name} must be an origin with no path, query, or fragment (got "${raw}").`,
    );
  }
  return url;
}

export function getBrandDeployment(
  env: Record<string, string | undefined> = process.env,
): BrandDeployment {
  const app = parseOrigin(env, BRAND_DEPLOYMENT_ENV.appUrl);
  const marketing = parseOrigin(env, BRAND_DEPLOYMENT_ENV.marketingUrl);
  const supportEmail = readRequired(env, BRAND_DEPLOYMENT_ENV.supportEmail);
  if (!EMAIL_PATTERN.test(supportEmail)) {
    throw new BrandConfigError(
      `${BRAND_DEPLOYMENT_ENV.supportEmail} must be an email address (got "${supportEmail}").`,
    );
  }
  return Object.freeze({
    appUrl: app.origin,
    appDomain: app.hostname,
    marketingUrl: marketing.origin,
    marketingDomain: marketing.hostname.replace(/^www\./, ""),
    supportEmail,
  });
}

/**
 * Validate every deployment brand value. `NEXT_PUBLIC_APP_URL`, when set, is
 * the browser copy of `APP_URL` and must match it.
 */
export function assertBrandDeploymentConfig(
  env: Record<string, string | undefined> = process.env,
): BrandDeployment {
  const deployment = getBrandDeployment(env);
  const publicAppUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    let publicOrigin: string;
    try {
      publicOrigin = new URL(publicAppUrl).origin;
    } catch {
      throw new BrandConfigError(
        `NEXT_PUBLIC_APP_URL must be an absolute URL (got "${publicAppUrl}").`,
      );
    }
    if (publicOrigin !== deployment.appUrl) {
      throw new BrandConfigError(
        `NEXT_PUBLIC_APP_URL (${publicOrigin}) must match ${BRAND_DEPLOYMENT_ENV.appUrl} (${deployment.appUrl}).`,
      );
    }
  }
  return deployment;
}
