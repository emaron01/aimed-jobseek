/**
 * Live persona-convergence drafts from fixture contexts (no production DB required).
 * npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/validate-persona-convergence-drafts.ts
 */
import Module from "node:module";
import { CRO_PERSONA_DRAFT_V2_FIXTURE } from "../../src/lib/persona-research/fixtures/cro-setup-run-draft-v2";
import type { EmailGenerationContext } from "../../src/lib/email-generation/context";
import type { EmailCompanyResearch } from "../../src/lib/email-generation/company-research-use";

type ModuleLoad = (
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
) => unknown;
const patchedModule = Module as typeof Module & { _load: ModuleLoad };
const moduleLoad = patchedModule._load.bind(patchedModule);
patchedModule._load = function load(
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
): unknown {
  if (request === "server-only") return {};
  return moduleLoad(request, parent, isMain);
};

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

const softWritersResearch: EmailCompanyResearch = {
  companySummary:
    "SoftWriters supplies software and services to long-term care pharmacies.",
  whatTheySell:
    "FrameworkLTC pharmacy management; eRx remote dispensing workflows; clinical consulting; billing services",
  customerTypes: [
    "Long-term care pharmacy operators",
    "Institutional pharmacies serving distributed care facilities",
  ],
  primaryMarkets: ["United States long-term care pharmacy market"],
  businessModel: "B2B software and services for pharmacy operators",
  companySizeContext: "201–500 employees",
  confidence: "HIGH",
};

const salesForecasterProduct = {
  id: "product_sf",
  name: "SalesForecaster",
  description: "Forecast and pipeline intelligence for revenue teams",
  valueProposition: "Evidence-backed commits and earlier risk visibility",
  evidence: [],
  problemsSolved: [
    "Forecast commits rest on seller optimism instead of deal evidence",
    "Pipeline risk stays hidden until late in the quarter",
  ],
  messaging: {
    primaryPositioning: [],
    coreValueThemes: [],
    strongestDifferentiators: [],
    proofPoints: [],
    supportedClaims: ["Improves forecast inspection workflows"],
    claimsNotToMake: ["Guaranteed forecast accuracy"],
    terminologyToUse: [],
    terminologyToAvoid: [],
  },
};

const nomProduct = {
  id: "product_nom",
  name: "OpenText NOM",
  description: "Network operations and observability platform",
  valueProposition: "End-to-end visibility across distributed sites",
  evidence: [],
  problemsSolved: [
    "Limited visibility into remote operational sites",
    "Network policy drift and compliance gaps between locations",
  ],
  messaging: {
    primaryPositioning: [],
    coreValueThemes: [],
    strongestDifferentiators: [],
    proofPoints: [],
    supportedClaims: ["Centralizes operational telemetry across sites"],
    claimsNotToMake: ["Guaranteed uptime"],
    terminologyToUse: [],
    terminologyToAvoid: [],
  },
};

function personaFromDraft(
  id: string,
  draft: typeof CRO_PERSONA_DRAFT_V2_FIXTURE,
) {
  return {
    id,
    name: draft.name,
    painPoints: draft.painPoints,
    desiredOutcomes: draft.desiredOutcomesFromSolution,
    messagingNotes: draft.messagingNotes ?? [],
    messaging: {
      positioning: draft.personaSpecificPositioning,
      proofPoints: draft.proofPointsToEmphasize,
      objections: draft.likelyObjections,
    },
    profile: {
      terminology: draft.terminology,
      organizationalPressures: draft.organizationalPressures ?? [],
      buyingRole: [],
      decisionInfluence: [],
    },
  };
}

function baseContext(
  overrides: Partial<EmailGenerationContext>,
): EmailGenerationContext {
  return {
    organizationId: "org_validation",
    userId: "user_validation",
    campaignContact: {
      id: "cc_validation",
      campaignId: "campaign_validation",
      contactId: "contact_validation",
    },
    campaign: {
      id: "campaign_validation",
      name: "Validation",
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
      id: "contact_validation",
      companyId: "company_validation",
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex@example.test",
      title: "Chief Revenue Officer",
      company: "StoneEagle",
      industry: null,
      location: null,
    },
    product: salesForecasterProduct,
    persona: personaFromDraft("persona_cro", CRO_PERSONA_DRAFT_V2_FIXTURE),
    icp: {
      id: "icp_validation",
      name: "Target accounts",
      definition: "Organizations matching the approved ICP",
      description: null,
    },
    personaResolution: {
      source: "override",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: null,
      decisionReason: null,
    },
    excludedCopySignals: {
      riskSignals: [],
      professionalSignals: [],
      negativeRoleSignals: [],
    },
    companyResearchUpdatedAt: null,
    voiceSamples: [],
    sequence: [],
    companyResearch: stoneEagleResearch,
    contactResearch: null,
    ...overrides,
  };
}

const VP_SALES_PERSONA = {
  id: "persona_vp_sales",
  name: "VP of Sales",
  painPoints: [
    "Managers spend forecast calls collecting updates instead of coaching reps on live deals",
    "Rep-level pipeline hygiene is inconsistent across regions",
    "Field leaders lack a shared view of which opportunities are truly commit-worthy",
  ],
  desiredOutcomes: [
    "More coaching time in forecast meetings",
    "Consistent qualification standards across the sales organization",
  ],
  messagingNotes: ["Lead with manager time lost to status collection, not executive reporting"],
  messaging: {
    positioning: ["Help front-line sales leaders coach with evidence"],
    proofPoints: ["Deal-level inspection without adding rep admin"],
    objections: ["Another dashboard reps will ignore"],
  },
  profile: {
    terminology: ["pipeline", "commit", "field leaders"],
    organizationalPressures: [],
    buyingRole: [],
    decisionInfluence: [],
  },
};

const VP_INFRA_PERSONA = {
  id: "persona_vp_infra",
  name: "VP Infrastructure",
  painPoints: [
    "Limited visibility into what is happening at remote facilities",
    "Inconsistent network posture between sites",
  ],
  desiredOutcomes: [
    "Centralized operational visibility without dispatching engineers everywhere",
    "Uniform compliance enforcement across locations",
  ],
  messagingNotes: [],
  messaging: {
    positioning: ["Operations visibility across distributed sites"],
    proofPoints: ["Site-level telemetry without truck rolls"],
    objections: ["Another monitoring silo"],
  },
  profile: {
    terminology: ["sites", "network posture", "facilities"],
    organizationalPressures: [],
    buyingRole: [],
    decisionInfluence: [],
  },
};

const PHARMACY_OPS_PERSONA = {
  id: "persona_pharmacy_ops",
  name: "Director of Pharmacy Operations",
  painPoints: [
    "Dispensing workflows vary by facility and are hard to standardize",
    "Clinical exceptions at one site do not surface to central operations quickly",
    "Billing and fulfillment handoffs break when sites use different processes",
  ],
  desiredOutcomes: [
    "Consistent dispensing workflows across facilities",
    "Earlier visibility into site-level exceptions",
  ],
  messagingNotes: ["Lead with workflow inconsistency across facilities, not network monitoring"],
  messaging: {
    positioning: ["Standardize pharmacy operations across distributed sites"],
    proofPoints: ["Fewer site-to-site process exceptions"],
    objections: ["Disrupting established site workflows"],
  },
  profile: {
    terminology: ["dispensing", "facilities", "LTC"],
    organizationalPressures: [],
    buyingRole: [],
    decisionInfluence: [],
  },
};

const TARGETS: Array<{
  label: string;
  context: EmailGenerationContext;
}> = [
  {
    label: "SalesForecaster · CRO · StoneEagle",
    context: baseContext({
      contact: {
        id: "c_cro",
        companyId: "company_stone",
        firstName: "Brent",
        lastName: "Lee",
        email: "brent@stone.test",
        title: "Chief Revenue Officer",
        company: "StoneEagle",
        industry: null,
        location: null,
      },
      persona: personaFromDraft("persona_cro", CRO_PERSONA_DRAFT_V2_FIXTURE),
      companyResearch: stoneEagleResearch,
    }),
  },
  {
    label: "SalesForecaster · VP of Sales · StoneEagle",
    context: baseContext({
      contact: {
        id: "c_vp",
        companyId: "company_stone",
        firstName: "Brent",
        lastName: "Lee",
        email: "brent@stone.test",
        title: "Vice President of Sales",
        company: "StoneEagle",
        industry: null,
        location: null,
      },
      persona: VP_SALES_PERSONA,
      companyResearch: stoneEagleResearch,
    }),
  },
  {
    label: "OpenText NOM · VP Infrastructure · SoftWriters",
    context: baseContext({
      product: nomProduct,
      contact: {
        id: "c_infra",
        companyId: "company_sw",
        firstName: "Jeff",
        lastName: "Nguyen",
        email: "jeff@softwriters.test",
        title: "VP Infrastructure",
        company: "SoftWriters",
        industry: null,
        location: null,
      },
      persona: VP_INFRA_PERSONA,
      companyResearch: softWritersResearch,
    }),
  },
  {
    label: "OpenText NOM · Director Pharmacy Ops · SoftWriters",
    context: baseContext({
      product: nomProduct,
      contact: {
        id: "c_pharm",
        companyId: "company_sw",
        firstName: "Jeff",
        lastName: "Nguyen",
        email: "jeff@softwriters.test",
        title: "Director of Pharmacy Operations",
        company: "SoftWriters",
        industry: null,
        location: null,
      },
      persona: PHARMACY_OPS_PERSONA,
      companyResearch: softWritersResearch,
    }),
  },
];

function mirrorEmailAiEnv() {
  const source =
    process.env.EMAIL_AI_API_KEY?.trim() ?
      "email"
    : process.env.RESEARCH_AI_API_KEY?.trim() ?
      "research"
    : process.env.SCORING_AI_API_KEY?.trim() ?
      "scoring"
    : null;
  if (!process.env.EMAIL_AI_PROVIDER && source) {
    const prefix =
      source === "email" ? "EMAIL_AI"
      : source === "research" ? "RESEARCH_AI"
      : "SCORING_AI";
    process.env.EMAIL_AI_PROVIDER = process.env[`${prefix}_PROVIDER`];
    process.env.EMAIL_AI_API_KEY = process.env[`${prefix}_API_KEY`];
    process.env.EMAIL_AI_MODEL_URL = process.env[`${prefix}_MODEL_URL`];
    process.env.EMAIL_AI_MODEL = process.env[`${prefix}_MODEL`];
  }
  if (!process.env.EMAIL_FACTS_AI_PROVIDER && process.env.EMAIL_AI_PROVIDER) {
    process.env.EMAIL_FACTS_AI_PROVIDER = process.env.EMAIL_AI_PROVIDER;
    process.env.EMAIL_FACTS_AI_API_KEY =
      process.env.EMAIL_FACTS_AI_API_KEY || process.env.EMAIL_AI_API_KEY;
    process.env.EMAIL_FACTS_AI_MODEL_URL =
      process.env.EMAIL_FACTS_AI_MODEL_URL || process.env.EMAIL_AI_MODEL_URL;
  }
  if (!process.env.EMAIL_FACTS_AI_MODEL?.trim() && process.env.EMAIL_AI_MODEL?.trim()) {
    process.env.EMAIL_FACTS_AI_MODEL = process.env.EMAIL_AI_MODEL;
  }
}

async function main() {
  mirrorEmailAiEnv();
  if (!process.env.EMAIL_AI_MODEL?.trim()) {
    throw new Error("EMAIL_AI_MODEL (or SCORING_AI_MODEL mirror) is required.");
  }

  const { prepareEmailGenerationMessages } = await import(
    "../../src/lib/email-generation/prepare-email-generation"
  );
  const { getEmailAiProvider, getEmailAiConfig } = await import("@/lib/ai");
  const { structuredOutputRequest } = await import(
    "@/lib/ai/structured-output-schemas"
  );
  const { removeEmDashes, sanitizeGeneratedEmailBody } = await import(
    "../../src/lib/email-generation/service"
  );

  const ai = getEmailAiProvider();
  getEmailAiConfig();

  for (const target of TARGETS) {
    const prepared = await prepareEmailGenerationMessages(target.context);
    const response = await ai.generateStructured({
      ...structuredOutputRequest("emailDraftGeneration"),
      messages: prepared.messages,
    });
    const subject = removeEmDashes(response.data.subject);
    const body = sanitizeGeneratedEmailBody(response.data.body);
    console.log("\n" + "=".repeat(72));
    console.log(target.label);
    console.log(`SUBJECT: ${subject}`);
    console.log("-".repeat(72));
    console.log(body);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
