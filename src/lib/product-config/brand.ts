/**
 * Brand identity that does not vary by deployment. Client-safe.
 * Deployment values (domains, support email) live in `./deployment`.
 */
import { vocab } from "./vocabulary";

const APP_NAME = "AimedJobSeek";

export const brand = Object.freeze({
  appName: APP_NAME,
  /** Display name on the From line of platform transactional email. */
  transactionalSenderName: APP_NAME,
  /** Small label above the app name in the sidebar lockup. */
  lockupEyebrow: vocab.campaign.Plural,
  /** Document title when a page does not set its own. */
  defaultPageTitle: APP_NAME,
  metaDescription: `Research-backed ${vocab.campaign.singular} materials and ${vocab.outreach.singular} for ${vocab.seeker.plural}`,
  /** The app renders a text wordmark from `appName`; this is the only image asset. */
  faviconPath: "/favicon.ico",
  /** Product token for outbound HTTP User-Agent headers. */
  httpUserAgentProduct: APP_NAME,
});

/** User-Agent header value for a named outbound fetcher. */
export function brandUserAgent(component: string): string {
  return `${brand.httpUserAgentProduct}${component}/1.0`;
}

/**
 * Suggested referral share text. The user may edit it before copying.
 * `marketingDomain` comes from deployment config (`getBrandDeployment`).
 */
export function supportMailtoHref(email: string): string {
  return `mailto:${email}`;
}

export function referralShareMessage(input: {
  code: string;
  marketingDomain: string;
}): string {
  return (
    `I've been using ${brand.appName} to research ${vocab.account.plural} and write ${vocab.outreach.singular} — it saves ` +
    `me the half hour per ${vocab.campaign.singular} I never actually had. Use code ${input.code} when you sign up and ` +
    `you'll get 10% off for as long as you use it. ${input.marketingDomain}`
  );
}
