import { describe, expect, it } from "vitest";
import {
  experienceRoleIdsForYearsTarget,
  verifyModelAssessments,
  type ProfileFactRef,
} from "@/lib/consultation/assess";
import {
  CONSULTATION_PLAN_DECISION_PROMPT_VERSION,
  CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
} from "@/lib/consultation/contract";
import { bestPracticeDraftsForAnswers } from "@/lib/consultation/role-expertise";
import { CONSULTATION_PLAN_DECISION_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-decision";
import { CONSULTATION_PLAN_WRITING_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-writing";

const DECISION_RATING =
  "When a requirement has several parts, rate it PARTIAL if the person's information supports any part; rate it NONE only when nothing supports any part.";

const WRITING_RATING = "Write each explanation consistent with that target's strength.";

const AS_OF = new Date("2026-10-06T00:00:00.000Z");

function experience(
  id: string,
  text: string,
  startDate: string,
  endDate: string | null,
): ProfileFactRef {
  return {
    id,
    kind: "FACT",
    text,
    itemType: "EXPERIENCE",
    startDate,
    endDate,
  };
}

function fact(id: string, text: string): ProfileFactRef {
  return { id, kind: "FACT", text, itemType: "ITEM" };
}

describe("consistent ratings", () => {
  it("places the approved rating sentences on the decision and writing instructions", () => {
    expect(CONSULTATION_PLAN_DECISION_INSTRUCTIONS.endsWith(
      `${DECISION_RATING}\n\nReturn JSON matching the schema only.`,
    )).toBe(true);
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS.endsWith(
      `${WRITING_RATING}\n\nReturn JSON matching the schema only.`,
    )).toBe(true);
    expect(CONSULTATION_PLAN_DECISION_PROMPT_VERSION).toBe("5");
    expect(CONSULTATION_PLAN_WRITING_PROMPT_VERSION).toBe("6");
  });

  it("rates a multi-part requirement PARTIAL when any part is supported, for sales, nursing, and a new graduate", () => {
    const cases = [
      {
        key: "required:methods",
        text: "MEDDPICC and Command of the Message",
        profile: [
          fact(
            "fact-meddpicc",
            "Led a MEDDPICC implementation and held 95% forecast accuracy.",
          ),
        ],
        explanation:
          "You directly support this through MEDDPICC implementation and 95% forecast accuracy.",
      },
      {
        key: "required:nursing",
        text: "Inpatient nursing and surgical first assist",
        profile: [fact("fact-nurse", "Inpatient nursing on a medical unit at County Hospital.")],
        explanation: "You have inpatient nursing experience on a medical unit.",
      },
      {
        key: "required:teaching",
        text: "Classroom teaching and published research",
        profile: [
          fact(
            "fact-student",
            "Student teaching placement in a public school classroom.",
          ),
        ],
        explanation: "You have classroom teaching from a student teaching placement.",
      },
    ];
    for (const item of cases) {
      const [assessment] = verifyModelAssessments({
        targets: [{ key: item.key, kind: "REQUIRED", text: item.text }],
        profileItems: item.profile,
        assessments: [
          {
            targetKey: item.key,
            strength: "NONE",
            supportingFactIds: [item.profile[0]!.id],
            relevantRoleIds: [],
            explanation: item.explanation,
            strategyMode: "REFRAME_ADJACENT",
            strategy: "Use the part the profile already states.",
          },
        ],
        asOf: AS_OF,
      });
      expect(assessment?.strength).toBe("PARTIAL");
      expect(assessment?.explanation).toMatch(/^Supported:/);
      expect(assessment?.explanation).toContain("Missing:");
      expect(assessment?.explanation).not.toMatch(/clearly meet/i);
      const missingPart = item.text.split(/\s+and\s+/i)[1] ?? "";
      expect(assessment?.explanation).toContain(missingPart);
    }

    const [fullyMet] = verifyModelAssessments({
      targets: [
        {
          key: "required:scope",
          kind: "REQUIRED",
          text: "Enterprise sales experience and leadership scope",
        },
      ],
      profileItems: [fact("fact-sales", "Led enterprise sales at OpenText.")],
      assessments: [
        {
          targetKey: "required:scope",
          strength: "PARTIAL",
          supportingFactIds: ["fact-sales"],
          relevantRoleIds: [],
          explanation: "You clearly meet the experience and leadership scope.",
          strategyMode: "REFRAME_ADJACENT",
          strategy: "Use the stated sales experience.",
        },
      ],
      asOf: AS_OF,
    });
    expect(fullyMet?.strength).toBe("PARTIAL");
    expect(fullyMet?.explanation).toBe(
      "Supported: Enterprise sales experience. Missing: leadership scope.",
    );
    expect(fullyMet?.explanation).not.toMatch(/clearly meet/i);

    const [unsupported] = verifyModelAssessments({
      targets: [
        {
          key: "required:unrelated",
          kind: "REQUIRED",
          text: "Quantum cryptography and orbital welding",
        },
      ],
      profileItems: [fact("fact-nurse", "Inpatient nursing on a medical unit.")],
      assessments: [
        {
          targetKey: "required:unrelated",
          strength: "NONE",
          supportingFactIds: [],
          relevantRoleIds: [],
          explanation: "Nothing stated so far covers either part.",
          strategyMode: "ACKNOWLEDGE",
          strategy: "Address the gap honestly.",
        },
      ],
      asOf: AS_OF,
    });
    expect(unsupported?.strength).toBe("NONE");
    expect(unsupported?.explanation).toBe("Nothing stated so far covers either part.");
  });
});

describe("whole drafts", () => {
  it("keeps the introducing sentence ahead of a later reference to the transition", () => {
    const story = "Describe a situation in which you led a regional transition.";
    const droppedOpening = bestPracticeDraftsForAnswers(
      [
        {
          text: story,
          targetKey: "role-expertise:transition",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: story,
          answerFramework: "CAR",
          challenge:
            "As Director, North America Sales, I led the sales strategy and execution for the transition.",
          situation: "The company had just been acquired.",
          task: null,
          action: "I reset the operating rhythm with the remaining team.",
          result: "The team kept its largest accounts through the first year.",
          followUpQuestion: null,
        },
      ],
      [],
    );
    const fromSituation = droppedOpening[0]?.content ?? "";
    expect(fromSituation.startsWith("The company had just been acquired")).toBe(true);
    expect(fromSituation.indexOf("The company had just been acquired")).toBeLessThan(
      fromSituation.indexOf("for the transition"),
    );

    const fromText = bestPracticeDraftsForAnswers(
      [
        {
          text: story,
          targetKey: "role-expertise:transition",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: "The company had just been acquired. As Director, North America Sales, I led the sales strategy and execution for the transition. The team kept its largest accounts.",
          answerFramework: "CAR",
          challenge:
            "As Director, North America Sales, I led the sales strategy and execution for the transition.",
          situation: null,
          task: null,
          action: "I reset the operating rhythm with the remaining team.",
          result: "The team kept its largest accounts through the first year.",
          followUpQuestion: null,
        },
      ],
      [],
    );
    const fromProse = fromText[0]?.content ?? "";
    expect(fromProse.startsWith("The company had just been acquired")).toBe(true);
    expect(fromProse.indexOf("for the transition")).toBeGreaterThan(
      fromProse.indexOf("The company had just been acquired"),
    );

    const nursing = "Describe a situation in which you covered a staffing change.";
    const star = bestPracticeDraftsForAnswers(
      [
        {
          text: nursing,
          targetKey: "role-expertise:rotation",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: nursing,
          answerFramework: "STAR",
          challenge: "The unit had just changed its staffing model.",
          situation: "As charge nurse, I led the nursing plan for the transition.",
          task: "I had to restaff the night rotation.",
          action: "I rebuilt the rotation with the remaining nurses.",
          result: "The unit kept full coverage the next month.",
          followUpQuestion: null,
        },
      ],
      [],
    );
    const nursingDraft = star[0]?.content ?? "";
    expect(nursingDraft.startsWith("The unit had just changed its staffing model")).toBe(true);
    expect(nursingDraft.indexOf("for the transition")).toBeGreaterThan(
      nursingDraft.indexOf("The unit had just changed"),
    );
  });
});

describe("stable experience years", () => {
  function yearsFor(
    targetText: string,
    profileItems: ProfileFactRef[],
    modelRoleIds: string[],
  ) {
    const roleIds = experienceRoleIdsForYearsTarget({
      targetText,
      profileItems,
      modelRoleIds,
    });
    const [assessment] = verifyModelAssessments({
      targets: [{ key: "required:years", kind: "REQUIRED", text: targetText }],
      profileItems,
      assessments: [
        {
          targetKey: "required:years",
          strength: "STRONG",
          supportingFactIds: profileItems.filter((item) => item.itemType === "ITEM").map((item) => item.id),
          relevantRoleIds: modelRoleIds,
          explanation: "The writing step chose a different subset of roles.",
          strategyMode: "PROVE_WITH_STORY",
          strategy: "Walk through the roles where this experience was used.",
        },
      ],
      asOf: AS_OF,
    });
    return {
      roleIds,
      totalYears: assessment?.experienceCalculation?.totalYears,
    };
  }

  it("counts every qualifying role and ignores the writing model's role choice", () => {
    const sales: ProfileFactRef[] = [
      fact("fact-sales", "Led enterprise sales."),
      experience(
        "opentext",
        "VP Enterprise Sales at OpenText. Led enterprise sales.",
        "2018-01",
        "2021-01",
      ),
      experience(
        "loginvsi",
        "VP Sales at Login VSI. Led enterprise sales.",
        "2021-01",
        "2023-06",
      ),
      experience(
        "gryphon",
        "CRO at Gryphon Networks. Led enterprise sales.",
        "2023-06",
        null,
      ),
      experience(
        "microfocus",
        "GM at Micro Focus. Led enterprise sales across the region.",
        "2004-01",
        "2018-01",
      ),
      experience(
        "beta",
        "Software Engineer at Beta. Built internal tools.",
        "2010-01",
        "2014-01",
      ),
    ];
    const salesTarget = "8–10+ years leading enterprise sales";
    const salesA = yearsFor(salesTarget, sales, ["opentext", "loginvsi", "gryphon"]);
    const salesB = yearsFor(salesTarget, sales, ["beta"]);
    expect(salesA.roleIds).toEqual(salesB.roleIds);
    expect(salesA.roleIds).toEqual(["opentext", "loginvsi", "gryphon", "microfocus"]);
    expect(salesA.totalYears).toBe(salesB.totalYears);
    expect(salesA.totalYears).toBeGreaterThan(20);

    const nursing: ProfileFactRef[] = [
      experience(
        "county",
        "Registered nurse at County Hospital. Inpatient nursing on a medical unit.",
        "2014-01",
        "2019-01",
      ),
      experience(
        "riverside",
        "Inpatient nurse at Riverside Hospital.",
        "2019-01",
        "2024-01",
      ),
      experience("retail", "Retail associate at Northwind.", "2010-01", "2014-01"),
    ];
    const nursingTarget = "5 years of inpatient nursing";
    const nursingA = yearsFor(nursingTarget, nursing, ["retail"]);
    const nursingB = yearsFor(nursingTarget, nursing, []);
    expect(nursingA.roleIds).toEqual(["county", "riverside"]);
    expect(nursingB).toEqual(nursingA);

    const graduate: ProfileFactRef[] = [
      experience(
        "school",
        "Clinical placement at a school of nursing.",
        "2022-09",
        "2023-05",
      ),
      fact("school-rotation", "Pediatric nursing rotations."),
      experience(
        "internship",
        "Pediatric nursing internship at City Hospital.",
        "2023-06",
        "2024-05",
      ),
      experience(
        "project",
        "Capstone project on pediatric nursing assessments.",
        "2024-01",
        "2024-06",
      ),
      experience("cafe", "Barista at a cafe.", "2021-06", "2022-05"),
    ];
    graduate[1] = { ...graduate[1]!, roleId: "school" };
    const graduateTarget = "1 year of pediatric nursing";
    const graduateA = yearsFor(graduateTarget, graduate, ["cafe"]);
    const graduateB = yearsFor(graduateTarget, graduate, ["school"]);
    expect(graduateA.roleIds).toEqual(["school", "internship", "project"]);
    expect(graduateB).toEqual(graduateA);
    expect(graduateA.totalYears).toBeGreaterThan(0);
  });
});
