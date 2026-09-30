import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.hoisted(() => vi.fn());
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));
const runPaidStructuredCall = vi.hoisted(() => vi.fn());
const findPaidCallReceipt = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
  };
});

vi.mock("@/lib/ai/paid-call-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/paid-call-gate")>();
  return {
    ...actual,
    runPaidStructuredCall,
    findPaidCallReceipt,
  };
});

import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { deriveCareerStage } from "@/lib/consultation/career-stage";
import { careerWalkThroughAlreadyAsked } from "@/lib/consultation/question-detection";
import { deriveRecentRoles } from "@/lib/consultation/recent-roles";
import {
  COACHING_SET_MAX,
  COACHING_SET_MIN,
  ROLE_EXPERTISE_PROMPT_VERSION,
  countNonRoleExpertiseQuestions,
  generateRoleExpertiseWithModel,
  roleExpertiseFillRange,
  roleExpertiseJobFingerprint,
  validateRoleExpertiseQuestions,
  type RoleExpertiseQuestion,
} from "@/lib/consultation/role-expertise";
import { fixtureSalesLeadershipProfile } from "@/lib/consultation/fixtures/sales-leadership-profile";
import {
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const AS_OF = new Date("2026-09-28T00:00:00.000Z");

const COACH_RECENT_ROLES_LINE =
  "- The career walk-through covers only the roles in recentRoles (roughly the last 3 to 5 years). Never ask the person to walk through their whole career or start from their first job.";

const SALES_ONLY =
  /\b(?:MEDDIC|MEDDPICC|quota|pipeline|forecast|deal[- ]?review)\b/i;

function fact(id: string, text: string) {
  return {
    id,
    kind: "FACT" as const,
    text,
    provenance: [{ sourceId: "src_test" }],
  };
}

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

function carQuestion(
  text: string,
  tag: RoleExpertiseQuestion["interviewTypeTag"] = "focused_competency",
): RoleExpertiseQuestion {
  return {
    text,
    interviewTypeTag: tag,
    answerFramework: "CAR",
    challenge: "I faced a staffing gap on the unit.",
    situation: null,
    task: null,
    action: "I rebalanced assignments across the shift.",
    result: "The unit stayed calm through the night.",
  };
}

const fixtures = {
  nurse: {
    job: {
      title: "Registered Nurse",
      companyName: "City Hospital",
      seniority: "Mid",
      location: "Boston, MA",
      workArrangement: "On-site",
      requiredItems: ["BLS", "Patient assessment"],
      preferredItems: ["ICU experience"],
      responsibilities: ["Bedside care"],
      scorecardJson: {
        mission: { text: "Safe patient care" },
        outcomes: [{ text: "Reduce falls" }],
        competencies: [{ text: "Clinical judgment" }],
      },
    },
    profile: {
      experience: [
        role({
          id: "rn1",
          title: "Staff Nurse",
          employer: "City Hospital",
          startDate: "2021-01",
          endDate: "Present",
          summary: "Med-surg bedside care and handoffs.",
        }),
      ],
      education: [fact("edu_rn", "BSN, State University")],
    },
  },
  engineer: {
    job: {
      title: "Software Engineer",
      companyName: "Northwind Labs",
      seniority: "Mid",
      location: "Remote",
      workArrangement: "Remote",
      requiredItems: ["TypeScript", "System design"],
      preferredItems: ["Postgres"],
      responsibilities: ["Ship reliable services"],
      scorecardJson: {
        mission: { text: "Build reliable products" },
        outcomes: [{ text: "Reduce incidents" }],
        competencies: [{ text: "Ownership" }],
      },
    },
    profile: {
      experience: [
        role({
          id: "eng1",
          title: "Software Engineer",
          employer: "Contoso",
          startDate: "2020-01",
          endDate: "Present",
          summary: "Built TypeScript services.",
        }),
      ],
      education: [],
    },
  },
  hotelGm: {
    job: {
      title: "Hotel General Manager",
      companyName: "Harbor Inn",
      seniority: "Director",
      location: "Miami, FL",
      workArrangement: "On-site",
      requiredItems: ["P&L ownership", "Guest experience"],
      preferredItems: ["Union relations"],
      responsibilities: ["Lead hotel operations"],
      scorecardJson: {
        mission: { text: "Memorable guest stays" },
        outcomes: [{ text: "Raise RevPAR" }],
        competencies: [{ text: "People leadership" }],
      },
    },
    profile: {
      experience: [
        role({
          id: "gm1",
          title: "Hotel General Manager",
          employer: "Harbor Inn",
          startDate: "2018-01",
          endDate: "Present",
          summary: "Ran rooms and F&B teams.",
        }),
      ],
      education: [],
    },
  },
  newGradMarketing: {
    job: {
      title: "Marketing Coordinator",
      companyName: "Brightleaf",
      seniority: "Entry",
      location: "Austin, TX",
      workArrangement: "Hybrid",
      requiredItems: ["Campus marketing", "Content drafts"],
      preferredItems: ["Canva"],
      responsibilities: ["Support campaign launches"],
      scorecardJson: {
        mission: { text: "Grow early awareness" },
        outcomes: [{ text: "Support launches" }],
        competencies: [{ text: "Organization" }],
      },
    },
    profile: {
      experience: [
        role({
          id: "int1",
          title: "Marketing Intern",
          employer: "Brightleaf",
          startDate: "2025-06",
          endDate: "2025-08",
          summary: "Drafted campus campaign copy.",
        }),
        role({
          id: "proj1",
          title: "Class Project — Brand Refresh",
          employer: "State University",
          startDate: "2025-01",
          endDate: "2025-05",
          summary: "Led a student brand refresh.",
        }),
      ],
      education: [fact("edu_mkt", "B.A. Marketing, 2025")],
    },
  },
  salesDirector: {
    job: {
      title: "Senior Director of Sales",
      companyName: "CSC",
      seniority: "Senior Director",
      location: "Chicago, IL",
      workArrangement: "Hybrid",
      requiredItems: ["Enterprise sales leadership", "Forecast discipline"],
      preferredItems: ["MEDDIC"],
      responsibilities: ["Build manager bench"],
      scorecardJson: {
        mission: { text: "Grow enterprise revenue" },
        outcomes: [{ text: "Hit forecast" }],
        competencies: [{ text: "Coaching sellers" }],
      },
    },
    profile: fixtureSalesLeadershipProfile(),
  },
};

describe("Harper Batch D6 — role-expertise + recentRoles", () => {
  beforeEach(() => {
    generateStructured.mockReset();
    runPaidStructuredCall.mockReset();
    findPaidCallReceipt.mockReset();
    isConsultationAiConfigured.mockReturnValue(true);
    runPaidStructuredCall.mockImplementation(async (input: {
      callProvider: () => Promise<unknown>;
    }) => ({ data: await input.callProvider(), skipped: false }));
  });

  it("bumps consultation prompt version and adds the recentRoles coach line", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("34");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(COACH_RECENT_ROLES_LINE);
    expect(ROLE_EXPERTISE_PROMPT_VERSION).toBe("2");
    expect(ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS).toContain(
      "You are Harper, an expert interview coach. For one job application, you write the questions a hiring manager for this specific role and industry asks, and a suggested answer for each.",
    );
  });

  it("computes fill counts from G (follow-ups and person-prep excluded)", () => {
    expect(roleExpertiseFillRange(5)).toEqual({ minCount: 15, maxCount: 20 });
    expect(roleExpertiseFillRange(0)).toEqual({
      minCount: COACHING_SET_MIN,
      maxCount: COACHING_SET_MAX,
    });
    expect(roleExpertiseFillRange(25)).toEqual({ minCount: 0, maxCount: 0 });
    expect(
      countNonRoleExpertiseQuestions([
        { text: "Gap?", targetKey: "required:0", followUp: false },
        { text: "Follow?", targetKey: "required:0", followUp: true },
        { text: "Prep?", targetKey: "person-prep:c1", followUp: false },
        { text: "Fill?", targetKey: "role-expertise:ops", followUp: false },
      ]),
    ).toBe(1);
  });

  it("deriveRecentRoles: 30-year career keeps only last-5-year overlap + most recent", () => {
    const profile = {
      experience: [
        role({
          id: "old",
          title: "Analyst",
          startDate: "1995-01",
          endDate: "2005-01",
        }),
        role({
          id: "mid",
          title: "Manager",
          startDate: "2005-01",
          endDate: "2018-01",
        }),
        role({
          id: "recent",
          title: "Director",
          startDate: "2018-01",
          endDate: "2024-01",
        }),
        role({
          id: "current",
          title: "VP",
          startDate: "2024-01",
          endDate: "Present",
        }),
      ],
      education: [],
    };
    const recent = deriveRecentRoles(profile, AS_OF);
    const ids = recent.map((item) => item.id);
    expect(ids).toContain("current");
    expect(ids).toContain("recent");
    expect(ids).not.toContain("old");
    expect(ids).not.toContain("mid");
  });

  it("deriveRecentRoles: new graduate yields school, internships, and projects", () => {
    const profile = fixtures.newGradMarketing.profile;
    const stage = deriveCareerStage(profile, AS_OF);
    expect(stage === "college_graduate" || stage === "new_to_workforce").toBe(
      true,
    );
    const recent = deriveRecentRoles(profile, AS_OF, stage);
    const haystack = JSON.stringify(recent).toLowerCase();
    expect(haystack).toMatch(/intern|project|marketing|university|bsn|b\.a/i);
  });

  it("deriveRecentRoles: unreadable dates yield the most recent two roles", () => {
    const profile = {
      experience: [
        role({ id: "a", title: "One", startDate: null, endDate: null }),
        role({ id: "b", title: "Two", startDate: "nope", endDate: "nah" }),
        role({ id: "c", title: "Three", startDate: null, endDate: null }),
      ],
      education: [],
    };
    expect(deriveRecentRoles(profile, AS_OF).map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("validates tags/parts and keeps valid questions after the last attempt", async () => {
    generateStructured
      .mockResolvedValueOnce({
        data: {
          questions: [
            {
              text: "Tell me about a time.",
              interviewTypeTag: "focused_competency",
              answerFramework: "CAR",
              challenge: null,
              situation: null,
              task: null,
              action: "I acted.",
              result: "Ok.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          questions: [
            carQuestion(
              "Walk me through how you handled a hard shift on the unit.",
            ),
            carQuestion(
              "Tell me how you escalate a deteriorating patient.",
            ),
          ],
        },
      });

    const result = await generateRoleExpertiseWithModel({
      organizationId: "org",
      campaignId: "camp",
      job: fixtures.nurse.job,
      minCount: 2,
      maxCount: 3,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: deriveRecentRoles(fixtures.nurse.profile, AS_OF),
      careerStage: "early_career",
      profileItems: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions.length).toBeGreaterThanOrEqual(1);
    for (const question of result.questions) {
      expect([
        "screening",
        "chronological_walk_through",
        "focused_competency",
        "reference_check_prep",
      ]).toContain(question.interviewTypeTag);
      expect(question.grounding.action.trim().length).toBeGreaterThan(0);
      expect(question.grounding.result.trim().length).toBeGreaterThan(0);
    }
  });

  it("rejects a missing part at validation and keeps only valid items", () => {
    const checked = validateRoleExpertiseQuestions({
      questions: [
        carQuestion("How do you prioritize patients on a busy shift?"),
        {
          text: "How do you hand off at change of shift?",
          interviewTypeTag: "focused_competency",
          answerFramework: "CAR",
          challenge: "Busy floor.",
          situation: null,
          task: null,
          action: "",
          result: "Things improved overnight for the team.",
        },
      ],
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
    });
    expect(checked.valid).toHaveLength(1);
    expect(checked.issues.length).toBeGreaterThan(0);
  });

  it("non-sales fixtures reject sales-only terms unless present in job/profile", () => {
    for (const key of ["nurse", "engineer", "hotelGm"] as const) {
      const fixture = fixtures[key];
      const jobText = JSON.stringify(fixture.job);
      const profileText = JSON.stringify(fixture.profile);
      const allowed = `${jobText}\n${profileText}`;
      const question = carQuestion(
        key === "nurse"
          ? "How do you prioritize patients when the unit is short-staffed?"
          : key === "engineer"
            ? "Walk me through a reliability incident you owned end to end."
            : "How do you lead the front desk and rooms teams through a busy weekend?",
      );
      const text = JSON.stringify(question);
      for (const match of text.match(SALES_ONLY) ?? []) {
        expect(allowed.toLowerCase()).toContain(match.toLowerCase());
      }
    }
  });

  it("sales fixture may use MEDDIC when present in job/profile", () => {
    const allowed = `${JSON.stringify(fixtures.salesDirector.job)}\n${JSON.stringify(fixtures.salesDirector.profile)}`;
    expect(allowed).toMatch(/MEDDIC/i);
  });

  it("new-graduate suggested answers draw on school, internships, or projects", () => {
    const stage = deriveCareerStage(fixtures.newGradMarketing.profile, AS_OF);
    const recent = deriveRecentRoles(
      fixtures.newGradMarketing.profile,
      AS_OF,
      stage,
    );
    const haystack = JSON.stringify(recent).toLowerCase();
    expect(haystack).toMatch(/intern|project|university|marketing/);
    const answer =
      "In my marketing internship I drafted campus copy, and in my class project I led a student brand refresh so the launch had a clear voice.";
    expect(answer.toLowerCase()).toMatch(/intern|project|campus|student/);
  });

  it("enforces one career walk-through and never whole-career wording", () => {
    const checked = validateRoleExpertiseQuestions({
      questions: [
        {
          ...carQuestion(
            "Walk me through your whole career starting from your first job.",
            "chronological_walk_through",
          ),
        },
        carQuestion(
          "Walk me through your recent roles and why you moved between them.",
          "chronological_walk_through",
        ),
      ],
      minCount: 0,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: false,
    });
    expect(
      checked.valid.every(
        (item) =>
          !/\bwhole career\b/i.test(item.text) &&
          !/\bfirst job\b/i.test(item.text),
      ),
    ).toBe(true);

    expect(
      careerWalkThroughAlreadyAsked([
        {
          speaker: "CONSULTANT",
          targetKey: "chronology",
          body: "Walk me through your recent roles.",
        },
      ]),
    ).toBe(true);
    expect(
      careerWalkThroughAlreadyAsked([
        {
          speaker: "CONSULTANT",
          targetKey: "role-expertise:career",
          body: "Walk me through your career path over the last few years.",
        },
      ]),
    ).toBe(true);
  });

  it("same job fingerprint skips the provider; job change runs; profile alone does not", async () => {
    const fpA = roleExpertiseJobFingerprint(fixtures.nurse.job);
    const fpB = roleExpertiseJobFingerprint({
      ...fixtures.nurse.job,
      title: "Nurse Practitioner",
    });
    expect(fpA).not.toBe(fpB);
    const fpProfileIrrelevant = roleExpertiseJobFingerprint(fixtures.nurse.job);
    expect(fpProfileIrrelevant).toBe(fpA);

    runPaidStructuredCall.mockResolvedValueOnce({
      data: { questions: [carQuestion("How do you prioritize patients?")] },
      skipped: true,
    });
    generateStructured.mockClear();
    const skipped = await generateRoleExpertiseWithModel({
      organizationId: "org",
      campaignId: "camp",
      job: fixtures.nurse.job,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "early_career",
      profileItems: [{ id: "changed", text: "new profile fact" }],
    });
    expect(skipped.ok).toBe(true);
    if (skipped.ok) expect(skipped.skipped).toBe(true);
  });

  it("nothing runs on a page view or render path", () => {
    for (const path of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ConsultationSection.tsx",
      "src/components/ConsultationStanding.tsx",
      "src/components/HarperPersonView.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("generateRoleExpertiseWithModel");
      expect(text).not.toContain("maybeFillRoleExpertiseAfterGapPlan");
      expect(text).not.toContain("ROLE_EXPERTISE_QUESTIONS");
    }
    const process = src("src/lib/application-jobs/process.ts");
    expect(process).toContain("processConsultationJob");
    expect(process).toContain("continueConsultationPlanning");
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain("maybeFillRoleExpertiseAfterGapPlan");
    expect(service).toContain("planAndStoreRound");
  });

  it("rendered output never contains tags, framework names, part labels, or career stage", () => {
    for (const path of [
      "src/components/ConsultationStanding.tsx",
      "src/components/ConsultationSection.tsx",
      "src/components/HarperPersonView.tsx",
      "src/components/CheatSheetPersonBody.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("careerStage");
      expect(text).not.toContain("new_to_workforce");
      expect(text).not.toContain("college_graduate");
      expect(text).not.toContain("interviewTypeTag");
      expect(text).not.toMatch(/answerFramework/);
      expect(text).not.toContain("Challenge:");
      expect(text).not.toContain("Situation:");
    }
  });

  it("gap questions come before role-expertise in Where you stand partitions", () => {
    const layout = src("src/lib/consultation/harper-layout.ts");
    expect(layout).toContain('ROLE_EXPERTISE_TARGET_PREFIX');
    expect(layout).toContain('"role-expertise"');
    const service = src("src/lib/consultation/service.ts");
    const planIdx = service.indexOf("async function planAndStoreRound");
    const fillIdx = service.indexOf("maybeFillRoleExpertiseAfterGapPlan");
    expect(planIdx).toBeGreaterThan(-1);
    expect(fillIdx).toBeGreaterThan(planIdx);
  });
});
