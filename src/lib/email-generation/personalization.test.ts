import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import { buildEmailPrompt, emailPromptOptionsForContext } from "@/lib/email-generation/prompt";
import {
  collectMotionSpecificCandidates,
  type RequiredMotionSpecific,
} from "@/lib/email-generation/motion-specifics";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  distinctiveContentTokens,
  personalizationSourceSummary,
  resolveEmailGenerationPersona,
  resolvePersonalization,
  resolvePersonalizationForGeneration,
  tokenJaccard,
} from "@/lib/email-generation/personalization";
import { CRO_PERSONA_DRAFT_V2_FIXTURE } from "@/lib/persona-research/fixtures/cro-setup-run-draft-v2";
import { REVOPS_PERSONA_DRAFT_FIXTURE } from "@/lib/persona-research/fixtures/revops-setup-run-draft";

const stoneEagleResearch: EmailCompanyResearch = {
  companySummary:
    "StoneEagle provides F&I and dealership software to automotive retail groups.",
  whatTheySell: "B2B automotive-dealership software and data intelligence.",
  customerTypes: ["auto dealer groups", "franchise dealerships"],
  primaryMarkets: ["US automotive retail"],
  businessModel:
    "B2B software licensed to multi-rooftop dealer groups that sell through retail networks",
  companySizeContext: "201–500 employees in Dallas.",
  confidence: "HIGH",
};

const plgResearch: EmailCompanyResearch = {
  companySummary: "Northwind ships a usage-based analytics SDK to developers.",
  whatTheySell: "Self-serve product analytics for engineering teams.",
  customerTypes: ["product-led growth teams", "self-serve expansion buyers"],
  primaryMarkets: ["developer-led SaaS"],
  businessModel:
    "High-volume PLG with usage-based expansion seats, not enterprise RFPs",
  companySizeContext: null,
  confidence: "HIGH",
};

const thinResearch: EmailCompanyResearch = {
  companySummary: "A company in software.",
  whatTheySell: null,
  customerTypes: [],
  primaryMarkets: [],
  businessModel: null,
  companySizeContext: null,
  confidence: "HIGH",
};

function testSpecificsFromResearch(
  research: EmailCompanyResearch | null,
): RequiredMotionSpecific[] {
  if (!research) return [];
  return collectMotionSpecificCandidates(research)
    .slice(0, 2)
    .map((candidate) => ({
      text: candidate.text,
      sourceField: candidate.sourceField,
      whyItMatters: "Test-selected company fact.",
    }));
}

function promptMessages(
  context: EmailGenerationContext = contextFixture(),
  guidance?: string | null,
) {
  const specifics = testSpecificsFromResearch(context.companyResearch);
  return buildEmailPrompt(
    context,
    emailPromptOptionsForContext(context, specifics),
    guidance ?? null,
  );
}

function contextFixture(
  overrides: Partial<EmailGenerationContext> = {},
): EmailGenerationContext {
  return {
    organizationId: "org_1",
    userId: "user_1",
    campaignContact: {
      id: "cc_1",
      campaignId: "campaign_1",
      contactId: "contact_1",
    },
    campaign: {
      id: "campaign_1",
      name: "Outreach",
      offerName: "Working session",
      offerDescription: "A 20-minute review",
      offerCta: "Reply with a time that works",
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
      title: "Chief Revenue Officer",
      company: "Example Co",
      industry: null,
      location: null,
    },
    product: {
      id: "product_1",
      name: "Example Product",
      description: "Helps operators see what is actually happening",
      valueProposition: "Fewer surprises in daily operations",
      evidence: ["Published product fact: configurable workflow."],
      problemsSolved: ["Missed handoffs between teams"],
      messaging: {
        primaryPositioning: [],
        coreValueThemes: [],
        strongestDifferentiators: [],
        proofPoints: [],
        supportedClaims: ["Improves visibility into current work"],
        claimsNotToMake: ["Guaranteed results"],
        terminologyToUse: [],
        terminologyToAvoid: [],
      },
    },
    persona: {
      id: "persona_cro",
      name: "CRO",
      painPoints: ["Forecast calls rely on anecdotes"],
      desiredOutcomes: ["A defensible commit"],
      messagingNotes: ["Avoid guaranteed claims."],
      messaging: {
        positioning: ["Make forecast changes explainable"],
        proofPoints: ["Evidence at opportunity level"],
        objections: ["Another system for reps"],
      },
      profile: {
        terminology: ["commit", "pipeline coverage"],
        organizationalPressures: [],
        buyingRole: [],
        decisionInfluence: [],
      },
    },
    icp: {
      id: "icp_1",
      name: "Operators",
      definition: null,
      description: null,
    },
    contactResearch: null,
    companyResearch: null,
    companyResearchUpdatedAt: null,
    excludedCopySignals: {
      riskSignals: [],
      professionalSignals: [],
      negativeRoleSignals: [],
    },
    personaResolution: {
      source: "matched",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: null,
      decisionReason: null,
    },
    voiceSamples: [
      {
        id: "voice_1",
        label: "Sample",
        sampleText: "Short and direct. One question at the end.",
        createdAt: new Date(),
      },
    ],
    sequence: [],
    ...overrides,
  };
}

/**
 * Deterministic stand-in for a model that follows the generation contract:
 * copy selling-motion tokens, persona angle, and role facts from the prompt
 * payload into the body. This is how we assert company-derived content rather
 * than "any diff."
 */
function emailFromPrompt(context: EmailGenerationContext): {
  subject: string;
  body: string;
} {
  const content = promptMessages(context)[1]!.content;
  const jsonPart = content
    .replace(
      /^Generate the first outbound email for this campaign contact.\s*/,
      "",
    )
    .split("\n\nWRITING SAMPLE")[0]!;
  const prompt = JSON.parse(jsonPart) as {
    personalization: { tier: string; companyResearchUsable: boolean };
    companyResearch: EmailCompanyResearch | null;
    personaNeeds: { painPoints: string[]; desiredOutcomes: string[] };
    personaMessaging: { positioning: string[]; terminology: string[] };
    contactContext: {
      recipient: { firstName: string | null };
      freshRoleResearch: {
        roleSummary: string | null;
        responsibilities: string[];
        ownershipAreas: string[];
      } | null;
    };
    offer: { callToAction: string | null };
  };

  const motion = [
    ...(prompt.companyResearch?.customerTypes ?? []),
    prompt.companyResearch?.businessModel ?? "",
    ...(prompt.companyResearch?.primaryMarkets ?? []),
  ]
    .filter((value) => value.trim())
    .join("; ");
  const role = [
    prompt.contactContext.freshRoleResearch?.roleSummary,
    ...(prompt.contactContext.freshRoleResearch?.responsibilities ?? []),
    ...(prompt.contactContext.freshRoleResearch?.ownershipAreas ?? []),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("; ");
  const angle = [
    prompt.personaNeeds.painPoints[0],
    prompt.personaMessaging.positioning[0],
  ]
    .filter(Boolean)
    .join("; ");

  const paragraphs: string[] = [];
  if (prompt.personalization.tier === "THIN") {
    paragraphs.push(
      `Leaders in your seat often hit ${angle || "the same operating friction this product addresses"}.`,
    );
  } else if (motion) {
    paragraphs.push(`Given ${motion}, ${angle}.`);
  }
  if (role) paragraphs.push(`In your role: ${role}.`);
  paragraphs.push(prompt.offer.callToAction ?? "Worth a look?");

  return {
    subject: "Quick question",
    body: `Hi ${prompt.contactContext.recipient.firstName ?? "there"},\n\n${paragraphs.join("\n\n")}`,
  };
}

const SHARED_EXCLUDE = [
  "Hi Alex",
  "Working session",
  "Reply with a time that works",
  "CRO",
  "Forecast calls rely on anecdotes",
  "Make forecast changes explainable",
  "Example Product",
];

describe("personalization tiers", () => {
  it("classifies BEST, COMPANY, and THIN from research quality", () => {
    expect(
      resolvePersonalization({
        companyResearch: stoneEagleResearch,
        contactResearch: {
          roleSummary: "Owns the revenue forecast",
          responsibilities: ["Commit calls"],
          ownershipAreas: [],
        },
      }).tier,
    ).toBe("BEST");
    expect(
      resolvePersonalization({
        companyResearch: stoneEagleResearch,
        contactResearch: null,
      }).tier,
    ).toBe("COMPANY");
    expect(
      resolvePersonalization({
        companyResearch: thinResearch,
        contactResearch: null,
      }).tier,
    ).toBe("COMPANY");
    expect(
      resolvePersonalization({
        companyResearch: null,
        contactResearch: null,
      }).tier,
    ).toBe("THIN");
    expect(
      resolvePersonalization({
        companyResearch: { ...stoneEagleResearch, confidence: "LOW" },
        contactResearch: null,
      }).companyResearchUsable,
    ).toBe(true);
  });

  it("passes usable low-confidence research to the selector", () => {
    const thin = resolvePersonalization({
      companyResearch: thinResearch,
      contactResearch: null,
    });
    expect(thin.companyResearch).not.toBeNull();
    const low = resolvePersonalization({
      companyResearch: { ...stoneEagleResearch, confidence: "LOW" },
      contactResearch: null,
    });
    expect(low.companyResearch).not.toBeNull();
    expect(low.tier).toBe("COMPANY");

    const noRelevantFact = resolvePersonalizationForGeneration({
      companyResearch: { ...stoneEagleResearch, confidence: "LOW" },
      contactResearch: null,
      hasRelevantCompanyFacts: false,
    });
    expect(noRelevantFact.companyResearch).toBeNull();
    expect(noRelevantFact.tier).toBe("THIN");
  });

  it("signals tier and degrade rules in the generation prompt", () => {
    const messages = promptMessages(
      contextFixture({ companyResearch: stoneEagleResearch }),
    );
    const system = messages[0]!.content;
    const user = messages[1]!.content;
    expect(system).toContain("Personalization is graded");
    expect(system).toContain("do not infer");
    expect(system).toMatch(/false specificity/i);
    expect(user).toContain('"tier": "COMPANY"');
    expect(user).toContain('"companyResearchUsable": true');
  });
});

describe("persona resolution for generation", () => {
  it("uses matched persona when present", () => {
    expect(
      resolveEmailGenerationPersona({
        matchedPersonaId: "persona_matched",
        suggestedPersonaId: "persona_campaign",
      }),
    ).toEqual({
      personaId: "persona_matched",
      source: "matched",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: "persona_campaign",
      decisionReason: null,
    });
  });

  it("requires confirmation instead of silently using the campaign persona", () => {
    expect(
      resolveEmailGenerationPersona({
        matchedPersonaId: null,
        suggestedPersonaId: "persona_campaign",
        aiSkipReason: "MULTI_PERSONA_MATCH",
      }),
    ).toEqual({
      personaId: null,
      source: "none",
      hasDecision: false,
      needsConfirmation: true,
      suggestedPersonaId: "persona_campaign",
      decisionReason:
        "Title matched more than one persona — choose which applies.",
    });
  });

  it("uses the persona stored on the draft when match is absent", () => {
    expect(
      resolveEmailGenerationPersona({
        storedPersonaId: "persona_stored",
        matchedPersonaId: null,
        suggestedPersonaId: "persona_campaign",
      }),
    ).toEqual({
      personaId: "persona_stored",
      source: "draft",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: "persona_campaign",
      decisionReason: null,
    });
  });

  it("uses an explicit rep choice over later matches", () => {
    expect(
      resolveEmailGenerationPersona({
        chosenPersonaId: "persona_chosen",
        storedPersonaId: "persona_stored",
        matchedPersonaId: "persona_matched",
        suggestedPersonaId: "persona_campaign",
      }),
    ).toEqual({
      personaId: "persona_chosen",
      source: "chosen",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: "persona_campaign",
      decisionReason: null,
    });
  });
});

describe("personalization source summary", () => {
  it("lists company research fields that were used and states when contact research is absent", () => {
    const decision = resolvePersonalization({
      companyResearch: stoneEagleResearch,
      contactResearch: null,
    });
    expect(decision.tier).toBe("COMPANY");
    expect(decision.sources).toMatch(/Company research used: .*business model/i);
    expect(decision.sources).toMatch(/customer types/i);
    expect(decision.sources).toMatch(/No contact research available/i);
    expect(
      personalizationSourceSummary({
        companyResearch: stoneEagleResearch,
        contactResearch: null,
        companyResearchUsable: true,
        contactResearchUsable: false,
      }),
    ).toBe(decision.sources);
  });
});

describe("materially different emails from company research", () => {
  it("same CRO persona, StoneEagle vs PLG company research, differ on selling-motion tokens", () => {
    const stone = emailFromPrompt(
      contextFixture({
        contact: {
          id: "c_stone",
          companyId: "company_stone",
          firstName: "Alex",
          lastName: "Rivera",
          email: "alex@stone.test",
          title: "Chief Revenue Officer",
          company: "StoneEagle",
          industry: null,
          location: null,
        },
        companyResearch: stoneEagleResearch,
      }),
    );
    const plg = emailFromPrompt(
      contextFixture({
        contact: {
          id: "c_plg",
          companyId: "company_plg",
          firstName: "Alex",
          lastName: "Rivera",
          email: "alex@northwind.test",
          title: "Chief Revenue Officer",
          company: "Northwind",
          industry: null,
          location: null,
        },
        companyResearch: plgResearch,
      }),
    );

    expect(stone.body).toMatch(/multi-rooftop dealer groups|auto dealer groups/i);
    expect(stone.body).not.toMatch(/usage-based expansion seats|product-led growth teams/i);
    expect(plg.body).toMatch(/usage-based expansion seats|product-led growth teams/i);
    expect(plg.body).not.toMatch(/multi-rooftop dealer groups|auto dealer groups/i);

    const jaccard = tokenJaccard(
      distinctiveContentTokens(stone.body, SHARED_EXCLUDE),
      distinctiveContentTokens(plg.body, SHARED_EXCLUDE),
    );
    expect(jaccard).toBeLessThan(0.25);
  });

  it("same StoneEagle company, CRO vs RevOps angle, differ on persona-derived tokens", () => {
    const cro = emailFromPrompt(
      contextFixture({
        persona: {
          id: "persona_cro",
          name: CRO_PERSONA_DRAFT_V2_FIXTURE.name,
          painPoints: CRO_PERSONA_DRAFT_V2_FIXTURE.painPoints,
          desiredOutcomes: CRO_PERSONA_DRAFT_V2_FIXTURE.desiredOutcomesFromSolution,
          messagingNotes: [],
          messaging: {
            positioning: CRO_PERSONA_DRAFT_V2_FIXTURE.personaSpecificPositioning,
            proofPoints: CRO_PERSONA_DRAFT_V2_FIXTURE.proofPointsToEmphasize,
            objections: CRO_PERSONA_DRAFT_V2_FIXTURE.likelyObjections,
          },
          profile: {
            terminology: CRO_PERSONA_DRAFT_V2_FIXTURE.terminology,
            organizationalPressures: [],
            buyingRole: [],
            decisionInfluence: [],
          },
        },
        companyResearch: stoneEagleResearch,
      }),
    );
    const revops = emailFromPrompt(
      contextFixture({
        persona: {
          id: "persona_revops",
          name: REVOPS_PERSONA_DRAFT_FIXTURE.name,
          painPoints: REVOPS_PERSONA_DRAFT_FIXTURE.painPoints,
          desiredOutcomes: REVOPS_PERSONA_DRAFT_FIXTURE.desiredOutcomesFromSolution,
          messagingNotes: [],
          messaging: {
            positioning: REVOPS_PERSONA_DRAFT_FIXTURE.personaSpecificPositioning,
            proofPoints: REVOPS_PERSONA_DRAFT_FIXTURE.proofPointsToEmphasize,
            objections: REVOPS_PERSONA_DRAFT_FIXTURE.likelyObjections,
          },
          profile: {
            terminology: REVOPS_PERSONA_DRAFT_FIXTURE.terminology,
            organizationalPressures: [],
            buyingRole: [],
            decisionInfluence: [],
          },
        },
        companyResearch: stoneEagleResearch,
      }),
    );

    expect(cro.body).toMatch(
      /continuously updated view of which commits are supported/i,
    );
    expect(revops.body).toMatch(
      /Help RevOps establish a repeatable, evidence-backed forecast process/i,
    );
    expect(cro.body).not.toMatch(/Help RevOps establish a repeatable/i);
    expect(revops.body).not.toMatch(
      /continuously updated view of which commits are supported/i,
    );
  });

  it("same contact with vs without company research differs on company-derived specifics", () => {
    const withResearch = emailFromPrompt(
      contextFixture({ companyResearch: stoneEagleResearch }),
    );
    const withoutResearch = emailFromPrompt(contextFixture());
    expect(withResearch.body).toMatch(/multi-rooftop dealer groups|auto dealer groups/i);
    expect(withoutResearch.body).not.toMatch(
      /multi-rooftop dealer groups|auto dealer groups|franchise dealerships/i,
    );
    const shared = tokenJaccard(
      distinctiveContentTokens(withResearch.body, SHARED_EXCLUDE),
      distinctiveContentTokens(withoutResearch.body, SHARED_EXCLUDE),
    );
    expect(shared).toBeLessThan(0.4);
  });
});

describe("generation constraints", () => {
  it("does not put company facts, risk signals, or fabricated role hooks in the prompt when they are absent", () => {
    const messages = promptMessages(contextFixture());
    const user = messages[1]!.content;
    expect(user).not.toContain("riskSignals");
    expect(user).not.toContain("professionalSignals");
    expect(user).not.toContain("negativeRoleSignals");
    expect(user).toContain('"freshRoleResearch": null');
    expect(user).toContain('"tier": "THIN"');
    expect(messages[0]!.content).toMatch(/Never fabricate a personal hook/i);
  });

  it("never includes CompanyResearch.riskSignals in the company research payload", () => {
    const messages = promptMessages(
      contextFixture({ companyResearch: stoneEagleResearch }),
    );
    expect(messages[1]!.content).not.toContain("riskSignals");
    expect(messages[1]!.content).toContain("auto dealer groups");
  });

  it("keeps excludedCopySignals out of the generation prompt", () => {
    const messages = promptMessages(
      contextFixture({
        excludedCopySignals: {
          riskSignals: ["secret churn marker"],
          professionalSignals: ["secret hiring signal"],
          negativeRoleSignals: ["secret role risk"],
        },
      }),
    );
    const user = messages[1]!.content;
    expect(user).not.toContain("secret churn marker");
    expect(user).not.toContain("secret hiring signal");
    expect(user).not.toContain("secret role risk");
    expect(user).not.toContain("excludedCopySignals");
  });

  it("draft screen surfaces persona confirmation and personalization tier", () => {
    const workspace = readFileSync(
      "src/components/EmailSequenceWorkspace.tsx",
      "utf8",
    );
    expect(workspace).toContain("needsPersonaConfirmation");
    expect(workspace).toContain("personalizationTier");
    expect(workspace).toContain("persona-confirmation-prompt");
    expect(workspace).toContain("data-testid=\"personalization-tier\"");
    expect(workspace).toContain("data-testid=\"resolved-persona\"");
    expect(workspace).toContain("data-testid=\"email-length\"");
    expect(workspace).toContain("Length for this email");
    expect(workspace).toContain("personalizationSources");
    expect(workspace).toContain("regenerateEmailDraftAction");
    expect(workspace).toContain("selectedLength");
    const stage = readFileSync("src/components/EmailDraftsStage.tsx", "utf8");
    expect(stage).toContain("Compare drafts");
    expect(stage).toContain("Needs persona");
    expect(stage).toContain("initialCampaignContactId");
    expect(stage).toContain("Open in Write");
    expect(stage).toContain("onOpenInWrite");
    expect(stage).toContain("data-testid=\"campaign-draft-compare\"");
    expect(stage).toContain("${vocab.campaign.Singular} ${vocab.contact.plural}");
    expect(stage).toContain('data-testid="email-contacts-filter"');
    expect(stage).toContain("Ready to send");

    const duePanel = readFileSync("src/components/DueContactsPanel.tsx", "utf8");
    expect(duePanel).toContain("Review draft");
    expect(duePanel).toContain("?stage=emails&contact=");
    expect(duePanel).not.toMatch(
      /Review draft[\s\S]{0,200}href=\{`\/campaigns\/\$\{campaign\.campaignId\}`\}/,
    );
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    expect(page).toContain("campaign.contacts");
    expect(page).not.toContain("qualifiedCampaignContacts");
    expect(page).toContain(
      "Generate, edit, and send drafts for every ${vocab.contact.singular}",
    );
    const context = readFileSync("src/lib/email-generation/context.ts", "utf8");
    expect(context).toContain("storedPersonaId: row.personaId");
    expect(context).toContain("chosenPersonaId");
    expect(context).toContain("needsPersonaConfirmation");
  });
});
