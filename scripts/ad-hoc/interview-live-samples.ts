/**
 * Live interview guide, thank-you, and consultation-focus samples.
 * Requires ASSET_AI_* and CONSULTATION_AI_* in .env.local.
 *
 *   npx dotenv -e .env.local -- tsx --conditions=react-server scripts/ad-hoc/interview-live-samples.ts
 */
import Module from "node:module";
import { generateOutreachWithModel } from "../../src/lib/application-assets/ai";
import { validateOutreachContent } from "../../src/lib/application-assets/outreach";
import { composeOutreachText } from "../../src/lib/application-assets/contract";
import type { OutreachGenerationInput } from "../../src/lib/application-assets/outreach-types";
import {
  getAiConfigPublicSummary,
  getAssetAiConfig,
  getConsultationAiConfig,
} from "../../src/lib/ai/config";
import type { ReadyApplicationGenerationContext } from "../../src/lib/generation/context";
import { generateInterviewThankYouClarifyingQuestions } from "../../src/lib/interview/ai";
import { generateInterviewGuideWithModel } from "../../src/lib/interview/ai";
import {
  validateInterviewGuideContent,
  type InterviewGuideContent,
} from "../../src/lib/interview/guide";
import type { InterviewGuidePromptInput } from "../../src/lib/interview/prompt";
import { planConsultationWithModel } from "../../src/lib/consultation/ai";
import {
  evidenceTargets,
  profileEvidenceItems,
} from "../../src/lib/consultation/assess";
import { matchConsultationFocus } from "../../src/lib/consultation/questions";
import { normalizeParsedJobRequirement } from "../../src/lib/job-requirement/normalize";
import {
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "../../src/lib/job-requirement/fixtures";
import { fixtureAlexChenProfile } from "../../src/lib/product-research/fixtures/alex-chen-profile";
import { applicationAssetConfig, outreachGreeting } from "../../src/lib/product-config";

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

function requireRole(prefix: "ASSET_AI" | "CONSULTATION_AI"): void {
  const required = [
    `${prefix}_PROVIDER`,
    `${prefix}_MODEL`,
    `${prefix}_MODEL_URL`,
    `${prefix}_API_KEY`,
  ] as const;
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`${prefix}_* is not configured in .env.local.`);
  }
}

const THIN_NOTES =
  "The hiring manager will focus on incident leadership.";
const SEEKER_ANSWERS =
  "We discussed my on-call rotation. Priya asked how I handle incident leadership, and I want to reinforce the invoice rewrite.";
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
    text: THIN_NOTES,
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
            notesAfter: THIN_NOTES,
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
  const failures: Array<{ attempt: number; errors: string[] }> = [];
  for (
    let attempt = 0;
    attempt <= applicationAssetConfig.generation.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const generated = await generateInterviewGuideWithModel({
      ...input,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      failures.push({ attempt: attempt + 1, errors: [generated.message] });
      console.error(JSON.stringify({ event: "interview_guide_validation_failed", label, attempt: attempt + 1, errors: [generated.message] }));
      feedback = [generated.message];
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
      return { content: generated.data, attempts: attempt + 1, failures };
    }
    failures.push({ attempt: attempt + 1, errors });
    console.error(JSON.stringify({ event: "interview_guide_validation_failed", label, attempt: attempt + 1, errors }));
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
      ...row.likelyQuestions.flatMap((item) => [
        item.question.text,
        item.answerMaterial.text,
        item.exampleAnswer.text,
      ]),
    ]),
  ].join("\n");
}

async function thankYouQuestions() {
  let feedback: string[] = [];
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const generated = await generateInterviewThankYouClarifyingQuestions({
      notes: THIN_NOTES,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      feedback = [generated.message];
      continue;
    }
    const questions = generated.data.questions.slice(0, 2);
    if (questions.length > 0 && questions.every((question) => question.text.endsWith("?"))) {
      return questions;
    }
    feedback = ["Write up to two short questions that end with a question mark."];
  }
  throw new Error("Thank-you clarifying questions did not pass.");
}

async function thankYouEmail(notes: string) {
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
      applicationProgress: "INTERVIEWING",
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
      { id: "application:notes", text: notes, category: "APPLICATION", url: null },
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
    interviewStageNotes: notes,
    mentionApplied: false,
    regenerationInstruction: null,
    qualityFeedback: [],
  };
  const failures: Array<{ attempt: number; errors: string[] }> = [];
  for (let attempt = 0; attempt <= 8; attempt += 1) {
    const generated = await generateOutreachWithModel({
      ...input,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      failures.push({ attempt: attempt + 1, errors: [generated.message] });
      console.error(JSON.stringify({ event: "outreach_validation_failed", attempt: attempt + 1, errors: [generated.message] }));
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
      stageNotes: notes,
      mentionApplied: false,
    });
    if (violations.length === 0) {
      return { content: generated.data, attempts: attempt + 1, failures };
    }
    failures.push({ attempt: attempt + 1, errors: violations });
    console.error(JSON.stringify({ event: "outreach_validation_failed", attempt: attempt + 1, errors: violations }));
    feedback = violations;
  }
  throw new Error("Thank-you email did not pass validation.");
}

async function consultationFocusQuestion() {
  const profile = fixtureAlexChenProfile();
  const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
  const targets = evidenceTargets({
    requiredItems: parsed.requiredItems,
    preferredItems: parsed.preferredItems,
    scorecard: parsed.scorecard,
  });
  const focusTargetKey = matchConsultationFocus({
    focusNote: THIN_NOTES,
    targets,
  });
  if (!focusTargetKey) {
    throw new Error("Could not match the new-gap focus to a consultation target.");
  }
  const plan = await planConsultationWithModel({
    targets,
    profileItems: profileEvidenceItems(profile),
    hiringTeam: [
      {
        id: "hm",
        name: "Hiring Manager",
        likelyTitles: ["Director of Engineering"],
        whyThisRoleMatters: "Owns incident leadership and on-call quality.",
        personaContext: {},
      },
    ],
    chronologyRequested: false,
    coveredTargetKeys: [],
    focusTargetKey,
  });
  if (!plan.ok) {
    throw new Error(plan.message);
  }
  const focused =
    plan.data.questions.find((question) => question.targetKey === focusTargetKey) ??
    plan.data.questions[0];
  if (!focused) {
    throw new Error("Consultation planner did not write a focus question.");
  }
  return { focusTargetKey, question: focused.text, firstTargetKey: plan.data.questions[0]?.targetKey };
}

async function main() {
  requireRole("ASSET_AI");
  requireRole("CONSULTATION_AI");
  console.log(
    JSON.stringify({
      asset: getAiConfigPublicSummary(getAssetAiConfig()),
      consultation: getAiConfigPublicSummary(getConsultationAiConfig()),
    }),
  );
  const recruiter = await generateGuide("recruiter screen", false);
  const hiringManager = await generateGuide("hiring manager", true);
  const questions = await thankYouQuestions();
  const thanks = await thankYouEmail(`${THIN_NOTES}\n${SEEKER_ANSWERS}`);
  const composed = composeOutreachText(thanks.content);
  const consultation = await consultationFocusQuestion();
  console.log("\n=== Recruiter screen guide ===\n");
  console.log(summarizeGuide(recruiter.content));
  console.log("\n=== Hiring manager guide ===\n");
  console.log(summarizeGuide(hiringManager.content));
  console.log("\n=== Harper questions for thin notes ===\n");
  for (const question of questions) {
    console.log(question.text);
  }
  console.log("\n=== Thank-you email after answers ===\n");
  console.log(composed.subject);
  console.log(composed.body);
  console.log("\n=== First consultation question for new-gap focus ===\n");
  console.log(consultation.question);
  console.log(
    JSON.stringify({
      recruiterAttempts: recruiter.attempts,
      recruiterFailures: recruiter.failures,
      hiringManagerAttempts: hiringManager.attempts,
      hiringManagerFailures: hiringManager.failures,
      thankYouAttempts: thanks.attempts,
      thankYouFailures: thanks.failures,
      hiringManagerMentionsIncident: summarizeGuide(hiringManager.content)
        .toLowerCase()
        .includes("incident"),
      consultationFocusTargetKey: consultation.focusTargetKey,
      consultationFirstTargetKey: consultation.firstTargetKey,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
