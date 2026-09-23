import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeApplicationEmployerFit,
  applicationFitStaleReason,
  targetEmployerStaleReason,
} from "@/lib/application/fit";
import {
  compareEmployerCompensation,
  emptyEmployerCompensationProfile,
  type EmployerCompensationProfile,
} from "@/lib/application/compensation-fit";
import { compensationCopy } from "@/lib/product-config";

function profile(
  overrides: Partial<EmployerCompensationProfile> = {},
): EmployerCompensationProfile {
  return { ...emptyEmployerCompensationProfile(), ...overrides };
}

function compensation(result: ReturnType<typeof compareEmployerCompensation>) {
  return result.find((outcome) => outcome.name === compensationCopy.compensationSignal);
}

function employment(result: ReturnType<typeof compareEmployerCompensation>) {
  return result.find((outcome) => outcome.name === compensationCopy.employmentTypeLabel);
}

describe("employer compensation comparison", () => {
  it("compares annual compensation to an annual minimum directly", () => {
    const outcome = compensation(
      compareEmployerCompensation({
        profile: profile({
          targetAnnualEarningsMin: 150000,
          compensationCurrency: "USD",
        }),
        compensationRange: "$160,000–$190,000",
        employmentType: "Full-time",
      }),
    );
    expect(outcome?.estimated).toBe(false);
    expect(outcome?.source).toBeNull();
    expect(outcome?.mustHaveMiss).toBe(false);
    expect(outcome?.preferenceMiss).toBe(false);
    expect(outcome?.evidence).toMatch(/\$190,000/);
    expect(outcome?.evidence).not.toContain(compensationCopy.estimate);
  });

  it("labels an hourly-to-annual comparison as an estimate", () => {
    const outcome = compensation(
      compareEmployerCompensation({
        profile: profile({
          targetAnnualEarningsMin: 150000,
          annualEarningsMinimumRequired: true,
          compensationCurrency: "USD",
        }),
        compensationRange: "$40 per hour",
        employmentType: null,
      }),
    );
    expect(outcome?.estimated).toBe(true);
    expect(outcome?.source).toBe(compensationCopy.estimate);
    expect(outcome?.evidence).toContain(compensationCopy.estimate);
    expect(outcome?.evidence).toMatch(/\$83,200/);
    expect(outcome?.mustHaveMiss).toBe(true);
  });

  it("shows not stated when the posting has no compensation", () => {
    const outcome = compensation(
      compareEmployerCompensation({
        profile: profile({
          targetAnnualEarningsMin: 150000,
          annualEarningsMinimumRequired: true,
        }),
        compensationRange: null,
        employmentType: null,
      }),
    );
    expect(outcome?.evidence).toBe(compensationCopy.notStated);
    expect(outcome?.mustHaveMiss).toBe(false);
    expect(outcome?.preferenceMiss).toBe(false);
    expect(outcome?.estimated).toBe(false);
  });

  it("marks a posting maximum below the minimum as a Must-have miss when the minimum is hard", () => {
    const outcome = compensation(
      compareEmployerCompensation({
        profile: profile({
          targetAnnualEarningsMin: 150000,
          annualEarningsMinimumRequired: true,
          compensationCurrency: "USD",
        }),
        compensationRange: "$120,000",
        employmentType: null,
      }),
    );
    expect(outcome?.mustHaveMiss).toBe(true);
    expect(outcome?.preferenceMiss).toBe(false);
    expect(outcome?.evidence).toMatch(/below/);
    expect(outcome?.estimated).toBe(false);
  });

  it("marks a posting maximum below the minimum as a preference when the minimum is not hard", () => {
    const outcome = compensation(
      compareEmployerCompensation({
        profile: profile({
          targetAnnualEarningsMin: 150000,
          annualEarningsMinimumRequired: false,
          compensationCurrency: "USD",
        }),
        compensationRange: "$120,000",
        employmentType: null,
      }),
    );
    expect(outcome?.mustHaveMiss).toBe(false);
    expect(outcome?.preferenceMiss).toBe(true);
    expect(outcome?.evidence).toMatch(/below/);
  });

  it("signals an employment type mismatch", () => {
    const hard = employment(
      compareEmployerCompensation({
        profile: profile({
          employmentTypes: ["FULL_TIME"],
          employmentTypeRequired: true,
        }),
        compensationRange: null,
        employmentType: "Part-time",
      }),
    );
    expect(hard?.mustHaveMiss).toBe(true);
    expect(hard?.preferenceMiss).toBe(false);
    expect(hard?.evidence).toMatch(/Part-time/);

    const preference = employment(
      compareEmployerCompensation({
        profile: profile({
          employmentTypes: ["FULL_TIME"],
          employmentTypeRequired: false,
        }),
        compensationRange: null,
        employmentType: "Part-time",
      }),
    );
    expect(preference?.mustHaveMiss).toBe(false);
    expect(preference?.preferenceMiss).toBe(true);
  });

  it("does not treat a matching employment type or an unstated type as a mismatch", () => {
    const match = employment(
      compareEmployerCompensation({
        profile: profile({ employmentTypes: ["FULL_TIME", "PART_TIME"] }),
        compensationRange: null,
        employmentType: "Full-time",
      }),
    );
    expect(match?.mustHaveMiss).toBe(false);
    expect(match?.preferenceMiss).toBe(false);
    expect(match?.assessment).toBe("STRONG");

    const unstated = employment(
      compareEmployerCompensation({
        profile: profile({
          employmentTypes: ["FULL_TIME"],
          employmentTypeRequired: true,
        }),
        compensationRange: null,
        employmentType: "Contract",
      }),
    );
    expect(unstated?.evidence).toBe(compensationCopy.notStated);
    expect(unstated?.mustHaveMiss).toBe(false);
  });

  it("keeps a compensation miss as a signal and does not block downstream work", () => {
    const result = computeApplicationEmployerFit({
      criteria: [],
      company: {},
      research: null,
      interpretationPromptVersion: "7",
      compensation: {
        profile: profile({
          targetAnnualEarningsMin: 150000,
          annualEarningsMinimumRequired: true,
          compensationCurrency: "USD",
        }),
        compensationRange: "$120,000",
        employmentType: "Part-time",
      },
    });
    expect(result.blocksDownstream).toBe(false);
    expect(result.bucket).toBe("NEEDS_REVIEW");
    expect(result.outcomes.some((outcome) => outcome.mustHaveMiss)).toBe(true);
  });

  it("stales employer fit when the Target Employer profile changes, including compensation", () => {
    const reason = applicationFitStaleReason({
      computedAt: new Date("2026-09-01T00:00:00Z"),
      recordedIcpUpdatedAt: new Date("2026-09-01T00:00:00Z"),
      recordedResearchUpdatedAt: new Date("2026-09-01T00:00:00Z"),
      recordedPromptVersion: "7",
      currentIcpUpdatedAt: new Date("2026-09-05T00:00:00Z"),
      currentResearchUpdatedAt: new Date("2026-09-01T00:00:00Z"),
      currentPromptVersion: "7",
    });
    expect(reason).toBe(targetEmployerStaleReason());
    const updateIcp = readFileSync("src/lib/tenant/data.ts", "utf8");
    expect(updateIcp).toContain("markApplicationFitsStaleForIcp");
  });
});
