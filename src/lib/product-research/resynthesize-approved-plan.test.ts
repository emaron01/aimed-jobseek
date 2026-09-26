import { describe, expect, it } from "vitest";
import { vocab } from "@/lib/product-config";
import {
  buildProductResynthesisApplyPlan,
  mergeProtectedProductDraftFields,
  productDraftFromApprovedProfile,
} from "@/lib/product-research/resynthesize-approved-plan";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";

describe("buildProductResynthesisApplyPlan", () => {
  const before = fixtureAlexChenProfile();
  const after = {
    ...before,
    positioning: {
      ...before.positioning!,
      text: "New inferred positioning.",
    },
    skills: [
      ...before.skills,
      {
        id: "skill_new",
        kind: "INFERENCE" as const,
        text: "Mentoring",
        provenance: [],
      },
    ],
  };

  it("lists manually edited fields as preserved", () => {
    const plan = buildProductResynthesisApplyPlan({
      product: {
        id: "prod_1",
        name: "Alex Chen",
        manuallyEditedFields: ["positioning"],
      },
      before,
      after,
    });

    expect(plan.preserved.some((item) => item.label === "Positioning statement")).toBe(
      true,
    );
    expect(plan.preserved.some((item) => item.label === `${vocab.product.Singular} id`)).toBe(true);
    expect(plan.fieldDiffs.map((d) => d.field)).not.toContain("positioning");
    expect(plan.replaced.some((item) => item.label === "Skills and competencies")).toBe(
      true,
    );
  });
});

describe("mergeProtectedProductDraftFields", () => {
  it("keeps manually edited profile fields from the current product", () => {
    const current = fixtureAlexChenProfile();
    const proposed = {
      ...current,
      positioning: {
        ...current.positioning!,
        text: "AI positioning",
      },
      identity: {
        ...current.identity,
        headline: {
          ...current.identity.headline!,
          text: "AI headline",
        },
      },
    };

    const merged = mergeProtectedProductDraftFields({
      current,
      proposed,
      manuallyEditedFields: ["positioning"],
    });

    expect(merged.positioning?.text).toBe(current.positioning?.text);
    expect(merged.identity.headline?.text).toBe("AI headline");
  });

  it("keeps seeker-edited role dates including year-only and Present", () => {
    const current = {
      ...fixtureAlexChenProfile(),
      experience: fixtureAlexChenProfile().experience.map((role, index) =>
        index === 0
          ? { ...role, startDate: "2021", endDate: "Present" }
          : role,
      ),
    };
    const proposed = {
      ...current,
      experience: current.experience.map((role, index) =>
        index === 0
          ? { ...role, startDate: "January 2021", endDate: "2026" }
          : role,
      ),
    };
    const merged = mergeProtectedProductDraftFields({
      current,
      proposed,
      manuallyEditedFields: ["experience"],
    });
    expect(merged.experience[0]?.startDate).toBe("2021");
    expect(merged.experience[0]?.endDate).toBe("Present");
  });
});

describe("productDraftFromApprovedProfile", () => {
  it("returns empty profile when stored JSON is missing", () => {
    expect(productDraftFromApprovedProfile(null)).toEqual(emptyCandidateProfile());
  });
});
