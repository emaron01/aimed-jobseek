/**
 * ICP evidence classing, multi-value IN fix, TARGETED_SEARCH asymmetry, caps, approval.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildEvidenceClassSummary,
  checkTargetedSearchCap,
  countsTowardTargetedSearchCap,
  criterionMaterialFingerprint,
  inferEvidenceClassFromCriterion,
  isTargetedSearchDecisionStale,
  normalizeEvidenceClass,
  repairedEvidenceClassIfMisclassed,
  resolveIcpEvidenceClass,
} from "@/lib/criteria/evidence-class";
import {
  normalizeInOperatorValues,
  splitEmbeddedListValue,
} from "@/lib/criteria/multi-value";
import {
  clampFactualAiDimension,
  evaluateIcpCriterionWithEvidenceClass,
} from "@/lib/criteria/targeted-search-eval";
import {
  calculateComponentScores,
  calculateScoresFromAssessment,
} from "@/lib/scoring/calculate";
import { ICP_INTERPRETATION_PROMPT_VERSION } from "@/lib/criteria/types";
import {
  icpInterpretationResultSchema,
  parseIcpInterpretedCriteria,
} from "@/lib/interpretation/schema";
import { zodToOpenAiStrictJsonSchema } from "@/lib/ai/zod-json-schema";
import type { CriterionSnapshot } from "@/lib/criteria/types";

function criterion(
  overrides: Partial<CriterionSnapshot> & Pick<CriterionSnapshot, "name">,
): CriterionSnapshot {
  return {
    criterionType: overrides.criterionType ?? "custom",
    dataType: overrides.dataType ?? "TEXT",
    operator: overrides.operator ?? "EQUALS",
    importance: overrides.importance ?? "MEDIUM",
    isRequired: overrides.isRequired ?? false,
    isDisqualifier: overrides.isDisqualifier ?? false,
    sortOrder: overrides.sortOrder ?? 0,
    ...overrides,
  };
}

describe("evidence class normalize + infer", () => {
  it('classes "Uses Salesforce or HubSpot" as TARGETED_SEARCH and splits allowed values', () => {
    const evidenceClass = inferEvidenceClassFromCriterion({
      name: "Required Technologies",
      criterionType: "technology",
      description: "Uses Salesforce or HubSpot",
    });
    expect(evidenceClass).toBe("TARGETED_SEARCH");

    const split = normalizeInOperatorValues({
      operator: "IN",
      dataType: "MULTI_SELECT",
      targetValue: ["salesforce.com or hubspot CRM"],
    });
    expect(split.splitPerformed).toBe(true);
    expect(split.targetValue).toEqual(["salesforce.com", "hubspot CRM"]);
    expect(split.allowedValues).toEqual(["salesforce.com", "hubspot CRM"]);
  });

  it('classes "Between 50 and 500 employees" as LIST_DATA', () => {
    expect(
      inferEvidenceClassFromCriterion({
        name: "Employee Count",
        criterionType: "employee_count",
        description: "Between 50 and 500 employees",
      }),
    ).toBe("LIST_DATA");
  });

  it("classes company_revenue and employee_count slugs as LIST_DATA", () => {
    expect(
      inferEvidenceClassFromCriterion({
        name: "Size",
        criterionType: "company_revenue",
      }),
    ).toBe("LIST_DATA");
    expect(
      inferEvidenceClassFromCriterion({
        name: "Headcount range",
        criterionType: "employee_count",
      }),
    ).toBe("LIST_DATA");
  });

  it("classes canonical LIST_DATA slugs even when the name is generic", () => {
    expect(
      inferEvidenceClassFromCriterion({
        name: "Filter",
        criterionType: "geography",
      }),
    ).toBe("LIST_DATA");
    expect(
      inferEvidenceClassFromCriterion({
        name: "Filter",
        criterionType: "Industry",
      }),
    ).toBe("LIST_DATA");
  });

  it("repairs unlocked TARGETED_SEARCH firmographics and leaves real lookups alone", () => {
    expect(
      repairedEvidenceClassIfMisclassed({
        evidenceClass: "TARGETED_SEARCH",
        evidenceClassLocked: false,
        name: "Industry",
        criterionType: "industry",
      }),
    ).toBe("LIST_DATA");
    expect(
      repairedEvidenceClassIfMisclassed({
        evidenceClass: "TARGETED_SEARCH",
        name: "Employee Count",
        criterionType: "employee_count",
      }),
    ).toBe("LIST_DATA");
    expect(
      repairedEvidenceClassIfMisclassed({
        evidenceClass: "TARGETED_SEARCH",
        name: "Company Revenue",
        criterionType: "company_revenue",
      }),
    ).toBe("LIST_DATA");
    expect(
      repairedEvidenceClassIfMisclassed({
        evidenceClass: "TARGETED_SEARCH",
        name: "Geography",
        criterionType: "geography",
      }),
    ).toBe("LIST_DATA");
    expect(
      repairedEvidenceClassIfMisclassed({
        evidenceClass: "TARGETED_SEARCH",
        evidenceClassLocked: true,
        name: "Industry",
        criterionType: "industry",
      }),
    ).toBeNull();
    expect(
      repairedEvidenceClassIfMisclassed({
        evidenceClass: "TARGETED_SEARCH",
        name: "Required Technologies",
        criterionType: "technology",
        description: "Uses Salesforce or HubSpot",
      }),
    ).toBeNull();
  });

  it("does not let a conservative TARGETED_SEARCH proposal override firmographics", () => {
    expect(
      resolveIcpEvidenceClass({
        proposed: "TARGETED_SEARCH",
        name: "Industry",
        criterionType: "industry",
        description: "Industry in [SaaS, Cyber Security, B2B, Software Companies]",
      }),
    ).toBe("LIST_DATA");
    expect(
      resolveIcpEvidenceClass({
        proposed: "TARGETED_SEARCH",
        name: "Employee Count",
        criterionType: "employee_count",
        description: "Between 50 and 500 employees",
      }),
    ).toBe("LIST_DATA");
    expect(
      resolveIcpEvidenceClass({
        proposed: null,
        name: "Company Revenue",
        criterionType: "company_revenue",
        description: "between 50000000 and 100000000",
      }),
    ).toBe("LIST_DATA");
    expect(
      resolveIcpEvidenceClass({
        proposed: undefined,
        name: "Geography",
        criterionType: "geography",
        description: "in [United States of America]",
      }),
    ).toBe("LIST_DATA");
    expect(
      resolveIcpEvidenceClass({
        proposed: "TARGETED_SEARCH",
        name: "Hiring sales leaders or reps",
        criterionType: "hiring_signal",
        description: "are hiring sales leaders or reps",
      }),
    ).toBe("TARGETED_SEARCH");
  });

  it("defaults missing or unrecognized class to TARGETED_SEARCH", () => {
    expect(normalizeEvidenceClass(undefined)).toBe("TARGETED_SEARCH");
    expect(normalizeEvidenceClass(null)).toBe("TARGETED_SEARCH");
    expect(normalizeEvidenceClass("NOT_A_REAL_CLASS")).toBe("TARGETED_SEARCH");
    expect(normalizeEvidenceClass("list_data")).toBe("LIST_DATA");
  });

  it("splits embedded or/and/, lists", () => {
    expect(splitEmbeddedListValue("salesforce.com or hubspot CRM")).toEqual([
      "salesforce.com",
      "hubspot CRM",
    ]);
    expect(splitEmbeddedListValue("a, b, and c")).toEqual(["a", "b", "c"]);
  });
});

describe("evidence class summary (internal helper)", () => {
  it("still describes class counts for internal callers", () => {
    const summary = buildEvidenceClassSummary([
      { evidenceClass: "LIST_DATA" },
      { evidenceClass: "LIST_DATA" },
      { evidenceClass: "LIST_DATA" },
      { evidenceClass: "TARGETED_SEARCH" },
    ]);
    expect(summary).toMatch(/3 of 4 criteria come from your list/i);
    expect(summary).toMatch(/1 may not be verifiable online/i);
  });
});

describe("user override fingerprint / material change", () => {
  it("user class override fingerprint survives when text is unchanged", () => {
    const base = {
      name: "Required Technologies",
      description: "CRM stack",
      criterionType: "technology",
      evidenceClass: "TARGETED_SEARCH" as const,
      operator: "IN",
      targetValue: ["Salesforce", "HubSpot"],
    };
    const fp = criterionMaterialFingerprint(base);
    expect(
      isTargetedSearchDecisionStale({
        decision: "KEEP_ASYMMETRIC",
        storedFingerprint: fp,
        currentFingerprint: criterionMaterialFingerprint(base),
      }),
    ).toBe(false);
  });

  it("material text change invalidates approval; unrelated importance alone does not", () => {
    const before = criterionMaterialFingerprint({
      name: "Required Technologies",
      description: "CRM stack",
      criterionType: "technology",
      evidenceClass: "TARGETED_SEARCH",
      operator: "IN",
      targetValue: ["Salesforce"],
    });
    const afterName = criterionMaterialFingerprint({
      name: "Required Technologies (updated)",
      description: "CRM stack",
      criterionType: "technology",
      evidenceClass: "TARGETED_SEARCH",
      operator: "IN",
      targetValue: ["Salesforce"],
    });
    expect(
      isTargetedSearchDecisionStale({
        decision: "KEEP_ASYMMETRIC",
        storedFingerprint: before,
        currentFingerprint: afterName,
      }),
    ).toBe(true);

    // Fingerprint ignores importance / isRequired — those are not material for re-prompt.
    expect(before).toBe(
      criterionMaterialFingerprint({
        name: "Required Technologies",
        description: "CRM stack",
        criterionType: "technology",
        evidenceClass: "TARGETED_SEARCH",
        operator: "IN",
        targetValue: ["Salesforce"],
      }),
    );
  });

  it("locked evidence class is preserved in interpret merge path (source seam)", () => {
    const src = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(src).toContain("applyLockedEvidenceClass");
    expect(src).toContain("evidenceClassLocked");
    expect(src).toContain("nextTier");
    expect(src).toContain("evidenceClass: true, tier: true");
  });
});

describe("TARGETED_SEARCH asymmetry", () => {
  const targeted = criterion({
    name: "Required Technologies",
    criterionType: "technology",
    dataType: "MULTI_SELECT",
    operator: "IN",
    targetValue: ["Salesforce", "HubSpot"],
    isRequired: true,
    evidenceClass: "TARGETED_SEARCH",
  });

  it("no evidence → UNVERIFIABLE, excluded from score, not a fail", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: null,
    });
    expect(result.evidenceOutcome).toBe("UNVERIFIABLE");
    expect(result.assessment).toBe("NEUTRAL");
    expect(result.excludeFromScore).toBe(true);

    const components = calculateComponentScores(
      [
        {
          dimension: "Required Technologies",
          component: "ICP",
          assessment: "NO_FIT",
          evidence: [],
          concerns: [],
          confidence: "HIGH",
        },
        {
          dimension: "Industry",
          component: "ICP",
          assessment: "STRONG",
          evidence: [],
          concerns: [],
          confidence: "HIGH",
        },
      ],
      { excludeIcpDimensionNames: new Set(["Required Technologies"]) },
    );
    expect(components.icpScore).toBe(100);
  });

  it("confirming evidence → CONFIRMED positive contribution", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: "Company uses HubSpot CRM extensively",
    });
    expect(result.evidenceOutcome).toBe("CONFIRMED");
    expect(result.excludeFromScore).toBe(false);
    expect(["STRONG", "MODERATE"]).toContain(result.assessment);
  });

  it("unrelated discovered technologies are absence, not contradiction", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue:
        "DMS analytics, workflow tooling, benchmarking, and FusionAuth",
    });
    expect(result).toMatchObject({
      evidenceOutcome: "UNVERIFIABLE",
      assessment: "NEUTRAL",
      excludeFromScore: true,
    });
  });

  it("contradicting evidence → CONTRADICTED / normal negative", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: "Uses only proprietary internal tools",
    });
    expect(result.evidenceOutcome).toBe("CONTRADICTED");
    expect(result.excludeFromScore).toBe(false);
    expect(["NO_FIT", "WEAK"]).toContain(result.assessment);
  });

  it("does not mistake a negated target mention for confirming evidence", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: "The company does not use Salesforce and uses Dynamics.",
    });
    expect(result).toMatchObject({
      evidenceOutcome: "CONTRADICTED",
      assessment: "NO_FIT",
      excludeFromScore: false,
    });
  });

  it("missing LIST_DATA is unresolvable and excluded from scoring", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: criterion({
        name: "Employee Count",
        criterionType: "employee_count",
        dataType: "NUMBER",
        operator: "BETWEEN",
        minValue: 50,
        maxValue: 500,
        evidenceClass: "LIST_DATA",
      }),
      actualValue: null,
    });
    expect(result).toMatchObject({
      evidenceOutcome: "UNVERIFIABLE",
      assessment: "NEUTRAL",
      excludeFromScore: true,
    });
  });
});

describe("factual AI guard", () => {
  it("AI assessment cannot satisfy a LIST_DATA / TARGETED_SEARCH criterion", () => {
    const factual = evaluateIcpCriterionWithEvidenceClass({
      criterion: criterion({
        name: "Industry",
        criterionType: "industry",
        dataType: "MULTI_SELECT",
        operator: "IN",
        targetValue: ["SaaS"],
        evidenceClass: "LIST_DATA",
      }),
      actualValue: null,
    });
    expect(factual.factualAiForbidden).toBe(true);

    const clamped = clampFactualAiDimension({
      dimensionName: "Industry",
      aiAssessment: "STRONG",
      evidenceAssessment: {
        ...factual,
        evidenceOutcome: "UNVERIFIABLE",
        excludeFromScore: true,
        factualAiForbidden: true,
        assessment: "NEUTRAL",
        method: "ASYMMETRIC",
      },
    });
    expect(clamped.forced).toBe(true);
    expect(clamped.assessment).toBe("UNKNOWN");
  });

  it("calculateScoresFromAssessment clamps factual AI STRONG when unverifiable", () => {
    const result = calculateScoresFromAssessment({
      assessment: {
        dimensions: [
          {
            dimension: "Required Technologies",
            component: "ICP",
            assessment: "STRONG",
            evidence: ["model invented this"],
            concerns: [],
            confidence: "HIGH",
          },
        ],
        fitStrengths: [],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "review",
        reasoning: "test",
      },
      applicable: [
        {
          dimension: "Required Technologies",
          component: "ICP",
        },
      ],
      icp: {
        id: "icp",
        name: "ICP",
        description: null,
        definition: null,
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria: [],
      },
      criterionEvidenceAssessments: [
        {
          scope: "ICP",
          name: "Required Technologies",
          evidenceClass: "TARGETED_SEARCH",
          assessment: "NEUTRAL",
          confidence: "LOW",
          method: "ASYMMETRIC",
          reasoning: "unverifiable",
          evidenceOutcome: "UNVERIFIABLE",
          excludeFromScore: true,
          factualAiForbidden: true,
        },
      ],
    });
    expect(result.dimensions[0]?.assessment).toBe("UNKNOWN");
    // Excluded from ICP average → neutral 50 component default when no scored dims.
    expect(result.icpScore).toBe(50);
    expect(result.componentCoverage.icp).toEqual({ evaluated: 0, total: 1 });
    expect(result.scoreLabel).toBe("FAIR");
  });

  it("excludes an AI STRONG for a blank LIST_DATA field from the score", () => {
    const industryCriterion = criterion({
      id: "industry",
      name: "Industry",
      criterionType: "industry",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: ["SaaS", "B2B"],
      evidenceClass: "LIST_DATA",
      isRequired: true,
    });
    const evidenceAssessment = evaluateIcpCriterionWithEvidenceClass({
      criterion: industryCriterion,
      actualValue: null,
    });
    expect(evidenceAssessment).toMatchObject({
      assessment: "NEUTRAL",
      evidenceOutcome: "UNVERIFIABLE",
      excludeFromScore: true,
      factualAiForbidden: true,
    });

    const result = calculateScoresFromAssessment({
      assessment: {
        dimensions: [
          {
            dimension: "Industry",
            component: "ICP",
            assessment: "STRONG",
            evidence: ["model invented B2B from research narrative"],
            concerns: [],
            confidence: "HIGH",
          },
        ],
        fitStrengths: [],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "review",
        reasoning: "test",
      },
      applicable: [{ dimension: "Industry", component: "ICP" }],
      icp: {
        id: "icp",
        name: "Primary Target",
        description: null,
        definition: null,
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria: [industryCriterion],
      },
      criterionEvidenceAssessments: [evidenceAssessment],
    });

    expect(result.dimensions[0]?.assessment).toBe("UNKNOWN");
    expect(result.dimensions[0]?.assessment).not.toBe("STRONG");
    // A leaked AI STRONG would score 100. Exclusion yields the empty-average fallback.
    expect(result.icpScore).toBe(50);
    expect(result.icpScore).not.toBe(100);
    expect(result.componentCoverage.icp).toEqual({ evaluated: 0, total: 1 });
  });

  it("does not let AI STRONG satisfy a factual criterion when evidence assessments are omitted", () => {
    const industryCriterion = criterion({
      id: "industry",
      name: "Industry",
      criterionType: "industry",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: ["SaaS"],
      evidenceClass: "LIST_DATA",
    });
    const result = calculateScoresFromAssessment({
      assessment: {
        dimensions: [
          {
            dimension: "Industry",
            component: "ICP",
            assessment: "STRONG",
            evidence: ["invented"],
            concerns: [],
            confidence: "HIGH",
          },
        ],
        fitStrengths: [],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "review",
        reasoning: "test",
      },
      applicable: [{ dimension: "Industry", component: "ICP" }],
      icp: {
        id: "icp",
        name: "ICP",
        description: null,
        definition: null,
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria: [industryCriterion],
      },
    });
    expect(result.dimensions[0]?.assessment).toBe("UNKNOWN");
    expect(result.icpScore).toBe(50);
    expect(result.componentCoverage.icp).toEqual({ evaluated: 0, total: 1 });
  });

  it("scores one passing ICP criterion while excluding three unresolvable criteria", () => {
    const criteria = [
      criterion({
        id: "industry",
        name: "Industry",
        criterionType: "industry",
        dataType: "MULTI_SELECT",
        operator: "IN",
        targetValue: ["SaaS", "B2B"],
        evidenceClass: "LIST_DATA",
        isRequired: true,
      }),
      criterion({
        id: "employees",
        name: "Employee Count",
        criterionType: "employee_count",
        dataType: "NUMBER",
        operator: "BETWEEN",
        minValue: 50,
        maxValue: 500,
        evidenceClass: "LIST_DATA",
      }),
      criterion({
        id: "revenue",
        name: "Company Revenue",
        criterionType: "company_revenue",
        dataType: "CURRENCY",
        operator: "BETWEEN",
        minValue: 10_000_000,
        maxValue: 100_000_000,
        evidenceClass: "LIST_DATA",
      }),
      criterion({
        id: "technologies",
        name: "Required Technologies",
        criterionType: "technology",
        dataType: "MULTI_SELECT",
        operator: "IN",
        targetValue: ["Salesforce", "HubSpot"],
        evidenceClass: "TARGETED_SEARCH",
        isRequired: true,
      }),
    ];
    const actualValues = [
      "B2B SaaS",
      null,
      null,
      "DMS analytics, workflow tooling, benchmarking, and FusionAuth",
    ];
    const criterionEvidenceAssessments = criteria.map((entry, index) =>
      evaluateIcpCriterionWithEvidenceClass({
        criterion: entry,
        actualValue: actualValues[index],
      }),
    );

    const result = calculateScoresFromAssessment({
      assessment: {
        dimensions: criteria.map((entry) => ({
          dimension: entry.name,
          component: "ICP" as const,
          assessment: "STRONG" as const,
          evidence: [],
          concerns: [],
          confidence: "HIGH" as const,
        })),
        fitStrengths: [],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "Review the evidence gaps.",
        reasoning: "One criterion is confirmed.",
      },
      applicable: criteria.map((entry) => ({
        component: "ICP" as const,
        dimension: entry.name,
      })),
      icp: {
        id: "primary-target",
        name: "Primary Target",
        description: null,
        definition: null,
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria,
      },
      criterionEvidenceAssessments,
    });

    expect(result.icpScore).toBe(100);
    expect(result.componentCoverage.icp).toEqual({ evaluated: 1, total: 4 });
    expect(result.scoreLabel).toBe("FAIR");
    expect(result.fitRisks).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Employee Count"),
        expect.stringContaining("Company Revenue"),
        expect.stringContaining("Required Technologies"),
      ]),
    );
  });
});

describe("cap enforcement", () => {
  it("four TARGETED_SEARCH against cap of 3 blocks with named excess; nothing dropped", () => {
    const criteria = [
      { name: "CRM", evidenceClass: "TARGETED_SEARCH" as const },
      { name: "Buildings", evidenceClass: "TARGETED_SEARCH" as const },
      { name: "Certifications", evidenceClass: "TARGETED_SEARCH" as const },
      { name: "Fleet", evidenceClass: "TARGETED_SEARCH" as const },
    ];
    const cap = checkTargetedSearchCap({ criteria, maxAllowed: 3 });
    expect(cap.ok).toBe(false);
    if (!cap.ok) {
      expect(cap.exceedingNames).toEqual(["Fleet"]);
      expect(cap.message).toContain('"Fleet"');
      expect(cap.message).toContain("limit 3");
      expect(cap.message).toContain("Good to know");
      expect(cap.message).toContain("Remove a listed criterion");
      expect(cap.message).not.toMatch(/Remove or reclassify/i);
    }
    expect(criteria).toHaveLength(4);
  });

  it("does not count SECONDARY TARGETED_SEARCH toward the cap", () => {
    expect(
      countsTowardTargetedSearchCap({
        evidenceClass: "TARGETED_SEARCH",
        tier: "SECONDARY",
      }),
    ).toBe(false);
    expect(
      countsTowardTargetedSearchCap({
        evidenceClass: "TARGETED_SEARCH",
        tier: "PRIMARY",
      }),
    ).toBe(true);
    expect(
      countsTowardTargetedSearchCap({
        evidenceClass: "TARGETED_SEARCH",
      }),
    ).toBe(true);

    const mixed = checkTargetedSearchCap({
      criteria: [
        {
          name: "CRM",
          evidenceClass: "TARGETED_SEARCH",
          tier: "PRIMARY",
        },
        {
          name: "Buildings",
          evidenceClass: "TARGETED_SEARCH",
          tier: "PRIMARY",
        },
        {
          name: "Certifications",
          evidenceClass: "TARGETED_SEARCH",
          tier: "SECONDARY",
        },
        {
          name: "Fleet",
          evidenceClass: "TARGETED_SEARCH",
          tier: "SECONDARY",
        },
        {
          name: "Hiring",
          evidenceClass: "TARGETED_SEARCH",
          tier: "SECONDARY",
        },
      ],
      maxAllowed: 3,
    });
    expect(mixed.ok).toBe(true);

    const allSecondary = checkTargetedSearchCap({
      criteria: [
        {
          name: "CRM",
          evidenceClass: "TARGETED_SEARCH",
          tier: "SECONDARY",
        },
        {
          name: "Buildings",
          evidenceClass: "TARGETED_SEARCH",
          tier: "SECONDARY",
        },
        {
          name: "Certifications",
          evidenceClass: "TARGETED_SEARCH",
          tier: "SECONDARY",
        },
        {
          name: "Fleet",
          evidenceClass: "TARGETED_SEARCH",
          tier: "SECONDARY",
        },
      ],
      maxAllowed: 3,
    });
    expect(allSecondary.ok).toBe(true);

    const fourPrimary = checkTargetedSearchCap({
      criteria: [
        { name: "CRM", evidenceClass: "TARGETED_SEARCH", tier: "PRIMARY" },
        {
          name: "Buildings",
          evidenceClass: "TARGETED_SEARCH",
          tier: "PRIMARY",
        },
        {
          name: "Certifications",
          evidenceClass: "TARGETED_SEARCH",
          tier: "PRIMARY",
        },
        { name: "Fleet", evidenceClass: "TARGETED_SEARCH", tier: "PRIMARY" },
      ],
      maxAllowed: 3,
    });
    expect(fourPrimary.ok).toBe(false);
  });
});

describe("ICP interpretation prose + definition isolation", () => {
  it("parses a prose read-back without a rewritten definition field", () => {
    const parsed = parseIcpInterpretedCriteria({
      understoodSummary:
        "You want mid-market SaaS companies with a CRM already in place.",
      undetermined: [
        "Preferred CRM brand mix when both Salesforce and HubSpot appear",
      ],
      criteria: [
        {
          name: "Industry",
          criterionType: "industry",
          dataType: "MULTI_SELECT",
          operator: "IN",
          targetValue: ["SaaS"],
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
    });
    expect(parsed.understoodSummary).toMatch(/mid-market SaaS/);
    expect(parsed.undetermined[0]).toMatch(/CRM/);
    expect(parsed).not.toHaveProperty("definition");
  });

  it("keeps evidenceClass in the structured schema and accepts null", () => {
    const jsonSchema = zodToOpenAiStrictJsonSchema(
      icpInterpretationResultSchema,
    );
    const criteria = (jsonSchema.properties as Record<string, unknown>)
      .criteria as Record<string, unknown>;
    const items = criteria.items as Record<string, unknown>;
    const props = items.properties as Record<string, unknown>;
    expect(props).toHaveProperty("evidenceClass");
    expect(items.required as string[]).toContain("evidenceClass");

    const parsed = parseIcpInterpretedCriteria({
      understoodSummary: "Mid-market SaaS.",
      undetermined: [],
      criteria: [
        {
          name: "Industry",
          criterionType: "industry",
          dataType: "MULTI_SELECT",
          operator: "IN",
          targetValue: ["SaaS"],
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
          evidenceClass: null,
          sortOrder: 0,
        },
      ],
    });
    expect(parsed.criteria[0]?.evidenceClass ?? null).toBeNull();
  });

  it("prompt describes evidenceClass and the structured schema requires the key", () => {
    const icp = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    const content = readFileSync(
      "src/lib/prompt-content/icp-interpretation.ts",
      "utf8",
    );
    expect(content).toContain("Assign evidenceClass using these definitions");
    expect(icp).toContain(
      'evidenceClass: "LIST_DATA|COMPANY_RESEARCH|TARGETED_SEARCH|SEMANTIC"',
    );
    expect(content).toContain('"Industry is X" → LIST_DATA');

    const jsonSchema = zodToOpenAiStrictJsonSchema(
      icpInterpretationResultSchema,
    );
    const criteria = (jsonSchema.properties as Record<string, unknown>)
      .criteria as Record<string, unknown>;
    const items = criteria.items as Record<string, unknown>;
    const props = items.properties as Record<string, unknown>;
    const evidenceClass = props.evidenceClass as Record<string, unknown>;
    expect(items.required as string[]).toContain("evidenceClass");
    expect(JSON.stringify(evidenceClass)).toContain("LIST_DATA");
    expect(JSON.stringify(evidenceClass)).toContain("TARGETED_SEARCH");
  });

  it("interpretation persist path never writes Icp.definition", () => {
    const src = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(src).toMatch(
      /icp\.definition\?\.trim\(\) \|\| icp\.description\?\.trim\(\)/,
    );
    expect(src).toContain(
      "interpretationSummary: parsed.understoodSummary.trim()",
    );
    expect(src).not.toMatch(/data:\s*\{[\s\S]{0,400}definition:/);
  });
});

describe("prompt version + UI seams", () => {
  it("ICP interpretation prompt version is 6 and asserted in prompt builder", () => {
    expect(ICP_INTERPRETATION_PROMPT_VERSION).toBe("7");
    const icp = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    const content = readFileSync(
      "src/lib/prompt-content/icp-interpretation.ts",
      "utf8",
    );
    expect(icp).toContain("TARGETED_SEARCH");
    expect(content).toContain("Uses Greenhouse or Lever");
    expect(content).toContain("array of discrete");
    expect(icp).toContain("understoodSummary");
    expect(content).toContain("Always use LIST_DATA for these");
    expect(icp).toContain("logIcpInterpretationEvidenceClasses");
    expect(icp).toContain("resolveIcpEvidenceClass");
    expect(icp).toContain("repairUnlockedIcpEvidenceClasses");
    expect(icp).not.toMatch(/Prefer this when unsure/);
    expect(icp).not.toMatch(/data:\s*\{[\s\S]{0,400}definition:/);
    const types = readFileSync("src/lib/criteria/types.ts", "utf8");
    expect(types).toContain('ICP_INTERPRETATION_PROMPT_VERSION = "7"');
    const evidenceClass = readFileSync("src/lib/criteria/evidence-class.ts", "utf8");
    expect(evidenceClass).toContain("Good to know");
    expect(evidenceClass).toContain("countsTowardTargetedSearchCap");
    const backfill = readFileSync("src/lib/criteria/legacy-backfill.ts", "utf8");
    expect(backfill).toContain("resolveIcpEvidenceClass");
  });

  it("criteria review UI shows role, mandatory hover, and a single targeted warning", () => {
    const ui = readFileSync("src/components/IcpCriteriaReview.tsx", "utf8");
    expect(ui).toContain('data-testid="icp-role-summary"');
    expect(ui).toContain("buildIcpRoleSummary");
    expect(ui).toContain("KEEP_ASYMMETRIC");
    expect(ui).toContain("MAKE_SUPPORTING");
    expect(ui).toContain("REMOVE");
    expect(ui).toContain('data-testid="icp-interpretation-prose"');
    expect(ui).toContain("Could not be determined from available data");
    expect(ui).toContain('data-testid="icp-primary-tier"');
    expect(ui).toContain('data-testid="icp-secondary-tier"');
    expect(ui).toContain('data-testid="icp-mandatory-toggle"');
    expect(ui).toContain("title={ICP_MANDATORY_EXPLANATION}");
    expect(ui).toContain("ICP_PRIMARY_TIER_HEADER");
    expect(ui).toContain("ICP_SECONDARY_TIER_HEADER");
    expect(ui).toContain("May not be verifiable online");
    expect(ui).toContain('data-testid="targeted-search-warning"');
    expect(ui).toContain('data-testid="limited-public-evidence-warning"');
    expect(ui).toContain("criterionFlagLabels");
    expect(ui).not.toContain("Evidence source");
    expect(ui).not.toContain("updateIcpEvidenceClassAction");
    expect(ui).not.toContain("From your list");
    expect(ui).not.toContain('data-testid="evidence-class-summary"');
    expect(ui).not.toContain("expectation-line");
    expect(ui).not.toContain("TARGETED_SEARCH_SECTION_TITLE");
  });

  it("MAKE_SUPPORTING demote only clears isRequired via decide action", () => {
    const actions = readFileSync("src/app/actions/interpretation.ts", "utf8");
    expect(actions).toContain("decideIcpTargetedSearchAction");
    expect(actions).toContain('decision === "MAKE_SUPPORTING" ? false');
    expect(actions).toContain("updateIcpCriterionTierAction");
  });
});
