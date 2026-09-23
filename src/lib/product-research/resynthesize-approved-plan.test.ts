import { describe, expect, it } from "vitest";
import { vocab } from "@/lib/product-config";
import {
  buildProductResynthesisApplyPlan,
  mergeProtectedProductDraftFields,
  productDraftFromApprovedProfile,
} from "@/lib/product-research/resynthesize-approved-plan";
import { emptyProductDraft } from "@/lib/product-research/review";

describe("buildProductResynthesisApplyPlan", () => {
  const before = {
    ...emptyProductDraft(),
    description: "Current description",
    valueProposition: "Rep-edited value prop",
    problemsSolved: ["Problem A"],
    capabilities: ["Capability A"],
  };

  const after = {
    ...emptyProductDraft(),
    description: "New AI description",
    valueProposition: "New AI value prop",
    problemsSolved: ["Problem A", "Problem B"],
    capabilities: ["Capability A", "Capability B"],
  };

  it("lists manually edited fields as preserved", () => {
    const plan = buildProductResynthesisApplyPlan({
      product: {
        id: "prod_1",
        name: "Acme",
        manuallyEditedFields: ["valueProposition"],
      },
      before,
      after,
    });

    expect(plan.preserved.some((item) => item.label === "Value proposition")).toBe(
      true,
    );
    expect(plan.preserved.some((item) => item.label === `${vocab.product.Singular} id`)).toBe(true);
    expect(plan.fieldDiffs.map((d) => d.field)).not.toContain("valueProposition");
    expect(plan.replaced.some((item) => item.label === "Description")).toBe(true);
  });
});

describe("mergeProtectedProductDraftFields", () => {
  it("keeps manually edited profile fields from the current product", () => {
    const current = {
      ...emptyProductDraft(),
      valueProposition: "Rep-edited value prop",
      description: "Old description",
    };
    const proposed = {
      ...emptyProductDraft(),
      valueProposition: "AI value prop",
      description: "AI description",
    };

    const merged = mergeProtectedProductDraftFields({
      current,
      proposed,
      manuallyEditedFields: ["valueProposition"],
    });

    expect(merged.valueProposition).toBe("Rep-edited value prop");
    expect(merged.description).toBe("AI description");
  });
});

describe("productDraftFromApprovedProfile", () => {
  it("returns empty draft when profile is missing", () => {
    expect(productDraftFromApprovedProfile(null)).toEqual(emptyProductDraft());
  });
});
