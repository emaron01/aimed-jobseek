/**
 * Shared constants for contact/outreach selective purge (safe for client + server).
 */

import { vocab } from "@/lib/product-config";

export const CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE = `Purge ${vocab.contact.plural}`;

/** Days after cancellation before contact/outbound data should be purged. */
export const CONTACT_OUTBOUND_RETENTION_DAYS = 30;

export const CONTACT_OUTBOUND_RETENTION_MS =
  CONTACT_OUTBOUND_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function contactOutboundPurgeEligibleAt(canceledAt: Date): Date {
  return new Date(canceledAt.getTime() + CONTACT_OUTBOUND_RETENTION_MS);
}

/** What the platform confirm dialog must name. */
export function contactOutboundPurgeConfirmSummary(): {
  deletes: string[];
  keeps: string[];
} {
  return {
    deletes: [
      `${vocab.contact.Plural} and ${vocab.contact.singular} ${vocab.list.plural}`,
      `${vocab.account.Plural} and ${vocab.account.singular}/${vocab.contact.singular} research`,
      "Scoring runs, scores, and title suggestions",
      `${vocab.campaign.Plural}, drafts, and send records`,
      "Email suppressions (opt-out / bounce list)",
    ],
    keeps: [
      "Organization and users",
      `${vocab.product.Plural}, ${vocab.icp.plural}, and ${vocab.persona.plural}`,
      "Voice samples and email signatures",
      "Billing profile, credit packs, and referrals",
    ],
  };
}
