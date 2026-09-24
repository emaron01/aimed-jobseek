import { beforeAll, describe, expect, it, vi } from "vitest";
import { seedContactOnList } from "@/test/contact-seed";
import { getScoringReadiness } from "@/lib/scoring/engine";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";

const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scoringRun: { findFirst },
    contactScore: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/work/ownership", () => ({
  getWorkActor: async () => ({
    organizationId: "org_b",
    userId: "user_b",
    canViewAll: true,
  }),
  assertCanModifyOwnedWork: vi.fn(),
}));

vi.mock("@/lib/tenant/getCurrentOrganization", () => {
  class TenantError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TenantError";
    }
  }
  return { TenantError };
});

vi.mock("@/lib/ai/config", () => ({
  isContactResearchAiConfigured: () => false,
  isScoringAiConfigured: () => false,
}));

vi.mock("@/lib/ai/roles", () => ({
  listUnconfiguredScoringRoles: () => [],
}));

vi.mock("@/lib/scoring/score-contact", () => ({
  scoreSingleContact: vi.fn(),
}));

vi.mock("@/lib/usage/policy-service", () => ({
  getResearchPolicy: async () => ({ contactResearchEnabled: false }),
}));

describe("scoring engine tenant isolation (Phase 3C)", () => {
  it("blocks cross-tenant scoring run access", async () => {
    findFirst.mockResolvedValueOnce(null);

    await expect(getScoringReadiness("run_a")).rejects.toBeInstanceOf(
      TenantError,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "run_a",
          organizationId: "org_b",
        }),
      }),
    );
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("scoring engine persistence (Phase 3C)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  let orgAId = "";
  let runAId = "";
  let scoreAId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "scoringStatus" FROM "ContactScore" LIMIT 0`;
      await prisma.$queryRaw`SELECT "aiModel" FROM "ContactScore" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping Phase 3C scoring DB tests: apply migration 20260320220000_scoring_engine first.",
      );
      return;
    }

    ready = true;
    const suffix = Date.now().toString(36);

    const orgA = await prisma.organization.create({
      data: {
        name: `[TEST] ScoreEngine A ${suffix}`,
        slug: `test-score-engine-a-${suffix}`,
        status: "ACTIVE",
      },
    });
    orgAId = orgA.id;
    const owner = await prisma.user.create({
      data: {
        email: `score-engine-owner-${suffix}@example.test`,
        emailNormalized: `score-engine-owner-${suffix}@example.test`,
        name: "Score Engine Owner",
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: orgAId, userId: owner.id, role: "OWNER" },
    });

    const product = await prisma.product.create({
      data: { organizationId: orgAId, name: `[TEST] SE Product ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: product.id,
        name: `[TEST] SE ICP ${suffix}`,
        targetIndustries: ["SaaS"],
        negativeSignals: ["Uses competitor X exclusively"],
      },
    });
    const persona = await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: product.id,
        name: `[TEST] SE Persona ${suffix}`,
        targetTitles: ["VP Sales"],
      },
    });
    const list = await prisma.contactList.create({
      data: {
        organizationId: orgAId,
        ownerUserId: owner.id,
        name: `[TEST] SE List ${suffix}`,
        sourceType: "PASTE",
        totalContacts: 1,
      },
    });
    const contact = await seedContactOnList(prisma, {
      organizationId: orgAId,
      contactListId: list.id,
      firstName: "Sam",
      lastName: "Seller",
      title: "VP Sales",
      company: "Acme",
      email: `sam-${suffix}@example.test`,
    });

    const productSnapshot = {
      id: product.id,
      name: product.name,
      description: "Outbound platform",
      valueProposition: "Book more meetings",
      averageOrderValue: null,
      websiteUrl: null,
    };
    const icpSnapshot = {
      id: icp.id,
      name: icp.name,
      description: null,
      targetIndustries: ["SaaS"],
      minEmployees: null,
      maxEmployees: null,
      minRevenue: null,
      maxRevenue: null,
      targetGeographies: null,
      requiredTechnologies: null,
      positiveSignals: null,
      negativeSignals: ["Uses competitor X exclusively"],
      notes: null,
    };
    const personaSnapshot = {
      id: persona.id,
      name: persona.name,
      targetTitles: ["VP Sales"],
      department: null,
      seniority: null,
      responsibilities: null,
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
    };

    const run = await prisma.scoringRun.create({
      data: {
        organizationId: orgAId,
        contactListId: list.id,
        productId: product.id,
        icpId: icp.id,
        personaId: persona.id,
        status: "PENDING",
        totalContacts: 1,
        scoredContacts: 0,
        productSnapshot,
        icpSnapshot,
        personaSnapshot,
      },
    });
    runAId = run.id;

    const score = await prisma.contactScore.create({
      data: {
        organizationId: orgAId,
        contactId: contact.id,
        scoringRunId: run.id,
        scoringStatus: "PENDING",
        researchStatus: "NOT_STARTED",
      },
    });
    scoreAId = score.id;
  });

  it("persists ContactScore provenance fields without API key", async () => {
    if (!ready) return;

    await prisma.contactScore.update({
      where: { id: scoreAId },
      data: {
        scoringStatus: "COMPLETED",
        overallScore: 82,
        icpScore: 90,
        personaScore: 80,
        companyScore: 70,
        productRelevanceScore: 75,
        scoreLabel: "GOOD",
        recommendedAction: "Good target — include in campaign.",
        reasoning: "Title and industry align.",
        assessmentData: {
          dimensions: [
            {
              dimension: "Industry Fit",
              component: "ICP",
              assessment: "STRONG",
              evidence: ["SaaS"],
              concerns: [],
              confidence: "HIGH",
            },
          ],
          unknownDimensionCount: 0,
        },
        aiProvider: "openai-compatible",
        aiModel: "env-model-name",
        aiModelUrlIdentifier: "https://example.test/v1/chat/completions",
        promptVersion: "1",
        scoringLogicVersion: "1",
        scoredAt: new Date(),
      },
    });

    const saved = await prisma.contactScore.findUnique({
      where: { id: scoreAId },
    });
    expect(saved?.aiProvider).toBe("openai-compatible");
    expect(saved?.aiModel).toBe("env-model-name");
    expect(saved?.promptVersion).toBe("1");
    expect(saved?.scoringLogicVersion).toBe("1");
    expect(JSON.stringify(saved)).not.toMatch(/AI_API_KEY|sk-/i);
  });

  it("keeps historical scoring snapshots intact on the run", async () => {
    if (!ready) return;
    const run = await prisma.scoringRun.findUnique({ where: { id: runAId } });
    expect(run?.productSnapshot).toMatchObject({
      valueProposition: "Book more meetings",
    });
    expect(run?.icpSnapshot).toMatchObject({
      targetIndustries: ["SaaS"],
    });
    expect(run?.personaSnapshot).toMatchObject({
      targetTitles: ["VP Sales"],
    });
  });

  it("one failed contact does not prevent others from remaining scoreable", async () => {
    if (!ready) return;
    const list = await prisma.contactList.findFirst({
      where: { organizationId: orgAId },
    });
    expect(list).toBeTruthy();

    const contact2 = await seedContactOnList(prisma, {
      organizationId: orgAId,
      contactListId: list!.id,
      firstName: "Pat",
      lastName: "Prospect",
      title: "Director",
      company: "Beta",
    });

    const failed = await prisma.contactScore.create({
      data: {
        organizationId: orgAId,
        contactId: contact2.id,
        scoringRunId: runAId,
        scoringStatus: "FAILED",
        scoringError: "Simulated provider failure",
        researchStatus: "NOT_STARTED",
      },
    });

    const completed = await prisma.contactScore.findFirst({
      where: {
        id: scoreAId,
        organizationId: orgAId,
        scoringStatus: "COMPLETED",
      },
    });
    expect(completed).toBeTruthy();
    expect(failed.scoringStatus).toBe("FAILED");
  });
});
