/**
 * Legacy persona-contract tests redirected to Product v3 buyer roles.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productAiResponseSchema,
  productSynthesisResultSchema,
} from "@/lib/product-research/contract";
import { transformProductAiResponse } from "@/lib/product-research/transform";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";

describe("Product AI candidate-profile contract (v6)", () => {
  it("does not accept suggestedBuyerRoles on the synthesis result", () => {
    const parsed = productAiResponseSchema.parse({
      candidateProfile: {
        identity: {
          name: {
            id: "id_name",
            kind: "FACT",
            text: "Alex Chen",
            provenance: [{ sourceId: "s1" }],
          },
        },
        direction: {},
      },
    });
    expect(parsed.candidateProfile.identity.name?.text).toBe("Alex Chen");
    expect(parsed).not.toHaveProperty("suggestedBuyerRoles");
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("8");
  });

  it("rejects FACT items without a source", () => {
    expect(() =>
      productAiResponseSchema.parse({
        candidateProfile: {
          identity: {
            name: {
              id: "id_name",
              kind: "FACT",
              text: "Alex Chen",
              provenance: [],
            },
          },
          direction: {},
        },
      }),
    ).toThrow();
  });

  it("transform returns only the candidate profile", () => {
    const ai = productAiResponseSchema.parse({
      candidateProfile: {
        identity: {},
        direction: {},
      },
    });
    const result = transformProductAiResponse(ai);
    expect(result).not.toHaveProperty("suggestedBuyerRoles");
    expect(productSynthesisResultSchema.parse(result)).toBeTruthy();
  });

  it("prompt forbids suggestedBuyerRoles", () => {
    const messages = buildProductSynthesisMessages({
      productName: "Alex Chen",
      primaryUrl: null,
      excerpts: [
        {
          sourceId: "s1",
          sourceType: "USER_NOTE",
          displayName: "Notes",
          text: "Backend engineer in Seattle.",
        },
      ],
    });
    expect(messages[0]!.content).toContain("Do NOT return suggestedBuyerRoles");
    expect(messages[0]!.content).not.toContain("Do NOT return suggestionKey");
  });
});
