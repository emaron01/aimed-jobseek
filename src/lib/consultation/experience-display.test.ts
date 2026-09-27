import { describe, expect, it } from "vitest";
import {
  formatExperienceLine,
  formatListPlain,
} from "@/lib/consultation/experience-display";
import { readFileSync } from "node:fs";

describe("plain experience line", () => {
  it("formats years and employers without months or date ranges", () => {
    const line = formatExperienceLine({
      totalYears: 14.7,
      periods: [
        { roleId: "r1" },
        { roleId: "r2" },
        { roleId: "r3" },
        { roleId: "r4" },
      ],
      missingDateRoleIds: [],
      roles: [
        {
          id: "r1",
          employer: "OpenText",
          title: "Director",
          label: "Director at OpenText",
        },
        {
          id: "r2",
          employer: "Login VSI",
          title: "VP",
          label: "VP at Login VSI",
        },
        {
          id: "r3",
          employer: "Micro Focus",
          title: "GM",
          label: "GM at Micro Focus",
        },
        {
          id: "r4",
          employer: "Gryphon Networks",
          title: "CRO",
          label: "CRO at Gryphon Networks",
        },
      ],
    });
    expect(line).toBe(
      "About 15 years of relevant experience across OpenText, Login VSI, Micro Focus, and Gryphon Networks.",
    );
    expect(line).not.toMatch(/month/i);
    expect(line).not.toMatch(/\d+\.\d+\s*[–-]\s*\d+/);
    expect(line).not.toMatch(/Verified experience/);
    expect(line).not.toMatch(/toward/);
  });

  it("asks for missing dates in plain language", () => {
    expect(
      formatExperienceLine({
        totalYears: 8.2,
        periods: [{ roleId: "r1" }],
        missingDateRoleIds: ["r2"],
        roles: [
          {
            id: "r1",
            employer: "Acme",
            title: "Engineer",
            label: "Engineer at Acme",
          },
          {
            id: "r2",
            employer: "Beta Co",
            title: "Manager",
            label: "Manager at Beta Co",
          },
        ],
      }),
    ).toBe(
      "About 8 years of relevant experience across Acme. Add dates for Manager at Beta Co.",
    );
    expect(formatListPlain(["A", "B", "C"])).toBe("A, B, and C");
  });

  it("is used by the Harper standing display", () => {
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).toContain("formatExperienceLine");
    expect(section).not.toContain("Verified experience");
    expect(section).not.toContain("formatExperienceRange");
  });
});
