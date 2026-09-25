import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendTargetTitle, mergeManualEditedFields, TARGET_TITLES_FIELD } from "@/lib/persona/manual-target-titles";
import { canonicalTitle } from "@/lib/scoring/title-fit";
import {
  buildTitleSuggestionMessages,
  estimateTitleSuggestionInputChars,
} from "@/lib/scoring/title-suggestion-prompt";
import type { PersonaSnapshot } from "@/lib/scoring/types";

const runScoringForRun = vi.hoisted(() => vi.fn());
const generateStructured = vi.hoisted(() => vi.fn());
const recordUsageEvent = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  scoringRun: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  contactScore: {
    findMany: vi.fn(),
  },
  productTitleDismissal: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  titleSuggestion: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
  },
  persona: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ai", () => ({
  getScoringAiConfig: vi.fn(() => ({ maxRetries: 0 })),
  getScoringAiProvider: vi.fn(() => ({ generateStructured })),
  AiConfigError: class AiConfigError extends Error {},
  AiProviderError: class AiProviderError extends Error {
    retryable = true;
  },
  AiTimeoutError: class AiTimeoutError extends Error {},
  AiValidationError: class AiValidationError extends Error {},
}));
vi.mock("@/lib/org/authz", () => ({
  getCurrentUser: async () => ({ id: "user_1" }),
}));
vi.mock("@/lib/usage/events", () => ({ recordUsageEvent }));
vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  TenantError: class TenantError extends Error {},
  requireOrganizationId: vi.fn(async () => "org_1"),
}));
vi.mock("@/lib/scoring/engine", () => ({
  runScoringForRun,
}));

import {
  generateTitleSuggestionsForRun,
  groupUnmatchedTitles,
  isUnmatchedTitleScore,
  mapAiSuggestionsToGroups,
  resolveTitleSuggestion,
} from "@/lib/scoring/title-suggestions";

function persona(input: {
  id: string;
  name: string;
  definition: string;
  targetTitles: string[];
}): PersonaSnapshot {
  return {
    id: input.id,
    name: input.name,
    definition: input.definition,
    targetTitles: input.targetTitles,
    department: null,
    seniority: null,
    responsibilities: null,
    painPoints: null,
    desiredOutcomes: null,
    messagingNotes: null,
    criteria: [],
  };
}

const REAL_PERSONA_SET: PersonaSnapshot[] = [
  persona({
    id: "persona_revops",
    name: "Revenue Operations Leader",
    definition:
      "Owns the systems, processes, reporting, and governance that help revenue teams produce consistent, evidence-backed forecasts and actionable pipeline visibility.",
    targetTitles: [
      "VP Revenue Operations",
      "Head of Revenue Operations",
      "Director of Revenue Operations",
      "Revenue Operations Manager",
    ],
  }),
  persona({
    id: "persona_cro",
    name: "Chief Revenue Officer",
    definition:
      "Executive leader accountable for revenue performance, sales execution, forecast confidence, and visibility into risks that could affect committed revenue.",
    targetTitles: [
      "Chief Revenue Officer",
      "Chief Sales Officer",
      "VP Revenue",
      "Chief Commercial Officer",
    ],
  }),
  persona({
    id: "persona_enablement",
    name: "Sales Enablement and Coaching Leader",
    definition:
      "Owns sales onboarding, content, and coaching programs for the sales org.",
    targetTitles: [
      "VP Sales Enablement",
      "Head of Sales Enablement",
      "Director of Sales Training",
      "Director of Sales Enablement",
      "Sales Enablement Manager",
    ],
  }),
  persona({
    id: "persona_vp_sales",
    name: "VP of Sales",
    definition:
      "Owns a sales team and quota attainment. Forecasts the team's number.",
    targetTitles: [
      "VP Sales",
      "Vice President of Sales",
      "Senior Vice President of Sales",
      "Regional Vice President",
      "Head of Sales",
    ],
  }),
];

/** Actual unmatched titles from the 27-contact Test Run list. */
const TEST_RUN_UNMATCHED_CONTACT_TITLES = [
  "Chairman and Founder",
  "VP of Sales Operations & Partnerships",
  "Founder",
  "Founder & Managing Partner",
  "Co-Founder",
  "Founder & President",
  "Founder",
  "Co-Founder",
  "Founder",
  "President and Co-Founder",
  "Founder, Owner & President",
  "Founder,",
  "Chief Risk Officer (CRO)",
  "Founder",
  "President of Sales",
  "President, Co-Founder",
];

function unmatchedScore(title: string, id: string) {
  return {
    id,
    scoringStatus: "COMPLETED",
    assessmentData: {
      personaMatch: { status: "UNKNOWN" },
      aiSkipReason: "NO_TITLE_FIT",
    },
    contact: { title },
  };
}

describe("groupUnmatchedTitles", () => {
  it("produces one suggestion for five contacts titled Founder", () => {
    const groups = groupUnmatchedTitles(
      Array.from({ length: 5 }, (_, index) => ({
        contactScoreId: `score_${index}`,
        title: "Founder",
      })),
    );
    expect(groups).toEqual([
      {
        title: "Founder",
        normalizedTitle: "founder",
        contactCount: 5,
        contactScoreIds: [
          "score_0",
          "score_1",
          "score_2",
          "score_3",
          "score_4",
        ],
      },
    ]);
  });

  it("merges equivalent spellings and keeps the most common display title", () => {
    const groups = groupUnmatchedTitles([
      { contactScoreId: "a", title: "Founder" },
      { contactScoreId: "b", title: "Founder," },
      { contactScoreId: "c", title: "Founder" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("Founder");
    expect(groups[0]?.contactCount).toBe(3);
  });
});

describe("Test Run unmatched-title cost", () => {
  it("is one AI call over far fewer than 16 distinct titles", () => {
    const groups = groupUnmatchedTitles(
      TEST_RUN_UNMATCHED_CONTACT_TITLES.map((title, index) => ({
        contactScoreId: `score_${index}`,
        title,
      })),
    );
    expect(TEST_RUN_UNMATCHED_CONTACT_TITLES).toHaveLength(16);
    expect(groups.length).toBe(10);
    expect(groups.find((group) => group.title === "Founder")?.contactCount).toBe(
      5,
    );

    const chars = estimateTitleSuggestionInputChars({
      personas: REAL_PERSONA_SET,
      unmatchedTitles: groups.map((group) => group.title),
    });
    expect(chars).toBeLessThan(5_000);
    expect(chars).toBeGreaterThan(1_500);
  });
});

describe("title suggestion prompt", () => {
  it("sends VP of Sales Operations & Partnerships against the real persona set", () => {
    const messages = buildTitleSuggestionMessages({
      personas: REAL_PERSONA_SET,
      unmatchedTitles: ["VP of Sales Operations & Partnerships"],
    });
    const user = messages[1]?.content ?? "";
    const system = messages[0]?.content ?? "";
    expect(system).toContain("Null is the correct answer");
    expect(system.toLowerCase()).toContain("adjacent functional titles");
    expect(user).toContain("VP of Sales Operations & Partnerships");
    expect(user).toContain("Revenue Operations Leader");
    expect(user).toContain("VP Revenue Operations");
  });
});

describe("mapAiSuggestionsToGroups", () => {
  it("keeps a model no-match as unmatched needs-review", () => {
    const mapped = mapAiSuggestionsToGroups({
      groups: [
        {
          title: "Founder",
          normalizedTitle: "founder",
          contactCount: 5,
          contactScoreIds: ["s1"],
        },
      ],
      personas: REAL_PERSONA_SET,
      ai: {
        suggestions: [
          {
            unmatchedTitle: "Founder",
            proposedPersonaId: null,
            confidence: "NONE",
            reasoning: "Founder is not a listed functional buyer.",
          },
        ],
      },
    });
    expect(mapped[0]?.proposedPersonaId).toBeNull();
    expect(mapped[0]?.confidence).toBe("NONE");
  });

  it("maps VP of Sales Operations & Partnerships to Revenue Operations Leader", () => {
    const mapped = mapAiSuggestionsToGroups({
      groups: [
        {
          title: "VP of Sales Operations & Partnerships",
          normalizedTitle: canonicalTitle(
            "VP of Sales Operations & Partnerships",
          ),
          contactCount: 1,
          contactScoreIds: ["s1"],
        },
      ],
      personas: REAL_PERSONA_SET,
      ai: {
        suggestions: [
          {
            unmatchedTitle: "VP of Sales Operations & Partnerships",
            proposedPersonaId: "persona_revops",
            confidence: "HIGH",
            reasoning:
              "Sales operations is adjacent to the Revenue Operations Leader role.",
          },
        ],
      },
    });
    expect(mapped[0]?.proposedPersonaId).toBe("persona_revops");
    expect(mapped[0]?.proposedPersonaName).toBe("Revenue Operations Leader");
  });
});

describe("generateTitleSuggestionsForRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === "function") return arg(prismaMock);
      return Promise.all(arg);
    });
    prismaMock.productTitleDismissal.findMany.mockResolvedValue([]);
    prismaMock.titleSuggestion.findMany.mockResolvedValue([]);
    prismaMock.titleSuggestion.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.titleSuggestion.createMany.mockResolvedValue({ count: 1 });
    prismaMock.scoringRun.findFirst.mockResolvedValue({
      id: "run_1",
      productId: "product_1",
      personaSnapshot: REAL_PERSONA_SET[0],
      personaSnapshots: REAL_PERSONA_SET,
    });
  });

  it("makes one AI call for the unmatched set and persists a RevOps proposal", async () => {
    prismaMock.contactScore.findMany.mockResolvedValue([
      unmatchedScore("VP of Sales Operations & Partnerships", "score_ops"),
      unmatchedScore("Founder", "score_f1"),
      unmatchedScore("Founder", "score_f2"),
    ]);
    generateStructured.mockResolvedValue({
      data: {
        suggestions: [
          {
            unmatchedTitle: "VP of Sales Operations & Partnerships",
            proposedPersonaId: "persona_revops",
            confidence: "HIGH",
            reasoning:
              "Sales operations is adjacent to revenue operations ownership.",
          },
          {
            unmatchedTitle: "Founder",
            proposedPersonaId: null,
            confidence: "NONE",
            reasoning: "Founder is not a listed functional buyer.",
          },
        ],
      },
      provider: "openai-compatible",
      model: "test-model",
      usage: { inputTokens: 800, outputTokens: 120 },
    });

    const result = await generateTitleSuggestionsForRun({
      organizationId: "org_1",
      scoringRunId: "run_1",
    });

    expect(result).toEqual({ suggestionCount: 2, aiCalled: true });
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const request = generateStructured.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    expect(request.messages[1]?.content).toContain(
      "VP of Sales Operations & Partnerships",
    );
    expect(request.messages[1]?.content).toContain("Revenue Operations Leader");
    expect(prismaMock.titleSuggestion.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          unmatchedTitle: "VP of Sales Operations & Partnerships",
          proposedPersonaId: "persona_revops",
          proposedPersonaName: "Revenue Operations Leader",
          contactCount: 1,
        }),
        expect.objectContaining({
          unmatchedTitle: "Founder",
          proposedPersonaId: null,
          contactCount: 2,
        }),
      ]),
    });
  });

  it("does not re-propose a dismissed title for the same product", async () => {
    prismaMock.contactScore.findMany.mockResolvedValue([
      unmatchedScore("Founder", "score_f1"),
    ]);
    prismaMock.productTitleDismissal.findMany.mockResolvedValue([
      { normalizedTitle: "founder" },
    ]);

    const result = await generateTitleSuggestionsForRun({
      organizationId: "org_1",
      scoringRunId: "run_2",
    });

    expect(result).toEqual({ suggestionCount: 0, aiCalled: false });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("treats a model no-match as needs-review without scoring", async () => {
    prismaMock.contactScore.findMany.mockResolvedValue([
      unmatchedScore("Founder", "score_f1"),
    ]);
    generateStructured.mockResolvedValue({
      data: {
        suggestions: [
          {
            unmatchedTitle: "Founder",
            proposedPersonaId: null,
            confidence: "NONE",
            reasoning: "No listed persona covers company founders.",
          },
        ],
      },
      provider: "test",
      model: "test",
    });

    await generateTitleSuggestionsForRun({
      organizationId: "org_1",
      scoringRunId: "run_1",
    });

    expect(prismaMock.titleSuggestion.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          unmatchedTitle: "Founder",
          proposedPersonaId: null,
          proposedPersonaName: null,
        }),
      ],
    });
    expect(runScoringForRun).not.toHaveBeenCalled();
    expect(
      isUnmatchedTitleScore({
        scoringStatus: "COMPLETED",
        assessmentData: {
          personaMatch: { status: "UNKNOWN" },
          aiSkipReason: "NO_TITLE_FIT",
        },
      }),
    ).toBe(true);
  });
});

describe("resolveTitleSuggestion", () => {
  let titles: string[];
  let manual: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    titles = ["VP of Revenue Operations", "Head of Revenue Operations"];
    manual = null;
    prismaMock.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === "function") return arg(prismaMock);
      return Promise.all(arg);
    });
    prismaMock.titleSuggestion.findFirst.mockResolvedValue({
      id: "sug_1",
      organizationId: "org_1",
      scoringRunId: "run_1",
      productId: "product_1",
      unmatchedTitle: "Founder",
      normalizedTitle: "founder",
      status: "PENDING",
      proposedPersonaId: "persona_revops",
    });
    prismaMock.persona.findFirst.mockImplementation(async () => ({
      id: "persona_revops",
      organizationId: "org_1",
      productId: "product_1",
      name: "Revenue Operations Leader",
      definition:
        "Owns the systems, processes, reporting, and governance that help revenue teams produce consistent forecasts.",
      additionalContext: null,
      targetTitles: titles,
      department: null,
      seniority: null,
      responsibilities: null,
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
      interpretationVersion: 1,
      interpretationPromptVersion: null,
      lastInterpretedAt: null,
      approvalStatus: "APPROVED",
      approvedAt: null,
      approvedByUserId: null,
      approvedEvidenceBundleId: null,
      approvedSetupRunId: null,
      manuallyEditedFields: manual,
      suggestionKey: null,
      whyThisPersonaMatters: null,
      personaMessagingJson: null,
      profileJson: null,
      setupStatus: "APPROVED",
      staleAt: null,
      staleReason: null,
      approvedPersonaSetupRunId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      criteria: [],
    }));
    prismaMock.persona.update.mockImplementation(async ({ data }) => {
      titles = data.targetTitles as string[];
      manual = data.manuallyEditedFields;
      return { id: "persona_revops" };
    });
    prismaMock.scoringRun.findFirst.mockResolvedValue({
      id: "run_1",
      personaSnapshot: REAL_PERSONA_SET[1],
      personaSnapshots: REAL_PERSONA_SET,
    });
    prismaMock.scoringRun.update.mockResolvedValue({});
    prismaMock.titleSuggestion.update.mockResolvedValue({});
    prismaMock.productTitleDismissal.upsert.mockResolvedValue({});
    prismaMock.contactScore.findMany.mockResolvedValue([
      unmatchedScore("Founder", "score_f1"),
      unmatchedScore("Founder", "score_f2"),
      unmatchedScore("Founder", "score_f3"),
      unmatchedScore("Founder", "score_f4"),
      unmatchedScore("Founder", "score_f5"),
      unmatchedScore("President", "score_p1"),
    ]);
    runScoringForRun.mockResolvedValue({
      totalContacts: 6,
      attempted: 5,
      completed: 5,
      failed: 0,
      companiesResearched: 0,
      companiesMissingResearch: 0,
      status: "COMPLETED",
    });
  });

  it("adds an approved title to the persona and marks it manually edited", async () => {
    const result = await resolveTitleSuggestion({
      organizationId: "org_1",
      userId: "user_1",
      suggestionId: "sug_1",
      action: "approve",
    });

    expect(result.ok).toBe(true);
    expect(titles).toContain("Founder");
    expect(mergeManualEditedFields(manual, [])).toContain(TARGET_TITLES_FIELD);
    expect(prismaMock.persona.update).toHaveBeenCalledWith({
      where: { id: "persona_revops" },
      data: expect.objectContaining({
        targetTitles: expect.arrayContaining(["Founder"]),
        manuallyEditedFields: expect.arrayContaining([TARGET_TITLES_FIELD]),
      }),
    });
  });

  it("scores only the contacts that have the approved title", async () => {
    await resolveTitleSuggestion({
      organizationId: "org_1",
      userId: "user_1",
      suggestionId: "sug_1",
      action: "approve",
    });

    expect(runScoringForRun).toHaveBeenCalledTimes(1);
    expect(runScoringForRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        contactScoreIds: [
          "score_f1",
          "score_f2",
          "score_f3",
          "score_f4",
          "score_f5",
        ],
        personas: [
          expect.objectContaining({ id: "persona_revops" }),
        ],
      }),
    );
  });

  it("records a product-level dismissal so later runs skip the title", async () => {
    const result = await resolveTitleSuggestion({
      organizationId: "org_1",
      userId: "user_1",
      suggestionId: "sug_1",
      action: "dismiss",
    });

    expect(result.ok).toBe(true);
    expect(prismaMock.productTitleDismissal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_productId_normalizedTitle: {
            organizationId: "org_1",
            productId: "product_1",
            normalizedTitle: "founder",
          },
        },
      }),
    );
    expect(runScoringForRun).not.toHaveBeenCalled();
    expect(titles).not.toContain("Founder");
  });
});

describe("manual title protection", () => {
  it("does not let persona interpretation rewrite targetTitles", () => {
    const src = readFileSync("src/lib/interpretation/persona.ts", "utf8");
    const updateAt = src.indexOf("await tx.persona.update");
    expect(updateAt).toBeGreaterThan(0);
    const dataBlock = src.slice(updateAt, updateAt + 600);
    expect(dataBlock).toContain("interpretationVersion");
    expect(dataBlock).not.toMatch(/\btargetTitles\s*:/);
  });

  it("keeps manually edited targetTitles when product research re-approves a persona", () => {
    const src = readFileSync("src/lib/product-research/approve.ts", "utf8");
    expect(src).toContain('protectedPaths.includes("targetTitles")');
  });

  it("appending a title is a no-op when an equivalent title already exists", () => {
    expect(
      appendTargetTitle(
        ["VP of Revenue Operations"],
        "VP Revenue Operations",
        canonicalTitle,
      ),
    ).toEqual(["VP of Revenue Operations"]);
  });
});
