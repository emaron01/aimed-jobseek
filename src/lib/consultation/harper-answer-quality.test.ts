import { describe, expect, it } from "vitest";
import {
  experienceRoleIdsForYearsTarget,
  verifyModelAssessments,
  type ProfileFactRef,
} from "@/lib/consultation/assess";
import {
  CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
} from "@/lib/consultation/contract";
import { ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION } from "@/lib/consultation/role-expertise";
import { CONSULTATION_PLAN_WRITING_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-writing";
import { ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";

const STORY_INSTRUCTION =
  'For a story question (tell me about a time, describe a situation, give an example), tell a real experience from the Personal Profile or approvedAnswers as what happened. Never answer a story question hypothetically with "I would". When no stated experience fits exactly, use the closest stated experience and say plainly what happened there.';

const METHOD_INSTRUCTION =
  'You may describe the person\'s actual practice using the job\'s terminology (for example, "my discovery-to-value approach, which works like Command of the Message"), but never claim the person formally uses, was trained in, or is certified in a named method, framework, or tool they have not stated.';

function role(
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

describe("Harper answer quality", () => {
  it("puts the story and named-method rules on the answer-drafting instructions", () => {
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).toContain(STORY_INSTRUCTION);
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).toContain(METHOD_INSTRUCTION);
    expect(ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION).toBe("9");
  });

  it("puts the named-method rule on the planning writing instructions", () => {
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).toContain(METHOD_INSTRUCTION);
    expect(CONSULTATION_PLAN_WRITING_INSTRUCTIONS).not.toContain(STORY_INSTRUCTION);
    expect(CONSULTATION_PLAN_WRITING_PROMPT_VERSION).toBe("6");
  });

  it("counts every stated enterprise-sales role when the writing step listed only three", () => {
    const profileItems: ProfileFactRef[] = [
      {
        id: "fact-sales",
        kind: "FACT",
        text: "Led enterprise sales.",
        itemType: "ITEM",
      },
      role(
        "opentext",
        "VP Enterprise Sales at OpenText. Led enterprise sales.",
        "2018-01",
        "2021-01",
      ),
      role(
        "loginvsi",
        "VP Sales at Login VSI. Led enterprise sales.",
        "2021-01",
        "2023-06",
      ),
      role(
        "gryphon",
        "CRO at Gryphon Networks. Led enterprise sales.",
        "2023-06",
        null,
      ),
      role(
        "microfocus",
        "GM at Micro Focus. Led enterprise sales across the region.",
        "2004-01",
        "2018-01",
      ),
      role(
        "beta",
        "Software Engineer at Beta. Built internal tools.",
        "2010-01",
        "2014-01",
      ),
    ];
    const modelRoleIds = ["opentext", "loginvsi", "gryphon"];
    expect(
      experienceRoleIdsForYearsTarget({
        targetText: "8–10+ years leading enterprise sales",
        profileItems,
        modelRoleIds,
      }),
    ).toEqual(["opentext", "loginvsi", "gryphon", "microfocus"]);

    const [assessment] = verifyModelAssessments({
      targets: [
        {
          key: "required:years",
          kind: "REQUIRED",
          text: "8–10+ years leading enterprise sales",
        },
      ],
      profileItems,
      assessments: [
        {
          targetKey: "required:years",
          strength: "STRONG",
          supportingFactIds: ["fact-sales"],
          relevantRoleIds: modelRoleIds,
          explanation: "The writing step named three employers.",
          strategyMode: "PROVE_WITH_STORY",
          strategy: "Walk through the sales leadership roles.",
        },
      ],
      asOf: new Date("2026-10-06T00:00:00.000Z"),
    });
    expect(assessment?.experienceCalculation?.roleIds).toEqual([
      "opentext",
      "loginvsi",
      "gryphon",
      "microfocus",
    ]);
    expect(assessment?.experienceCalculation?.totalYears).toBeGreaterThan(20);
    expect(assessment?.strength).toBe("STRONG");
  });
});
