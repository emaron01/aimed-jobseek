import { describe, expect, it } from "vitest";
import {
  candidateProfileForGeneration,
  omitCompensationFromUnknown,
  parseCandidateProfile,
  parseCandidateProfileSafe,
  profileContainsCompensation,
} from "@/lib/product-research/candidate-profile";
import {
  fixtureAlexChenProfile,
  fixtureResumeAlexChenText,
} from "@/lib/product-research/fixtures/alex-chen-profile";
import {
  parseProductAiResponse,
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productAiResponseSchema,
  synthesisHasSuggestedBuyerRoles,
} from "@/lib/product-research/contract";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";
import { transformProductAiResponse } from "@/lib/product-research/transform";
import { evidenceFragments } from "@/lib/campaign/offer-validation";

describe("candidate profile shape", () => {
  it("parses the fixture resume profile", () => {
    const resume = fixtureResumeAlexChenText();
    expect(resume).toContain("Alex Chen");
    expect(resume).toContain("Northwind Analytics");
    const profile = fixtureAlexChenProfile();
    expect(profile.identity.name?.text).toBe("Alex Chen");
    expect(profile.experience).toHaveLength(2);
    expect(profile.compensation?.text).toMatch(/180,000/);
    expect(profile.gaps.length).toBeGreaterThan(0);
  });

  it("rejects FACT items without a ProductSource provenance", () => {
    const result = parseCandidateProfileSafe({
      identity: {
        name: {
          id: "id_name",
          kind: "FACT",
          text: "Alex Chen",
          provenance: [],
        },
      },
      direction: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/FACT items require at least one ProductSource/);
    }
  });

  it("accepts INFERENCE items without provenance", () => {
    const profile = parseCandidateProfile({
      identity: {},
      positioning: {
        id: "id_pos",
        kind: "INFERENCE",
        text: "Backend engineer for billing systems.",
        provenance: [],
      },
      direction: {},
    });
    expect(profile.positioning?.kind).toBe("INFERENCE");
  });

  it("accepts a later consultation FACT with its own source without restructuring", () => {
    const profile = fixtureAlexChenProfile();
    const next = parseCandidateProfile({
      ...profile,
      skills: [
        ...profile.skills,
        {
          id: "consult_skill_1",
          kind: "FACT",
          text: "Led a three-person incident rotation",
          provenance: [{ sourceId: "src_consultation_1" }],
        },
      ],
    });
    expect(next.skills.at(-1)?.provenance[0]?.sourceId).toBe(
      "src_consultation_1",
    );
  });
});

describe("profile synthesis output", () => {
  it("never contains suggestedBuyerRoles", () => {
    const profile = fixtureAlexChenProfile();
    const parsed = parseProductAiResponse({
      candidateProfile: profile,
      suggestedBuyerRoles: [{ name: "CRO" }],
    });
    expect(parsed.data).not.toHaveProperty("suggestedBuyerRoles");
    expect(synthesisHasSuggestedBuyerRoles(parsed.data)).toBe(false);

    const transformed = transformProductAiResponse(parsed.data);
    expect(transformed).not.toHaveProperty("suggestedBuyerRoles");
    expect(transformed.candidateProfile.identity.name?.text).toBe("Alex Chen");
    expect(productAiResponseSchema.safeParse(parsed.data).success).toBe(true);
  });

  it("uses prompt version 7 and does not ask for compensation", () => {
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("7");
    const messages = buildProductSynthesisMessages({
      productName: "Alex Chen",
      primaryUrl: null,
      excerpts: [
        {
          sourceId: "src_resume_alex_chen",
          sourceType: "UPLOADED_DOCUMENT",
          displayName: "resume-alex-chen.txt",
          text: fixtureResumeAlexChenText(),
        },
      ],
    });
    expect(messages[0]!.content).toContain("Do NOT return suggestedBuyerRoles");
    expect(messages[0]!.content).toContain("Do not invent a web search");
    expect(messages[0]!.content).toContain("Do not return compensation");
    expect(messages[1]!.content).toContain("suggestedBuyerRoles");
    expect(messages[1]!.content).toContain("webSearchForThePerson");
    expect(messages[1]!.content).not.toContain('"compensation"');
  });
});

describe("compensation privacy", () => {
  it("old profileJson with a compensation field still loads", () => {
    const profile = parseCandidateProfile(fixtureAlexChenProfile());
    expect(profile.compensation?.text).toMatch(/180,000/);
    expect(parseCandidateProfileSafe(profile).ok).toBe(true);
  });

  it("is excluded from outreach and document generation context", () => {
    const profile = fixtureAlexChenProfile();
    expect(profileContainsCompensation(profile)).toBe(true);

    const forGeneration = candidateProfileForGeneration(profile);
    expect(forGeneration).not.toBeNull();
    expect(forGeneration).not.toHaveProperty("compensation");
    expect(JSON.stringify(forGeneration)).not.toMatch(/180,000/);

    const fragments = evidenceFragments(
      omitCompensationFromUnknown(profile),
      "productProfile",
    );
    expect(fragments.join("\n")).not.toMatch(/180,000/);
    expect(fragments.join("\n")).toContain("Alex Chen");
  });
});
