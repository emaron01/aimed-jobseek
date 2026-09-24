import type { OfferConflict } from "@/lib/campaign/offer-validation";
import type { EmailGenerationContext } from "@/lib/email-generation/context";

/**
 * Offer conflicts are informational for validation storage only —
 * rep input is never challenged, so generation never surfaces warnings.
 */
export function unacknowledgedOfferWarnings(
  context: EmailGenerationContext,
): OfferConflict[] {
  void context;
  return [];
}
