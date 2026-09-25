import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";

const generateStructured = vi.hoisted(() => vi.fn());
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
  };
});

import {
  generateApplicationSummary,
  getApplicationSummaryView,
} from "@/lib/application-summary/service";

describe.skipIf(!hasTestDatabase())("Application Summary", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let requirementId = "";
  let researchId = "";
  let roleId = "";
  let assessmentId = "";
  let statementId = "";
  let capturedSources: Array<{ id: string; text: string; category: string }> = [];

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const organization = await prisma.organization.create({
      data: { name: `[TEST] Summary ${suffix}`, slug: `summary-${suffix}` },
    });
    organizationId = organization.id;
    const user = await prisma.user.create({
      data: {
        email: `summary-${suffix}@example.test`,
        emailNormalized: `summary-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Candidate ${suffix}`,
        profileJson: fixtureAlexChenProfile(),
      },
    });
    const icp = await prisma.icp.create({
      data: {
        organizationId,
        productId: product.id,
        name: `Target employer ${suffix}`,
        targetAnnualEarningsTarget: 999000,
        compensationCurrency: "USD",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        productId: product.id,
        icpId: icp.id,
        name: `Application ${suffix}`,
      },
    });
    campaignId = campaign.id;
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Acme ${suffix}`,
        normalizedName: `acme-${suffix}`,
      },
    });
    const requirement = await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        companyId: company.id,
        rawText:
          "Director of Enterprise Sales. Reports to VP Sales. Remote. Compensation $180,000 OTE. Build a repeatable enterprise motion.",
        title: "Director of Enterprise Sales",
        reportingLine: "VP Sales",
        location: "Remote",
        workArrangement: "Remote",
        compensationRange: "$180,000 OTE",
        requiredItems: ["Build a repeatable enterprise motion"],
        preferredItems: [],
        responsibilities: ["Lead enterprise sales"],
        scorecardJson: {
          mission: {
            id: "mission:sales",
            text: "Build a repeatable enterprise motion",
            inferred: false,
          },
          outcomes: [],
          competencies: [],
        },
      },
    });
    requirementId = requirement.id;
    const research = await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        companySummary: "Acme sells warehouse software and recently expanded.",
        whatTheySell: "Warehouse operations software",
        customerTypes: ["Enterprise logistics teams"],
        companySizeContext: "Growth-stage, about 300 employees",
        hiringSignals: ["Opened a new sales region"],
        riskSignals: ["A crowded market"],
      },
    });
    researchId = research.id;
    const role = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        name: "Hiring Manager",
        targetTitles: ["VP Sales"],
        whyThisPersonaMatters: "Owns the enterprise revenue plan and hiring decision.",
        profileJson: {
          involvement: "DIRECT",
          narrative: {
            overview: {
              text: "Owns enterprise revenue and sales capacity.",
              kind: "FACT",
            },
            impact: {
              text: "This hire takes ownership of repeatable enterprise execution.",
              kind: "INFERENCE",
            },
            concerns: [
              {
                text: "Whether the candidate can build process while carrying a number.",
                kind: "INFERENCE",
              },
            ],
            talkingPoints: [
              {
                text: "Discuss building a disciplined sales motion.",
                kind: "INFERENCE",
              },
            ],
          },
        },
      },
    });
    roleId = role.id;
    const session = await prisma.consultationSession.create({
      data: {
        organizationId,
        campaignId,
        productId: product.id,
        promptVersion: "3",
      },
    });
    const assessment = await prisma.consultationAssessment.create({
      data: {
        organizationId,
        sessionId: session.id,
        targetKey: "mission:sales",
        kind: "MISSION",
        text: "Build a repeatable enterprise motion",
        strength: "PARTIAL",
        supportingFactIds: ["ach_1"],
        explanation: "The candidate has adjacent process-building evidence.",
        strategy: "REFRAME_ADJACENT",
        strategyText: "Connect the operating cadence to enterprise sales execution.",
      },
    });
    assessmentId = assessment.id;
    const turn = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: session.id,
        sequence: 1,
        speaker: "SEEKER",
        body: "I built a weekly operating cadence and reduced failed jobs by 40%.",
        seekerAuthored: true,
      },
    });
    const statement = await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: session.id,
        turnId: turn.id,
        kind: "INTERVIEW_ANSWER",
        status: "APPROVED",
        content:
          "I built a weekly operating cadence and reduced failed jobs by 40%.",
        groundingJson: [],
        promptVersion: "3",
        approvedAt: new Date(),
      },
    });
    statementId = statement.id;
    await prisma.profileStory.create({
      data: {
        organizationId,
        productId: product.id,
        consultationTurnId: turn.id,
        situation: turn.body,
        task: turn.body,
        action: turn.body,
        result: turn.body,
        competencyLinks: [
          { id: "mission:sales", text: "Build a repeatable enterprise motion" },
        ],
        verbatimAnswer: turn.body,
        interviewAnswer: statement.content,
        interviewAnswerApprovedAt: new Date(),
      },
    });
  });

  beforeEach(() => {
    capturedSources = [];
    isConsultationAiConfigured.mockReturnValue(true);
    generateStructured.mockReset();
    generateStructured.mockImplementation(async (request: {
      messages: Array<{ content: string }>;
    }) => {
      const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
        allowedSources: Array<{ id: string; text: string; category: string }>;
        people: Array<{
          sectionKey: string;
          roleId: string;
          contactId: string | null;
          heading: string;
          sectionKind: "RECRUITER" | "HIRING_MANAGER" | "EXECUTIVE" | "CROSS_FUNCTIONAL";
        }>;
      };
      capturedSources = payload.allowedSources;
      const source = payload.allowedSources[0]!;
      const item = {
        text: source.text,
        supports: [{ sourceId: source.id, quote: source.text }],
      };
      const question = {
        text: `What should I be ready to discuss about ${source.text}?`,
        supports: [{ sourceId: source.id, quote: source.text }],
      };
      return {
        data: {
          overview: {
            thirtySecondFit: item,
            careerRecap: item,
            gapsToPrepare: [item, item],
          },
          stories: [
            {
              storyId: "story-1",
              headline: "Operating cadence",
              situation: source.text,
              answers: [{ requirement: source.text, question: question.text }],
              variations: [
                { angle: "Forecast discipline", text: `${source.text} forecast`, supports: item.supports },
                { angle: "Manager coaching", text: `${source.text} coaching`, supports: item.supports },
              ],
            },
          ],
          people: payload.people.map((person) => ({
            sectionKey: person.sectionKey,
            roleId: person.roleId,
            contactId: person.contactId,
            heading: person.heading,
            sectionKind: person.sectionKind,
            caresAbout: [item],
            bestMaterial: [item],
            likelyQuestions: [question],
            questionsToAsk: [question],
            storyIds: ["story-1"],
            recruiter:
              person.sectionKind === "RECRUITER"
                ? {
                    sixtySecondSummary: item,
                    whyThisCompany: item,
                    whyThisRole: item,
                    logistics: item,
                    compensationReadiness: item,
                    flagAnswers: [item],
                  }
                : null,
            hiringManager:
              person.sectionKind === "HIRING_MANAGER"
                ? {
                    scorecardOutcomes: [
                      { outcome: source.text, storyId: "story-1", note: source.text },
                    ],
                    firstNinetyDays: item,
                    drillDowns: [question],
                    gaps: [item],
                  }
                : null,
            executive:
              person.sectionKind === "EXECUTIVE"
                ? { strategy: item, judgment: item, businessImpact: item }
                : null,
            crossFunctional:
              person.sectionKind === "CROSS_FUNCTIONAL"
                ? { howWorkedAcross: item, dayToDay: item }
                : null,
          })),
        },
      };
    });
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
    await prisma.$disconnect();
  });

  it("excludes target compensation and unapproved statement drafts", async () => {
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId },
    });
    const turn = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: session!.id,
        sequence: 2,
        speaker: "SEEKER",
        body: "Unapproved answer",
        seekerAuthored: true,
      },
    });
    await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: session!.id,
        turnId: turn.id,
        kind: "RESUME_BULLET",
        content: "UNAPPROVED PRIVATE DRAFT",
        groundingJson: [],
        promptVersion: "3",
      },
    });
    await generateApplicationSummary({ organizationId, campaignId, userId });
    const corpus = capturedSources.map((source) => source.text).join("\n");
    expect(corpus).toContain("$180,000 OTE");
    expect(corpus).not.toContain("999000");
    expect(corpus).not.toContain("UNAPPROVED PRIVATE DRAFT");
  });

  it("stays unchanged until requested and becomes stale for every source category", async () => {
    await generateApplicationSummary({ organizationId, campaignId, userId });
    const ready = await getApplicationSummaryView({ organizationId, campaignId });
    expect(ready.stale).toBe(false);
    const originalGuidance = ready.guidance;

    const changes: Array<() => Promise<unknown>> = [
      () =>
        prisma.jobRequirement.update({
          where: { id: requirementId },
          data: { location: "Hybrid" },
        }),
      () =>
        prisma.companyResearch.update({
          where: { id: researchId },
          data: { companySizeContext: "Growth-stage, about 320 employees" },
        }),
      () =>
        prisma.persona.update({
          where: { id: roleId },
          data: { whyThisPersonaMatters: "Owns revenue, capacity, and the hiring decision." },
        }),
      () =>
        prisma.consultationAssessment.update({
          where: { id: assessmentId },
          data: { explanation: "Adjacent evidence needs a sales-specific example." },
        }),
      () =>
        prisma.consultationStatement.update({
          where: { id: statementId },
          data: {
            content:
              "I built a weekly operating cadence and reduced failed jobs by forty percent.",
          },
        }),
    ];

    for (const change of changes) {
      await change();
      const stale = await getApplicationSummaryView({ organizationId, campaignId });
      expect(stale.stale).toBe(true);
      expect(stale.guidance).toEqual(originalGuidance);
      await generateApplicationSummary({ organizationId, campaignId, userId });
      expect(
        (await getApplicationSummaryView({ organizationId, campaignId })).stale,
      ).toBe(false);
    }
  });

  it("stores failure with no substitute guidance and supports retry", async () => {
    generateStructured.mockRejectedValueOnce(new Error("provider timeout"));
    await generateApplicationSummary({ organizationId, campaignId, userId });
    const failed = await getApplicationSummaryView({ organizationId, campaignId });
    expect(failed.summary?.status).toBe("FAILED");
    expect(failed.guidance).toBeNull();
    expect(failed.summary?.generationError).toContain("could not be generated");

    await generateApplicationSummary({ organizationId, campaignId, userId });
    expect(
      (await getApplicationSummaryView({ organizationId, campaignId })).summary
        ?.status,
    ).toBe("READY");
  });

  it("keeps Direct before Indirect and includes dedicated print rules", () => {
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    const disclosure = readFileSync(
      "src/components/HiringTeamDisclosureGroup.tsx",
      "utf8",
    );
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(workspace.indexOf('groupKey="direct"')).toBeLessThan(
      workspace.indexOf('groupKey="indirect"'),
    );
    expect(workspace).toContain("<details");
    expect(workspace).not.toMatch(/<details[^>]*\sopen/);
    expect(disclosure).toContain("expand-all");
    expect(disclosure).toContain("collapse-all");
    expect(css).toContain(".application-summary button");
    expect(css).toContain(".application-summary details > *");
  });
});

describe("application summary seeker-facing labels", () => {
  it("does not print assessment enums on the cheat sheet page", () => {
    const page = readFileSync(
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "utf8",
    );
    expect(page).toContain("applicationSummaryConfig.title");
    expect(page).not.toContain("({assessment.strength})");
    expect(page).not.toContain("evidenceStrengthLabels");
  });
});
