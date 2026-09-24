/**
 * Live outreach samples through generateOutreachWithModel + validateOutreachContent.
 * ASSET_AI_* is required at call time. If those vars are absent, this script
 * copies PERSONA_AI_* into ASSET_AI_* for this process only so the ASSET_AI
 * loader is still the path used. It never writes .env.local.
 *
 *   npx dotenv -e .env.local -- tsx --conditions=react-server scripts/ad-hoc/outreach-live-samples.ts
 */
import Module from "node:module";
import { generateOutreachWithModel } from "../../src/lib/application-assets/ai";
import { validateOutreachContent } from "../../src/lib/application-assets/outreach";
import {
  composeOutreachText,
  type ApplicationAssetContent,
} from "../../src/lib/application-assets/contract";
import type { OutreachGenerationInput } from "../../src/lib/application-assets/outreach-types";
import { getAssetAiConfig, getAiConfigPublicSummary } from "../../src/lib/ai/config";
import { profileEvidenceItems } from "../../src/lib/consultation/assess";
import type { ReadyApplicationGenerationContext } from "../../src/lib/generation/context";
import {
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "../../src/lib/job-requirement/fixtures";
import { fixtureAlexChenProfile } from "../../src/lib/product-research/fixtures/alex-chen-profile";
import {
  applicationAssetConfig,
  outreachConfig,
  outreachGreeting,
} from "../../src/lib/product-config";

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

function mapPersonaAiToAssetAiIfNeeded(): string {
  const required = [
    "ASSET_AI_PROVIDER",
    "ASSET_AI_MODEL",
    "ASSET_AI_MODEL_URL",
    "ASSET_AI_API_KEY",
  ] as const;
  if (required.every((key) => process.env[key]?.trim())) {
    return "ASSET_AI_* from environment";
  }
  const persona = [
    "PERSONA_AI_PROVIDER",
    "PERSONA_AI_MODEL",
    "PERSONA_AI_MODEL_URL",
    "PERSONA_AI_API_KEY",
  ] as const;
  if (!persona.every((key) => process.env[key]?.trim())) {
    throw new Error(
      "Neither ASSET_AI_* nor PERSONA_AI_* is configured. Live samples cannot run.",
    );
  }
  process.env.ASSET_AI_PROVIDER = process.env.PERSONA_AI_PROVIDER;
  process.env.ASSET_AI_MODEL = process.env.PERSONA_AI_MODEL;
  process.env.ASSET_AI_MODEL_URL = process.env.PERSONA_AI_MODEL_URL;
  process.env.ASSET_AI_API_KEY = process.env.PERSONA_AI_API_KEY;
  if (process.env.PERSONA_AI_TIMEOUT_MS?.trim()) {
    process.env.ASSET_AI_TIMEOUT_MS = process.env.PERSONA_AI_TIMEOUT_MS;
  }
  if (process.env.PERSONA_AI_MAX_RETRIES?.trim()) {
    process.env.ASSET_AI_MAX_RETRIES = process.env.PERSONA_AI_MAX_RETRIES;
  }
  return "ASSET_AI_* mapped from PERSONA_AI_* for this process only";
}

const STATEMENT_ID = "stmt_invoice_rewrite";
const APPROVED_STATEMENT =
  "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.";

function sourcesFor(profile: ReturnType<typeof fixtureAlexChenProfile>) {
  const sources: ReadyApplicationGenerationContext["sources"] = [];
  for (const item of profileEvidenceItems(profile)) {
    if (item.kind !== "FACT" || !item.text.trim()) continue;
    sources.push({
      id: `profile:${item.id}`,
      text: item.text.trim(),
      category: "PROFILE_FACT",
      url: null,
    });
  }
  sources.push({
    id: `statement:${STATEMENT_ID}`,
    text: APPROVED_STATEMENT,
    category: "APPROVED_STATEMENT",
    url: null,
  });
  sources.push({
    id: "job:posting",
    text: NORMAL_JOB_POSTING,
    category: "JOB_REQUIREMENT",
    url: null,
  });
  sources.push({
    id: "application:status",
    text: "Applied through the employer portal on 2026-09-20.",
    category: "APPLICATION",
    url: null,
  });
  return sources;
}

function contextForPersona(input: {
  personaId: string;
  personaName: string;
  suggestionKey: string;
  likelyTitles: string[];
  whyThisPersonaMatters: string;
  appliedAt: Date | null;
}): ReadyApplicationGenerationContext {
  const profile = fixtureAlexChenProfile();
  const sources = sourcesFor(profile);
  sources.push({
    id: `persona:${input.personaId}`,
    text: `${input.personaName}. ${input.whyThisPersonaMatters}`,
    category: "PERSONA",
    url: null,
  });
  return {
    organizationId: "org_live_outreach",
    userId: "user_live_outreach",
    campaign: {
      id: "campaign_live_outreach",
      name: "Acme Robotics Senior Product Engineer",
      ownerUserId: "user_live_outreach",
      applicationGuidance:
        "Keep the proof point on production billing ownership. Do not invent robotics experience.",
      appliedAt: input.appliedAt,
    },
    profile,
    requirement: {
      id: "req_live_outreach",
      title: NORMAL_JOB_MODEL.title,
      companyName: NORMAL_JOB_MODEL.companyName,
      location: NORMAL_JOB_MODEL.location,
      workArrangement: NORMAL_JOB_MODEL.workArrangement,
      seniority: NORMAL_JOB_MODEL.seniority,
      reportingLine: NORMAL_JOB_MODEL.reportingLine,
      compensationRange: NORMAL_JOB_MODEL.compensationRange,
      responsibilities: [...NORMAL_JOB_MODEL.responsibilities],
      requiredItems: [...NORMAL_JOB_MODEL.requiredItems],
      preferredItems: [...NORMAL_JOB_MODEL.preferredItems],
      scorecard: NORMAL_JOB_MODEL.scorecard,
      rawText: NORMAL_JOB_POSTING,
    },
    companyResearch: {
      id: "research_live",
      companySummary:
        "Acme Robotics builds warehouse robots used by fulfillment operators.",
      whatTheySell: "Warehouse robots and motion-planning software.",
      customerTypes: ["fulfillment operators"],
      primaryMarkets: ["US logistics"],
      businessModel: "B2B hardware and software for warehouse automation",
      companySizeContext: "Growing robotics company in Austin.",
      hiringSignals: ["Hiring a Senior Product Engineer for motion planning"],
      riskSignals: [],
      researchSources: [],
      updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    },
    persona: {
      id: input.personaId,
      name: input.personaName,
      suggestionKey: input.suggestionKey,
      likelyTitles: input.likelyTitles,
      profileJson: {
        whyThisPersonaMatters: input.whyThisPersonaMatters,
      },
    },
    hiringManagerPersonaId: "persona_hiring_manager",
    hiringManagerContactName: null,
    assessments: [],
    approvedStatements: [
      {
        id: STATEMENT_ID,
        kind: "PROOF",
        content: APPROVED_STATEMENT,
        turnId: "turn_proof",
      },
    ],
    stories: [],
    voiceSamples: [
      {
        id: "voice_1",
        label: "Written sample",
        sampleText:
          "I write the way I work: short, specific, and about what shipped. I would rather name one result than stack adjectives.",
        createdAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    ],
    seekerAnswers: [
      {
        id: "seeker_1",
        text: "When billing broke, I stayed with the rewrite instead of handing it off. I care about systems that stay up after they ship.",
      },
    ],
    sources,
  };
}

const HIRING_MANAGER = {
  personaId: "persona_hiring_manager",
  personaName: "Hiring Manager",
  suggestionKey: "hiring_manager",
  likelyTitles: ["Director of Engineering", "Engineering Manager"],
  whyThisPersonaMatters:
    "This role decides whether the Senior Product Engineer can own motion-planning reliability.",
};

const INDIRECT = {
  personaId: "persona_robotics_peer",
  personaName: "Robotics Engineering Partner",
  suggestionKey: "robotics_engineering_partner",
  likelyTitles: ["Robotics Engineer", "Staff Robotics Engineer"],
  whyThisPersonaMatters:
    "The posting asks the hire to review designs with the robotics team, so this partner will feel the motion-planning work every week.",
};

const RECRUITER = {
  personaId: "persona_recruiter",
  personaName: "Recruiter",
  suggestionKey: "recruiter",
  likelyTitles: ["Technical Recruiter", "Recruiter"],
  whyThisPersonaMatters:
    "Priya Shah is named in the posting as Technical Recruiter and is the stated coordinator for this search.",
};

async function generateValidated(
  input: OutreachGenerationInput,
): Promise<{
  content: ApplicationAssetContent | null;
  attempts: number;
  violations: string[];
  error: string | null;
}> {
  let feedback: string[] = [];
  const maxAttempts =
    applicationAssetConfig.generation.qualityRegenerationAttempts +
    outreachConfig.generation.limitRegenerationAttempts;
  let lastContent: ApplicationAssetContent | null = null;
  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const generated = await generateOutreachWithModel({
      ...input,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      feedback = [generated.message];
      if (attempt === maxAttempts) {
        return {
          content: lastContent,
          attempts: attempt + 1,
          violations: feedback,
          error: generated.message,
        };
      }
      continue;
    }
    lastContent = generated.data;
    const violations = await validateOutreachContent({
      content: generated.data,
      context: input.context,
      greeting: input.greeting,
      signerName: input.signerName,
      confirmedHiringManagerRole: input.confirmedHiringManagerRole,
      purpose: input.purpose,
      includeRedirect: input.includeRedirect,
      priorMessages: input.priorMessage ? [input.priorMessage] : [],
    });
    if (violations.length === 0) {
      return {
        content: generated.data,
        attempts: attempt + 1,
        violations: [],
        error: null,
      };
    }
    feedback = violations;
    if (attempt === maxAttempts) {
      return {
        content: generated.data,
        attempts: attempt + 1,
        violations,
        error: null,
      };
    }
  }
  return {
    content: lastContent,
    attempts: maxAttempts + 1,
    violations: feedback,
    error: "Outreach generation exited without a result.",
  };
}

function printSample(
  title: string,
  result: {
    content: ApplicationAssetContent | null;
    attempts: number;
    violations: string[];
    error: string | null;
  },
) {
  console.log(`\n===== ${title} =====`);
  console.log(`attempts=${result.attempts}`);
  if (result.error) console.log(`error=${result.error}`);
  console.log(
    `violations=${result.violations.length ? result.violations.join(" | ") : "none"}`,
  );
  if (!result.content) {
    console.log("(no model content)");
    return;
  }
  const composed = composeOutreachText(result.content);
  if (composed.subject) console.log(`SUBJECT: ${composed.subject}`);
  console.log(composed.body);
  console.log(`chars=${composed.body.length}`);
}

async function main() {
  const credentialSource = mapPersonaAiToAssetAiIfNeeded();
  const summary = getAiConfigPublicSummary(getAssetAiConfig());
  console.log(
    JSON.stringify({
      credentialSource,
      role: summary.role,
      provider: summary.provider,
      model: summary.model,
      modelUrlIdentifier: summary.modelUrlIdentifier,
      temperature: summary.temperature,
    }),
  );

  const appliedAt = new Date("2026-09-20T12:00:00.000Z");
  const hmContext = contextForPersona({ ...HIRING_MANAGER, appliedAt });
  const indirectContext = contextForPersona({ ...INDIRECT, appliedAt });
  const recruiterContext = contextForPersona({ ...RECRUITER, appliedAt });
  const signerName = hmContext.profile.identity.name?.text ?? "Alex Chen";

  const only = (process.argv[2] ?? "").trim();
  const run = (name: string) => !only || only === name;

  if (run("note")) {
    const connectionNote = await generateValidated({
      context: hmContext,
      type: "LINKEDIN_CONNECTION_NOTE",
      greeting: outreachGreeting({ channel: "linkedin", firstName: null }),
      signerName,
      confirmedHiringManagerRole: false,
      includeRedirect: true,
      purpose: "PROACTIVE",
      emailLength: null,
      priorMessage: null,
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    printSample("Connection note to Hiring Manager, no contact name", connectionNote);
  }

  if (run("inmail")) {
    const inmail = await generateValidated({
      context: indirectContext,
      type: "LINKEDIN_INMAIL",
      greeting: outreachGreeting({ channel: "linkedin", firstName: null }),
      signerName,
      confirmedHiringManagerRole: false,
      includeRedirect: true,
      purpose: "PROACTIVE",
      emailLength: null,
      priorMessage: null,
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    printSample("InMail to Indirect role, no contact name", inmail);
  }

  if (!run("email")) return;

  const recruiterEmail = await generateValidated({
    context: recruiterContext,
    type: "EMAIL",
    greeting: outreachGreeting({
      channel: "email",
      firstName: "Priya",
    }),
    signerName,
    confirmedHiringManagerRole: false,
    includeRedirect: false,
    purpose: "PROACTIVE",
    emailLength: "MEDIUM",
    priorMessage: null,
    regenerationInstruction: null,
    qualityFeedback: [],
  });
  printSample("Email to recruiter named in the posting", recruiterEmail);

  if (!recruiterEmail.content) {
    console.log("\n===== Follow-up email after first marked sent =====");
    console.log("skipped because the proactive recruiter email had no content");
  } else {
    const followUp = await generateValidated({
      context: recruiterContext,
      type: "EMAIL",
      greeting: outreachGreeting({
        channel: "email",
        firstName: "Priya",
      }),
      signerName,
      confirmedHiringManagerRole: false,
      includeRedirect: false,
      purpose: "FOLLOW_UP",
      emailLength: "SHORT",
      priorMessage: composeOutreachText(recruiterEmail.content),
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    printSample("Follow-up email after first marked sent", followUp);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
