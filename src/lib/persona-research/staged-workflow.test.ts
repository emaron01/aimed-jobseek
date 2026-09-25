/**
 * Staged Product → Persona workflow contracts & sufficiency.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productAiResponseSchema,
} from "@/lib/product-research/contract";
import { transformProductAiResponse } from "@/lib/product-research/transform";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";
import {
  evaluatePersonaEvidenceSufficiency,
  buildPersonaSearchFocus,
} from "@/lib/persona-research/sufficiency";
import { selectProductEvidenceForPersona } from "@/lib/persona-research/compact";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

describe("Product synthesis v6 — candidate profile only", () => {
  it("does not return suggestedBuyerRoles or persona drafts", () => {
    const ai = productAiResponseSchema.parse({
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
    expect(ai).not.toHaveProperty("suggestedBuyerRoles");
    expect(ai).not.toHaveProperty("personas");
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("9");

    const result = transformProductAiResponse(ai);
    expect(result).not.toHaveProperty("suggestedBuyerRoles");
    expect(result).not.toHaveProperty("personaDrafts");
  });

  it("prompt forbids buyer roles and persona drafts", () => {
    const messages = buildProductSynthesisMessages({
      productName: "X",
      primaryUrl: null,
      excerpts: [
        {
          sourceId: "1",
          sourceType: "USER_NOTE",
          displayName: "n",
          text: "Backend engineer resume",
        },
      ],
    });
    expect(messages[0]!.content).toContain("Do NOT return suggestedBuyerRoles");
    expect(messages[0]!.content).toContain("persona drafts");
  });
});

describe("persona synthesis differentiation prompt", () => {
  it("passes existing approved personas for runtime differentiation", () => {
    const messages = buildPersonaSynthesisMessages({
      productName: "Example",
      productSnapshot: { name: "Example" },
      productMessaging: null,
      buyerRole: {
        name: "Role B",
        likelyTitles: ["Director"],
        departmentFunction: "Operations",
        whyThisRoleMatters: "Owns process",
        suggestionKey: "role_b",
        confidence: "HIGH",
        evidenceRefs: [],
      },
      userContext: null,
      productEvidence: [],
      personaEvidence: [],
      icpContext: null,
      existingApprovedPersonas: [
        {
          id: "p1",
          name: "Role A",
          painPoints: ["Shared operational delay pain"],
          messagingNotes: ["Emphasize handoff risk"],
        },
      ],
    });
    expect(messages[0]!.content).toContain("INFERENCE");
    expect(messages[0]!.content).toContain("Keep this role distinct");
    expect(messages[0]!.content).not.toContain("GTM");
    expect(messages[1]!.content).toContain("existingApprovedPersonas");
    expect(messages[1]!.content).toContain("Role A");
    expect(messages[1]!.content).toContain("Shared operational delay pain");
  });
});

describe("Persona evidence sufficiency + progressive search triggers", () => {
  it("CRO with rich product evidence may skip web search", () => {
    const rich = `
      Forecast software helps sales leaders improve forecast confidence.
      Problems include manual forecast calls and unreliable CRM data.
      Capabilities: pipeline inspection, risk scoring, coaching workflows.
      Outcomes: reduce admin time, increase forecast accuracy.
    `.repeat(3);
    const result = evaluatePersonaEvidenceSufficiency({
      roleName: "Chief Revenue Officer",
      productName: "Forecast App",
      productEvidenceText: rich,
      personaMaterialText: "",
      webEvidenceText: "",
    });
    expect(result.sufficient).toBe(true);
  });

  it("ambiguous infrastructure role with thin evidence is not sufficient", () => {
    const result = evaluatePersonaEvidenceSufficiency({
      roleName: "VP Infrastructure",
      productName: "Cloud Ops",
      productEvidenceText: "We sell cloud software.",
      personaMaterialText: "",
      webEvidenceText: "",
    });
    expect(result.sufficient).toBe(false);
    expect(result.ambiguityLevel).not.toBe("LOW");
    expect(result.missingDimensions.length).toBeGreaterThan(0);
    const focus = buildPersonaSearchFocus({
      roleName: "VP Infrastructure",
      productName: "Cloud Ops",
      industryHint: "enterprise bank",
      missing: result.missingDimensions,
    });
    expect(focus).toContain("VP Infrastructure");
  });

  it("persona policy defaults exist separately from product", () => {
    expect(DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerPersona).toBe(2);
    expect(DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerPersona).toBe(8);
    expect(PERSONA_SYNTHESIS_PROMPT_VERSION).toBe("13");
  });

  it("selects role-relevant product evidence without Product re-fetch", () => {
    const selected = selectProductEvidenceForPersona({
      roleName: "CRO",
      excerpts: [
        {
          sourceId: "a",
          sourceType: "URL",
          displayName: "Pricing",
          text: "Pricing plans start at $10.",
        },
        {
          sourceId: "b",
          sourceType: "URL",
          displayName: "Forecast",
          text: "Improve forecast accuracy and sales coaching for CROs.",
        },
      ],
      maxChars: 5000,
    });
    expect(selected.some((e) => e.sourceId === "b")).toBe(true);
  });
});

describe("architecture boundaries", () => {
  it("persona synthesis does not invoke Product acquisition or contact scoring", async () => {
    const fs = await import("node:fs");
    const synth = fs.readFileSync(
      "src/lib/persona-research/synthesize.ts",
      "utf8",
    );
    expect(synth).toContain("getPersonaAiProvider");
    expect(synth).toContain("selectProductEvidenceForPersona");
    expect(synth).toContain("existingApprovedPersonas");
    expect(synth).not.toContain("acquireProductEvidence");
    expect(synth).not.toContain("runProgressiveProductWebSearch");
    expect(synth).not.toContain("scoreContact");
    expect(synth).not.toContain("researchContact");
    expect(synth).not.toContain("generateEmail");
  });

  it("product synthesize no longer writes personaDrafts", async () => {
    const fs = await import("node:fs");
    const synth = fs.readFileSync(
      "src/lib/product-research/synthesize.ts",
      "utf8",
    );
    expect(synth).not.toContain("result.suggestedBuyerRoles");
    expect(synth).toContain("suggestedPersonasJson: []");
    expect(synth).toContain("personaDraftsJson: Prisma.DbNull");
  });
});
