import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { employerIdentityCopy } from "@/lib/product-config";
import {
  mayUseEmployerResearch,
  usableEmployerResearch,
  verifyEmployerIdentity,
} from "@/lib/job-requirement/identity-verification";

const STUDENT_TEAM_RESEARCH = {
  companyName: "Acme Robotics",
  companySummary:
    "Acme Robotics is an FTC (FIRST Tech Challenge) student robotics team in Nevada City, CA. It is community-supported and not a commercial company.",
  whatTheySell: "Student robotics for grades 9-12 through FIRST Tech Challenge.",
  businessModel: "A high-school student team, not a commercial employer.",
  companySizeContext: "Seven students on a community-supported team.",
  location: "Nevada City, CA",
  website: null,
  identityAmbiguous: false,
  researchSources: [
    {
      url: "https://ftc-events.firstinspires.org/team/12345",
      title: "FTC Team 12345",
      supports: ["FIRST Tech Challenge student team"],
    },
  ],
};

const MATCHING_COMMERCIAL_RESEARCH = {
  companyName: "Acme Robotics",
  companySummary: "Acme Robotics builds warehouse robots for production facilities.",
  whatTheySell: "Warehouse robotics systems for commercial fulfillment.",
  businessModel: "B2B robotics software and hardware.",
  companySizeContext: "Growth-stage, about 200 employees.",
  location: "Austin, TX",
  website: "https://acmerobotics.example",
  identityAmbiguous: false,
  researchSources: [
    {
      url: "https://acmerobotics.example/about",
      title: "About Acme Robotics",
      supports: ["Warehouse robotics for production facilities"],
    },
  ],
};

function fixturePosting() {
  return {
    rawText: NORMAL_JOB_POSTING,
    title: "Senior Product Engineer",
    companyName: "Acme Robotics",
    location: "Austin, TX",
    employmentType: "Full-time",
    seniority: "Senior",
    compensationRange: "$160,000–$190,000",
    suppliedEmployerWebsite: null,
  };
}

describe("employer identity verification", () => {
  it("marks a student team with the same name as the fixture posting as ambiguous", () => {
    const verification = verifyEmployerIdentity({
      posting: fixturePosting(),
      research: STUDENT_TEAM_RESEARCH,
    });
    expect(verification.verdict).toBe("AMBIGUOUS");
    expect(verification.checks.some((check) => check.status === "MISMATCH")).toBe(
      true,
    );
    expect(verification.checks.find((check) => check.key === "industry")?.status).toBe(
      "MISMATCH",
    );
    expect(verification.checks.find((check) => check.key === "location")?.status).toBe(
      "MISMATCH",
    );
    expect(
      verification.checks.find((check) => check.key === "sizeOrStage")?.status,
    ).toBe("NOT_STATED");
    expect(verification.checks.find((check) => check.key === "website")?.status).toBe(
      "MISMATCH",
    );
    expect(
      mayUseEmployerResearch({
        confirmation: "PENDING",
        verification,
        identityAmbiguous: false,
      }),
    ).toBe(false);
    expect(
      usableEmployerResearch(
        { identityConfirmation: "PENDING", identityVerificationJson: verification },
        { identityAmbiguous: false, companySummary: STUDENT_TEAM_RESEARCH.companySummary },
      ),
    ).toBeNull();
  });

  it("gives the student-team fixture like-with-like reasons a seeker can understand", () => {
    const verification = verifyEmployerIdentity({
      posting: fixturePosting(),
      research: STUDENT_TEAM_RESEARCH,
    });
    const byKey = Object.fromEntries(
      verification.checks.map((check) => [check.key, check]),
    );
    expect(byKey.industry?.reason).toBe(
      employerIdentityCopy.reasonTemplates.industryCompare
        .replace(
          "{posting}",
          employerIdentityCopy.kinds.commercialCompany.replace(
            "{industry}",
            "warehouse robotics",
          ),
        )
        .replace("{research}", employerIdentityCopy.kinds.highSchoolTeam),
    );
    expect(byKey.location?.reason).toContain("austin");
    expect(byKey.location?.reason).toContain("nevada city");
    expect(byKey.sizeOrStage?.status).toBe("NOT_STATED");
    expect(byKey.sizeOrStage?.reason).toBe(employerIdentityCopy.notStatedInPosting);
    expect(byKey.sizeOrStage?.postingEvidence).toBeNull();
    expect(byKey.website?.reason).toContain("firstinspires");
    const evidence = verification.checks.flatMap((check) => [
      check.postingEvidence,
      check.researchEvidence,
      check.reason,
    ]);
    for (const text of evidence) {
      if (!text) continue;
      expect(text).not.toMatch(/\bSenior\b/i);
      expect(text).not.toMatch(/Product Engineer/i);
      expect(text).not.toMatch(/Director of Engineering/i);
      expect(text).not.toMatch(/Technical Recruiter/i);
    }
    expect(byKey.industry?.reason).toMatch(/commercial/i);
    expect(byKey.industry?.reason).toMatch(/high school robotics team/i);
  });

  it("does not let downstream generation use unconfirmed mismatched research", () => {
    const verification = verifyEmployerIdentity({
      posting: fixturePosting(),
      research: STUDENT_TEAM_RESEARCH,
    });
    expect(
      mayUseEmployerResearch({
        confirmation: "PENDING",
        verification,
      }),
    ).toBe(false);
    expect(
      mayUseEmployerResearch({
        confirmation: "REJECTED",
        verification,
      }),
    ).toBe(false);
    expect(
      mayUseEmployerResearch({
        confirmation: "CONFIRMED",
        verification,
      }),
    ).toBe(true);
  });

  it("does not treat a careers or news domain as a material website mismatch", () => {
    const verification = verifyEmployerIdentity({
      posting: fixturePosting(),
      research: {
        ...MATCHING_COMMERCIAL_RESEARCH,
        website: null,
        researchSources: [
          {
            url: "https://example.com/acme-robotics",
            title: "Acme Robotics",
            supports: ["Warehouse robotics for production facilities"],
          },
        ],
      },
    });
    expect(verification.checks.find((check) => check.key === "website")?.status).toBe(
      "NOT_STATED",
    );
    expect(verification.verdict).toBe("MATCHED");
  });

  it("accepts research that matches the commercial posting", () => {
    const verification = verifyEmployerIdentity({
      posting: fixturePosting(),
      research: MATCHING_COMMERCIAL_RESEARCH,
    });
    expect(verification.verdict).toBe("MATCHED");
    expect(verification.checks.every((check) => check.status !== "MISMATCH")).toBe(
      true,
    );
    expect(
      mayUseEmployerResearch({
        confirmation: "PENDING",
        verification,
      }),
    ).toBe(true);
  });

  it("gates hiring-team and generation context on confirmed research", () => {
    const hiringTeam = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    const context = readFileSync("src/lib/generation/context.ts", "utf8");
    const summary = readFileSync("src/lib/application-summary/service.ts", "utf8");
    expect(hiringTeam).toContain("usableEmployerResearch");
    expect(context).toContain("usableEmployerResearch");
    expect(summary).toContain("usableEmployerResearch");
  });
});
