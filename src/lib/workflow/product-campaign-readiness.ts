/**
 * Client-safe campaign readiness for a Product.
 * A product is selectable in New Campaign when approved, has an ICP with
 * criteria rows, and has at least one saved persona.
 */

import { vocab } from "@/lib/product-config";

/** Blocker text is shown to users and matched by the Home setup summaries. */
export const PRODUCT_READINESS_BLOCKERS = Object.freeze({
  notStarted: `${vocab.product.Singular} setup not started`,
  needsReview: `${vocab.product.Singular} needs review and approval`,
  draft: `${vocab.product.Singular} is still a draft`,
  notApproved: `${vocab.product.Singular} is not approved`,
  needsIcp: `Needs ${vocab.icp.aSingular} with criteria`,
  needsPersona: `Needs at least one saved ${vocab.persona.singular}`,
});

export type ProductCampaignReadinessInput = {
  approvalStatus: string;
  icps: Array<{ criteria: unknown[] }>;
  personas: unknown[];
};

export type ProductCampaignReadiness = {
  ready: boolean;
  blockers: string[];
  /** Single line for disabled <option> labels. */
  omissionReason: string | null;
};

function hasInterpretedCriteria(icp: { criteria: unknown[] }): boolean {
  return icp.criteria.length > 0;
}

export function getProductCampaignReadiness(
  product: ProductCampaignReadinessInput,
): ProductCampaignReadiness {
  const blockers: string[] = [];

  if (product.approvalStatus !== "APPROVED") {
    if (product.approvalStatus === "NOT_STARTED") {
      blockers.push(PRODUCT_READINESS_BLOCKERS.notStarted);
    } else if (product.approvalStatus === "NEEDS_REVIEW") {
      blockers.push(PRODUCT_READINESS_BLOCKERS.needsReview);
    } else if (product.approvalStatus === "DRAFT") {
      blockers.push(PRODUCT_READINESS_BLOCKERS.draft);
    } else {
      blockers.push(PRODUCT_READINESS_BLOCKERS.notApproved);
    }
  }

  const icpsWithCriteria = product.icps.filter(hasInterpretedCriteria);
  if (icpsWithCriteria.length === 0) {
    blockers.push(PRODUCT_READINESS_BLOCKERS.needsIcp);
  }

  if (product.personas.length === 0) {
    blockers.push(PRODUCT_READINESS_BLOCKERS.needsPersona);
  }

  return {
    ready: blockers.length === 0,
    blockers,
    omissionReason: blockers.length > 0 ? blockers.join("; ") : null,
  };
}

export function formatProductCampaignOmission(
  productName: string,
  readiness: ProductCampaignReadiness,
): string {
  if (readiness.ready || !readiness.omissionReason) return productName;
  return `${productName} — ${readiness.omissionReason}`;
}
