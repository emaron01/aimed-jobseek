import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cheatSheetPersonSectionInputHash } from "@/lib/application-summary/people";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
} from "@/lib/application-summary/contract";
import { deriveCareerStage } from "@/lib/consultation/career-stage";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  buildConsultationCoachMessages,
  buildConsultationPolishMessages,
} from "@/lib/consultation/prompt";
import {
  APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS,
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const AS_OF = new Date("2026-09-28T00:00:00.000Z");

const COACH_CAREER_STAGE_LINE =
  "- Match careerStage: for new_to_workforce or college_graduate, ask about school, internships, projects, part-time work, and activities when the profile has them; for early_career through late_career, ask about roles and results at the level of this job.";

const DRAW_EXAMPLES_LINE =
  "Draw examples that fit careerStage: for new_to_workforce or college_graduate, school, internships, projects, part-time work, and activities; for early_career through late_career, roles and results at the level of this job.";

function role(
  partial: Partial<CandidateProfile["experience"][number]> &
    Pick<CandidateProfile["experience"][number], "id">,
): CandidateProfile["experience"][number] {
  return {
    kind: "FACT",
    employer: partial.employer ?? "Acme",
    title: partial.title ?? "Engineer",
    startDate: partial.startDate ?? null,
    endDate: partial.endDate ?? null,
    location: null,
    summary: partial.summary ?? null,
    achievements: [],
    reasonForLeaving: null,
    provenance: [{ sourceId: "src_test" }],
    ...partial,
  };
}

function education(
  text: string,
): CandidateProfile["education"][number] {
  return {
    id: "edu_1",
    kind: "FACT",
    text,
    provenance: [{ sourceId: "src_edu" }],
  };
}

function profile(input: {
  experience?: CandidateProfile["experience"];
  education?: CandidateProfile["education"];
}): Pick<CandidateProfile, "experience" | "education"> {
  return {
    experience: input.experience ?? [],
    education: input.education ?? [],
  };
}

describe("Harper Batch D5 — career stage", () => {
  it("bumps prompt versions for career-stage instructions", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("31");
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("14");
  });

  it("adds the exact coach, polish, and Cheat Sheet careerStage lines", () => {
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(COACH_CAREER_STAGE_LINE);
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(DRAW_EXAMPLES_LINE);
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(
      DRAW_EXAMPLES_LINE,
    );
  });

  it("deriveCareerStage: new_to_workforce for only internships and a class project", () => {
    expect(
      deriveCareerStage(
        profile({
          experience: [
            role({
              id: "r1",
              title: "Software Engineering Intern",
              startDate: "2024-06",
              endDate: "2024-08",
            }),
            role({
              id: "r2",
              title: "Class Project — Course Scheduler",
              employer: "State University",
              startDate: "2024-01",
              endDate: "2024-05",
            }),
          ],
          education: [education("B.S. Computer Science")],
        }),
        AS_OF,
      ),
    ).toBe("new_to_workforce");
  });

  it("deriveCareerStage: college_graduate for a new graduate with a degree and 1 year of work", () => {
    expect(
      deriveCareerStage(
        profile({
          experience: [
            role({
              id: "r1",
              title: "Junior Analyst",
              startDate: "2025-09",
              endDate: "2026-09",
            }),
          ],
          education: [education("B.A. Economics, 2025")],
        }),
        AS_OF,
      ),
    ).toBe("college_graduate");
  });

  it("deriveCareerStage: early_career for 5 years", () => {
    expect(
      deriveCareerStage(
        profile({
          experience: [
            role({
              id: "r1",
              title: "Engineer",
              startDate: "2021-09",
              endDate: "2026-09",
            }),
          ],
        }),
        AS_OF,
      ),
    ).toBe("early_career");
  });

  it("deriveCareerStage: mid_career for 10 years", () => {
    expect(
      deriveCareerStage(
        profile({
          experience: [
            role({
              id: "r1",
              title: "Engineer",
              startDate: "2016-09",
              endDate: "2026-09",
            }),
          ],
        }),
        AS_OF,
      ),
    ).toBe("mid_career");
  });

  it("deriveCareerStage: late_career for 25 years with only 4 roles (years decide)", () => {
    expect(
      deriveCareerStage(
        profile({
          experience: [
            role({
              id: "r1",
              title: "Engineer",
              startDate: "2001-01",
              endDate: "2008-01",
            }),
            role({
              id: "r2",
              title: "Senior Engineer",
              startDate: "2008-01",
              endDate: "2014-01",
            }),
            role({
              id: "r3",
              title: "Staff Engineer",
              startDate: "2014-01",
              endDate: "2020-01",
            }),
            role({
              id: "r4",
              title: "Principal Engineer",
              startDate: "2020-01",
              endDate: "2026-01",
            }),
          ],
        }),
        AS_OF,
      ),
    ).toBe("late_career");
  });

  it("deriveCareerStage: role-count fallback when dates cannot be parsed", () => {
    expect(
      deriveCareerStage(
        profile({
          experience: [
            role({ id: "r1", title: "Engineer", startDate: null, endDate: null }),
            role({ id: "r2", title: "Lead", startDate: "unreadable", endDate: "nope" }),
          ],
        }),
        AS_OF,
      ),
    ).toBe("early_career");

    expect(
      deriveCareerStage(
        profile({
          experience: [
            role({ id: "a", title: "A", startDate: null, endDate: null }),
            role({ id: "b", title: "B", startDate: null, endDate: null }),
            role({ id: "c", title: "C", startDate: null, endDate: null }),
          ],
        }),
        AS_OF,
      ),
    ).toBe("mid_career");

    expect(
      deriveCareerStage(
        profile({
          experience: Array.from({ length: 6 }, (_, index) =>
            role({
              id: `r${index}`,
              title: `Role ${index}`,
              startDate: null,
              endDate: null,
            }),
          ),
        }),
        AS_OF,
      ),
    ).toBe("late_career");
  });

  it("deriveCareerStage: does not double-count overlapping roles", () => {
    // 2020-01..2023-01 and 2022-01..2024-01 → merged 2020-01..2024-01 = 49 months ≈ 4.1y → early_career
    // Without merge would be ~5y + ~2y overcounted; still early, so assert via college boundary:
    // Overlap that stays under 3 years when merged, over 3 if double-counted.
    const stage = deriveCareerStage(
      profile({
        experience: [
          role({
            id: "a",
            title: "Role A",
            startDate: "2023-01",
            endDate: "2025-01",
          }),
          role({
            id: "b",
            title: "Role B",
            startDate: "2024-01",
            endDate: "2026-01",
          }),
        ],
        education: [education("B.S.")],
      }),
      AS_OF,
    );
    // Merged: 2023-01..2026-01 = 37 months → early_career (>= 3y)
    // If double-counted: 24+24=48 months still early. Use a tighter window:
    expect(stage).toBe("early_career");

    const underThreeMerged = deriveCareerStage(
      profile({
        experience: [
          role({
            id: "a",
            title: "Role A",
            startDate: "2024-06",
            endDate: "2026-06",
          }),
          role({
            id: "b",
            title: "Role B",
            startDate: "2025-01",
            endDate: "2026-06",
          }),
        ],
        education: [education("B.S.")],
      }),
      AS_OF,
    );
    // Merged ~24 months → college_graduate; double-count ~42 months → early_career
    expect(underThreeMerged).toBe("college_graduate");
  });

  it("passes careerStage into coach, polish, and Cheat Sheet person payloads", () => {
    const coach = JSON.parse(
      buildConsultationCoachMessages({
        targets: [],
        profileItems: [],
        careerStage: "mid_career",
        hiringTeam: [],
        seekerStatedFacts: [],
        companyResearch: null,
        askedQuestions: [],
        chronologyRequested: false,
        coveredTargetKeys: [],
      })[1]!.content,
    );
    expect(coach.careerStage).toBe("mid_career");

    const polish = JSON.parse(
      buildConsultationPolishMessages({
        answer: "I led the work.",
        story: { situation: null, task: null, action: null, result: null },
        declinedFollowUp: false,
        strengtheningNeeds: [],
        careerStage: "college_graduate",
        profileItems: [],
      })[1]!.content,
    );
    expect(polish.careerStage).toBe("college_graduate");

    const cheatSheet = JSON.parse(
      buildApplicationSummaryGuidanceMessages({
        sources: [],
        people: [
          {
            sectionKey: "contact:1",
            roleId: "role-1",
            contactId: "1",
            heading: "Alex",
            roleName: "Hiring Manager",
            titles: ["Director"],
            sectionKind: "HIRING_MANAGER",
          },
        ],
        mode: "person",
        careerStage: "late_career",
      })[1]!.content,
    );
    expect(cheatSheet.careerStage).toBe("late_career");
  });

  it("includes careerStage in the Cheat Sheet person input hash fingerprint", () => {
    const person = {
      sectionKey: "contact:1",
      roleId: "role-1",
      contactId: "1",
      heading: "Alex",
      roleName: "Hiring Manager",
      titles: ["Director"],
      sectionKind: "HIRING_MANAGER",
    };
    const sources = [{ id: "job:title", text: "Engineer" }];
    const mid = cheatSheetPersonSectionInputHash({
      person,
      sources,
      careerStage: "mid_career",
    });
    const midAgain = cheatSheetPersonSectionInputHash({
      person,
      sources,
      careerStage: "mid_career",
    });
    const late = cheatSheetPersonSectionInputHash({
      person,
      sources,
      careerStage: "late_career",
    });
    expect(mid).toBe(midAgain);
    expect(mid).not.toBe(late);
  });

  it("never renders careerStage and view paths enqueue no paid call", () => {
    for (const path of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/ConsultationSection.tsx",
      "src/components/HarperPersonView.tsx",
      "src/components/ConsultationStanding.tsx",
      "src/lib/consultation/qa-view.ts",
    ]) {
      const text = src(path);
      expect(text).not.toContain("careerStage");
      expect(text).not.toContain("deriveCareerStage");
      expect(text).not.toContain("new_to_workforce");
      expect(text).not.toContain("college_graduate");
      expect(text).not.toContain("early_career");
      expect(text).not.toContain("mid_career");
      expect(text).not.toContain("late_career");
    }

    const workspace = src("src/components/ApplicationWorkspace.tsx");
    expect(workspace).not.toContain("enqueueApplicationJob");
    expect(workspace).not.toContain("generateStructured");
    expect(workspace).not.toContain("planConsultationWithModel");
    expect(workspace).not.toContain("polishAnswerWithModel");
    expect(workspace).not.toContain("generateCheatSheetPersonSectionGuidance");
  });
});
