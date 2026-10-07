import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  experienceRoleIdsForYearsTarget,
  explanationContradictsStrength,
  verifyModelAssessments,
  type ProfileFactRef,
} from "@/lib/consultation/assess";
import { approvedRequirementTargetKey } from "@/lib/consultation/harper-layout";
import {
  CONSULTATION_PLAN_DECISION_PROMPT_VERSION,
  CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
} from "@/lib/consultation/contract";
import { bestPracticeDraftsForAnswers } from "@/lib/consultation/role-expertise";
import { CONSULTATION_PLAN_DECISION_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-decision";
import { CONSULTATION_PLAN_WRITING_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-writing";

const DECISION_RATING =
  "Rate a requirement STRONG when the person's information supports every part of it, PARTIAL when it supports some parts (and name the missing part), and NONE when it supports no part. Never lower a rating because a story has not been written yet, a date is missing, or the wording differs.";

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
    expect(CONSULTATION_PLAN_DECISION_PROMPT_VERSION).toBe("6");
    expect(CONSULTATION_PLAN_WRITING_PROMPT_VERSION).toBe("6");
  });

  it("keeps STRONG when every part is supported and PARTIAL when a named part is missing, for sales, nursing, software, and a new graduate", () => {
    const strong = [
      {
        key: "required:methods",
        text: "MEDDPICC and Command of the Message",
        profile: [
          fact("fact-meddpicc", "Led a MEDDPICC implementation and held 95% forecast accuracy."),
          fact("fact-command", "Ran discovery with Command of the Message."),
        ],
        explanation:
          "You support both parts through MEDDPICC implementation and Command of the Message discovery.",
      },
      {
        key: "required:nursing",
        text: "Inpatient nursing and surgical first assist",
        profile: [
          fact("fact-nurse", "Inpatient nursing on a medical unit at County Hospital."),
          fact("fact-assist", "Surgical first assist on general surgery cases."),
        ],
        explanation: "You have inpatient nursing and surgical first assist experience.",
      },
      {
        key: "required:software",
        text: "API design and production on-call",
        profile: [
          fact("fact-api", "Designed the public billing API."),
          fact("fact-oncall", "Took production on-call for the billing service."),
        ],
        explanation: "You have API design and production on-call for the billing service.",
      },
      {
        key: "required:teaching",
        text: "Classroom teaching and published research",
        profile: [
          fact("fact-student", "Student teaching placement in a public school classroom."),
          fact("fact-paper", "Published a research paper on classroom assessment."),
        ],
        explanation: "You have classroom teaching and a published research paper.",
      },
    ];
    for (const item of strong) {
      const [assessment] = verifyModelAssessments({
        targets: [{ key: item.key, kind: "REQUIRED", text: item.text }],
        profileItems: item.profile,
        assessments: [
          {
            targetKey: item.key,
            strength: "STRONG",
            supportingFactIds: item.profile.map((row) => row.id),
            relevantRoleIds: [],
            explanation: item.explanation,
            strategyMode: "PROVE_WITH_STORY",
            strategy: "Use the stated experience.",
          },
        ],
        asOf: AS_OF,
      });
      expect(assessment?.strength).toBe("STRONG");
      expect(assessment?.explanation).toBe(item.explanation);
    }

    const partial = [
      {
        key: "required:methods",
        text: "MEDDPICC and Command of the Message",
        profile: [
          fact("fact-meddpicc", "Led a MEDDPICC implementation and held 95% forecast accuracy."),
        ],
        explanation:
          "MEDDPICC is in your background. Command of the Message is the missing part.",
      },
      {
        key: "required:nursing",
        text: "Inpatient nursing and surgical first assist",
        profile: [fact("fact-nurse", "Inpatient nursing on a medical unit at County Hospital.")],
        explanation:
          "Inpatient nursing is stated. Surgical first assist is the missing part.",
      },
      {
        key: "required:software",
        text: "API design and production on-call",
        profile: [fact("fact-api", "Designed the public billing API.")],
        explanation: "API design is stated. Production on-call is the missing part.",
      },
      {
        key: "required:teaching",
        text: "Classroom teaching and published research",
        profile: [
          fact("fact-student", "Student teaching placement in a public school classroom."),
        ],
        explanation:
          "Classroom teaching is stated. Published research is the missing part.",
      },
    ];
    for (const item of partial) {
      const [assessment] = verifyModelAssessments({
        targets: [{ key: item.key, kind: "REQUIRED", text: item.text }],
        profileItems: item.profile,
        assessments: [
          {
            targetKey: item.key,
            strength: "PARTIAL",
            supportingFactIds: [item.profile[0]!.id],
            relevantRoleIds: [],
            explanation: item.explanation,
            strategyMode: "REFRAME_ADJACENT",
            strategy: "Ask only for the missing part.",
          },
        ],
        asOf: AS_OF,
      });
      expect(assessment?.strength).toBe("PARTIAL");
      expect(assessment?.explanation).toBe(item.explanation);
      expect(assessment?.explanation).toContain("missing part");
    }
  });

  it("does not change a rating from word overlap or a missing date", () => {
    const [overlapped] = verifyModelAssessments({
      targets: [
        {
          key: "required:nursing",
          kind: "REQUIRED",
          text: "Inpatient nursing and surgical first assist",
        },
      ],
      profileItems: [fact("fact-nurse", "Inpatient nursing on a medical unit at County Hospital.")],
      assessments: [
        {
          targetKey: "required:nursing",
          strength: "NONE",
          supportingFactIds: [],
          relevantRoleIds: [],
          explanation: "Nothing stated covers this requirement.",
          strategyMode: "ACKNOWLEDGE",
          strategy: "Address the gap honestly.",
        },
      ],
      asOf: AS_OF,
    });
    expect(overlapped?.strength).toBe("NONE");

    const [undated] = verifyModelAssessments({
      targets: [
        {
          key: "required:years",
          kind: "REQUIRED",
          text: "5 years of inpatient nursing",
        },
      ],
      profileItems: [
        fact("fact-nurse", "Inpatient nursing on a medical unit."),
        experience("county", "Registered nurse at County Hospital. Inpatient nursing.", "Summer 2024", null),
      ],
      assessments: [
        {
          targetKey: "required:years",
          strength: "STRONG",
          supportingFactIds: ["fact-nurse"],
          relevantRoleIds: ["county"],
          explanation: "Inpatient nursing is stated. The role date is incomplete.",
          strategyMode: "PROVE_WITH_STORY",
          strategy: "Use the stated nursing work.",
        },
      ],
      asOf: AS_OF,
    });
    expect(undated?.strength).toBe("STRONG");
    expect(undated?.experienceCalculation).not.toBeNull();
    expect(typeof undated?.experienceCalculation?.totalYears).toBe("number");

    const assess = readFileSync(resolve("src/lib/consultation/assess.ts"), "utf8");
    expect(assess).not.toContain("strengthForMultipartSupport");
    expect(assess).not.toContain("missing or invalid dates");
    expect(assess).not.toContain("do not meet the required duration");
  });
});

describe("explanation matches strength without a template", () => {
  it("leaves the model's explanation unchanged and never writes a Supported/Missing template", () => {
    const [assessment] = verifyModelAssessments({
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
    expect(assessment?.strength).toBe("PARTIAL");
    expect(assessment?.explanation).toBe(
      "You clearly meet the experience and leadership scope.",
    );
    expect(explanationContradictsStrength("PARTIAL", assessment?.explanation ?? "")).toBe(
      true,
    );
    const assess = readFileSync(resolve("src/lib/consultation/assess.ts"), "utf8");
    const service = readFileSync(resolve("src/lib/consultation/service.ts"), "utf8");
    expect(assess).not.toContain("explanationAlignedToStrength");
    expect(assess).not.toContain("Supported:");
    expect(service).not.toContain("Supported:");
    expect(assess).not.toContain("rewriteContradictingExplanations");
    expect(service).not.toContain("rewriteContradictingExplanations");
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).toContain(WRITING_RATING);
    expect(service).toContain("runConsultationPlanWriting");
  });
});

describe("approving a requirement answer moves the score", () => {
  it("sets a requirement row STRONG and leaves an acknowledge-the-gap track unchanged", () => {
    const rows = [
      "required:methods",
      "required:nursing",
      "required:software",
      "required:teaching",
    ];
    for (const targetKey of rows) {
      expect(
        approvedRequirementTargetKey({
          statementKind: "INTERVIEW_ANSWER",
          targetKey,
          confirmedGap: false,
        }),
      ).toBe(targetKey);
      expect(
        approvedRequirementTargetKey({
          statementKind: "INTERVIEW_ANSWER",
          targetKey,
          confirmedGap: true,
        }),
      ).toBe("");
    }
    expect(
      approvedRequirementTargetKey({
        statementKind: "RESUME_BULLET",
        targetKey: "required:nursing",
        confirmedGap: false,
      }),
    ).toBe("");
    expect(
      approvedRequirementTargetKey({
        statementKind: "INTERVIEW_ANSWER",
        targetKey: "why-this-company",
        confirmedGap: false,
      }),
    ).toBe("why-this-company");
    expect(
      approvedRequirementTargetKey({
        statementKind: "INTERVIEW_ANSWER",
        targetKey: "why-this-company",
        confirmedGap: true,
      }),
    ).toBe("");

    const service = readFileSync(resolve("src/lib/consultation/service.ts"), "utf8");
    const approveStart = service.indexOf(
      "export async function approveConsultationStatement",
    );
    const approveFn = service.slice(approveStart, service.indexOf(
      "export async function resolveConsultationStatementFlag",
    ));
    expect(approveFn).toContain("approvedRequirementTargetKey");
    expect(approveFn).toContain('gapDecisionFromAnalysis(statement.turn.analysisJson) === "no_evidence"');
    expect(approveFn).toContain("card?.targetKey ?? statement.turn.targetKey");
    expect(approveFn).toContain('strength: "STRONG"');
    expect(approveFn).not.toContain("runConsultation");
    expect(approveFn).not.toContain("polishAnswer");
    expect(approveFn).not.toContain("generateStructured");
  });
});

describe("whole drafts", () => {
  it("stores the model answer once on its question id and drops a repeated sentence", () => {
    const story = "Describe a situation in which you led a regional transition.";
    const employer = [{ employer: "OpenText", text: "Director at OpenText", itemType: "EXPERIENCE" }];
    const stored = bestPracticeDraftsForAnswers(
      [
        {
          text: story,
          targetKey: "role-expertise:transition",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          questionId: "role-expertise:transition",
          text: "The company had just been acquired. At OpenText I led the regional transition. At OpenText I led the regional transition.",
          answerFramework: "CAR",
          challenge: "At OpenText I led the regional transition.",
          situation: null,
          task: null,
          action: "I reset the operating rhythm with the remaining team.",
          result: "The team kept its largest accounts through the first year. At OpenText I led the regional transition.",
          followUpQuestion: null,
        },
      ],
      [],
      employer,
    );
    const content = stored[0]?.content ?? "";
    expect(content.startsWith("At OpenText I led the regional transition")).toBe(true);
    expect(content).not.toContain("The company had just been acquired");
    expect(content.match(/At OpenText I led the regional transition/g)?.length).toBe(1);

    const missingId = bestPracticeDraftsForAnswers(
      [
        {
          text: story,
          targetKey: "role-expertise:transition",
          interviewTypeTag: "focused_competency",
        },
      ],
      [
        {
          text: "At OpenText I led the regional transition.",
          answerFramework: "CAR",
          challenge: "At OpenText I led the regional transition.",
          situation: null,
          task: null,
          action: "I reset the operating rhythm.",
          result: "The team kept its largest accounts.",
          followUpQuestion: null,
        },
      ],
      [],
      employer,
    );
    expect(missingId[0]?.content ?? "").toBe("");
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
