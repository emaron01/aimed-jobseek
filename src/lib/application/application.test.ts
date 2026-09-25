import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applicationFitStaleReason,
  applyFitOverride,
  computeApplicationEmployerFit,
  formatFitBucketLabel,
  researchRefreshStaleReason,
  targetEmployerStaleReason,
} from "@/lib/application/fit";
import {
  decideEmployerResearch,
  decisionAfterResearchIdentity,
} from "@/lib/job-requirement/employer";
import {
  AGENCY_JOB_POSTING,
  CONFIDENTIAL_JOB_POSTING,
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { jobSeekerResearchColumns } from "@/lib/research/job-seeker-columns";
import { criterionFlags } from "@/lib/product-config";
import type { CriterionSnapshot } from "@/lib/criteria/types";

function criterion(overrides: Partial<CriterionSnapshot>): CriterionSnapshot {
  return {
    id: "c1",
    name: "Industry",
    criterionType: "industry",
    dataType: "TEXT",
    operator: "CONTAINS",
    targetValue: "robotics",
    importance: "HIGH",
    isRequired: false,
    isDisqualifier: false,
    evidenceClass: "LIST_DATA",
    tier: "PRIMARY",
    isMandatory: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe("job requirement parser", () => {
  const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);

  it("does not invent a field the posting does not state", () => {
    const withInvention = normalizeParsedJobRequirement(
      {
        ...NORMAL_JOB_MODEL,
        reportingLine: "Chief Executive Officer",
        responsibilities: [
          ...NORMAL_JOB_MODEL.responsibilities,
          "Own the company P&L",
        ],
      },
      NORMAL_JOB_POSTING,
    );
    expect(withInvention.reportingLine).toBeNull();
    expect(parsed.reportingLine).toBe("Director of Engineering");
    expect(withInvention.responsibilities).not.toContain("Own the company P&L");
    expect(parsed.compensationRange).toBe("$160,000–$190,000");
  });

  it("keeps required and preferred in the lists the posting states", () => {
    expect(parsed.requiredItems).toEqual([
      "5 years of Python",
      "Experience shipping production services",
    ]);
    expect(parsed.preferredItems).toEqual(["ROS2 experience"]);
  });

  it("marks scorecard items that were derived rather than stated", () => {
    expect(parsed.scorecard.mission?.inferred).toBe(false);
    expect(parsed.scorecard.mission?.id).toMatch(/^sc_/);
    const derived = parsed.scorecard.outcomes[0];
    expect(derived?.inferred).toBe(true);
    expect(derived?.text).toContain("motion-planning");
    const inventedCompetency = parsed.scorecard.competencies.find((item) =>
      item.text.includes("incident response"),
    );
    expect(inventedCompetency?.inferred).toBe(true);
    expect(parsed.scorecard.competencies.find((item) => item.text === "5 years of Python")?.inferred).toBe(false);
  });

  it("keeps the same scorecard id when the item is parsed again", () => {
    const again = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    expect(again.scorecard.mission?.id).toBe(parsed.scorecard.mission?.id);
  });

  it("keeps a recruiter named in the posting as FACT", () => {
    expect(parsed.namedContacts).toEqual([
      {
        firstName: "Priya",
        lastName: "Shah",
        title: "Technical Recruiter",
        email: "priya.shah@acmerobotics.example",
        phone: "512-555-0148",
      },
    ]);
    const invented = normalizeParsedJobRequirement(
      {
        ...NORMAL_JOB_MODEL,
        namedContacts: [
          ...NORMAL_JOB_MODEL.namedContacts,
          {
            firstName: "Invented",
            lastName: "Person",
            title: "Recruiter",
            email: "invented@example.test",
            phone: null,
          },
        ],
      },
      NORMAL_JOB_POSTING,
    );
    expect(invented.namedContacts.map((row) => row.firstName)).not.toContain(
      "Invented",
    );
  });
});

describe("employer identity", () => {
  it("skips research and fit for an agency posting", () => {
    const decision = decideEmployerResearch({
      rawText: AGENCY_JOB_POSTING,
      matches: [{ id: "agency", name: "Staffing agency", identityAmbiguous: false }],
    });
    expect(decision.disposition).toBe("UNDISCLOSED");
    expect(decision.runResearch).toBe(false);
    expect(decision.scoreFit).toBe(false);
    if (decision.disposition === "UNDISCLOSED") {
      expect(decision.reason).toMatch(/staffing or recruiting agency/i);
    }
  });

  it("skips research and fit for a confidential posting", () => {
    const decision = decideEmployerResearch({
      rawText: CONFIDENTIAL_JOB_POSTING,
      matches: [],
    });
    expect(decision.disposition).toBe("UNDISCLOSED");
    expect(decision.runResearch).toBe(false);
    expect(decision.scoreFit).toBe(false);
    if (decision.disposition === "UNDISCLOSED") {
      expect(decision.reason).toMatch(/does not disclose the employer/i);
    }
  });

  it("waits for confirmation when the employer is ambiguous", () => {
    const decision = decideEmployerResearch({
      rawText: NORMAL_JOB_POSTING,
      matches: [
        { id: "a", name: "Acme Robotics", identityAmbiguous: false },
        { id: "b", name: "Acme Robotics", identityAmbiguous: false },
      ],
    });
    expect(decision.disposition).toBe("AMBIGUOUS");
    expect(decision.runResearch).toBe(false);
    expect(decision.scoreFit).toBe(false);
    expect(decisionAfterResearchIdentity(true).scoreFit).toBe(false);
  });

  it("researches a named employer from a normal posting", () => {
    const decision = decideEmployerResearch({
      rawText: NORMAL_JOB_POSTING,
      matches: [{ id: "acme", name: "Acme Robotics", identityAmbiguous: false }],
    });
    expect(decision).toMatchObject({
      disposition: "IDENTIFIED",
      companyId: "acme",
      runResearch: true,
      scoreFit: true,
    });
  });
});

describe("application employer fit", () => {
  it("evaluates a LIST_DATA criterion from company research", () => {
    const result = computeApplicationEmployerFit({
      criteria: [criterion({ evidenceClass: "LIST_DATA" })],
      company: { industry: null, employeeCount: null, location: null },
      research: {
        companySummary: "Acme Robotics builds warehouse robots.",
        buyingSignals: [],
        hiringSignals: ["Hiring platform engineers"],
      },
      interpretationPromptVersion: "7",
    });
    expect(result.outcomes[0]?.assessment).toBe("STRONG");
    expect(result.outcomes[0]?.source).toMatch(/research/i);
    expect(result.blocksDownstream).toBe(false);
  });

  it("displays a Deal-breaker hit and does not block anything", () => {
    const result = computeApplicationEmployerFit({
      criteria: [
        criterion({
          name: "Excluded industries",
          operator: "NOT_IN",
          targetValue: ["defense"],
          isDisqualifier: true,
          evidenceClass: "LIST_DATA",
        }),
      ],
      company: {},
      research: { whatTheySell: "defense contractors" },
      interpretationPromptVersion: "7",
    });
    expect(result.outcomes[0]?.dealBreakerHit).toBe(true);
    expect(result.blocksDownstream).toBe(false);
    expect(result.outcomes[0]?.evidence).toMatch(/defense/i);
  });

  it("keeps an override on the fit record", () => {
    const stored = applyFitOverride(
      {
        bucket: "EXCLUDED" as const,
        overrideBucket: null,
        overrideReason: null,
        overriddenAt: null,
        stale: false,
        staleReason: null,
        computedAt: new Date("2026-09-01T00:00:00Z"),
        icpUpdatedAt: new Date("2026-09-01T00:00:00Z"),
        companyResearchUpdatedAt: new Date("2026-09-01T00:00:00Z"),
        interpretationPromptVersion: "7",
      },
      {
        bucket: "GOOD",
        reason: "I know this team.",
        at: new Date("2026-09-02T00:00:00Z"),
      },
    );
    expect(stored.bucket).toBe("EXCLUDED");
    expect(stored.overrideBucket).toBe("GOOD");
    expect(stored.overrideReason).toBe("I know this team.");
    expect(stored.overriddenAt).toEqual(new Date("2026-09-02T00:00:00Z"));
  });

  it("saves an override without a reason", () => {
    const stored = applyFitOverride(
      {
        bucket: "NEEDS_REVIEW" as const,
        overrideBucket: null,
        overrideReason: null,
        overriddenAt: null,
        stale: false,
        staleReason: null,
        computedAt: new Date("2026-09-01T00:00:00Z"),
        icpUpdatedAt: new Date("2026-09-01T00:00:00Z"),
        companyResearchUpdatedAt: new Date("2026-09-01T00:00:00Z"),
        interpretationPromptVersion: "7",
      },
      {
        bucket: "GOOD",
        at: new Date("2026-09-02T00:00:00Z"),
      },
    );
    expect(stored.overrideBucket).toBe("GOOD");
    expect(stored.overrideReason).toBeNull();
  });

  it("goes stale when research refreshes or the Target Employer profile changes", () => {
    const base = {
      computedAt: new Date("2026-09-01T00:00:00Z"),
      recordedIcpUpdatedAt: new Date("2026-09-01T00:00:00Z"),
      recordedResearchUpdatedAt: new Date("2026-09-01T00:00:00Z"),
      recordedPromptVersion: "7",
      currentIcpUpdatedAt: new Date("2026-09-01T00:00:00Z"),
      currentResearchUpdatedAt: new Date("2026-09-01T00:00:00Z"),
      currentPromptVersion: "7",
    };
    expect(
      applicationFitStaleReason({
        ...base,
        currentResearchUpdatedAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toBe(researchRefreshStaleReason());
    expect(
      applicationFitStaleReason({
        ...base,
        currentIcpUpdatedAt: new Date("2026-09-04T00:00:00Z"),
      }),
    ).toBe(targetEmployerStaleReason());
    expect(applicationFitStaleReason(base)).toBeNull();
  });
});

describe("job-seeker research columns", () => {
  it("never writes hiring signals into buyingSignals or estimatedAov", () => {
    const columns = jobSeekerResearchColumns({
      hiringSignals: ["Hiring 12 engineers"],
      buyingSignals: ["Hiring 12 engineers", "Opened a new office"],
      estimatedAov: "$40,000",
      aovReasoning: "guess",
    });
    expect(columns.hiringSignals).toEqual(["Hiring 12 engineers"]);
    expect(columns.buyingSignals).toEqual([]);
    expect(columns.estimatedAov).toBeNull();
    expect(columns.aovReasoning).toBeNull();
    expect(columns.hiringSignals.join(" ")).not.toBe(columns.buyingSignals.join(" "));
  });

  it("stores hiring signals on CompanyResearch.hiringSignals in the save path", () => {
    const source = readFileSync(
      "src/lib/tenant/company-research-service.ts",
      "utf8",
    );
    expect(source).toContain("jobSeekerResearchColumns");
    expect(source).toContain("hiringSignals:");
    expect(source).toContain("markApplicationFitsStaleForCompany");
    const prompt = readFileSync("src/lib/prompt-content/company-research.ts", "utf8");
    expect(prompt).toContain("hiringSignals");
    expect(prompt).not.toContain("Book a demo");
    expect(criterionFlags.disqualifier).toBe("Deal-breaker");
  });
});

describe("employer fit bucket labels", () => {
  it("shows seeker-facing labels instead of stored bucket names", () => {
    expect(formatFitBucketLabel("GOOD")).toBe("Good fit");
    expect(formatFitBucketLabel("NEEDS_REVIEW")).toBe("Needs review");
    expect(formatFitBucketLabel("POOR_FIT")).toBe("Poor fit");
    expect(formatFitBucketLabel("EXCLUDED")).toBe("Excluded");
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    expect(workspace).toContain("formatFitBucketLabel");
    expect(workspace).not.toContain("<option value=\"GOOD\">GOOD</option>");
  });
});
