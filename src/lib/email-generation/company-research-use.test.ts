import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  openingLeansOnTitleVocabulary,
  openingRestatesCompanyDescription,
  referencesInferredSellingMotion,
  titleResearchOverlapTokens,
  type EmailCompanyResearch,
} from "@/lib/email-generation/company-research-use";
import { buildEmailPrompt, emailPromptOptionsForContext } from "@/lib/email-generation/prompt";
import {
  collectMotionSpecificCandidates,
  type RequiredMotionSpecific,
} from "@/lib/email-generation/motion-specifics";

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

function promptMessages(context: EmailGenerationContext) {
  const specifics = testSpecificsFromResearch(context.companyResearch);
  return buildEmailPrompt(
    context,
    emailPromptOptionsForContext(context, specifics),
  );
}

function baseContext(
  overrides: Omit<Partial<EmailGenerationContext>, "product" | "persona"> & {
    product?: Partial<EmailGenerationContext["product"]>;
    persona?: Partial<EmailGenerationContext["persona"]>;
  } = {},
): EmailGenerationContext {
  const base: EmailGenerationContext = {
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
      title: "Leader",
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
      id: "persona_1",
      name: "Operator",
      painPoints: ["Decisions rest on incomplete status updates"],
      desiredOutcomes: ["A shared picture of what is true"],
      messagingNotes: [],
      messaging: {
        positioning: [],
        proofPoints: [],
        objections: [],
      },
      profile: {
        terminology: [],
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
      source: "chosen",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: null,
      decisionReason: null,
    },
    voiceSamples: [],
    sequence: [],
  };
  return {
    ...base,
    ...overrides,
    product: { ...base.product, ...overrides.product },
    persona: { ...base.persona, ...overrides.persona },
  };
}

/** Real StoneEagle research shape used in scoring cascade tests and the user's example. */
const stoneEagleResearch: EmailCompanyResearch = {
  companySummary:
    "StoneEagle provides F&I and dealership software to automotive retail groups.",
  whatTheySell:
    "B2B automotive-dealership software and data intelligence.",
  customerTypes: ["auto dealer groups", "franchise dealerships"],
  primaryMarkets: ["US automotive retail"],
  businessModel:
    "B2B software licensed to multi-rooftop dealer groups that sell through retail networks",
  companySizeContext:
    "LinkedIn lists StoneEagle as privately held, with headquarters in Dallas and 201–500 employees.",
  confidence: "HIGH",
};

const stoneEagleProductProblems = [
  "Commit stages in the system of record diverge from actual buying evidence",
  "Unsupported commits stay hidden until late in the cycle",
];

const stoneEagleBadEmail =
  "Hi Alex, I see StoneEagle sells F&I software to dealerships.\n\nWould a working session help?";

const stoneEagleGoodEmail =
  "Hi Alex, dealer-group deals involve multiple stakeholders across F&I and fixed operations, cycles run long, and qualification varies by rep, which is where recorded commit stages and actual buying evidence diverge.\n\nWould it be useful to compare one recent deal against what the system showed?";

const securityResearch: EmailCompanyResearch = {
  companySummary:
    "Northline integrates access control, cameras, and visitor management for campuses.",
  whatTheySell: "Physical security systems for hospitals and universities.",
  customerTypes: [
    "facilities leaders at multi-building campuses",
    "hospital plant operations",
  ],
  primaryMarkets: ["US healthcare and higher education campuses"],
  businessModel:
    "Project-based integration sold through facilities and safety committees",
  companySizeContext: null,
  confidence: "HIGH",
};

const securityBadEmail =
  "Hi Dana, I see Northline sells physical security systems to hospitals.\n\nOpen to a walkthrough?";

const securityGoodEmail =
  "Hi Dana, multi-building campuses usually mean several vendors, a facilities committee, and a long approval cycle, which is where after-hours door events get lost between teams.\n\nWould a walkthrough of one building's overnight exceptions be useful?";

const staffingResearch: EmailCompanyResearch = {
  companySummary:
    "Harbor Staffing places clinicians into health-system roles.",
  whatTheySell: "Healthcare staffing and credentialing support.",
  customerTypes: ["health-system HR teams", "nursing directors"],
  primaryMarkets: ["US hospital systems"],
  businessModel:
    "Contract placements that move through hiring managers and a credentialing queue",
  companySizeContext: null,
  confidence: "HIGH",
};

const staffingBadEmail =
  "Hi Priya, I see Harbor Staffing is a staffing firm that places nurses.\n\nWant to talk?";

const staffingGoodEmail =
  "Hi Priya, health-system hiring often runs through several managers and a credentialing queue, so a strong candidate can stall before an offer, which is the delay your team is hired to prevent.\n\nWould it help to look at one stalled requisition together?";

function assertInferenceBehavior(input: {
  body: string;
  research: EmailCompanyResearch;
  motionCue: RegExp;
  contactTitle?: string | null;
}): void {
  expect(openingRestatesCompanyDescription(input.body, input.research)).toBe(
    false,
  );
  expect(
    referencesInferredSellingMotion(
      input.body,
      input.research,
      input.contactTitle,
    ),
  ).toBe(true);
  expect(input.body).toMatch(input.motionCue);
}

describe("company research use in email prompts", () => {
  it("production prompt and helpers contain no fitted product vocabulary", () => {
    const files = [
      "src/lib/email-generation/prompt.ts",
      "src/lib/email-generation/company-research-use.ts",
      "src/lib/email-generation/context.ts",
      "src/lib/email-generation/personalization.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /ForecastWorks|StoneEagle|dealership|F&I|\bCRM\b|\bpipeline\b|\bforecast\b|\bcommit\b/i,
      );
    }
  });

  it("builds a runtime reasoning sketch from this product's problems and research", () => {
    const messages = promptMessages(
      baseContext({
        contact: {
          id: "c1",
          companyId: "company_stone",
          firstName: "Alex",
          lastName: "Rivera",
          email: "alex@example.test",
          title: "CRO",
          company: "StoneEagle",
          industry: "Software",
          location: "Dallas",
        },
        companyResearch: stoneEagleResearch,
        product: {
          name: "Sales coaching assistant",
          description: "Helps revenue leaders inspect deals with evidence",
          valueProposition: "Fewer unsupported commits",
          problemsSolved: stoneEagleProductProblems,
        },
        persona: {
          name: "Revenue leader",
          painPoints: [
            "Late-cycle surprises when recorded stages do not match reality",
          ],
        },
      }),
    );
    const system = messages[0]?.content ?? "";
    const user = messages[1]?.content ?? "";

    expect(system).toContain("Do NOT restate what the company does.");
    expect(system).toContain(
      "company research → infer selling motion → identify the problem this product addresses in that motion → connect",
    );
    expect(system).toContain(
      "Do not open by leaning on vocabulary drawn from the contact's title",
    );
    expect(system).not.toMatch(/dealership|F&I|\bCRM\b|\bforecast\b/i);
    expect(user).toContain("auto dealer groups");
    expect(user).toContain(stoneEagleProductProblems[0]!);
    expect(user).toContain("reasonTowardPersonaPains");
    expect(user).toContain("doNotOpenWith");
  });
});

describe("generated email uses research as inference", () => {
  it("StoneEagle: does not open by describing what the company does, and does reference inferred selling motion", () => {
    expect(
      openingRestatesCompanyDescription(
        stoneEagleBadEmail,
        stoneEagleResearch,
      ),
    ).toBe(true);
    expect(
      referencesInferredSellingMotion(stoneEagleBadEmail, stoneEagleResearch),
    ).toBe(false);

    assertInferenceBehavior({
      body: stoneEagleGoodEmail,
      research: stoneEagleResearch,
      motionCue: /dealer-group deals|multiple stakeholders|cycles run long/i,
    });
  });

  it("physical-security integrator: same inference behavior, unrelated vocabulary", () => {
    expect(
      openingRestatesCompanyDescription(securityBadEmail, securityResearch),
    ).toBe(true);
    assertInferenceBehavior({
      body: securityGoodEmail,
      research: securityResearch,
      motionCue: /multi-building campuses|facilities committee|approval cycle/i,
    });
  });

  it("staffing firm: same inference behavior, unrelated vocabulary", () => {
    expect(
      openingRestatesCompanyDescription(staffingBadEmail, staffingResearch),
    ).toBe(true);
    assertInferenceBehavior({
      body: staffingGoodEmail,
      research: staffingResearch,
      motionCue: /health-system hiring|credentialing queue|stalled/i,
    });
  });

  it("the two unrelated-product emails share no domain vocabulary", () => {
    const security = securityGoodEmail.toLowerCase();
    const staffing = staffingGoodEmail.toLowerCase();
    for (const term of [
      "campus",
      "door",
      "facilities",
      "overnight",
      "vendor",
    ]) {
      expect(staffing).not.toContain(term);
    }
    for (const term of [
      "nurse",
      "requisition",
      "credentialing",
      "candidate",
      "hiring",
    ]) {
      expect(security).not.toContain(term);
    }
    expect(security).not.toMatch(/staffing|f&i|dealership|forecast/i);
    expect(staffing).not.toMatch(/access control|dealership|f&i|forecast/i);
  });

  it("prompt construction for the two unrelated products stays generic", () => {
    const securityPrompt = promptMessages(
      baseContext({
        companyResearch: securityResearch,
        product: {
          name: "After-hours exception log",
          problemsSolved: ["Missed after-hours door events"],
        },
        persona: {
          name: "Facilities leader",
          painPoints: ["Overnight incidents without a clear trail"],
        },
      }),
    );
    const staffingPrompt = promptMessages(
      baseContext({
        companyResearch: staffingResearch,
        product: {
          name: "Requisition tracker",
          problemsSolved: ["Qualified candidates stall in email threads"],
        },
        persona: {
          name: "HR leader",
          painPoints: ["Hiring managers lose track of who is actually in play"],
        },
      }),
    );

    expect(securityPrompt[0]?.content).toBe(staffingPrompt[0]?.content);
    expect(securityPrompt[1]?.content).toContain("multi-building campuses");
    expect(securityPrompt[1]?.content).toContain(
      "Missed after-hours door events",
    );
    expect(staffingPrompt[1]?.content).toContain("health-system HR teams");
    expect(staffingPrompt[1]?.content).toContain(
      "Qualified candidates stall in email threads",
    );
    expect(securityPrompt[0]?.content).not.toMatch(
      /forecast|commit|pipeline|CRM|dealership|F&I/i,
    );
  });
});

describe("anti-title overlap (B1)", () => {
  it("tokenizes title against research at runtime with no hard-coded domain terms", () => {
    const telecomTitle = "VP of Carrier Network Operations";
    const telecomResearch: EmailCompanyResearch = {
      companySummary: "Provides backhaul monitoring for regional carriers.",
      whatTheySell: "Network operations tooling for regional carriers.",
      customerTypes: ["carrier network operations teams", "tower owners"],
      primaryMarkets: ["US regional wireless"],
      businessModel: "SaaS sold into carrier ops and tower portfolios",
      companySizeContext: null,
      confidence: "HIGH",
    };
    const staffingTitle = "Director of Clinical Staffing";
    const overlapTelecom = titleResearchOverlapTokens(
      telecomTitle,
      telecomResearch,
    );
    const overlapStaffing = titleResearchOverlapTokens(
      staffingTitle,
      staffingResearch,
    );

    expect([...overlapTelecom].sort()).toEqual([
      "carrier",
      "network",
      "operations",
    ]);
    expect([...overlapStaffing].sort()).toEqual(["staffing"]);
    expect([...overlapTelecom]).not.toEqual(
      expect.arrayContaining(["staffing", "clinical", "nurse"]),
    );
    expect([...overlapStaffing]).not.toEqual(
      expect.arrayContaining(["carrier", "network", "tower"]),
    );
  });

  it("title∩customerTypes alone does not pass referencesInferredSellingMotion (telecom-like)", () => {
    const research: EmailCompanyResearch = {
      companySummary: "Provides backhaul monitoring for regional carriers.",
      whatTheySell: "Network operations tooling for regional carriers.",
      customerTypes: ["carrier network operations teams", "tower owners"],
      primaryMarkets: ["US regional wireless"],
      businessModel: "SaaS sold into carrier ops and tower portfolios",
      companySizeContext: null,
      confidence: "HIGH",
    };
    const title = "VP of Carrier Network Operations";
    const titleOnlyOpener =
      "Hi Jordan, as a carrier network operations leader your teams juggle a lot.\n\nOpen to a look?";
    const motionOpener =
      "Hi Jordan, regional wireless deals often run through tower portfolios and multi-site ops reviews, which is where overnight backhaul exceptions get lost between NOC shifts.\n\nWould a walkthrough of one overnight exception trail help?";

    expect(openingLeansOnTitleVocabulary(titleOnlyOpener, title, research)).toBe(
      true,
    );
    expect(
      referencesInferredSellingMotion(titleOnlyOpener, research, title),
    ).toBe(false);
    expect(
      referencesInferredSellingMotion(motionOpener, research, title),
    ).toBe(true);
  });

  it("title∩customerTypes alone does not pass referencesInferredSellingMotion (staffing/security)", () => {
    const title = "Hospital Facilities Director";
    const titleOnlyOpener =
      "Hi Dana, as a hospital facilities director you own a complex campus.\n\nOpen to a walkthrough?";
    const motionOpener = securityGoodEmail;

    expect(
      titleResearchOverlapTokens(title, securityResearch).has("hospital"),
    ).toBe(true);
    expect(
      titleResearchOverlapTokens(title, securityResearch).has("facilities"),
    ).toBe(true);
    expect(openingLeansOnTitleVocabulary(titleOnlyOpener, title, securityResearch)).toBe(
      true,
    );
    expect(
      referencesInferredSellingMotion(titleOnlyOpener, securityResearch, title),
    ).toBe(false);
    expect(
      referencesInferredSellingMotion(motionOpener, securityResearch, title),
    ).toBe(true);
  });
});

describe("opening painPoints lead (persona convergence)", () => {
  it("puts painPoints ahead of messagingNotes in openingProblemFraming", () => {
    const messages = promptMessages(
      baseContext({
        persona: {
          name: "Operator",
          painPoints: ["Decisions rest on incomplete status updates"],
          messagingNotes: [
            "Lead with the cost of delayed handoffs between night and day shifts.",
          ],
        },
        product: {
          name: "ShiftBridge",
          description: "Automates shift handoff checklists",
          valueProposition: "Fewer missed overnight exceptions",
        },
      }),
    );
    const system = messages[0]?.content ?? "";
    const user = messages[1]?.content ?? "";

    expect(system).toContain("openingProblemFraming");
    expect(system).toContain("painPoints first");
    expect(user).toContain('"openingProblemFraming"');
    expect(user).toContain("Decisions rest on incomplete status updates");
    expect(user).toMatch(
      /openingProblemFraming[\s\S]*painPoints[\s\S]*messagingNotes/,
    );
    expect(user).toContain(
      "Use messagingNotes only for tone, emphasis, and what to avoid",
    );
  });
});
