import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApplicationOverview } from "@/components/ApplicationOverview";
import { ConsultationSection } from "@/components/ConsultationSection";
import {
  CONSULTATION_PLAN_DECISION_PROMPT_VERSION,
  CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
  CONSULTATION_PROMPT_VERSION,
  WHY_THIS_COMPANY_TARGET_KEY,
  consultationPlanSchema,
} from "@/lib/consultation/contract";
import {
  EXPERIMENTAL_LEAN_DECISION_INSTRUCTIONS,
  EXPERIMENTAL_LEAN_WRITING_INSTRUCTIONS,
} from "@/lib/model-comparison/plan-split-experiment";
import { CONSULTATION_PLAN_DECISION_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-decision";
import { CONSULTATION_PLAN_WRITING_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-writing";
import { hasTestDatabase } from "@/test/database";

const decisionGenerate = vi.hoisted(() => vi.fn());
const writingGenerate = vi.hoisted(() => vi.fn());
const providerChoices = vi.hoisted(() => [] as string[]);
const enqueueApplicationJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured: () => true,
    isConsultationReplyAiConfigured: () => true,
    getConsultationAiProvider: () => {
      providerChoices.push("CONSULTATION_AI_MODEL");
      return { generateStructured: decisionGenerate };
    },
    getConsultationReplyAiProvider: () => {
      providerChoices.push("CONSULTATION_REPLY_AI_MODEL");
      return { generateStructured: writingGenerate };
    },
    createAiProvider: (config: { model: string }) => {
      providerChoices.push(`override:${config.model}`);
      return { generateStructured: decisionGenerate };
    },
  };
});

vi.mock("@/lib/application-jobs/service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/application-jobs/service")>();
  return { ...actual, enqueueApplicationJob };
});

vi.mock("@/lib/consultation/role-expertise", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/consultation/role-expertise")>();
  return {
    ...actual,
    generateRoleExpertiseWithModel: vi.fn(async () => ({
      ok: true as const,
      questions: [],
      skipped: true,
      questionsSkipped: true,
      answersSkipped: true,
      keptAfterPartial: null,
    })),
  };
});

import {
  CONSULTATION_PLAN_OPERATION,
  CONSULTATION_PLAN_WRITING_OPERATION,
  planConsultationWithModel,
} from "@/lib/consultation/ai";
import { buildConsultationPlanDecisionMessages } from "@/lib/consultation/prompt";
import {
  consultationPlanDecisionFingerprint,
  consultationPlanWritingFingerprint,
} from "@/lib/consultation/plan-split";
import { startConsultation } from "@/lib/consultation/service";
import { generateApplicationSummaryShell } from "@/lib/application-summary/ai";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";
import { prisma } from "@/lib/prisma-client";
import { runModelComparison } from "@/lib/model-comparison/compare";

const EXPERIMENTAL_LABEL =
  "EXPERIMENTAL. Not production. For this comparison script only. Do not treat this as Harper's live coach.\n\n";

const QUESTION =
  "What part of this company's forecasting work do you want to be responsible for?";

const TARGET = {
  key: WHY_THIS_COMPANY_TARGET_KEY,
  kind: "MISSION",
  text: "Why you want to work at this company",
};

function decisionPayload(hiringTeamRoleId: string) {
  return {
    assessments: [
      {
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        strength: "PARTIAL" as const,
        strategyMode: "REFRAME_ADJACENT" as const,
      },
    ],
    questions: [
      {
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        text: QUESTION,
        hiringTeamRoleId,
        interviewTypeTag: "screening" as const,
      },
    ],
  };
}

function writingPayload(extra?: Record<string, unknown>) {
  return {
    overall: "You are ready to talk about the work you have already done.",
    strongestAngles: [
      "You have led delivery.",
      "You have worked with customers.",
    ],
    importantGaps: ["The posting does not name a team size."],
    commentary: "You can speak from the work you have done.",
    closingNote: null,
    assessments: [
      {
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        supportingFactIds: ["fact_supplied"],
        relevantRoleIds: ["role_supplied"],
        explanation: "You can connect the forecast work you already led.",
        strategy: "Tell that story in your own words.",
        ...extra,
      },
    ],
    questions: [
      {
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        whoCaresNote:
          "The hiring manager needs to hear why this work matters to you.",
        requirementInterpretation: null,
      },
    ],
  };
}

function callsFor(
  fn: { mock: { calls: unknown[][] } },
  schemaName: string,
): number {
  return fn.mock.calls.filter(
    (call) => (call[0] as { schemaName?: string } | undefined)?.schemaName === schemaName,
  ).length;
}

function installPlanningMocks(hiringTeamRoleId: string) {
  decisionGenerate.mockImplementation(async (request: { schemaName?: string }) => {
    if (request.schemaName === "consultation_plan_decision") {
      return { data: decisionPayload(hiringTeamRoleId) };
    }
    if (request.schemaName === "application_summary_shell") {
      return {
        data: {
          overview: {
            companyBackground: { text: "Northwind builds warehouse tools." },
            jobRequirements: [{ text: "Own the weekly forecast." }],
            whereSeekerShines: [{ text: "You have led a forecast." }],
          },
        },
      };
    }
    if (request.schemaName === "roleExpertiseQuestions") {
      return {
        data: {
          questions: [
            {
              text: "How did you decide which warehouse forecast to trust when two reports disagreed?",
              interviewTypeTag: "focused_competency",
            },
          ],
        },
      };
    }
    throw new Error(`unexpected decision schema ${request.schemaName ?? ""}`);
  });
  writingGenerate.mockImplementation(async (request: { schemaName?: string }) => {
    if (request.schemaName === "consultation_plan_writing") {
      return { data: writingPayload() };
    }
    if (request.schemaName === "roleExpertiseAnswers") {
      return {
        data: {
          answers: [
            {
              text: "How did you decide which warehouse forecast to trust when two reports disagreed?",
              answerFramework: "CAR",
              challenge: "Two reports disagreed.",
              situation: null,
              task: null,
              action: "You compared the two reports against the shipments you had already counted.",
              result: "The team used the forecast you stood behind.",
              followUpQuestion: null,
            },
          ],
        },
      };
    }
    throw new Error(`unexpected writing schema ${request.schemaName ?? ""}`);
  });
}

function planInput(input: {
  organizationId: string;
  campaignId: string;
  sessionId: string;
}) {
  return {
    targets: [TARGET],
    profileItems: [
      {
        id: "fact_supplied",
        kind: "FACT",
        text: "Led the weekly forecast.",
        itemType: "ACHIEVEMENT",
      },
      {
        id: "role_supplied",
        kind: "ROLE",
        text: "Forecast lead at Northwind.",
        itemType: "EXPERIENCE",
        roleId: "role_supplied",
      },
    ],
    careerStage: "early_career" as const,
    recentRoles: [],
    hiringTeam: [],
    seekerStatedFacts: [],
    companyResearch: null,
    askedQuestions: [],
    chronologyRequested: false,
    coveredTargetKeys: [],
    sessionId: input.sessionId,
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      category: "CONSULTATION" as const,
      operation: "CONSULTATION" as const,
      metadata: { step: "plan" as const, attempt: 1 },
    },
  };
}

const RESTORED_DECISION_RULES = [
  "You are Harper, the career coach named in the payload. You coach; you do not interrogate. Your job for this application: review the person's Personal Profile against this job, surface the gaps, ask about each gap, and help them close it with evidence or address it honestly.",
  "Scope: you coach for any role, in any industry, at any career stage. Never introduce methods, tools, frameworks, or metrics from any profession unless they appear in the supplied Personal Profile or job sources.",
  "Sources: the Personal Profile, including background the person added later and what they learned in interviews, is what the person has stated. Treat all of it as true. Re-evaluate your assessment whenever it changes. companyResearch is this application's employer research when it exists. Use it to understand the company; never mention research status, missing research, or that research was supplied.",
  "Assessment: assess every target semantically, combining evidence across the whole Personal Profile before treating anything as a gap. Adjacent and transferable experience counts when you explain the connection.",
  "Never ask for months or estimates.",
  "Use chronological_walk_through only for the career walk-through question; screening for broad fit and motivation questions such as why this company; focused_competency for a specific requirement or gap; reference_check_prep for what a former manager or colleague would confirm.",
  "Never repeat or rephrase askedQuestions, including career walk-through and interviewer-prep questions.",
  "Never ask about a role that ended more than 10 years ago, in the walk-through or in any gap question. If the seeker volunteers experience from an older role, you may still use it as evidence.",
  "The career walk-through covers only the roles in recentRoles (roughly the last 3 to 5 years).",
  "When a requirement is vague or buzzword-heavy, ask about the concrete behavior or outcome the hiring manager actually needs.",
  "Do not ask about a target already rated STRONG or met from dates.",
  "When the uncovered target is why-this-company, write one question that asks why they want to work at this company for this role. Write that question yourself.",
  "When a gap is PARTIAL, briefly state what the Personal Profile already supports for that target, then ask only for the missing piece. Do not ask the person to restate what is already supported.",
  "Hiring Team: each role carries generalPersona, the built persona for the role itself, and people, the individuals matched to that role. These are separate entries and stay separate: a person's own persona and LinkedIn details describe that individual only. Never merge a person into the generalPersona, never treat one person as standing for the role, and never apply one person's private details to another. What the seeker learned during the interview process (learned notes, notes before and after each interview, and newly gained information) applies to the Hiring Manager by default, including the matched Hiring Manager person when there is one; for other interviewers, use it only as background. When a role has matched people, write whoCaresNote from the generalPersona and from the individual who will actually be in the room, naming which is which. When generalPersona is null the role has not been built yet; use the role name, likely titles, and why the role matters, and do not invent persona detail. When a person has no linkedIn, use their other evidence and claim nothing about their background.",
  "A person's linkedIn, headline, About, roles, education, certifications, skills, and pasted profileText describe that interviewer. Read them to understand who you are preparing the person for. They are never the experience of the person you are coaching: never cite them as evidence for a target and never put them in a question as if they were your own history.",
  "When a seeker-stated background fact such as years in a domain is not tied to specific Personal Profile roles, that gap's question must ask which roles that background came from, in your own words, as part of the same question. Never leave that ask off. Never paste a fixed stock sentence.",
  "Never lower a STRONG or PARTIAL rating because new supporting evidence arrived. Only lower a rating when the new evidence contradicts the earlier evidence.",
  "When every important gap is closed or confirmed and every question is answered, or 25 questions have been asked, set questions to [].",
  "If qualityFeedback says the last result was not accurate, ask what is wrong before rewriting.",
  "When interviewerPrep is present, ask only what this interviewer will likely probe, which of their stories fit, and one or two new questions for weak spots with this interviewer.",
  "If qualityFeedback names a field, rewrite only that field.",
];

const RESTORED_WRITING_RULES = [
  "You are Harper, the career coach named in the payload. You coach; you do not interrogate. Your job for this application: review the person's Personal Profile against this job, surface the gaps, ask about each gap, and help them close it with evidence or address it honestly.",
  'Never refer to them in third person by name, as "he", "she", or "the seeker".',
  "Put FACT item ids only in structured citation fields such as supportingFactIds and relevantRoleIds; never cite an INFERENCE item. Never put an id (consult_…, achievement_…, role_…, skill_…, or similar) or a parenthetical id list in explanation, overall, strongestAngles, importantGaps, commentary, questions, coaching, strategies, whoCaresNote, closingNote, or any other prose. In prose, name employers, titles, and outcomes in plain language. Achievement items include their parent roleId for structured citation only. For years-of-experience requirements, list in relevantRoleIds only the FACT roles where the required skill was used; product code calculates duration from the dates.",
  "Write importantGaps yourself from the assessment. Never leave importantGaps empty. storyPlan is [].",
  "When a requirement is vague or buzzword-heavy, ask about the concrete behavior or outcome the hiring manager actually needs, and set requirementInterpretation to that meaning.",
  "whoCaresNote is required on every question. Never leave whoCaresNote empty.",
  "Hiring Team: each role carries generalPersona, the built persona for the role itself, and people, the individuals matched to that role. These are separate entries and stay separate: a person's own persona and LinkedIn details describe that individual only. Never merge a person into the generalPersona, never treat one person as standing for the role, and never apply one person's private details to another. What the seeker learned during the interview process (learned notes, notes before and after each interview, and newly gained information) applies to the Hiring Manager by default, including the matched Hiring Manager person when there is one; for other interviewers, use it only as background. When a role has matched people, write whoCaresNote from the generalPersona and from the individual who will actually be in the room, naming which is which. When generalPersona is null the role has not been built yet; use the role name, likely titles, and why the role matters, and do not invent persona detail. When a person has no linkedIn, use their other evidence and claim nothing about their background.",
  "A person's linkedIn, headline, About, roles, education, certifications, skills, and pasted profileText describe that interviewer. Read them to understand who you are preparing the person for. They are never the experience of the person you are coaching: never cite them as evidence for a target and never put them in a question as if they were your own history.",
  'likelyToValue is that interviewer\'s own experience synthesized into what they are likely to value and emphasize. Use it to show how to connect your answers to their background: name the part of your experience that speaks to what they have built, and say why it lands with them, for example "when you talk with Jordan about how you trained new team members, lead with the onboarding checklist you built, because that is how they have built their teams". Only connect to experience that is in your Personal Profile. When likelyToValue is empty or absent, coach from the persona alone and say nothing about it being missing.',
  "When every important gap is closed or confirmed and every question is answered, or 25 questions have been asked, set questions to [] and write closingNote as coaching that they can prepare from what you have covered. If any gap is still open, closingNote is null.",
  'Interviewer prep, closing notes, and commentary are coaching and suggestions for the seeker. Never describe them as a "question plan" or refer to the plan\'s status.',
  'Do not use the words "Harper prepares the seeker".',
  "When interviewerPrep is present, ground the commentary in that person's entry, persona, LinkedIn, notes, invitation, stages, and learnings, read alongside the role's generalPersona.",
  "Never generic, never an instruction to go find or prepare something.",
  "Do not write a resume, cover letter, or outreach. Never mention research status, confidence, missing data, prompts, models, or any internal system state.",
  "If qualityFeedback names a field, rewrite only that field.",
];

function approvedBody(experimental: string): string {
  return experimental
    .replace(EXPERIMENTAL_LABEL, "")
    .replace(/\n\nReturn JSON matching the schema only\.$/, "");
}

describe("lean planning instructions", () => {
  it("keeps the approved texts and restores the coach rules verbatim", () => {
    expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS).toContain(
      approvedBody(EXPERIMENTAL_LEAN_DECISION_INSTRUCTIONS),
    );
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).toContain(
      approvedBody(EXPERIMENTAL_LEAN_WRITING_INSTRUCTIONS),
    );
    expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS.endsWith(
      "Return JSON matching the schema only.",
    )).toBe(true);
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS.endsWith(
      "Return JSON matching the schema only.",
    )).toBe(true);
    for (const rule of RESTORED_DECISION_RULES) {
      expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS).toContain(rule);
    }
    for (const rule of RESTORED_WRITING_RULES) {
      expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).toContain(rule);
    }
    expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS).not.toContain(
      "EXPERIMENTAL. Not production.",
    );
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).not.toContain(
      "EXPERIMENTAL. Not production.",
    );
    expect(CONSULTATION_PROMPT_VERSION).toBe("39");
    expect(CONSULTATION_PLAN_DECISION_PROMPT_VERSION).toBe("6");
    expect(CONSULTATION_PLAN_WRITING_PROMPT_VERSION).toBe("6");
    const messages = buildConsultationPlanDecisionMessages({
      targets: [TARGET],
      profileItems: [],
      careerStage: "early_career",
      recentRoles: [],
      hiringTeam: [],
      seekerStatedFacts: [],
      companyResearch: null,
      askedQuestions: [],
      chronologyRequested: false,
      coveredTargetKeys: [],
    });
    expect(messages[0]?.content.startsWith("Prompt version: 6\n")).toBe(true);
    expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS).not.toContain(
      "Ask only what this interviewer will likely probe, which of their stories fit, and one or two new questions for weak spots with this interviewer.",
    );
    expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS).not.toContain(
      "Never repeat or rephrase any of them, including career walk-through and interviewer-prep questions.",
    );
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).not.toContain(
      "Ground it in that person's entry, persona, LinkedIn, notes, invitation, stages, and learnings, read alongside the role's generalPersona.",
    );
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).not.toContain(
      "Write these yourself from the assessment.",
    );
    expect(messages[0]?.content).toContain(CONSULTATION_PLAN_DECISION_INSTRUCTIONS);
    expect(messages[0]?.content).not.toContain("EXPERIMENTAL. Not production.");
    const background = readFileSync(
      "src/lib/consultation/seeker-background-reassess.ts",
      "utf8",
    );
    expect(background).toContain("CONSULTATION_PROMPT_VERSION");
    expect(background).not.toContain("CONSULTATION_PLAN_DECISION_PROMPT_VERSION");
    expect(background).not.toContain("CONSULTATION_PLAN_WRITING_PROMPT_VERSION");
  });

  it("sends best-practice questions and the Cheat Sheet overview to their own models", async () => {
    installPlanningMocks("role_pending");
    providerChoices.length = 0;
    delete process.env.APPLICATION_SUMMARY_SHELL_AI_MODEL;
    delete process.env.ROLE_EXPERTISE_AI_MODEL;
    const fallback = await generateApplicationSummaryShell({
      sources: [{ id: "s1", text: "Northwind builds warehouse tools.", category: "company" }],
    });
    expect(fallback.ok).toBe(true);
    expect(providerChoices).toEqual(["CONSULTATION_AI_MODEL"]);

    providerChoices.length = 0;
    process.env.APPLICATION_SUMMARY_SHELL_AI_MODEL = "gpt-5.6-luna";
    process.env.CONSULTATION_AI_PROVIDER = "openai-responses";
    process.env.CONSULTATION_AI_MODEL = "gpt-5.6-terra";
    process.env.CONSULTATION_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.CONSULTATION_AI_API_KEY = "test-key";
    const override = await generateApplicationSummaryShell({
      sources: [{ id: "s1", text: "Northwind builds warehouse tools.", category: "company" }],
    });
    expect(override.ok).toBe(true);
    expect(providerChoices[0]).toBe("override:gpt-5.6-luna");
    delete process.env.APPLICATION_SUMMARY_SHELL_AI_MODEL;
  });
});

describe("Harper planning render", () => {
  it("renders a saved next step without a paid call or a job", () => {
    decisionGenerate.mockClear();
    writingGenerate.mockClear();
    enqueueApplicationJob.mockClear();
    const html = renderToStaticMarkup(
      createElement(ApplicationOverview, {
        view: {
          campaignId: "camp_render",
          campaignName: "Analyst",
          jobTitle: "Analyst",
          companyName: "Northwind",
          statusLabel: "Not applied",
          statusTone: "attention",
          appliedAt: null,
          nextStepText: "Schedule your initial consultation.",
          nextStepFailed: false,
          fitLabel: null,
          location: null,
          workArrangement: null,
          compensation: null,
          steps: [],
        },
      }),
    );
    expect(html).toContain("Schedule your initial consultation.");
    expect(decisionGenerate).not.toHaveBeenCalled();
    expect(writingGenerate).not.toHaveBeenCalled();
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    for (const path of [
      "src/app/(app)/campaigns/[id]/page.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const page = readFileSync(path, "utf8");
      expect(page).not.toContain("planConsultationWithModel");
      expect(page).not.toContain("runConsultationPlanDecision");
      expect(page).not.toContain("runConsultationPlanWriting");
      expect(page).not.toContain("enqueueApplicationJob");
    }
  });
});

describe("planning callers stay on the lean split", () => {
  it("routes every planning caller through planAndStoreRound or startConsultation", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const plan = service.slice(
      service.indexOf("async function planAndStoreRound"),
      service.indexOf("async function maybeFillRoleExpertiseAfterGapPlan"),
    );
    expect(plan).toContain("runConsultationPlanDecision");
    expect(plan).toContain("runConsultationPlanWriting");
    expect(plan).toContain('"plan_decision"');
    expect(plan).toContain('"plan_writing"');
    function body(name: string) {
      const start = service.indexOf(`export async function ${name}`);
      const end = service.indexOf("\nexport async function ", start + 10);
      return service.slice(start, end === -1 ? undefined : end);
    }
    expect(body("startConsultation")).toContain("planAndStoreRound");
    expect(body("reassessConsultationStanding")).toContain("startConsultation");
    expect(body("retryConsultationGeneration")).toContain("startConsultation");
    expect(body("continueConsultationPlanning")).toContain("planAndStoreRound");
    expect(body("skipConsultationQuestion")).toContain("planAndStoreRound");
    expect(body("flagConsultationInaccuracy")).toContain("planAndStoreRound");
    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(process).toContain("retryConsultationGeneration");
    expect(process).toContain("reassessConsultationStanding");
    expect(process).toContain("continueConsultationPlanning");
    expect(process).toContain("startConsultation");
    expect(process).toContain('operation === "person_prep"');
    const interview = readFileSync("src/app/actions/interview.ts", "utf8");
    const gap = interview.slice(
      interview.indexOf("export async function startInterviewGapConsultationAction"),
      interview.indexOf("export async function", interview.indexOf("startInterviewGapConsultationAction") + 20),
    );
    expect(gap).toContain("startConsultation");
  });
});

describe.skipIf(!hasTestDatabase())(
  "lean planning split",
  { timeout: 60_000 },
  () => {
    const suffix = `lean-${Date.now()}`;
    let organizationId = "";
    let userId = "";
    let productId = "";
    let campaignId = "";
    let hiringRoleId = "";

    beforeAll(async () => {
      process.env.CONSULTATION_AI_PROVIDER = "openai-responses";
      process.env.CONSULTATION_AI_MODEL = "gpt-5.6-terra";
      process.env.CONSULTATION_AI_MODEL_URL = "https://api.openai.com/v1/responses";
      process.env.CONSULTATION_AI_API_KEY = "test-key";
      process.env.CONSULTATION_REPLY_AI_PROVIDER = "openai-responses";
      process.env.CONSULTATION_REPLY_AI_MODEL = "gpt-5.6-luna";
      process.env.CONSULTATION_REPLY_AI_MODEL_URL = "https://api.openai.com/v1/responses";
      process.env.CONSULTATION_REPLY_AI_API_KEY = "test-key";
      delete process.env.ROLE_EXPERTISE_AI_MODEL;
      delete process.env.APPLICATION_SUMMARY_SHELL_AI_MODEL;
      const org = await prisma.organization.create({
        data: { name: `[TEST] Lean plan ${suffix}`, slug: `lean-plan-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `lean-plan-${suffix}@example.com`,
          emailNormalized: `lean-plan-${suffix}@example.com`,
          firstName: "Alex",
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Profile ${suffix}`,
          profileJson: emptyCandidateProfile(),
        },
      });
      productId = product.id;
      const icp = await prisma.icp.create({
        data: { organizationId, productId, name: `Employer ${suffix}` },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `Application ${suffix}`,
          productId,
          icpId: icp.id,
        },
      });
      campaignId = campaign.id;
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId,
          rawText: "Forecast analyst.",
          title: "Forecast analyst",
          companyName: "Northwind",
          requiredItems: [],
          preferredItems: [],
          scorecardJson: {},
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId,
          campaignId,
          name: "Hiring Manager",
          whyThisPersonaMatters: "Owns the hiring decision.",
        },
      });
      hiringRoleId = persona.id;
      installPlanningMocks(hiringRoleId);
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      }
    });

    it("runs terra then luna through the gate and keeps luna from changing the decision", async () => {
      decisionGenerate.mockClear();
      writingGenerate.mockClear();
      providerChoices.length = 0;
      const errors: string[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((message) => {
        errors.push(String(message));
      });
      writingGenerate.mockImplementationOnce(async () => ({
        data: {
          ...writingPayload(),
          assessments: [
            {
              targetKey: WHY_THIS_COMPANY_TARGET_KEY,
              strength: "STRONG",
              strategyMode: "ACKNOWLEDGE",
              supportingFactIds: ["fact_supplied", "fact_not_supplied"],
              relevantRoleIds: ["role_supplied", "role_not_supplied"],
              explanation: "You can connect the forecast work you already led.",
              strategy: "Tell that story in your own words.",
            },
            {
              targetKey: "invented-target",
              supportingFactIds: [],
              relevantRoleIds: [],
              explanation: "You should ignore this extra target.",
              strategy: "Do not add it.",
            },
          ],
          questions: [
            {
              targetKey: WHY_THIS_COMPANY_TARGET_KEY,
              text: "Luna rewrote this question.",
              hiringTeamRoleId: "role_other",
              interviewTypeTag: "reference_check_prep",
              whoCaresNote:
                "The hiring manager needs to hear why this work matters to you.",
              requirementInterpretation: null,
            },
            {
              targetKey: "invented-question",
              whoCaresNote: "This question was not in the decision.",
              requirementInterpretation: null,
            },
          ],
        },
      }));
      const sessionId = `sess_restore_${suffix}`;
      const gateCampaignId = `camp_gate_${suffix}`;
      const first = await planConsultationWithModel(
        planInput({ organizationId, campaignId: gateCampaignId, sessionId }),
      );
      spy.mockRestore();
      expect(first.ok).toBe(true);
      if (!first.ok || first.writingFailed) {
        throw new Error("writing should succeed");
      }
      expect(consultationPlanSchema.parse(first.data).briefing.storyPlan).toEqual([]);
      expect(first.data.assessments).toEqual([
        expect.objectContaining({
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          strength: "PARTIAL",
          strategyMode: "REFRAME_ADJACENT",
          supportingFactIds: ["fact_supplied"],
          relevantRoleIds: ["role_supplied"],
        }),
      ]);
      expect(first.data.questions[0]).toEqual(
        expect.objectContaining({
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          text: QUESTION,
          hiringTeamRoleId: hiringRoleId,
          interviewTypeTag: "screening",
        }),
      );
      expect(errors.join("\n")).toContain("consultation_plan_writing_adjusted");
      expect(errors.join("\n")).toContain("fact_not_supplied");
      expect(errors.join("\n")).toContain("role_not_supplied");
      expect(callsFor(decisionGenerate, "consultation_plan_decision")).toBe(1);
      expect(callsFor(writingGenerate, "consultation_plan_writing")).toBe(1);
      expect(providerChoices).toEqual([
        "CONSULTATION_AI_MODEL",
        "CONSULTATION_REPLY_AI_MODEL",
      ]);
      expect(decisionGenerate.mock.calls[0]?.[0]?.usage).toEqual(
        expect.objectContaining({
          operation: "CONSULTATION",
          metadata: { step: "plan_decision", attempt: 1 },
        }),
      );
      expect(writingGenerate.mock.calls[0]?.[0]?.usage).toEqual(
        expect.objectContaining({
          operation: "CONSULTATION_REPLY",
          metadata: { step: "plan_writing", attempt: 1 },
        }),
      );
      const decisionMessages = buildConsultationPlanDecisionMessages(
        planInput({ organizationId, campaignId: gateCampaignId, sessionId }),
      );
      const decisionReceipt = await prisma.paidCallReceipt.findFirst({
        where: {
          organizationId,
          operation: CONSULTATION_PLAN_OPERATION,
          subjectKey: { startsWith: `${gateCampaignId}:${sessionId}:` },
        },
      });
      expect(decisionReceipt?.inputHash).toBe(
        consultationPlanDecisionFingerprint(decisionMessages),
      );
      const { buildConsultationPlanWritingMessages } = await import(
        "@/lib/consultation/prompt"
      );
      const writingReceipt = await prisma.paidCallReceipt.findFirst({
        where: {
          organizationId,
          operation: CONSULTATION_PLAN_WRITING_OPERATION,
          subjectKey: { startsWith: `${gateCampaignId}:${sessionId}:` },
        },
      });
      expect(writingReceipt?.inputHash).toBe(
        consultationPlanWritingFingerprint({
          messages: buildConsultationPlanWritingMessages(
            planInput({ organizationId, campaignId: gateCampaignId, sessionId }),
            decisionPayload(hiringRoleId),
          ),
          decision: decisionPayload(hiringRoleId),
        }),
      );

      const second = await planConsultationWithModel(
        planInput({ organizationId, campaignId: gateCampaignId, sessionId }),
      );
      expect(second).toEqual(first);
      expect(callsFor(decisionGenerate, "consultation_plan_decision")).toBe(1);
      expect(callsFor(writingGenerate, "consultation_plan_writing")).toBe(1);
    });

    it("retries writing alone after luna fails and keeps the decision questions", async () => {
      decisionGenerate.mockClear();
      writingGenerate.mockClear();
      installPlanningMocks(hiringRoleId);
      writingGenerate.mockRejectedValue(new Error("luna down"));
      await startConsultation({ organizationId, campaignId });
      const session = await prisma.consultationSession.findUnique({
        where: { campaignId },
        include: { turns: true, assessments: true },
      });
      expect(session?.generationStatus).toBe("READY");
      expect(session?.generationError).toBeNull();
      expect(session?.briefingJson).toBeNull();
      expect(session?.coachNote).toBeNull();
      expect(session?.promptVersion).toBe("38");
      expect(session?.turns.map((turn) => turn.body)).toContain(QUESTION);
      expect(session?.assessments[0]?.strength).toBe("PARTIAL");
      expect(callsFor(decisionGenerate, "consultation_plan_decision")).toBe(1);
      expect(callsFor(writingGenerate, "consultation_plan_writing")).toBe(3);
      expect(
        await prisma.paidCallReceipt.count({
          where: {
            organizationId,
            operation: CONSULTATION_PLAN_WRITING_OPERATION,
            subjectKey: { startsWith: `${campaignId}:` },
          },
        }),
      ).toBe(0);

      decisionGenerate.mockClear();
      writingGenerate.mockClear();
      installPlanningMocks(hiringRoleId);
      enqueueApplicationJob.mockClear();
      await startConsultation({ organizationId, campaignId });
      expect(callsFor(decisionGenerate, "consultation_plan_decision")).toBe(0);
      expect(callsFor(writingGenerate, "consultation_plan_writing")).toBe(1);
      const written = await prisma.consultationSession.findUnique({
        where: { campaignId },
        include: { turns: true },
      });
      expect(written?.generationStatus).toBe("READY");
      expect(written?.generationError).toBeNull();
      const briefing = written?.briefingJson as { storyPlan?: string[]; overall?: string };
      expect(briefing.storyPlan).toEqual([]);
      expect(briefing.overall).toContain("You are ready");
      const question = written?.turns.find((turn) => turn.body === QUESTION);
      expect(question?.questionContextJson).toEqual(
        expect.objectContaining({
          interviewTypeTag: "screening",
          hiringTeamRoleId: hiringRoleId,
          whoCaresNote:
            "The hiring manager needs to hear why this work matters to you.",
        }),
      );
      expect(written?.turns.filter((turn) => turn.body === QUESTION)).toHaveLength(1);

      decisionGenerate.mockClear();
      writingGenerate.mockClear();
      enqueueApplicationJob.mockClear();
      const html = renderToStaticMarkup(
        await ConsultationSection({
          campaignId,
          organizationId,
          canEdit: false,
          jobs: [],
        }),
      );
      expect(html).toContain("forecasting work do you want to be responsible for");
      expect(html).toContain("You are ready");
      expect(decisionGenerate).not.toHaveBeenCalled();
      expect(writingGenerate).not.toHaveBeenCalled();
      expect(enqueueApplicationJob).not.toHaveBeenCalled();
    });

    it("uses ROLE_EXPERTISE_AI_MODEL when set and CONSULTATION_AI_MODEL when unset", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/consultation/role-expertise")
      >("@/lib/consultation/role-expertise");
      const job = {
        title: "Forecast analyst",
        companyName: "Northwind",
        seniority: null,
        location: null,
        workArrangement: null,
        requiredItems: [],
        preferredItems: [],
        responsibilities: [],
        scorecardJson: {},
      };
      providerChoices.length = 0;
      delete process.env.ROLE_EXPERTISE_AI_MODEL;
      await actual.generateRoleExpertiseWithModel({
        organizationId,
        campaignId,
        job,
        minCount: 1,
        maxCount: 1,
        askedQuestions: [],
        chronologyAlreadyAsked: false,
        recentRoles: [],
        careerStage: "early_career",
        profileItems: [],
      });
      expect(providerChoices[0]).toBe("CONSULTATION_AI_MODEL");

      providerChoices.length = 0;
      process.env.ROLE_EXPERTISE_AI_MODEL = "gpt-5.6-luna";
      await actual.generateRoleExpertiseWithModel({
        organizationId,
        campaignId,
        job: { ...job, title: "Forecast analyst lead" },
        minCount: 1,
        maxCount: 1,
        askedQuestions: [],
        chronologyAlreadyAsked: false,
        recentRoles: [],
        careerStage: "early_career",
        profileItems: [],
      });
      expect(providerChoices[0]).toBe("override:gpt-5.6-luna");
      delete process.env.ROLE_EXPERTISE_AI_MODEL;
    });

    it("runs comparison current and split modes against the production lean split", async () => {
      decisionGenerate.mockClear();
      writingGenerate.mockClear();
      const current = await runModelComparison({
        campaignId,
        steps: ["planning"],
        dryRun: true,
        fresh: true,
        mode: "current",
        writeReport: false,
      });
      const split = await runModelComparison({
        campaignId,
        steps: ["planning"],
        dryRun: true,
        fresh: true,
        mode: "split",
        writeReport: false,
      });
      expect(current.mode).toBe("current");
      expect(current.markdown).toContain(CONSULTATION_PLAN_DECISION_INSTRUCTIONS);
      expect(current.markdown).toContain(CONSULTATION_PLAN_WRITING_INSTRUCTIONS);
      expect(current.markdown).not.toContain("EXPERIMENTAL. Not production.");
      expect(split.mode).toBe("split");
      expect(split.markdown).toContain(
        "Production lean split (terra decision, luna writing)",
      );
      expect(split.markdown).toContain("EXPERIMENTAL. Not production.");
      expect(decisionGenerate).not.toHaveBeenCalled();
      expect(writingGenerate).not.toHaveBeenCalled();
    });
  },
);
