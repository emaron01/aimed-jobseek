import { describe, expect, it } from "vitest";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";
import {
  buildStarterTargetEmployerDefinition,
} from "@/lib/icp/starter-draft";
import {
  statedEmployerCompensationFromNotes,
  statedEmployerCompensationFromProfile,
} from "@/lib/icp/stated-compensation";
import { compensationConfig } from "@/lib/product-config";

describe("starter Target Employer compensation", () => {
  it("starts empty when the seeker's notes do not state compensation", () => {
    const stated = statedEmployerCompensationFromNotes(
      "Join a climate-tech company that is still growing. Remote-first.",
    );
    expect(stated.targetAnnualEarningsMin).toBe("");
    expect(stated.targetAnnualEarningsTarget).toBe("");
    expect(stated.targetHourlyRateMin).toBe("");
    expect(stated.targetHourlyRateTarget).toBe("");
    expect(stated.employmentTypes).toBe("");
    expect(stated.annualEarningsMinimumRequired).toBe("");
  });

  it("copies compensation the seeker's notes state and does not invent the other side", () => {
    const annual = statedEmployerCompensationFromNotes(
      "I need at least $180,000 a year.",
    );
    expect(annual.targetAnnualEarningsMin).toBe("180000");
    expect(annual.targetAnnualEarningsTarget).toBe("");
    expect(annual.compensationCurrency).toBe(compensationConfig.defaultCurrency);

    const range = statedEmployerCompensationFromNotes(
      "Target annual earnings of $150,000 to $180,000.",
    );
    expect(range.targetAnnualEarningsMin).toBe("150000");
    expect(range.targetAnnualEarningsTarget).toBe("180000");

    const hourly = statedEmployerCompensationFromNotes("I charge $75 per hour.");
    expect(hourly.targetHourlyRateTarget).toBe("75");
    expect(hourly.targetHourlyRateMin).toBe("");
    expect(hourly.targetAnnualEarningsMin).toBe("");
  });

  it("does not put compensation into the starter definition", () => {
    const profile = emptyCandidateProfile();
    profile.direction.targetTitles = [
      {
        id: "title_1",
        kind: "INFERENCE",
        text: "Staff Product Designer",
        provenance: [],
      },
    ];
    profile.compensation = {
      id: "comp_1",
      kind: "FACT",
      text: "Seeking $180,000 a year.",
      provenance: [{ sourceId: "src_notes" }],
    };
    const definition = buildStarterTargetEmployerDefinition(profile);
    expect(definition).toContain("Staff Product Designer");
    expect(definition).not.toMatch(/180/);
    const stated = statedEmployerCompensationFromProfile(profile);
    expect(stated.targetAnnualEarningsTarget).toBe("180000");
    expect(stated.targetAnnualEarningsMin).toBe("");
  });
});
