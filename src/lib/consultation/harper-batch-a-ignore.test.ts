import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import {
  askedQuestionsFromTurns,
  planQuestionRound,
  questionDuplicatesAsked,
} from "@/lib/consultation/questions";
import {
  buildConsultationQaView,
  consultationQuestionAcceptsReply,
  isTargetCurrentlyIgnored,
} from "@/lib/consultation/qa-view";
import {
  harperQuestionAnchorId,
  mapOpenGapsToAnswerableQuestions,
} from "@/lib/consultation/harper-layout";
import {
  consultationConfig,
  consultationConversationCopy,
} from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";

describe("Harper Batch A standing Answer / Ignore / reopen", () => {
  it("sets the gap-question cap to 25 as a maximum, not a target", () => {
    expect(consultationConfig.applicationQuestionLimit).toBe(25);
    expect(consultationConfig.roundSize).toBe(25);
    const fewerGaps = planQuestionRound({
      assessments: [
        {
          key: "required:a",
          kind: "REQUIRED",
          text: "Build a partner channel motion",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "ACKNOWLEDGE",
          explanation: "Missing.",
          strategyText: "Ask.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
        {
          key: "required:b",
          kind: "REQUIRED",
          text: "Own a weekly enterprise forecast",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "ACKNOWLEDGE",
          explanation: "Missing.",
          strategyText: "Ask.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
      ],
      modelQuestions: [
        {
          targetKey: "required:a",
          text: "How did you build the partner channel from zero?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "HM needs the channel story.",
        interviewTypeTag: "focused_competency" as const,
        },
        {
          targetKey: "required:b",
          text: "Walk me through a forecast review you owned end to end?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "HM needs the forecast story.",
        interviewTypeTag: "focused_competency" as const,
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(fewerGaps.questions.length).toBe(2);
    expect(fewerGaps.questions.length).toBeLessThan(
      consultationConfig.applicationQuestionLimit,
    );
  });

  it("inserts the application question cap from consultationConfig into the coach prompt", () => {
    const prompt = readFileSync("src/lib/prompt-content/consultation.ts", "utf8");
    expect(prompt).toContain(
      "buildConsultationCoachSystemInstructions",
    );
    expect(prompt).toContain(
      "questionCap: number = consultationConfig.applicationQuestionLimit",
    );
    expect(prompt).toContain(
      "Across the whole application, including questions already asked, there are never more than ${questionCap}.",
    );
    expect(prompt).toContain(
      "or ${questionCap} questions have been asked, set questions to [] and write closingNote",
    );
    expect(prompt).not.toContain(
      "there are never more than 10.",
    );
    expect(prompt).not.toContain(
      "or 10 questions have been asked, set questions to [] and write closingNote",
    );
  });

  it("shows Share+Ignore for gaps without questions; Answer jump removed when question is inline (B2)", () => {
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standing).not.toContain("consultationConversationCopy.answerGap");
    expect(standing).toContain("share-gap-details-");
    expect(standing).toContain("ignore-gap-");
    expect(standing).toContain("ignoreConsultationQuestionAction");
    expect(standing).toContain("QuestionList");
    // Unified standing: share form mounts when entry.showShareForm (no inline questions).
    expect(standing).toMatch(/entry\.showShareForm[\s\S]*GapShareDetailsForm/);
    expect(standing).toContain(
      "submitLabel={consultationConversationCopy.shareSomeDetails}",
    );
    expect(consultationConversationCopy.ignoreQuestion).toBe("Ignore");
    expect(harperQuestionAnchorId("turn-1")).toBe("harper-q:turn-1");
  });

  it("replaces Ignore with Ignored text link for questions and gaps", () => {
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(standing).toContain("reopenIgnoredConsultationTargetAction");
    expect(standing).toContain("reopen-ignored-gap-");
    expect(thread).toContain("consultation-ignored-question");
    expect(thread).toContain("reopenIgnoredConsultationTargetAction");
    expect(thread).toContain("consultation-ignore-question");
    expect(consultationConversationCopy.reopenIgnored).toBe("Ignored");
  });

  it("keeps ignored questions out of planning until reopened", () => {
    const asked = askedQuestionsFromTurns([
      {
        id: "q1",
        speaker: "CONSULTANT",
        body: "Tell me about forecasting?",
        targetKey: "required:forecast",
        followUp: false,
        skipped: false,
      },
      {
        id: "ignore-1",
        speaker: "SEEKER",
        body: "",
        targetKey: "required:forecast",
        followUp: false,
        skipped: true,
        analysisJson: {
          status: "READY",
          replyToTurnId: "q1",
          ignored: true,
        },
      },
    ]);
    expect(asked[0]?.ignored).toBe(true);
    expect(questionDuplicatesAsked("Tell me about forecasting?", asked)).toBe(
      true,
    );
    const round = planQuestionRound({
      assessments: [
        {
          key: "required:forecast",
          kind: "REQUIRED",
          text: "Run a weekly forecast",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "ACKNOWLEDGE",
          explanation: "Missing.",
          strategyText: "Ask.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
      ],
      modelQuestions: [
        {
          targetKey: "required:forecast",
          text: "Walk me through forecasting?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "HM needs this.",
        interviewTypeTag: "focused_competency" as const,
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(["required:forecast"]),
      skippedKeys: new Set(["required:forecast"]),
      includeChronology: false,
      chronologyAsked: false,
      askedQuestions: asked,
    });
    expect(round.questions).toEqual([]);
  });

  it("maps every open standing gap to Answer or Share unless ignored", () => {
    const mapping = mapOpenGapsToAnswerableQuestions({
      gaps: [
        {
          targetKey: "required:with-q",
          label: "With question",
          status: "open",
        },
        {
          targetKey: "required:no-q",
          label: "No question",
          status: "open",
        },
      ],
      requirements: [],
      questions: [
        {
          questionTurnId: "q1",
          targetKey: "required:with-q",
          question: "How do you do it?",
          followUp: null,
          seekerAnswers: [],
          statements: [],
          resumeBullet: null,
          talkingPoint: null,
          ignored: false,
        },
      ],
    });
    expect(
      mapping.mappings.find((row) => row.targetKey === "required:with-q")
        ?.answerableViaQuestion,
    ).toBe(true);
    expect(
      mapping.mappings.find((row) => row.targetKey === "required:no-q")
        ?.answerableViaQuestion,
    ).toBe(false);
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    // Unified standing: share form when entry has no questions; ignore reopen retained.
    expect(standing).toContain("entry.showShareForm");
    expect(standing).toContain("GapShareDetailsForm");
    expect(standing).toContain("ignoredQuestion");
  });

  it("ignore and reopen service paths make no paid plan call", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const ignoreFn = service.slice(
      service.indexOf("export async function ignoreConsultationQuestion"),
      service.indexOf("export async function reopenIgnoredConsultationTarget"),
    );
    const reopenFn = service.slice(
      service.indexOf("export async function reopenIgnoredConsultationTarget"),
      service.indexOf("function completeStoryFromAnalysis"),
    );
    expect(ignoreFn).not.toContain("planAndStoreRound");
    expect(ignoreFn).not.toContain("enqueueApplicationJob");
    expect(ignoreFn).not.toContain("enqueueAssetsAfterConsultation");
    expect(reopenFn).toContain("deleteMany");
    expect(reopenFn).not.toContain("planAndStoreRound");
    expect(reopenFn).not.toContain("enqueueApplicationJob");
    const actions = readFileSync("src/app/actions/consultation.ts", "utf8");
    const reopenAction = actions.slice(
      actions.indexOf("export async function reopenIgnoredConsultationTargetAction"),
      actions.indexOf("export async function confirmConsultationProposalAction"),
    );
    expect(reopenAction).not.toContain("enqueueApplicationJob");
    const ignoreAction = actions.slice(
      actions.indexOf("export async function ignoreConsultationQuestionAction"),
      actions.indexOf("export async function reopenIgnoredConsultationTargetAction"),
    );
    expect(ignoreAction).not.toContain("enqueueApplicationJob");
  });
});

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("Harper Batch A ignore/reopen (Postgres)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let organizationId = "";
  let userId = "";
  let productId = "";
  let icpId = "";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `[TEST] Harper ignore ${suffix}`,
        slug: `harper-ignore-${suffix}`,
      },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `harper-ignore-${suffix}@example.test`,
        emailNormalized: `harper-ignore-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `[TEST] Product ${suffix}`,
        profileJson: {},
      },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: {
        organizationId,
        productId,
        name: `[TEST] ICP ${suffix}`,
      },
    });
    icpId = icp.id;
  });

  afterAll(async () => {
    if (!organizationId) return;
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  });

  it("ignores and reopens a question without planning a new one", async () => {
    const {
      ignoreConsultationQuestion,
      reopenIgnoredConsultationTarget,
    } = await import("@/lib/consultation/service");
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `[TEST] Ignore reopen ${suffix}`,
        productId,
        icpId,
      },
    });
    const session = await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        productId,
        status: "IN_PROGRESS",
        promptVersion: "test",
      },
    });
    await prisma.consultationAssessment.create({
      data: {
        organizationId,
        sessionId: session.id,
        targetKey: "required:forecast",
        kind: "REQUIRED",
        text: "Run a weekly forecast",
        strength: "NONE",
        supportingFactIds: [],
      },
    });
    const question = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: session.id,
        sequence: 1,
        speaker: "CONSULTANT",
        body: "How do you run a weekly forecast?",
        targetKey: "required:forecast",
        followUp: false,
      },
    });

    await ignoreConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: `question:${question.id}`,
    });
    const afterIgnore = await prisma.consultationTurn.findMany({
      where: { sessionId: session.id },
      orderBy: { sequence: "asc" },
    });
    expect(afterIgnore).toHaveLength(2);
    expect(isTargetCurrentlyIgnored(afterIgnore, "required:forecast")).toBe(true);
    const viewIgnored = buildConsultationQaView({
      turns: afterIgnore.map((turn) => ({
        id: turn.id,
        speaker: turn.speaker,
        body: turn.body,
        targetKey: turn.targetKey,
        followUp: turn.followUp,
        sequence: turn.sequence,
        analysisJson: turn.analysisJson,
        intent: turn.intent,
      })),
      statements: [],
    });
    expect(viewIgnored.questions).toHaveLength(1);
    expect(viewIgnored.questions[0]?.ignored).toBe(true);
    expect(consultationQuestionAcceptsReply(viewIgnored.questions[0]!)).toBe(false);

    const consultantCountBefore = await prisma.consultationTurn.count({
      where: { sessionId: session.id, speaker: "CONSULTANT" },
    });
    await reopenIgnoredConsultationTarget({
      organizationId,
      campaignId: campaign.id,
      targetKey: `question:${question.id}`,
    });
    const afterReopen = await prisma.consultationTurn.findMany({
      where: { sessionId: session.id },
      orderBy: { sequence: "asc" },
    });
    expect(afterReopen).toHaveLength(1);
    expect(afterReopen[0]?.id).toBe(question.id);
    expect(isTargetCurrentlyIgnored(afterReopen, "required:forecast")).toBe(false);
    const consultantCountAfter = await prisma.consultationTurn.count({
      where: { sessionId: session.id, speaker: "CONSULTANT" },
    });
    expect(consultantCountAfter).toBe(consultantCountBefore);
    const viewOpen = buildConsultationQaView({
      turns: afterReopen.map((turn) => ({
        id: turn.id,
        speaker: turn.speaker,
        body: turn.body,
        targetKey: turn.targetKey,
        followUp: turn.followUp,
        sequence: turn.sequence,
        analysisJson: turn.analysisJson,
        intent: turn.intent,
      })),
      statements: [],
    });
    expect(viewOpen.questions[0]?.ignored).toBe(false);
    expect(consultationQuestionAcceptsReply(viewOpen.questions[0]!)).toBe(true);
    void WHY_THIS_COMPANY_TARGET_KEY;
  });

  it("ignores a gap with no question and reopens to Share-some-details state", async () => {
    const {
      ignoreConsultationQuestion,
      reopenIgnoredConsultationTarget,
    } = await import("@/lib/consultation/service");
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `[TEST] Gap ignore ${suffix}`,
        productId,
        icpId,
      },
    });
    const session = await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        productId,
        status: "IN_PROGRESS",
        promptVersion: "test",
      },
    });
    await prisma.consultationAssessment.create({
      data: {
        organizationId,
        sessionId: session.id,
        targetKey: "required:channel",
        kind: "REQUIRED",
        text: "Build a channel motion",
        strength: "NONE",
        supportingFactIds: [],
      },
    });

    await ignoreConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: "required:channel",
    });
    const ignored = await prisma.consultationTurn.findMany({
      where: { sessionId: session.id },
    });
    expect(ignored).toHaveLength(1);
    expect(ignored[0]?.speaker).toBe("SEEKER");
    expect(isTargetCurrentlyIgnored(ignored, "required:channel")).toBe(true);
    expect(
      await prisma.consultationTurn.count({
        where: { sessionId: session.id, speaker: "CONSULTANT" },
      }),
    ).toBe(0);

    await reopenIgnoredConsultationTarget({
      organizationId,
      campaignId: campaign.id,
      targetKey: "required:channel",
    });
    expect(
      await prisma.consultationTurn.count({ where: { sessionId: session.id } }),
    ).toBe(0);
  });
});
