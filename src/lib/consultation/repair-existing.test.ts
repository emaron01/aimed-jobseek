import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import {
  coachingSpeaksAsSeekerI,
  isTemplatedUnseenQuestion,
} from "@/lib/consultation/repair-existing";
import { hasTestDatabase } from "@/test/database";

describe("existing consultation repair", () => {
  it("removes templated unseen questions, mission ratings, and interviewer-prep gaps", () => {
    expect(
      isTemplatedUnseenQuestion(
        "Do you have experience with Join us to help protect the world's most valuable digital brands that Harper does not see?",
      ),
    ).toBe(true);
    const repair = readFileSync("src/lib/consultation/repair-existing.ts", "utf8");
    expect(repair).toContain("isTemplatedUnseenQuestion");
    expect(repair).toContain("questionNearDuplicate");
    expect(repair).toContain("isCompanyMissionOrTagline");
    expect(repair).toContain("isInterviewerPrepTarget");
    expect(repair).not.toContain("looksLikeCompanyMotivation");
    expect(repair).not.toContain("seekerWrittenReply");
    expect(repair).not.toContain("looksLikeWorkStory");
    expect(repair).toContain('status: "IN_PROGRESS"');
    expect(repair).toContain("coachingSpeaksAsSeekerI");
    expect(repair).toContain("firstPersonCoachingRepairedAt");
    expect(
      coachingSpeaksAsSeekerI("Which MEDDIC elements did I inspect?"),
    ).toBe(true);
    expect(
      coachingSpeaksAsSeekerI("Which MEDDIC elements did you inspect?"),
    ).toBe(false);
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    expect(service).toContain("repairExistingConsultationSession");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).toContain("prepareExistingConsultationSession");
    const standing = readFileSync(
      "src/components/ConsultationStanding.tsx",
      "utf8",
    );
    expect(standing).toContain("shareSomeDetails");
    expect(standing).toContain("replyConsultationAction");
    expect(standing).toContain("ResultActions");
    expect(standing).not.toContain("consultationConversationCopy.whereYouStand");
  });
});

describe.skipIf(!hasTestDatabase())("existing consultation repair on stored sessions", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";
  let icpId = "";
  let campaignId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const org = await prisma.organization.create({
      data: { name: `[TEST] Repair ${suffix}`, slug: `repair-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `repair-${suffix}@example.test`,
        emailNormalized: `repair-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        profileJson: { identity: { name: { text: "Alex Chen" } } },
      },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId, name: `Employer ${suffix}` },
    });
    icpId = icp.id;
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `CSC repair ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "I have built OpenText's ARM products by retooling GTM.",
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("repairs a production-shaped CSC session", async () => {
    const { repairExistingConsultationSession } = await import(
      "@/lib/consultation/repair-existing"
    );
    const session = await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId,
        productId,
        status: "SKIPPED",
        promptVersion: "19",
      },
    });
    const cscMission =
      "Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.";
    const motivation =
      "They are a global company we compete with today. Winning culture and known to be an outstanding employer with forward-thinking leadership.";
    await prisma.consultationTurn.createMany({
      data: [
        {
          organizationId,
          sessionId: session.id,
          sequence: 1,
          speaker: "CONSULTANT",
          body: `Do you have experience with ${cscMission} that Harper does not see?`,
          targetKey: "required:0",
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 2,
          speaker: "CONSULTANT",
          body: "Walk me through your career, starting with the earliest relevant role.",
          targetKey: "chronology",
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 3,
          speaker: "CONSULTANT",
          body: "Walk me through your career, starting with the earliest relevant role and the dates.",
          targetKey: "chronology",
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 4,
          speaker: "CONSULTANT",
          body: "Walk me through your career from the beginning.",
          targetKey: "chronology",
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 5,
          speaker: "CONSULTANT",
          body: "Why do you want to work at this company?",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 6,
          speaker: "SEEKER",
          body: motivation,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          seekerAuthored: true,
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 7,
          speaker: "SEEKER",
          body: "I have built OpenText's ARM products by completely retool the GTM.",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          seekerAuthored: true,
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 8,
          speaker: "SEEKER",
          body: "I have built OpenText's ARM products. He also reports building the business from under $2M to $6.8M.",
          targetKey: "required:arm",
          seekerAuthored: true,
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 9,
          speaker: "CONSULTANT",
          body: "The question plan is complete.",
          targetKey: null,
          intent: "CLOSING",
        },
        {
          organizationId,
          sessionId: session.id,
          sequence: 10,
          speaker: "CONSULTANT",
          body: "The question plan is complete.",
          targetKey: null,
          intent: "CLOSING",
        },
      ],
    });
    const whyStory = await prisma.consultationTurn.findFirst({
      where: {
        sessionId: session.id,
        speaker: "SEEKER",
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        body: { contains: "OpenText" },
      },
    });
    const armReply = await prisma.consultationTurn.findFirst({
      where: { sessionId: session.id, targetKey: "required:arm" },
    });
    const chronologyKept = await prisma.consultationTurn.findFirst({
      where: {
        sessionId: session.id,
        speaker: "CONSULTANT",
        targetKey: "chronology",
        body: "Walk me through your career from the beginning.",
      },
    });
    await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: session.id,
        turnId: whyStory!.id,
        kind: "INTERVIEW_ANSWER",
        content: "I built OpenText ARM.",
        groundingJson: {},
        promptVersion: "19",
      },
    });
    await prisma.consultationAssessment.createMany({
      data: [
        {
          organizationId,
          sessionId: session.id,
          targetKey: "required:0",
          kind: "REQUIRED",
          text: cscMission,
          strength: "NONE",
          supportingFactIds: [],
        },
        {
          organizationId,
          sessionId: session.id,
          targetKey: "person-prep:christina",
          kind: "COMPETENCY",
          text: "Harper prepares the seeker for Christina Schivley",
          strength: "NONE",
          supportingFactIds: [],
        },
        {
          organizationId,
          sessionId: session.id,
          targetKey: "required:channel",
          kind: "REQUIRED",
          text: "Build and lead a partner and channel motion",
          strength: "NONE",
          supportingFactIds: [],
        },
        {
          organizationId,
          sessionId: session.id,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          kind: "MISSION",
          text: "Why you want to work at this company",
          strength: "PARTIAL",
          supportingFactIds: [],
        },
      ],
    });

    const result = await repairExistingConsultationSession({
      organizationId,
      campaignId,
    });
    expect(result.repaired).toBe(true);

    const turns = await prisma.consultationTurn.findMany({
      where: { sessionId: session.id },
      orderBy: { sequence: "asc" },
    });
    expect(turns.some((turn) => /does not see/i.test(turn.body))).toBe(false);
    const chronology = turns.filter(
      (turn) => turn.speaker === "CONSULTANT" && turn.targetKey === "chronology",
    );
    expect(chronology).toHaveLength(1);
    expect(chronology[0]?.id).toBe(chronologyKept?.id);
    expect(
      turns.find((turn) => turn.id === armReply?.id)?.body,
    ).toBe(
      "I have built OpenText's ARM products. He also reports building the business from under $2M to $6.8M.",
    );
    const assessments = await prisma.consultationAssessment.findMany({
      where: { sessionId: session.id },
    });
    expect(assessments.some((row) => /Join us to help protect/i.test(row.text))).toBe(
      false,
    );
    expect(assessments.some((row) => row.targetKey.startsWith("person-prep:"))).toBe(
      false,
    );
    expect(
      assessments.some((row) => row.targetKey === WHY_THIS_COMPANY_TARGET_KEY),
    ).toBe(true);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    expect(campaign?.whyThisCompany).toBe(
      "I have built OpenText's ARM products by retooling GTM.",
    );
    const statements = await prisma.consultationStatement.findMany({
      where: { sessionId: session.id },
    });
    expect(statements.every((row) => row.turnId === whyStory?.id)).toBe(true);
    const repairedSession = await prisma.consultationSession.findUnique({
      where: { id: session.id },
    });
    expect(repairedSession?.status).toBe("IN_PROGRESS");
  });
});
