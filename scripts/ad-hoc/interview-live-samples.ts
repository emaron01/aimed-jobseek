/**
 * Live interview guide and thank-you samples through ASSET_AI.
 * If ASSET_AI_* is absent, this script copies PERSONA_AI_* for this process only.
 *
 *   npx dotenv -e .env.local -- tsx --conditions=react-server scripts/ad-hoc/interview-live-samples.ts
 */
import Module from "node:module";
import { generateOutreachWithModel } from "../../src/lib/application-assets/ai";
import { validateOutreachContent } from "../../src/lib/application-assets/outreach";
import { composeOutreachText } from "../../src/lib/application-assets/contract";
import type { OutreachGenerationInput } from "../../src/lib/application-assets/outreach-types";
import { getAiConfigPublicSummary, getAssetAiConfig } from "../../src/lib/ai/config";
import type { ReadyApplicationGenerationContext } from "../../src/lib/generation/context";
import {
  generateInterviewGuideWithModel,
} from "../../src/lib/interview/ai";
import {
  validateInterviewGuideContent,
  type InterviewGuideContent,
} from "../../src/lib/interview/guide";
import type { InterviewGuidePromptInput } from "../../src/lib/interview/prompt";
import {
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "../../src/lib/job-requirement/fixtures";
import { fixtureAlexChenProfile } from "../../src/lib/product-research/fixtures/alex-chen-profile";
import { applicationAssetConfig, outreachGreeting } from "../../src/lib/product-config";
import { profileEvidenceItems } from "../../src/lib/consultation/assess";

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
  return "ASSET_AI_* mapped from PERSONA_AI_* for this process only";
}

const NOTES =
  "The hiring manager will focus on incident leadership.";
const STATEMENT =
  "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.";

function sources() {
  const profile = fixtureAlexChenProfile();
  const rows: InterviewGuidePromptInput["sources"] = [];
  for (const item of profileEvidenceItems(profile)) {
    if (item.kind === "FACT") {
      rows.push({ id: `profile:${item.id}`, category: "PROFILE_FACT", text: item.text });
    }
  }
  rows.push({ id: "job:posting", category: "JOB_REQUIREMENT", text: NORMAL_JOB_POSTING });
  rows.push({
    id: "persona:recruiter",
    category: "PERSONA",
    text: "Technical Recruiter coordinating this search and screening for production reliability.",
  });
  rows.push({
    id: "persona:hm",
    category: "PERSONA",
    text: "Hiring manager who owns motion-planning reliability and on-call quality.",
  });
  rows.push({ id: "statement:s1", category: "APPROVED_STATEMENT", text: STATEMENT });
  rows.push({
    id: "interview:recruiter:notesAfter",
    category: "APPLICATION",
    text: NOTES,
  });
  return { profile, rows };
}

function basePrompt(priorNotes: boolean): InterviewGuidePromptInput {
  const { profile, rows } = sources();
  return {
    stageType: priorNotes ? "HIRING_MANAGER" : "RECRUITER_SCREEN",
    format: "VIDEO",
    scheduledAt: "2026-10-01T15:00:00.000Z",
    notesBefore: priorNotes ? null : "Screen for production ownership.",
    notesAfter: null,
    expectedDecisionAt: null,
    interviewers: priorNotes
      ? [
          {
            contactId: "contact_hm",
            firstName: "Lee",
            lastName: "Nguyen",
            title: "Director of Engineering",
            roleId: "persona_hm",
            roleName: "Hiring Manager",
          },
        ]
      : [
          {
            contactId: "contact_priya",
            firstName: "Priya",
            lastName: "Shah",
            title: "Technical Recruiter",
            roleId: "persona_recruiter",
            roleName: "Recruiter",
          },
        ],
    priorStageNotes: priorNotes
      ? [
          {
            stageId: "recruiter",
            type: "RECRUITER_SCREEN",
            notesAfter: NOTES,
          },
        ]
      : [],
    clarifyingAnswers: [],
    profileRoles: profile.experience.map((role) => ({
      roleId: role.id,
      employer: role.employer,
      title: role.title,
      startDate: role.startDate,
      endDate: role.endDate,
      achievements: role.achievements.map((item) => item.text),
      reasonForLeaving: role.reasonForLeaving?.text ?? null,
    })),
    approvedStatements: [{ id: "s1", text: STATEMENT }],
    approvedStories: [],
    scorecardCompetencies: NORMAL_JOB_MODEL.scorecard.competencies.map((item) => ({
      id: item.id,
      text: item.text,
    })),
    consultationGaps: [],
    personas: [
      {
        id: "persona_recruiter",
        name: "Recruiter",
        text: "Technical Recruiter coordinating this search.",
      },
      {
        id: "persona_hm",
        name: "Hiring Manager",
        text: "Owns motion-planning reliability and on-call quality.",
      },
    ],
    sources: rows,
    qualityFeedback: [],
  };
}

async function generateGuide(label: string, priorNotes: boolean) {
  const input = basePrompt(priorNotes);
  let feedback: string[] = [];
  for (let attempt = 0; attempt <= applicationAssetConfig.generation.qualityRegenerationAttempts; attempt += 1) {
    const generated = await generateInterviewGuideWithModel({
      ...input,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      feedback = [generated.message];
      if (attempt === applicationAssetConfig.generation.qualityRegenerationAttempts) {
        throw new Error(`${label} failed: ${generated.message}`);
      }
      continue;
    }
    const errors = validateInterviewGuideContent({
      content: generated.data,
      sources: input.sources,
      stageType: input.stageType,
      interviewerIds: input.interviewers.map((row) => row.contactId),
      experience: fixtureAlexChenProfile().experience,
      priorNoteSourceIds: priorNotes ? ["interview:recruiter:notesAfter"] : [],
      approvedStatementIds: ["s1"],
      approvedStoryIds: [],
    });
    if (errors.length === 0) {
      return { content: generated.data, attempts: attempt + 1 };
    }
    console.error(JSON.stringify({ label, attempt: attempt + 1, errors }));
    feedback = errors;
  }
  throw new Error(`${label} did not pass validation.`);
}

function summarizeGuide(content: InterviewGuideContent): string {
  return [
    content.purpose.text,
    ...content.talkingPoints.map((item) => item.text),
    ...content.interviewers.flatMap((row) => [
      row.whoTheyAre.text,
      row.whatTheyEvaluate.text,
      ...row.likelyQuestions.map((item) => item.question.text),
    ]),
  ].join("\n");
}

async function thankYouEmail() {
  const profile = fixtureAlexChenProfile();
  const context = {
    organizationId: "org_live",
    userId: "user_live",
    campaign: {
      id: "c1",
      name: "Acme",
      ownerUserId: "user_live",
      applicationGuidance: null,
      appliedAt: new Date("2026-09-20T12:00:00.000Z"),
    },
    profile,
    requirement: {
      id: "r1",
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
    companyResearch: null,
    persona: {
      id: "persona_recruiter",
      name: "Recruiter",
      suggestionKey: "recruiter",
      likelyTitles: ["Technical Recruiter"],
      profileJson: {},
    },
    hiringManagerPersonaId: null,
    hiringManagerContactName: null,
    assessments: [],
    approvedStatements: [],
    stories: [],
    voiceSamples: [],
    seekerAnswers: [],
    sources: [
      { id: "job:posting", text: NORMAL_JOB_POSTING, category: "JOB_REQUIREMENT", url: null },
      { id: "application:notes", text: NOTES, category: "APPLICATION", url: null },
      { id: "persona:recruiter", text: "Technical Recruiter coordinating this search.", category: "PERSONA", url: null },
    ],
  } as ReadyApplicationGenerationContext;
  const greeting = outreachGreeting({ channel: "email", firstName: "Priya" });
  let feedback: string[] = [];
  const input: OutreachGenerationInput = {
    context,
    type: "EMAIL",
    greeting,
    signerName: "Alex Chen",
    confirmedHiringManagerRole: false,
    includeRedirect: false,
    purpose: "THANK_YOU",
    emailLength: "SHORT",
    priorMessage: null,
    interviewStageNotes: NOTES,
    regenerationInstruction: null,
    qualityFeedback: [],
  };
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    const generated = await generateOutreachWithModel({
      ...input,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      feedback = [generated.message];
      continue;
    }
    const violations = await validateOutreachContent({
      content: generated.data,
      context,
      greeting,
      signerName: "Alex Chen",
      confirmedHiringManagerRole: false,
      purpose: "THANK_YOU",
      includeRedirect: false,
      stageNotes: NOTES,
    });
    if (violations.length === 0) {
      return { content: generated.data, attempts: attempt + 1 };
    }
    feedback = violations;
  }
  throw new Error("Thank-you email did not pass validation.");
}

async function main() {
  const mapped = mapPersonaAiToAssetAiIfNeeded();
  const config = getAssetAiConfig();
  console.log(JSON.stringify({ mapped, public: getAiConfigPublicSummary(config) }));
  const recruiter = await generateGuide("recruiter screen", false);
  const hiringManager = await generateGuide("hiring manager", true);
  const thanks = await thankYouEmail();
  const composed = composeOutreachText(thanks.content);
  console.log("\n=== Recruiter screen guide ===\n");
  console.log(summarizeGuide(recruiter.content));
  console.log("\n=== Hiring manager guide (after incident-leadership notes) ===\n");
  console.log(summarizeGuide(hiringManager.content));
  console.log("\n=== Thank-you email ===\n");
  console.log(composed.subject);
  console.log(composed.body);
  console.log(
    JSON.stringify({
      recruiterAttempts: recruiter.attempts,
      hiringManagerAttempts: hiringManager.attempts,
      thankYouAttempts: thanks.attempts,
      hiringManagerMentionsIncident: summarizeGuide(hiringManager.content)
        .toLowerCase()
        .includes("incident"),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
