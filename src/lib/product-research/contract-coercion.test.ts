/**
 * Product / persona synthesis contract coercion tests.
 */
import { describe, expect, it } from "vitest";
import {
  parseProductAiResponse,
  productAiResponseSchema,
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  synthesisHasSuggestedBuyerRoles,
} from "@/lib/product-research/contract";
import { parsePersonaAiResponse } from "@/lib/persona-research/contract";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";

describe("parseProductAiResponse coercion", () => {
  it("strips leftover suggestedBuyerRoles and keeps the candidate profile", () => {
    const { data, coercedFields } = parseProductAiResponse({
      candidateProfile: fixtureAlexChenProfile(),
      suggestedBuyerRoles: [{ name: "CRO", confidence: "high" }],
    });
    expect(data.candidateProfile.identity.name?.text).toBe("Alex Chen");
    expect(synthesisHasSuggestedBuyerRoles(data)).toBe(false);
    expect(coercedFields).toContain("suggestedBuyerRoles");
    expect(productAiResponseSchema.safeParse(data).success).toBe(true);
  });

  it("rejects FACT items without provenance instead of coercing them", () => {
    expect(() =>
      parseProductAiResponse({
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
    ).toThrow(/FACT items require at least one ProductSource/);
  });

  it("parses when optional arrays are omitted", () => {
    const { data } = parseProductAiResponse({
      candidateProfile: {
        identity: {},
        direction: {},
      },
    });
    expect(data.candidateProfile.skills).toEqual([]);
    expect(data.candidateProfile.experience).toEqual([]);
    expect(data.candidateProfile.gaps).toEqual([]);
  });

  it("uses prompt version 6", () => {
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("9");
  });
});

describe("parsePersonaAiResponse coercion", () => {
  it("normalizes persona draft confidence and evidenceRefs", () => {
    const { data, coercedFields } = parsePersonaAiResponse({
      personaDraft: {
        name: "VP RevOps",
        confidence: "high",
        evidenceRefs: ["Owns CRM hygiene"],
      },
    });
    expect(data.personaDraft.confidence).toBe("HIGH");
    expect(data.personaDraft.evidenceRefs[0]!.claim).toBe("Owns CRM hygiene");
    expect(coercedFields).toContain("confidence");
    expect(coercedFields).toContain("evidenceRefs");
  });
});
