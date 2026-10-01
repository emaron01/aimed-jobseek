import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const generateStructured = vi.hoisted(() => vi.fn());
const generateReplyStructured = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured: () => true,
    isConsultationReplyAiConfigured: () => true,
    getConsultationAiProvider: () => ({ generateStructured }),
    getConsultationReplyAiProvider: () => ({
      generateStructured: generateReplyStructured,
    }),
  };
});

vi.mock("@/lib/usage/events-service", () => ({
  recordUsageEvent: vi.fn(),
  sanitizeUsageMetadata: (metadata: Record<string, unknown> | null | undefined) =>
    metadata ?? undefined,
}));

import { wipeOrganizationAccount } from "@/lib/account/wipe-organization";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";
import {
  HARPER_LIBRARY_TAILOR_INSTRUCTION,
  findHarperLibraryMatch,
  harperLibraryContentHash,
} from "@/lib/consultation/harper-library";
import { questionNearDuplicate } from "@/lib/consultation/questions";
import { questionTextNearDuplicate } from "@/lib/consultation/general-question-match";
import { buildConsultationPolishMessages } from "@/lib/consultation/prompt";
import { polishAnswerWithQuality } from "@/lib/consultation/service";
import {
  ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION,
  ROLE_EXPERTISE_PROMPT_VERSION,
  generateRoleExpertiseWithModel,
  roleExpertiseAnswersFingerprint,
  roleExpertiseJobFingerprint,
  storeRoleExpertiseQuestions,
} from "@/lib/consultation/role-expertise";
import { ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";
import { CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";

const FORECAST =
  "How do you run a weekly sales forecast review with the team?";
const INTENT_LEFT = "Walk me through your career path starting with your first employer.";
const INTENT_RIGHT = "Walk me through your roles and why you moved on.";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

function carAnswer(text: string) {
  return {
    text,
    answerFramework: "CAR" as const,
    challenge: "The Monday forecast review kept slipping.",
    situation: null,
    task: null,
    action: "I rebuilt the review around the commits we already had.",
    result: "The team caught slip before the quarter closed.",
  };
}

describe("Harper library instructions and fingerprint", () => {
  it("adds the approved tailor sentence to both instructions and no other prompt family", () => {
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).toContain(
      HARPER_LIBRARY_TAILOR_INSTRUCTION,
    );
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(
      HARPER_LIBRARY_TAILOR_INSTRUCTION,
    );
    expect(HARPER_LIBRARY_TAILOR_INSTRUCTION).toBe(
      "When a prior approved answer is supplied, tailor it to this company and role. Replace anything about the previous company with this company's information; never carry it over. Do not add employers, numbers, titles, or outcomes that are not in the supplied answer or the Personal Profile.",
    );
    expect(ROLE_EXPERTISE_PROMPT_VERSION).toBe("3");
    expect(ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION).toBe("4");
  });

  it("puts an explicit empty library match in the answers fingerprint and changes it when the source content changes", () => {
    const questions = [
      { text: FORECAST, interviewTypeTag: "focused_competency" as const },
    ];
    const empty = roleExpertiseAnswersFingerprint(questions);
    const filled = roleExpertiseAnswersFingerprint(questions, [
      { statementId: "stmt_1", contentHash: harperLibraryContentHash("At Northwind I rebuilt the review.") },
    ]);
    const edited = roleExpertiseAnswersFingerprint(questions, [
      { statementId: "stmt_1", contentHash: harperLibraryContentHash("At Northwind I rebuilt the review and named the owner.") },
    ]);
    expect(empty).not.toBe(filled);
    expect(filled).not.toBe(edited);
    expect(roleExpertiseAnswersFingerprint(questions)).toBe(empty);
    const job = {
      title: "Sales Director",
      companyName: "Contoso",
      seniority: null,
      location: null,
      workArrangement: null,
      requiredItems: [],
      preferredItems: [],
      responsibilities: [],
      scorecardJson: {},
    };
    expect(roleExpertiseJobFingerprint(job)).toBe(roleExpertiseJobFingerprint(job));
    const jobFn = src("src/lib/consultation/role-expertise.ts").slice(
      src("src/lib/consultation/role-expertise.ts").indexOf(
        "export function roleExpertiseJobFingerprint",
      ),
      src("src/lib/consultation/role-expertise.ts").indexOf(
        "export function roleExpertiseAnswersFingerprint",
      ),
    );
    expect(jobFn).toContain("ROLE_EXPERTISE_PROMPT_VERSION");
    expect(jobFn).not.toContain("ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION");
    expect(jobFn).not.toContain("libraryMatch");
  });

  it("passes a prior answer to polish only beside seeker replies, and seeker replies take precedence", () => {
    const prior = {
      statementId: "stmt_prior",
      question: FORECAST,
      content: "At Northwind I rebuilt the Monday forecast review.",
    };
    const withReply = buildConsultationPolishMessages({
      answer: "I rebuilt the forecast review at Contoso.",
      seekerReplies: ["I rebuilt the forecast review at Contoso."],
      story: { situation: null, task: null, action: null, result: null },
      declinedFollowUp: false,
      strengtheningNeeds: [],
      careerStage: "mid_career",
      profileItems: [],
      priorApprovedAnswer: prior,
    });
    const payload = JSON.parse(withReply[2]?.content ?? "{}") as {
      seekerReplies: string[];
      priorApprovedAnswer: typeof prior | null;
      seekerRepliesTakePrecedenceOverPriorApprovedAnswer: boolean;
      latestReplyTakesPrecedence: boolean;
    };
    expect(payload.priorApprovedAnswer).toEqual(prior);
    expect(payload.seekerReplies).toEqual([
      "I rebuilt the forecast review at Contoso.",
    ]);
    expect(payload.seekerRepliesTakePrecedenceOverPriorApprovedAnswer).toBe(true);
    expect(payload.latestReplyTakesPrecedence).toBe(true);

    const withoutReply = buildConsultationPolishMessages({
      answer: "",
      seekerReplies: [],
      story: { situation: null, task: null, action: null, result: null },
      declinedFollowUp: false,
      strengtheningNeeds: [],
      careerStage: "mid_career",
      profileItems: [],
    });
    const emptyPayload = JSON.parse(withoutReply[2]?.content ?? "{}") as {
      priorApprovedAnswer: unknown;
      seekerRepliesTakePrecedenceOverPriorApprovedAnswer: boolean;
    };
    expect(emptyPayload.priorApprovedAnswer).toBeNull();
    expect(emptyPayload.seekerRepliesTakePrecedenceOverPriorApprovedAnswer).toBe(
      false,
    );
  });

  it("does not look up the library or enqueue work from a page render, and existing role-expertise questions still skip a re-run", () => {
    for (const path of [
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ConsultationSection.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("findHarperLibraryMatch");
      expect(text).not.toContain("runPaidStructuredCall");
      expect(text).not.toContain("enqueueApplicationJob");
    }
    const service = src("src/lib/consultation/service.ts");
    const fill = service.slice(
      service.indexOf("async function maybeFillRoleExpertiseAfterGapPlan"),
      service.indexOf("export async function startConsultation"),
    );
    const skip = fill.indexOf("if (usable && existingRoleExpertise >= minCount) return;");
    const generate = fill.indexOf("generateRoleExpertiseWithModel");
    expect(skip).toBeGreaterThan(-1);
    expect(generate).toBeGreaterThan(skip);
    const roleExpertise = src("src/lib/consultation/role-expertise.ts");
    const store = roleExpertise.slice(
      roleExpertise.indexOf("export async function storeRoleExpertiseQuestions"),
      roleExpertise.indexOf("export async function hasUsableRoleExpertiseReceipt"),
    );
    expect(store).toContain("if (existing) continue;");
    expect(store).toContain('status: "DRAFT"');
    expect(store).not.toContain('status: "APPROVED"');
  });
});

describe.skipIf(!hasTestDatabase())("Harper library lookup", { timeout: 60_000 }, () => {
  const suffix = Date.now().toString(36);
  let organizationId = "";
  let otherOrganizationId = "";
  let currentCampaignId = "";
  let currentSessionId = "";
  let pastCampaignId = "";

  async function seedCampaign(orgId: string, userId: string, productId: string, icpId: string, name: string) {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId: orgId,
        ownerUserId: userId,
        productId,
        icpId,
        name,
      },
    });
    const session = await prisma.consultationSession.create({
      data: {
        organizationId: orgId,
        campaignId: campaign.id,
        productId,
        promptVersion: "1",
      },
    });
    return { campaignId: campaign.id, sessionId: session.id };
  }

  async function seedApproved(input: {
    organizationId: string;
    sessionId: string;
    question: string;
    tag: "screening" | "chronological_walk_through" | "focused_competency" | "reference_check_prep";
    content: string;
    approvedAt: Date;
    status?: "APPROVED" | "DRAFT";
  }) {
    const latest = await prisma.consultationTurn.findFirst({
      where: { sessionId: input.sessionId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const turn = await prisma.consultationTurn.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sequence: (latest?.sequence ?? 0) + 1,
        speaker: "CONSULTANT",
        body: input.question,
        targetKey: "role-expertise:forecast",
        questionContextJson: {
          requirementInterpretation: null,
          hiringTeamRoleId: "",
          whoCaresNote: "",
          interviewTypeTag: input.tag,
        },
      },
    });
    return prisma.consultationStatement.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        turnId: turn.id,
        kind: "INTERVIEW_ANSWER",
        status: input.status ?? "APPROVED",
        content: input.content,
        groundingJson: [],
        promptVersion: "1",
        approvedAt: input.status === "DRAFT" ? null : input.approvedAt,
      },
    });
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: `[TEST] Harper library ${suffix}`, slug: `harper-lib-${suffix}` },
    });
    organizationId = organization.id;
    const other = await prisma.organization.create({
      data: { name: `[TEST] Harper library other ${suffix}`, slug: `harper-lib-other-${suffix}` },
    });
    otherOrganizationId = other.id;
    const user = await prisma.user.create({
      data: {
        email: `harper-lib-${suffix}@example.test`,
        emailNormalized: `harper-lib-${suffix}@example.test`,
      },
    });
    const product = await prisma.product.create({
      data: { organizationId, name: `Profile ${suffix}`, profileJson: {} },
    });
    const icp = await prisma.icp.create({
      data: {
        organizationId,
        productId: product.id,
        name: `Employer ${suffix}`,
        targetAnnualEarningsTarget: 120000,
        compensationCurrency: "USD",
      },
    });
    const current = await seedCampaign(organizationId, user.id, product.id, icp.id, `Current ${suffix}`);
    currentCampaignId = current.campaignId;
    currentSessionId = current.sessionId;
    const past = await seedCampaign(organizationId, user.id, product.id, icp.id, `Past ${suffix}`);
    pastCampaignId = past.campaignId;
    const older = await seedCampaign(organizationId, user.id, product.id, icp.id, `Older ${suffix}`);
    const otherProduct = await prisma.product.create({
      data: { organizationId: otherOrganizationId, name: `Other ${suffix}`, profileJson: {} },
    });
    const otherUser = await prisma.user.create({
      data: {
        email: `harper-lib-other-${suffix}@example.test`,
        emailNormalized: `harper-lib-other-${suffix}@example.test`,
      },
    });
    const otherIcp = await prisma.icp.create({
      data: {
        organizationId: otherOrganizationId,
        productId: otherProduct.id,
        name: `Other employer ${suffix}`,
        targetAnnualEarningsTarget: 120000,
        compensationCurrency: "USD",
      },
    });
    const foreign = await seedCampaign(
      otherOrganizationId,
      otherUser.id,
      otherProduct.id,
      otherIcp.id,
      `Foreign ${suffix}`,
    );

    await seedApproved({
      organizationId,
      sessionId: older.sessionId,
      question: FORECAST,
      tag: "focused_competency",
      content: "At Fabrikam I ran the forecast from a spreadsheet.",
      approvedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await seedApproved({
      organizationId,
      sessionId: past.sessionId,
      question: FORECAST,
      tag: "focused_competency",
      content: "At Northwind I rebuilt the Monday forecast review.",
      approvedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    await seedApproved({
      organizationId,
      sessionId: past.sessionId,
      question: INTENT_LEFT,
      tag: "chronological_walk_through",
      content: "I started at a clinic and moved into hospital operations.",
      approvedAt: new Date("2026-06-02T00:00:00.000Z"),
    });
    await seedApproved({
      organizationId,
      sessionId: current.sessionId,
      question: FORECAST,
      tag: "focused_competency",
      content: "This application's own approved answer must stay out of the lookup.",
      approvedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await seedApproved({
      organizationId,
      sessionId: past.sessionId,
      question: "How do you run a weekly sales forecast review with the team?",
      tag: "screening",
      content: "A different tag must not win.",
      approvedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    await seedApproved({
      organizationId,
      sessionId: past.sessionId,
      question: FORECAST,
      tag: "focused_competency",
      content: "A draft is not a library source.",
      approvedAt: new Date("2026-09-02T00:00:00.000Z"),
      status: "DRAFT",
    });
    await seedApproved({
      organizationId: otherOrganizationId,
      sessionId: foreign.sessionId,
      question: FORECAST,
      tag: "focused_competency",
      content: "Another organization's approved answer.",
      approvedAt: new Date("2026-09-03T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationId, otherOrganizationId].filter(Boolean) } },
    });
  });

  it("returns the newest approved answer from another application and ignores the other cases", async () => {
    const match = await findHarperLibraryMatch({
      organizationId,
      campaignId: currentCampaignId,
      question: FORECAST,
      interviewTypeTag: "focused_competency",
    });
    expect(match?.content).toBe("At Northwind I rebuilt the Monday forecast review.");
    expect(match?.question).toBe(FORECAST);

    const currentOnly = await findHarperLibraryMatch({
      organizationId,
      campaignId: pastCampaignId,
      question: "How do you inspect a warehouse pick path for accuracy?",
      interviewTypeTag: "focused_competency",
    });
    expect(currentOnly).toBeNull();

    expect(questionNearDuplicate(INTENT_LEFT, INTENT_RIGHT)).toBe(true);
    expect(questionTextNearDuplicate(INTENT_LEFT, INTENT_RIGHT)).toBe(false);
    const intent = await findHarperLibraryMatch({
      organizationId,
      campaignId: currentCampaignId,
      question: INTENT_RIGHT,
      interviewTypeTag: "chronological_walk_through",
    });
    expect(intent).toBeNull();

    const otherOrg = await findHarperLibraryMatch({
      organizationId: otherOrganizationId,
      campaignId: "not-the-foreign-campaign",
      question: FORECAST,
      interviewTypeTag: "focused_competency",
    });
    expect(otherOrg?.content).toBe("Another organization's approved answer.");
    const crossed = await findHarperLibraryMatch({
      organizationId,
      campaignId: currentCampaignId,
      question: FORECAST,
      interviewTypeTag: "focused_competency",
    });
    expect(crossed?.content).not.toBe("Another organization's approved answer.");
  });

  it("stores a library-seeded role-expertise answer as a draft and skips a second provider call until the source content changes", async () => {
    generateStructured.mockReset();
    generateReplyStructured.mockReset();
    generateStructured.mockResolvedValue({
      data: {
        questions: [{ text: FORECAST, interviewTypeTag: "focused_competency" }],
      },
    });
    generateReplyStructured.mockResolvedValue({
      data: { answers: [carAnswer(FORECAST)] },
    });
    const job = {
      title: "Sales Director",
      companyName: "Contoso",
      seniority: "director",
      location: null,
      workArrangement: null,
      requiredItems: ["Forecast discipline"],
      preferredItems: [],
      responsibilities: ["Run the weekly forecast"],
      scorecardJson: {},
    };
    const first = await generateRoleExpertiseWithModel({
      organizationId,
      campaignId: currentCampaignId,
      job,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "mid_career",
      profileItems: [],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const answerCall = generateReplyStructured.mock.calls[0]?.[0] as {
      messages?: Array<{ content: string }>;
    };
    const user = JSON.parse(answerCall.messages?.[1]?.content ?? "{}") as {
      questions: Array<{
        priorApprovedAnswer: { statementId: string; content: string } | null;
      }>;
    };
    expect(user.questions[0]?.priorApprovedAnswer?.content).toBe(
      "At Northwind I rebuilt the Monday forecast review.",
    );
    const receipt = await prisma.paidCallReceipt.findFirst({
      where: {
        organizationId,
        operation: "ROLE_EXPERTISE_ANSWERS",
        subjectKey: currentCampaignId,
      },
    });
    expect(receipt).not.toBeNull();

    await storeRoleExpertiseQuestions({
      organizationId,
      sessionId: currentSessionId,
      questions: first.questions,
    });
    const stored = await prisma.consultationStatement.findFirst({
      where: { sessionId: currentSessionId, kind: "INTERVIEW_ANSWER" },
      orderBy: { createdAt: "desc" },
    });
    expect(stored?.status).toBe("DRAFT");
    expect(stored?.status).not.toBe("APPROVED");
    await storeRoleExpertiseQuestions({
      organizationId,
      sessionId: currentSessionId,
      questions: first.questions,
    });
    const turns = await prisma.consultationTurn.count({
      where: { sessionId: currentSessionId, targetKey: first.questions[0]?.targetKey },
    });
    expect(turns).toBe(1);

    const second = await generateRoleExpertiseWithModel({
      organizationId,
      campaignId: currentCampaignId,
      job,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "mid_career",
      profileItems: [{ id: "new-profile-fact", text: "unchanged inputs still skip" }],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.answersSkipped).toBe(true);
    expect(second.questionsSkipped).toBe(true);
    expect(generateReplyStructured).toHaveBeenCalledTimes(1);
    expect(generateStructured).toHaveBeenCalledTimes(1);

    await prisma.consultationStatement.updateMany({
      where: {
        organizationId,
        sessionId: { not: currentSessionId },
        content: "At Northwind I rebuilt the Monday forecast review.",
      },
      data: { content: "At Northwind I rebuilt the Monday forecast review and named a single owner." },
    });
    const third = await generateRoleExpertiseWithModel({
      organizationId,
      campaignId: currentCampaignId,
      job,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "mid_career",
      profileItems: [],
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.questionsSkipped).toBe(true);
    expect(third.answersSkipped).toBe(false);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(generateReplyStructured).toHaveBeenCalledTimes(2);
    const editedCall = generateReplyStructured.mock.calls[1]?.[0] as {
      messages?: Array<{ content: string }>;
    };
    expect(editedCall.messages?.[1]?.content).toContain(
      "named a single owner",
    );
  });

  it("includes the prior answer in polish only after the seeker has replied", async () => {
    generateReplyStructured.mockReset();
    generateReplyStructured.mockResolvedValue({
      data: {
        answerFramework: "CAR",
        interviewAnswer: null,
        challenge: "The Monday forecast review kept slipping.",
        situation: null,
        task: null,
        action: "I rebuilt the review around the commits we already had.",
        result: "The team caught slip before the quarter closed.",
        resumeBullet: "Rebuilt the Monday forecast review.",
        strengtheningNote: null,
      },
    });
    const polished = await polishAnswerWithQuality({
      answer: "I rebuilt the forecast review at Contoso.",
      seekerReplies: ["I rebuilt the forecast review at Contoso."],
      story: { situation: null, task: null, action: null, result: null },
      sources: [{ id: "answer:1", text: "I rebuilt the forecast review at Contoso." }],
      declinedFollowUp: false,
      strengtheningNeeds: [],
      profileItems: [],
      libraryQuestion: {
        organizationId,
        campaignId: currentCampaignId,
        question: FORECAST,
        interviewTypeTag: "focused_competency",
      },
    });
    expect(polished.ok).toBe(true);
    const payload = JSON.parse(
      generateReplyStructured.mock.calls[0]?.[0]?.messages?.[2]?.content ?? "{}",
    ) as {
      priorApprovedAnswer: { content: string } | null;
      seekerReplies: string[];
      seekerRepliesTakePrecedenceOverPriorApprovedAnswer: boolean;
    };
    expect(payload.priorApprovedAnswer?.content).toContain("Northwind");
    expect(payload.seekerReplies[0]).toContain("Contoso");
    expect(payload.seekerRepliesTakePrecedenceOverPriorApprovedAnswer).toBe(true);

    generateReplyStructured.mockClear();
    await polishAnswerWithQuality({
      answer: "",
      seekerReplies: [],
      story: { situation: null, task: null, action: null, result: null },
      sources: [],
      declinedFollowUp: false,
      strengtheningNeeds: [],
      profileItems: [],
      libraryQuestion: {
        organizationId,
        campaignId: currentCampaignId,
        question: FORECAST,
        interviewTypeTag: "focused_competency",
      },
    });
    const empty = JSON.parse(
      generateReplyStructured.mock.calls[0]?.[0]?.messages?.[2]?.content ?? "{}",
    ) as { priorApprovedAnswer: unknown };
    expect(empty.priorApprovedAnswer).toBeNull();
  });

  it("returns nothing from an organization after wipeOrganizationAccount", async () => {
    const wipedId = organizationId;
    await wipeOrganizationAccount({ organizationId: wipedId, reason: "admin" });
    organizationId = "";
    const gone = await findHarperLibraryMatch({
      organizationId: wipedId,
      campaignId: currentCampaignId,
      question: FORECAST,
      interviewTypeTag: "focused_competency",
    });
    expect(gone).toBeNull();
    const remaining = await prisma.consultationStatement.count({
      where: { organizationId: wipedId },
    });
    expect(remaining).toBe(0);
  });
});
