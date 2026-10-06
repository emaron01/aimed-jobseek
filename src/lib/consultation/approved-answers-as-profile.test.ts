import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const enqueue = vi.hoisted(() => vi.fn(async () => ({ id: "job-1" })));
const approveResult = vi.hoisted(() => vi.fn(async () => undefined));
const continuesPlanning = vi.hoisted(() => vi.fn(async () => true));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: async () => ({ id: "user-1" }),
}));
vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  requireOrganizationId: async () => "org-1",
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: enqueue,
  activeApplicationJob: vi.fn(),
}));
vi.mock("@/lib/consultation/service", () => ({
  approveConsultationQaResult: approveResult,
  approvalContinuesHarperPlanning: continuesPlanning,
}));

import { approveConsultationQaResultAction } from "@/app/actions/consultation";
import type { EvidenceAssessment } from "@/lib/consultation/assess";
import {
  CONSULTATION_PLAN_DECISION_PROMPT_VERSION,
  CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
  CONSULTATION_PROMPT_VERSION,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import {
  approvedAnswerEvidenceId,
  harperLibraryContentHash,
  selectApprovedAnswersForTargets,
  type ApprovedAnswerCandidate,
} from "@/lib/consultation/harper-library";
import { combinePlanDecisionAndWriting } from "@/lib/consultation/plan-split";
import { buildConsultationPlanDecisionMessages, buildConsultationPolishMessages } from "@/lib/consultation/prompt";
import { selectGapsForRound } from "@/lib/consultation/questions";
import {
  ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION,
  ROLE_EXPERTISE_PROMPT_VERSION,
  buildRoleExpertiseAnswersMessages,
  buildRoleExpertiseQuestionsMessages,
  roleExpertiseAnswersFingerprint,
} from "@/lib/consultation/role-expertise";
import { CONSULTATION_PLAN_DECISION_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-decision";
import { CONSULTATION_PLAN_WRITING_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-writing";
import { CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";
import { ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";

const DECISION_RULE =
  "approvedAnswers are answers the person already approved in other applications. Treat them as stated by the person, like the Personal Profile. Rate a target they fully cover STRONG and do not ask about it. For a PARTIAL target, ask only for the missing piece. Never use another company's why-this-company answer as evidence.";
const WRITING_RULE =
  "You may cite approvedAnswers ids in supportingFactIds. Facts about the person may come only from the Personal Profile and approvedAnswers.";
const DRAFT_RULE =
  "Combine as many approved answers and profile facts as the question needs. Keep every employer, number, title, and outcome exactly as stated; a result achieved at one company stays at that company. Use this company and role only to frame why the experience matters here.";
const OPENTEXT = "At OpenText I raised forecast accuracy to 95%.";

function answer(
  overrides: Partial<ApprovedAnswerCandidate> &
    Pick<ApprovedAnswerCandidate, "statementId" | "question" | "content" | "approvedAt">,
): ApprovedAnswerCandidate {
  return {
    sourceCampaignId: "application-1",
    targetKey: "required:forecast",
    whyThisCompany: null,
    ...overrides,
  };
}

function assessment(
  partial: Pick<EvidenceAssessment, "key" | "text" | "strength">,
): EvidenceAssessment {
  return {
    kind: "REQUIRED",
    supportingFactIds: [],
    strategy: "PROVE_WITH_STORY",
    explanation: "",
    strategyText: "",
    verification: {
      originalStrength: partial.strength,
      invalidSupportingFactIds: [],
      invalidRoleIds: [],
      downgradeReasons: [],
    },
    experienceCalculation: null,
    ...partial,
  };
}

describe("approved answers as profile evidence", () => {
  it("keeps the newest matching answer per target and drops the excluded cases", () => {
    const selected = selectApprovedAnswersForTargets({
      campaignId: "application-2",
      targets: [
        { key: "required:forecast", text: "weekly sales forecast review" },
        { key: "required:sql", text: "SQL reporting for the sales team" },
        { key: WHY_THIS_COMPANY_TARGET_KEY, text: "why this company" },
      ],
      answers: [
        answer({
          statementId: "older",
          question: "How do you run a weekly sales forecast review?",
          content: "At Fabrikam I ran the forecast from a spreadsheet.",
          approvedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        answer({
          statementId: "newer",
          question: "How do you run a weekly sales forecast review with the team?",
          content: OPENTEXT,
          approvedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
        answer({
          statementId: "sql",
          question: "How do you use SQL reporting for the sales team?",
          content: "I built the weekly SQL report at OpenText.",
          approvedAt: new Date("2026-05-01T00:00:00.000Z"),
          targetKey: "required:sql",
        }),
        answer({
          statementId: "own",
          question: "How do you run a weekly sales forecast review?",
          content: "This application's own answer.",
          approvedAt: new Date("2026-09-01T00:00:00.000Z"),
          sourceCampaignId: "application-2",
        }),
        answer({
          statementId: "empty",
          question: "How do you run a weekly sales forecast review?",
          content: "   ",
          approvedAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
        answer({
          statementId: "why-target",
          question: "How do you run a weekly sales forecast review?",
          content: "I want Contoso because of the forecast culture.",
          approvedAt: new Date("2026-07-01T00:00:00.000Z"),
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        }),
        answer({
          statementId: "why-text",
          question: "Tell me something else about forecasting.",
          content: "I want to join because of the forecast review culture.",
          approvedAt: new Date("2026-07-02T00:00:00.000Z"),
          targetKey: "required:motivation",
          whyThisCompany: "I want to join because of the forecast review culture.",
        }),
        answer({
          statementId: "unrelated",
          question: "How do you hire a finance partner?",
          content: "I hired a finance partner at Northwind.",
          approvedAt: new Date("2026-04-01T00:00:00.000Z"),
          targetKey: "required:hiring",
        }),
      ],
    });

    expect(selected.map((item) => item.statementId)).toEqual(["newer", "sql"]);
    expect(selected[0]).toMatchObject({
      id: approvedAnswerEvidenceId("newer"),
      question: "How do you run a weekly sales forecast review with the team?",
      content: OPENTEXT,
      approvedAt: "2026-06-01T00:00:00.000Z",
      sourceApplicationId: "application-1",
    });
    expect(selected.some((item) => item.content.includes("why"))).toBe(false);

    const loader = readFileSync(
      "src/lib/consultation/harper-library.ts",
      "utf8",
    ).slice(
      readFileSync("src/lib/consultation/harper-library.ts", "utf8").indexOf(
        "export async function loadApprovedAnswersForTargets",
      ),
    );
    expect(loader).not.toContain("profileStory");
    expect(loader).not.toContain("situation");
    expect(loader).not.toContain("interviewAnswer");
  });

  it("does not ask a target rated STRONG and passes approved answers to the decision", () => {
    expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS).toContain(DECISION_RULE);
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).toContain(WRITING_RULE);
    expect(CONSULTATION_PLAN_DECISION_PROMPT_VERSION).toBe("6");
    expect(CONSULTATION_PLAN_WRITING_PROMPT_VERSION).toBe("6");
    expect(CONSULTATION_PROMPT_VERSION).toBe("38");

    const selected = selectGapsForRound({
      assessments: [
        assessment({
          key: "required:forecast",
          text: "weekly sales forecast review",
          strength: "STRONG",
        }),
        assessment({
          key: "required:sql",
          text: "SQL reporting for the sales team",
          strength: "NONE",
        }),
      ],
      askedKeys: new Set(),
      skippedKeys: new Set(),
    });
    expect(selected.map((gap) => gap.key)).toEqual(["required:sql"]);

    const approved = selectApprovedAnswersForTargets({
      campaignId: "application-2",
      targets: [{ key: "required:forecast", text: "weekly sales forecast review" }],
      answers: [
        answer({
          statementId: "newer",
          question: "How do you run a weekly sales forecast review?",
          content: OPENTEXT,
          approvedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
    });
    const messages = buildConsultationPlanDecisionMessages({
      targets: [
        { key: "required:forecast", kind: "REQUIRED", text: "weekly sales forecast review" },
      ],
      profileItems: [],
      approvedAnswers: approved,
      careerStage: "mid_career",
      recentRoles: [],
      hiringTeam: [],
      seekerStatedFacts: [],
      companyResearch: null,
      askedQuestions: [],
      chronologyRequested: false,
      coveredTargetKeys: [],
    });
    expect(messages[0]?.content.startsWith("Prompt version: 6\n")).toBe(true);
    const payload = JSON.parse(messages[1]?.content ?? "{}") as {
      personalProfileItems: unknown[];
      approvedAnswers: Array<{ id: string; content: string }>;
    };
    expect(payload.personalProfileItems).toEqual([]);
    expect(payload.approvedAnswers).toEqual([
      expect.objectContaining({ id: "approved:newer", content: OPENTEXT }),
    ]);
  });

  it("drops supporting fact ids that were not supplied and keeps approved answer ids", () => {
    const { plan } = combinePlanDecisionAndWriting({
      decision: {
        assessments: [
          {
            targetKey: "required:forecast",
            strength: "STRONG",
            strategyMode: "PROVE_WITH_STORY",
          },
        ],
        questions: [],
      },
      writingRaw: {
        overall: "You already covered forecast accuracy.",
        strongestAngles: ["The OpenText result", "The weekly review"],
        importantGaps: ["No remaining experience gap for this job."],
        commentary: "Lead with the OpenText result.",
        closingNote: "You can prepare from what you have covered.",
        assessments: [
          {
            targetKey: "required:forecast",
            supportingFactIds: ["approved:newer", "approved:unknown", "invented"],
            relevantRoleIds: ["role-unknown"],
            explanation: "The approved answer covers the target.",
            strategy: "Lead with it.",
          },
        ],
        questions: [],
      },
      suppliedFactIds: new Set(["approved:newer"]),
      suppliedRoleIds: new Set(),
    });
    expect(plan?.assessments[0]?.supportingFactIds).toEqual(["approved:newer"]);
    expect(plan?.assessments[0]?.relevantRoleIds).toEqual([]);
    expect(plan?.assessments[0]?.strength).toBe("STRONG");
  });

  it("keeps an OpenText result in the draft payload and does not tell the model to move it", () => {
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).toContain(DRAFT_RULE);
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(DRAFT_RULE);
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).toContain(
      "When the person's information doesn't cover the question, write a strong sample answer",
    );
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).not.toContain(
      "Replace anything about the previous company",
    );
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).not.toContain(
      "Replace anything about the previous company",
    );
    expect(ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION).toBe("8");
    expect(ROLE_EXPERTISE_PROMPT_VERSION).toBe("3");

    const approved = {
      id: "approved:opentext",
      statementId: "opentext",
      question: "How did you improve forecast accuracy?",
      content: OPENTEXT,
      approvedAt: "2026-06-01T00:00:00.000Z",
      sourceApplicationId: "application-1",
    };
    const answers = buildRoleExpertiseAnswersMessages({
      questions: [
        {
          text: "How did you improve forecast accuracy?",
          interviewTypeTag: "focused_competency",
          targetKey: "required:forecast",
        },
      ],
      careerStage: "mid_career",
      jobSources: { title: "Sales Director", employer: "Contoso" },
      profileItems: [],
      approvedAnswers: [approved],
    });
    expect(answers[0]?.content).toContain(
      "a result achieved at one company stays at that company",
    );
    expect(answers[1]?.content).toContain("OpenText");
    expect(answers[1]?.content).toContain("95%");
    expect(answers[1]?.content).not.toContain("Replace anything about the previous company");

    const polish = buildConsultationPolishMessages({
      answer: "I raised forecast accuracy.",
      seekerReplies: ["I raised forecast accuracy to 95% at OpenText."],
      story: { situation: null, task: null, action: null, result: null },
      declinedFollowUp: false,
      strengtheningNeeds: [],
      careerStage: "mid_career",
      profileItems: [],
      approvedAnswers: [approved],
    });
    expect(polish[2]?.content).toContain("OpenText");
    expect(polish[2]?.content).toContain("95%");

    const questions = buildRoleExpertiseQuestionsMessages({
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "mid_career",
      jobSources: { title: "Sales Director", employer: "Contoso" },
    });
    expect(questions[1]?.content).not.toContain("approvedAnswers");
    expect(questions[0]?.content.startsWith("Prompt version: 3\n")).toBe(true);

    const choice = {
      text: "How did you improve forecast accuracy?",
      interviewTypeTag: "focused_competency" as const,
    };
    const empty = roleExpertiseAnswersFingerprint([choice], []);
    const filled = roleExpertiseAnswersFingerprint(
      [choice],
      [
        {
          statementId: "opentext",
          contentHash: harperLibraryContentHash(OPENTEXT),
        },
      ],
    );
    expect(empty).not.toBe(filled);
  });

  it("enqueues consultation continue only for the application that was approved", async () => {
    enqueue.mockClear();
    approveResult.mockClear();
    const form = new FormData();
    form.set("campaignId", "application-2");
    form.set("statementId", "statement-1");
    const result = await approveConsultationQaResultAction(null, form);
    expect(result.ok).toBe(true);
    expect(approveResult).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        campaignId: "application-2",
        type: "CONSULTATION",
        payload: { operation: "continue" },
      }),
    );
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain("application-1");

    for (const path of [
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const page = readFileSync(path, "utf8");
      expect(page).not.toContain("loadApprovedAnswersForTargets");
      expect(page).not.toContain("selectApprovedAnswersForTargets");
    }
  });
});
