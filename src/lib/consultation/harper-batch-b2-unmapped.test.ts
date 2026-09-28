import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHEAT_SHEET_TARGET_PREFIX,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import {
  buildHarperQaLayout,
  collectRenderedHarperQuestionTurnIds,
  contactIdFromCheatSheetTarget,
  harperContentRenderCoverage,
  harperItemNeedsRender,
  partitionGeneralQuestionsForStanding,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { assignCoachItemIds } from "@/lib/application-summary/coach";

function question(
  partial: Partial<ConsultationQaItem> &
    Pick<ConsultationQaItem, "questionTurnId" | "question">,
): ConsultationQaItem {
  return {
    targetKey: null,
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    ignored: false,
    ...partial,
  };
}

describe("Harper B2 unmapped-items fix", () => {
  it("maps cheatSheet:contact:{id}:… to the interviewer contact from the coach item id", () => {
    const guidance = assignCoachItemIds({
      people: [
        {
          sectionKey: "contact:c-alex",
          heading: "Alex",
          sectionKind: "HIRING_MANAGER",
          roleId: "role-1",
          likelyQuestions: [
            {
              prompt: "How do you forecast?",
              harperQuestion: "Walk me through a forecast you owned.",
              sampleAnswer: null,
              supports: [],
            },
          ],
        },
      ],
      stories: [],
    } as Parameters<typeof assignCoachItemIds>[0]);
    const itemId = guidance.people[0]?.likelyQuestions[0]?.id;
    expect(itemId).toBe("contact:c-alex:likely:1");
    const targetKey = `${CHEAT_SHEET_TARGET_PREFIX}${itemId}`;
    expect(contactIdFromCheatSheetTarget(targetKey)).toBe("c-alex");
    expect(contactIdFromCheatSheetTarget("cheatSheet:overview:gap:1")).toBeNull();
    expect(contactIdFromCheatSheetTarget("cheatSheet:role:hm:likely:1")).toBeNull();
  });

  it("renders a cheatSheet answer in its interviewer section (not General / standing)", () => {
    const cheatKey = "cheatSheet:contact:c-alex:likely:1";
    const layout = buildHarperQaLayout({
      questions: [
        question({
          questionTurnId: "q-cheat",
          question: "Walk me through a forecast you owned.",
          targetKey: cheatKey,
          seekerAnswers: [{ id: "a1", body: "I owned the weekly forecast." }],
          talkingPoint: {
            id: "s1",
            turnId: "a1",
            kind: "INTERVIEW_ANSWER",
            status: "DRAFT",
            content: "I owned the weekly forecast.",
            strengtheningNote: null,
          },
        }),
        question({
          questionTurnId: "q-prep",
          question: "What will Alex probe?",
          targetKey: "person-prep:c-alex",
        }),
      ],
      interviewers: [{ contactId: "c-alex", heading: "Alex Rivera", sortAt: 1 }],
    });

    expect(layout.general).toEqual([]);
    expect(layout.interviewers).toHaveLength(1);
    expect(layout.interviewers[0]?.contactId).toBe("c-alex");
    expect(
      layout.interviewers[0]?.questions.map((item) => item.questionTurnId),
    ).toEqual(["q-prep", "q-cheat"]);
    expect(layout.interviewers[0]?.questions.find((q) => q.questionTurnId === "q-cheat")?.seekerAnswers).toEqual([
      { id: "a1", body: "I owned the weekly forecast." },
    ]);
  });

  it("places a new Cheat Sheet page answer (cheatSheet:contact:…) on Harper under that interviewer", () => {
    // Mirrors save path in application-summary/service.ts: targetKey = cheatSheet:${itemId}
    const itemId = "contact:c-sam:likely:2";
    const targetKey = `${CHEAT_SHEET_TARGET_PREFIX}${itemId}`;
    expect(contactIdFromCheatSheetTarget(targetKey)).toBe("c-sam");

    const layout = buildHarperQaLayout({
      questions: [
        question({
          questionTurnId: "q-new",
          question: "Tell me about a tough customer.",
          targetKey,
          seekerAnswers: [{ id: "ans", body: "I saved the Acme renewal." }],
        }),
      ],
      interviewers: [{ contactId: "c-sam", heading: "Sam", sortAt: 2 }],
    });
    expect(layout.interviewers[0]?.questions[0]?.questionTurnId).toBe("q-new");
    expect(layout.general).toEqual([]);
  });

  it("keeps a dropped standing requirement with seeker answer under Where you stand without a rating", () => {
    const dropped = question({
      questionTurnId: "q-dropped",
      question: "How did you build the partner channel?",
      targetKey: "required:channel",
      seekerAnswers: [{ id: "a1", body: "I hired two GSIs in APAC." }],
    });
    const partitioned = partitionGeneralQuestionsForStanding({
      general: [
        dropped,
        question({
          questionTurnId: "q-active",
          question: "How do you forecast?",
          targetKey: "required:forecast",
        }),
      ],
      requirementTargetKeys: ["required:forecast"],
      requirementLabels: {
        "required:channel": "Build a partner channel motion",
        "required:forecast": "Own a weekly forecast",
      },
    });

    expect(partitioned.byRequirementKey.get("required:forecast")?.map((q) => q.questionTurnId)).toEqual([
      "q-active",
    ]);
    expect(partitioned.orphanedRequirementTopics).toHaveLength(1);
    expect(partitioned.orphanedRequirementTopics[0]).toMatchObject({
      kind: "requirement",
      targetKey: "required:channel",
      label: "Build a partner channel motion",
    });
    expect(
      partitioned.orphanedRequirementTopics[0]?.questions[0]?.seekerAnswers,
    ).toEqual([{ id: "a1", body: "I hired two GSIs in APAC." }]);
    expect(partitioned.unmapped).toEqual([]);

    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standing).toContain('strength: "STRONG" | "PARTIAL" | "NONE" | null');
    expect(standing).toContain("item.strength ?");
    expect(standing).not.toContain("Other prep");
  });

  it("render invariant: every contentful item renders exactly once; no Other section", () => {
    const questions = [
      question({
        questionTurnId: "q-why",
        question: "Why this company?",
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        seekerAnswers: [{ id: "a-why", body: "Mission fit." }],
      }),
      question({
        questionTurnId: "q-gap",
        question: "Forecast?",
        targetKey: "required:forecast",
        seekerAnswers: [{ id: "a-gap", body: "Weekly call." }],
      }),
      question({
        questionTurnId: "q-dropped",
        question: "Channel?",
        targetKey: "required:channel",
        seekerAnswers: [{ id: "a-ch", body: "Built GSI." }],
      }),
      question({
        questionTurnId: "q-cheat",
        question: "Coach?",
        targetKey: "cheatSheet:contact:c1:likely:1",
        seekerAnswers: [{ id: "a-cs", body: "Coach answer." }],
      }),
      question({
        questionTurnId: "q-prep",
        question: "Prep?",
        targetKey: "person-prep:c1",
      }),
    ];
    const layout = buildHarperQaLayout({
      questions,
      interviewers: [{ contactId: "c1", heading: "Alex", sortAt: 1 }],
    });
    const partitioned = partitionGeneralQuestionsForStanding({
      general: layout.general,
      requirementTargetKeys: ["required:forecast"],
      requirementLabels: {
        "required:forecast": "Forecast",
        "required:channel": "Channel motion",
      },
    });
    const rendered = collectRenderedHarperQuestionTurnIds({
      interviewers: layout.interviewers,
      dedicatedTopics: partitioned.dedicatedTopics,
      byRequirementKey: partitioned.byRequirementKey,
      orphanedRequirementTopics: partitioned.orphanedRequirementTopics,
    });
    const coverage = harperContentRenderCoverage({
      questions,
      renderedQuestionTurnIds: rendered,
    });
    expect(coverage.ok).toBe(true);
    expect(coverage.missing).toEqual([]);
    expect(coverage.duplicates).toEqual([]);
    expect(new Set(rendered).size).toBe(rendered.length);
    expect(questions.filter(harperItemNeedsRender).map((q) => q.questionTurnId).sort()).toEqual(
      [...coverage.neededTurnIds].sort(),
    );

    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).toContain("orphanedRequirementTopics");
    expect(section).toContain("harperContentRenderCoverage");
    expect(section).toContain("collectRenderedHarperQuestionTurnIds");
    expect(section).not.toContain("Other prep");
    expect(section).not.toContain("generalQuestions={qaLayout.general}");

    const layoutSrc = readFileSync("src/lib/consultation/harper-layout.ts", "utf8");
    expect(layoutSrc).toContain("contactIdFromCheatSheetTarget");
  });

  it("STOP cases: overview/role cheatSheet and null keys stay unmapped (no Other)", () => {
    const overview = question({
      questionTurnId: "q-ov",
      question: "Overview gap?",
      targetKey: "cheatSheet:overview:gap:1",
      seekerAnswers: [{ id: "a", body: "Overview." }],
    });
    const role = question({
      questionTurnId: "q-role",
      question: "Role section?",
      targetKey: "cheatSheet:role:hm:likely:1",
      seekerAnswers: [{ id: "b", body: "Role." }],
    });
    const nullKey = question({
      questionTurnId: "q-null",
      question: "No key?",
      targetKey: null,
      seekerAnswers: [{ id: "c", body: "Orphan." }],
    });
    const layout = buildHarperQaLayout({
      questions: [overview, role, nullKey],
      interviewers: [],
    });
    expect(layout.general.map((q) => q.questionTurnId)).toEqual([
      "q-ov",
      "q-role",
      "q-null",
    ]);
    const partitioned = partitionGeneralQuestionsForStanding({
      general: layout.general,
      requirementTargetKeys: [],
    });
    expect(partitioned.unmapped.map((q) => q.questionTurnId).sort()).toEqual([
      "q-null",
      "q-ov",
      "q-role",
    ]);
    expect(partitioned.orphanedRequirementTopics).toEqual([]);
    const coverage = harperContentRenderCoverage({
      questions: [overview, role, nullKey],
      renderedQuestionTurnIds: collectRenderedHarperQuestionTurnIds({
        interviewers: layout.interviewers,
        dedicatedTopics: partitioned.dedicatedTopics,
        byRequirementKey: partitioned.byRequirementKey,
        orphanedRequirementTopics: partitioned.orphanedRequirementTopics,
      }),
    });
    expect(coverage.ok).toBe(false);
    expect(coverage.missing.map((q) => q.questionTurnId).sort()).toEqual([
      "q-null",
      "q-ov",
      "q-role",
    ]);
  });

  it("rendering still enqueues no job and makes no paid call", () => {
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const layout = readFileSync("src/lib/consultation/harper-layout.ts", "utf8");
    expect(section).not.toContain("enqueueApplicationJob");
    expect(section).not.toContain("runPaidStructuredCall");
    expect(standing).not.toContain("enqueueApplicationJob");
    expect(standing).not.toContain("runPaidStructuredCall");
    expect(layout).not.toContain("enqueueApplicationJob");
    expect(layout).toContain("contactIdFromCheatSheetTarget");
  });
});
