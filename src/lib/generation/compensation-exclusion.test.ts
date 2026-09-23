import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evidenceFragments } from "@/lib/campaign/offer-validation";
import { buildEmailPrompt, emailPromptOptionsForContext } from "@/lib/email-generation/prompt";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  icpForGeneration,
  personaGenerationSnapshot,
  profileForGeneration,
} from "@/lib/generation/compensation";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";

const TOKEN = "187654";

function contextFixture(icp: EmailGenerationContext["icp"], evidence: string[]): EmailGenerationContext {
  return {
    organizationId: "org_1",
    userId: "user_1",
    campaignContact: { id: "cc_1", campaignId: "campaign_1", contactId: "contact_1" },
    campaign: {
      id: "campaign_1",
      name: "Application",
      offerName: null,
      offerDescription: null,
      offerCta: null,
      offerNotes: null,
      offerValidationJson: null,
      offerValidationHash: null,
      emailLength: "MEDIUM",
      emailGuidance: null,
    },
    emailLength: "MEDIUM",
    contact: {
      id: "contact_1",
      companyId: "company_1",
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex@example.test",
      title: "Director",
      company: "Acme",
      industry: "Software",
      location: "Seattle",
    },
    product: {
      id: "product_1",
      name: "Alex Chen",
      description: "Product designer",
      valueProposition: "Ships design systems",
      evidence,
      problemsSolved: ["Invoice generation"],
      messaging: {
        primaryPositioning: [],
        coreValueThemes: [],
        strongestDifferentiators: [],
        proofPoints: [],
        supportedClaims: [],
        claimsNotToMake: [],
        terminologyToUse: [],
        terminologyToAvoid: [],
      },
    },
    persona: {
      id: "persona_1",
      name: "Hiring manager",
      painPoints: ["Unclear ownership"],
      desiredOutcomes: ["A designer who can ship"],
      messagingNotes: [],
      messaging: { positioning: [], proofPoints: [], objections: [] },
      profile: {
        terminology: [],
        organizationalPressures: [],
        buyingRole: [],
        decisionInfluence: [],
      },
    },
    icp,
    contactResearch: null,
    companyResearch: null,
    companyResearchUpdatedAt: null,
    excludedCopySignals: {
      riskSignals: [],
      professionalSignals: [],
      negativeRoleSignals: [],
    },
    personaResolution: {
      source: "chosen",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: null,
      decisionReason: null,
    },
    voiceSamples: [],
    sequence: [],
  };
}

describe("compensation stays out of generation contexts", () => {
  it("omits profile compensation and Target Employer pay from outreach and persona generation", () => {
    const profile = fixtureAlexChenProfile();
    profile.compensation = {
      id: "comp_token",
      kind: "FACT",
      text: `Seeking ${TOKEN} total annual compensation.`,
      provenance: [{ sourceId: "src_resume_alex_chen" }],
    };
    const employer = {
      id: "icp_1",
      name: "Target employers",
      definition: "Product design teams at software companies.",
      description: null,
      targetAnnualEarningsMin: TOKEN,
      targetAnnualEarningsTarget: 200000,
      targetHourlyRateMin: 90,
      targetHourlyRateTarget: 110,
      compensationCurrency: "USD",
      employmentTypes: ["FULL_TIME"],
      annualEarningsMinimumRequired: true,
      hourlyRateMinimumRequired: false,
      employmentTypeRequired: true,
    };

    const generatedProfile = profileForGeneration(profile);
    const generatedIcp = icpForGeneration(employer);
    const persona = personaGenerationSnapshot({
      product: {
        name: "Alex Chen",
        description: "Product designer",
        valueProposition: "Ships design systems",
        websiteUrl: null,
        profileJson: profile,
      },
      icp: employer,
    });
    const evidence = evidenceFragments(generatedProfile, "productProfile");
    const emailContext = contextFixture(generatedIcp, evidence);
    const email = buildEmailPrompt(
      emailContext,
      emailPromptOptionsForContext(emailContext),
    );
    const personaMessages = buildPersonaSynthesisMessages({
      productName: "Alex Chen",
      productSnapshot: persona.productSnapshot,
      productMessaging: null,
      buyerRole: {
        suggestionKey: "hiring-manager",
        name: "Hiring manager",
        likelyTitles: ["Director of Design"],
        departmentFunction: "Design",
        whyThisRoleMatters: "Owns the design hire",
        confidence: "MEDIUM",
        evidenceRefs: [],
      },
      userContext: null,
      productEvidence: [],
      personaEvidence: [],
      icpContext: persona.icpContext,
    });

    const payload = JSON.stringify({
      generatedProfile,
      generatedIcp,
      persona,
      email,
      personaMessages,
    });
    expect(payload).not.toContain(TOKEN);
    expect(payload).not.toContain("targetAnnualEarningsMin");
    expect(payload).not.toContain("targetHourlyRateMin");
    expect(payload).toContain("Alex Chen");
    expect(payload).toContain("Product design teams");

    const contextSource = readFileSync("src/lib/email-generation/context.ts", "utf8");
    const offerSource = readFileSync("src/lib/campaign/offer-validation.ts", "utf8");
    const personaSource = readFileSync("src/lib/persona-research/synthesize.ts", "utf8");
    expect(contextSource).toContain("omitCompensationFromUnknown");
    expect(contextSource).toContain("icpForGeneration");
    expect(offerSource).toContain("omitCompensationFromUnknown");
    expect(offerSource).not.toContain("targetAnnualEarningsMin");
    expect(personaSource).toContain("personaGenerationSnapshot");
  });
});
