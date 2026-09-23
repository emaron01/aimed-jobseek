/**
 * Target Employer interpretation content, unverifiable marks,
 * starter draft persistence, and criterion flag labels.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseIcpInterpretedCriteria } from "@/lib/interpretation/schema";
import {
  isLimitedPublicEvidenceClass,
  LIMITED_PUBLIC_EVIDENCE_CRITERION_WARNING,
  resolveIcpEvidenceClass,
} from "@/lib/criteria/evidence-class";
import { ICP_INTERPRETATION_PROMPT_VERSION } from "@/lib/criteria/types";
import { applyEmployerCriterionStrength } from "@/lib/interpretation/criterion-strength";
import {
  criterionFlagLabels,
  criterionFlags,
} from "@/lib/product-config";
import { STARTER_DRAFT_KIND } from "@/lib/icp/save";
import {
  buildStarterTargetEmployerDefinition,
  starterTargetEmployerName,
} from "@/lib/icp/starter-draft";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";

export const EMPLOYER_PREFERENCE_FIXTURE = `I want a mid-size B2B SaaS company, roughly 80 to 400 people, Series B or later, in climate or developer tools. US or Canada, remote-first or hybrid in those countries. I care about a culture that values psychological safety and written communication. I want a company that is still growing headcount. I will not work in advertising technology or weapons.`;

export const EMPLOYER_PREFERENCE_INTERPRETATION = {
  understoodSummary:
    "The seeker wants a mid-size B2B SaaS employer in climate or developer tools, Series B or later, in the US or Canada, remote-first or hybrid, with a psychologically safe written culture, ongoing headcount growth, and no advertising technology or weapons employers.",
  undetermined: [],
  criteria: [
    {
      name: "Company size",
      description: "80 to 400 employees",
      criterionType: "employee_count",
      dataType: "NUMBER" as const,
      operator: "BETWEEN" as const,
      minValue: 80,
      maxValue: 400,
      importance: "HIGH" as const,
      isRequired: false,
      isDisqualifier: false,
      evidenceClass: "LIST_DATA" as const,
      tier: "PRIMARY" as const,
      researchGuidance: "Confirm headcount from list fields or company filings.",
      sortOrder: 0,
    },
    {
      name: "Industry",
      description: "Climate or developer tools SaaS",
      criterionType: "industry",
      dataType: "MULTI_SELECT" as const,
      operator: "IN" as const,
      targetValue: ["Climate tech", "Developer tools", "B2B SaaS"],
      importance: "HIGH" as const,
      isRequired: false,
      isDisqualifier: false,
      evidenceClass: "LIST_DATA" as const,
      tier: "PRIMARY" as const,
      researchGuidance: "Match listed industry or market to climate or developer tools.",
      sortOrder: 1,
    },
    {
      name: "Company stage",
      description: "Series B or later",
      criterionType: "company_stage",
      dataType: "TEXT" as const,
      operator: "IN" as const,
      targetValue: ["Series B", "Series C", "Series D", "Late stage", "Public"],
      importance: "HIGH" as const,
      isRequired: false,
      isDisqualifier: false,
      evidenceClass: "COMPANY_RESEARCH" as const,
      tier: "PRIMARY" as const,
      researchGuidance: "Look for funding stage or public-company status.",
      sortOrder: 2,
    },
    {
      name: "Geography",
      description: "United States or Canada",
      criterionType: "geography",
      dataType: "MULTI_SELECT" as const,
      operator: "IN" as const,
      targetValue: ["United States", "Canada"],
      importance: "HIGH" as const,
      isRequired: false,
      isDisqualifier: false,
      evidenceClass: "LIST_DATA" as const,
      tier: "PRIMARY" as const,
      researchGuidance: "Confirm HQ or hiring geography from list or research.",
      sortOrder: 3,
    },
    {
      name: "Work arrangement",
      description: "Remote-first or hybrid in the US or Canada",
      criterionType: "work_arrangement",
      dataType: "TEXT" as const,
      operator: "IN" as const,
      targetValue: ["Remote", "Hybrid"],
      importance: "HIGH" as const,
      isRequired: false,
      isDisqualifier: false,
      evidenceClass: "COMPANY_RESEARCH" as const,
      tier: "PRIMARY" as const,
      researchGuidance: "Find published remote or hybrid policy on careers pages.",
      sortOrder: 4,
    },
    {
      name: "Culture and values",
      description: "Psychological safety and written communication",
      criterionType: "culture",
      dataType: "TEXT" as const,
      operator: "CONTAINS" as const,
      targetValue: "psychological safety",
      importance: "MEDIUM" as const,
      isRequired: false,
      isDisqualifier: false,
      evidenceClass: "SEMANTIC" as const,
      tier: "PRIMARY" as const,
      researchGuidance:
        "Collect limited public mentions of culture; never treat as verified.",
      sortOrder: 5,
    },
    {
      name: "Growth trajectory",
      description: "Still growing headcount",
      criterionType: "growth_trajectory",
      dataType: "BOOLEAN" as const,
      operator: "EQUALS" as const,
      targetValue: true,
      importance: "MEDIUM" as const,
      isRequired: false,
      isDisqualifier: false,
      evidenceClass: "COMPANY_RESEARCH" as const,
      tier: "PRIMARY" as const,
      researchGuidance: "Look for hiring growth or expanding teams.",
      sortOrder: 6,
    },
    {
      name: "Excluded industries",
      description: "Advertising technology or weapons",
      criterionType: "industry",
      dataType: "MULTI_SELECT" as const,
      operator: "NOT_IN" as const,
      targetValue: ["Advertising technology", "Weapons"],
      importance: "CRITICAL" as const,
      isRequired: false,
      isDisqualifier: true,
      evidenceClass: "LIST_DATA" as const,
      tier: "PRIMARY" as const,
      researchGuidance: "Treat listed industries as deal-breakers.",
      sortOrder: 7,
    },
  ],
};

const prismaMock = vi.hoisted(() => ({
  product: { findFirst: vi.fn() },
  icp: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  icpCriterion: { createMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ai", () => ({
  isInterpretationAiConfigured: vi.fn(() => false),
  getInterpretationAiProvider: vi.fn(),
  getInterpretationAiConfig: vi.fn(),
  getAiConfigPublicSummary: vi.fn(),
}));

import { previewStarterTargetEmployer } from "@/lib/icp/starter-draft";

function profileWithDirection() {
  const profile = emptyCandidateProfile();
  profile.direction.targetTitles = [
    {
      id: "title_1",
      kind: "INFERENCE",
      text: "Staff Product Designer",
      provenance: [],
    },
  ];
  profile.direction.careerGoals = [
    {
      id: "goal_1",
      kind: "INFERENCE",
      text: "Join a climate-tech company that is still growing",
      provenance: [],
    },
  ];
  profile.identity.workArrangementPreference = {
    id: "wa_1",
    kind: "INFERENCE",
    text: "Remote-first",
    provenance: [],
  };
  return profile;
}

describe("ICP interpretation prompt content", () => {
  it("lives in prompt-content at version 6", () => {
    expect(ICP_INTERPRETATION_PROMPT_VERSION).toBe("7");
    const content = readFileSync(
      "src/lib/prompt-content/icp-interpretation.ts",
      "utf8",
    );
    const assembler = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(content).toContain("company size");
    expect(content).toContain("culture and values");
    expect(content).toContain("SEMANTIC");
    expect(content).toContain("limited public evidence");
    expect(assembler).toContain("ICP_INTERPRETATION_SYSTEM_INSTRUCTIONS");
    expect(assembler).toContain("generateIcpInterpretation");
    expect(assembler).not.toContain("who you sell to");
  });
});

describe("employer preference fixture", () => {
  it("parses a plain-language employer description into the stated criteria", () => {
    const parsed = parseIcpInterpretedCriteria(
      EMPLOYER_PREFERENCE_INTERPRETATION,
    );
    const types = parsed.criteria.map((c) => c.criterionType);
    expect(types).toEqual(
      expect.arrayContaining([
        "employee_count",
        "industry",
        "company_stage",
        "geography",
        "work_arrangement",
        "culture",
        "growth_trajectory",
      ]),
    );
    const resolved = parsed.criteria.map((c) => ({
      name: c.name,
      evidenceClass: resolveIcpEvidenceClass({
        proposed: c.evidenceClass,
        name: c.name,
        criterionType: c.criterionType,
        description: c.description,
      }),
      isRequired: c.isRequired,
      isDisqualifier: c.isDisqualifier,
      researchGuidance: c.researchGuidance,
    }));
    const culture = resolved.find((c) => c.name === "Culture and values");
    expect(culture?.evidenceClass).toBe("SEMANTIC");
    expect(isLimitedPublicEvidenceClass(culture?.evidenceClass)).toBe(true);
    const exclusion = resolved.find((c) => c.name === "Excluded industries");
    expect(exclusion?.isDisqualifier).toBe(true);
    expect(resolved.filter((c) => c.isRequired)).toHaveLength(0);
    expect(resolved.filter((c) => c.isDisqualifier)).toHaveLength(1);
    expect(resolved.every((c) => c.researchGuidance?.trim())).toBe(true);
    expect(EMPLOYER_PREFERENCE_FIXTURE).toMatch(/psychological safety/i);

    const enforced = parsed.criteria.map((c) => ({
      name: c.name,
      ...applyEmployerCriterionStrength({
        seekerText: EMPLOYER_PREFERENCE_FIXTURE,
        ...c,
        description: c.description,
        isRequired: true,
        isDisqualifier: c.name === "Excluded industries",
      }),
    }));
    expect(enforced.filter((c) => c.isRequired)).toHaveLength(0);
    expect(enforced.filter((c) => c.isDisqualifier)).toHaveLength(1);
    expect(
      enforced.find((c) => c.name === "Company size")?.strengthAdjustment,
    ).toContain(`${criterionFlags.required} was removed`);
  });

  it("forces culture criteria to SEMANTIC even if the model proposes company research", () => {
    expect(
      resolveIcpEvidenceClass({
        proposed: "COMPANY_RESEARCH",
        name: "Culture and values",
        criterionType: "culture",
        description: "Psychological safety",
      }),
    ).toBe("SEMANTIC");
  });
});

describe("employer criterion strength", () => {
  function enforce(
    seekerText: string,
    criteria: Array<{
      name: string;
      criterionType: string;
      description?: string;
      targetValue?: unknown;
      isRequired?: boolean;
      isDisqualifier?: boolean;
    }>,
  ) {
    return criteria.map((criterion) =>
      applyEmployerCriterionStrength({
        seekerText,
        name: criterion.name,
        criterionType: criterion.criterionType,
        description: criterion.description ?? null,
        targetValue: criterion.targetValue,
        isRequired: criterion.isRequired ?? true,
        isDisqualifier: criterion.isDisqualifier ?? false,
        importance: "HIGH",
      }),
    );
  }

  it("loose description produces zero Must-haves", () => {
    const result = enforce(
      "prefer mid-size, open to remote or hybrid, ideally SaaS",
      [
        {
          name: "Company size",
          criterionType: "employee_count",
          description: "mid-size",
        },
        {
          name: "Work arrangement",
          criterionType: "work_arrangement",
          targetValue: ["Remote", "Hybrid"],
        },
        {
          name: "Industry",
          criterionType: "industry",
          targetValue: ["SaaS"],
        },
      ],
    );
    expect(result.filter((criterion) => criterion.isRequired)).toHaveLength(0);
    expect(result.filter((criterion) => criterion.isDisqualifier)).toHaveLength(0);
    expect(result.map((criterion) => criterion.importance)).toEqual([
      "HIGH",
      "LOW",
      "HIGH",
    ]);
    expect(result.every((criterion) => criterion.strengthAdjustment)).toBe(true);
  });

  it("explicit description produces one Must-have and one Deal-breaker", () => {
    const result = enforce(
      "must be fully remote, no defense contractors",
      [
        {
          name: "Work arrangement",
          criterionType: "work_arrangement",
          targetValue: "Remote",
        },
        {
          name: "Excluded industries",
          criterionType: "industry",
          targetValue: ["Defense"],
          isDisqualifier: true,
        },
      ],
    );
    expect(result.filter((criterion) => criterion.isRequired)).toHaveLength(1);
    expect(result.filter((criterion) => criterion.isDisqualifier)).toHaveLength(1);
    expect(result[0]?.isRequired).toBe(true);
    expect(result[0]?.strengthAdjustment).toBeNull();
    expect(result[1]?.isDisqualifier).toBe(true);
    expect(result[1]?.isRequired).toBe(false);
  });

  it("mixed description keeps only the explicitly stated requirements", () => {
    const result = enforce(
      "I prefer mid-size companies. The role must be fully remote. Ideally Series B. No defense contractors.",
      [
        {
          name: "Company size",
          criterionType: "employee_count",
          description: "mid-size",
        },
        {
          name: "Work arrangement",
          criterionType: "work_arrangement",
          targetValue: "Remote",
        },
        {
          name: "Company stage",
          criterionType: "company_stage",
          targetValue: ["Series B"],
        },
        {
          name: "Excluded industries",
          criterionType: "industry",
          targetValue: ["Defense"],
          isDisqualifier: true,
        },
      ],
    );
    expect(result.map((criterion) => criterion.isRequired)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(result.map((criterion) => criterion.isDisqualifier)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("downgrades a model-proposed Must-have that lacks supporting language", () => {
    const result = applyEmployerCriterionStrength({
      seekerText: "I would like a SaaS company",
      name: "Industry",
      criterionType: "industry",
      description: null,
      targetValue: ["SaaS"],
      isRequired: true,
      isDisqualifier: false,
      importance: "CRITICAL",
    });
    expect(result.isRequired).toBe(false);
    expect(result.isDisqualifier).toBe(false);
    expect(result.importance).toBe("MEDIUM");
    expect(result.strengthAdjustment).toContain(
      `${criterionFlags.required} was removed`,
    );
    const source = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(source).toContain("applyEmployerCriterionStrength");
    expect(source).toContain("icp_criterion_strength_adjustment");
  });
});

describe("Must-have and Deal-breaker labels", () => {
  it("come from the vocabulary module", () => {
    expect(criterionFlags.required).toBe("Must-have");
    expect(criterionFlags.disqualifier).toBe("Deal-breaker");
    expect(criterionFlagLabels({ isRequired: true, isDisqualifier: false })).toEqual(
      ["Must-have"],
    );
    expect(
      criterionFlagLabels({ isRequired: false, isDisqualifier: true }),
    ).toEqual(["Deal-breaker"]);
    const review = readFileSync("src/components/IcpCriteriaReview.tsx", "utf8");
    expect(review).toContain("criterionFlagLabels");
    expect(review).toContain("criterionFlags");
    expect(review).not.toContain('"Must-have"');
    expect(review).not.toContain('"Deal-breaker"');
    expect(LIMITED_PUBLIC_EVIDENCE_CRITERION_WARNING).toBe(
      criterionFlags.limitedPublicEvidence,
    );
  });
});

describe("starter Target Employer draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a definition from profile direction and career goals", () => {
    const profile = profileWithDirection();
    const definition = buildStarterTargetEmployerDefinition(profile);
    expect(definition).toContain("Staff Product Designer");
    expect(definition).toContain("climate-tech");
    expect(definition).toContain("Remote-first");
    expect(starterTargetEmployerName(profile)).toContain("Staff Product Designer");
  });

  it("does not save an Icp or criteria without approval", async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: "prod_1",
      name: "Alex",
      description: "Backend engineer",
      approvalStatus: "APPROVED",
      profileJson: profileWithDirection(),
    });

    const draft = await previewStarterTargetEmployer({
      organizationId: "org_1",
      productId: "prod_1",
    });

    expect(draft.kind).toBe(STARTER_DRAFT_KIND);
    expect(draft.kind).toBe(criterionFlags.inference);
    expect(draft.definition).toContain("Staff Product Designer");
    expect(prismaMock.icp.create).not.toHaveBeenCalled();
    expect(prismaMock.icpCriterion.createMany).not.toHaveBeenCalled();
    expect(prismaMock.icp.update).not.toHaveBeenCalled();
  });
});

describe("Hiring Team panel cleanup", () => {
  it("setup overview no longer renders suggested buyer roles or a Hiring Team panel", () => {
    const overview = readFileSync(
      "src/app/(app)/setup/[productId]/page.tsx",
      "utf8",
    );
    expect(overview).not.toContain("SuggestedBuyerRolesPanel");
    expect(overview).not.toContain("Suggested roles not yet built");
    expect(overview).not.toContain("normalizeSuggestedBuyerRoles");
    expect(overview).not.toContain("unbuiltSuggestions");
    expect(overview).not.toContain("listPersonas");
    expect(overview).not.toContain("`2. ${vocab.persona.Plural}`");
    expect(overview).toContain("`2. ${vocab.icp.singular}`");

    const assisted = readFileSync(
      "src/components/AssistedProductSetup.tsx",
      "utf8",
    );
    expect(assisted).not.toContain("SuggestedBuyerRolesPanel");
    expect(assisted).not.toContain("suggested-buyer-roles");
  });
});
