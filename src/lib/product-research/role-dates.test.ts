import { describe, expect, it } from "vitest";
import {
  calculateExperienceYears,
  profileEvidenceItems,
  verifyModelAssessments,
} from "@/lib/consultation/assess";
import { planQuestionRound } from "@/lib/consultation/questions";
import {
  fixtureSalesLeadershipProfile,
  fixtureSalesLeadershipResumeText,
} from "@/lib/consultation/fixtures/sales-leadership-profile";
import {
  extractDateRangesFromText,
  fillMissingRoleDates,
  parseExperienceDate,
} from "@/lib/product-research/role-dates";

describe("role date capture", () => {
  it("parses month-year, year-only, and present dates as written", () => {
    expect(parseExperienceDate("Dec 2022")?.precision).toBe("month");
    expect(parseExperienceDate("Apr 2015")?.month).toBe(4);
    expect(parseExperienceDate("2002")?.precision).toBe("year");
    expect(parseExperienceDate("Present")?.present).toBe(true);
    const ranges = extractDateRangesFromText(fixtureSalesLeadershipResumeText());
    expect(ranges.length).toBeGreaterThanOrEqual(9);
    expect(ranges.some((range) => range.startDate === "Dec 2022")).toBe(true);
    expect(ranges.some((range) => range.startDate === "2002")).toBe(true);
  });

  it("restores missing role dates from resume text without overwriting existing dates", () => {
    const profile = fixtureSalesLeadershipProfile();
    const stripped = {
      ...profile,
      experience: profile.experience.map((role) => ({
        ...role,
        startDate: null,
        endDate: null,
      })),
    };
    const restored = fillMissingRoleDates(stripped, [
      { sourceId: "src_sales_resume", text: fixtureSalesLeadershipResumeText() },
    ]);
    expect(restored.filled).toHaveLength(9);
    expect(restored.profile.experience[0]?.startDate).toBe("Dec 2022");
    expect(restored.profile.experience[0]?.endDate).toMatch(/Present/i);
    expect(restored.profile.experience.find((role) => role.id === "role_importers")?.startDate).toBe(
      "2002",
    );
    const kept = fillMissingRoleDates(profile, [
      { sourceId: "src_sales_resume", text: fixtureSalesLeadershipResumeText() },
    ]);
    expect(kept.filled).toHaveLength(0);
    expect(kept.profile.experience[0]?.startDate).toBe("Dec 2022");
  });
});

describe("sales leadership years calculation", () => {
  it("credits year-only dates conservatively, shows a range, and meets 10 years without asking for months", () => {
    const profile = fixtureSalesLeadershipProfile();
    const items = profileEvidenceItems(profile);
    const calculated = calculateExperienceYears({
      requiredYears: 10,
      roleIds: profile.experience.map((role) => role.id),
      profileItems: items,
      asOf: new Date("2026-09-25T00:00:00.000Z"),
    });
    expect(calculated.missingDateRoleIds).toEqual([]);
    expect(calculated.totalYears).toBeGreaterThanOrEqual(10);
    expect(calculated.maximumYears).toBeGreaterThan(calculated.totalYears);
    const [assessment] = verifyModelAssessments({
      targets: [
        {
          key: "required:0",
          kind: "REQUIRED",
          text: "10+ years of progressive leadership",
        },
      ],
      profileItems: items,
      assessments: [
        {
          targetKey: "required:0",
          strength: "STRONG",
          supportingFactIds: ["ach_meddic"],
          relevantRoleIds: profile.experience.map((role) => role.id),
          explanation:
            "The dated leadership roles cover more than ten conservative years.",
          strategyMode: "PROVE_WITH_STORY",
          strategy: "Lead with the manager-bench and forecast story.",
        },
      ],
      asOf: new Date("2026-09-25T00:00:00.000Z"),
    });
    expect(assessment?.strength).toBe("STRONG");
    const planned = planQuestionRound({
      assessments: [assessment!],
      modelQuestions: [
        {
          targetKey: "required:0",
          text: "What month and year did each of those leadership roles start and end?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs exact months to calculate tenure.",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(planned.questions).toEqual([]);
  });
});
