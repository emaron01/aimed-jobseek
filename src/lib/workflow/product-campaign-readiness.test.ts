import { describe, expect, it } from "vitest";
import { vocab } from "@/lib/product-config";
import {
  getProductCampaignReadiness,
  PRODUCT_READINESS_BLOCKERS,
} from "@/lib/workflow/product-campaign-readiness";

describe("getProductCampaignReadiness", () => {
  const complete = {
    approvalStatus: "APPROVED",
    icps: [{ criteria: [{ id: "c1" }] }],
    personas: [{ id: "p1" }],
  };

  it("marks a complete product as ready", () => {
    expect(getProductCampaignReadiness(complete)).toEqual({
      ready: true,
      blockers: [],
      omissionReason: null,
    });
  });

  it("requires approval", () => {
    const result = getProductCampaignReadiness({
      ...complete,
      approvalStatus: "NEEDS_REVIEW",
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(PRODUCT_READINESS_BLOCKERS.needsReview);
  });

  it("requires an ICP with criteria rows", () => {
    const result = getProductCampaignReadiness({
      ...complete,
      icps: [{ criteria: [] }],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(PRODUCT_READINESS_BLOCKERS.needsIcp);
  });

  it("does not require a saved persona", () => {
    const result = getProductCampaignReadiness({
      ...complete,
      personas: [],
    });
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("lists every remaining blocker when multiple are missing", () => {
    const result = getProductCampaignReadiness({
      approvalStatus: "DRAFT",
      icps: [],
      personas: [],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(2);
    expect(result.omissionReason).toContain("draft");
    expect(result.omissionReason).toContain(vocab.icp.singular);
    expect(result.omissionReason).not.toContain(vocab.persona.singular);
  });
});
