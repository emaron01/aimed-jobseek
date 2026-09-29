import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHRONOLOGY_TARGET_KEY,
  CONSULTATION_PROMPT_VERSION,
  WHY_THIS_COMPANY_TARGET_KEY,
  consultationPlanSchema,
} from "@/lib/consultation/contract";
import {
  buildHarperQaLayout,
  sortQuestionsByWhoTag,
  sortQuestionsOpenFirst,
} from "@/lib/consultation/harper-layout";
import {
  planQuestionRound,
  resolveInterviewTypeTag,
} from "@/lib/consultation/questions";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { CONSULTATION_COACH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { consultationConfig } from "@/lib/product-config/consultation";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

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

const basePlan = {
  commentary: "Ready.",
  briefing: {
    overall: "You are close.",
    strongestAngles: ["Angle one", "Angle two"],
    importantGaps: ["One gap remains."],
    storyPlan: [] as string[],
  },
  closingNote: null,
  assessments: [] as Array<{
    targetKey: string;
    strength: "STRONG" | "PARTIAL" | "NONE";
    supportingFactIds: string[];
    relevantRoleIds: string[];
    explanation: string;
    strategyMode: "PROVE_WITH_STORY" | "REFRAME_ADJACENT" | "ACKNOWLEDGE";
    strategy: string;
  }>,
};

describe("Harper Batch D2 — WHO interview-type tags", () => {
  it("requires interviewTypeTag on plan questions and rejects unknown values", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("32");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "Every question includes interviewTypeTag, one of: screening, chronological_walk_through, focused_competency, reference_check_prep. Use chronological_walk_through only for the career walk-through question; screening for broad fit and motivation questions such as why this company; focused_competency for a specific requirement or gap; reference_check_prep for what a former manager or colleague would confirm.",
    );

    const validQuestion = {
      targetKey: "required:a",
      text: "Tell me about a time you led a handoff.",
      requirementInterpretation: null,
      hiringTeamRoleId: "hm",
      whoCaresNote: "The Hiring Manager needs the handoff story.",
      interviewTypeTag: "focused_competency" as const,
    };
    expect(
      consultationPlanSchema.safeParse({
        ...basePlan,
        questions: [validQuestion],
      }).success,
    ).toBe(true);
    expect(
      consultationPlanSchema.safeParse({
        ...basePlan,
        questions: [
          {
            targetKey: "required:a",
            text: "Tell me about a time you led a handoff.",
            requirementInterpretation: null,
            hiringTeamRoleId: "hm",
            whoCaresNote: "The Hiring Manager needs the handoff story.",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      consultationPlanSchema.safeParse({
        ...basePlan,
        questions: [
          {
            ...validQuestion,
            interviewTypeTag: "why_this_company",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("plan schema failures continue the bounded quality regeneration loop", () => {
    const service = src("src/lib/consultation/service.ts");
    const planFn = service.slice(
      service.indexOf("async function planAndStoreRound"),
      service.indexOf("export async function startConsultation"),
    );
    expect(planFn).toContain(
      "attempt <= consultationConfig.qualityRegenerationAttempts",
    );
    expect(planFn).toMatch(/if \(!plan\.ok\)[\s\S]*continue/);
    expect(consultationConfig.qualityRegenerationAttempts).toBe(2);
  });

  it("overrides chronology and why-this-company tags even when the model disagrees", () => {
    expect(
      resolveInterviewTypeTag({
        targetKey: CHRONOLOGY_TARGET_KEY,
        text: "Walk me through your career.",
        modelTag: "focused_competency",
      }),
    ).toBe("chronological_walk_through");
    expect(
      resolveInterviewTypeTag({
        targetKey: "required:other",
        text: "Walk me through your career from Contoso onward.",
        modelTag: "screening",
      }),
    ).toBe("chronological_walk_through");
    expect(
      resolveInterviewTypeTag({
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        text: "Why do you want to work here?",
        modelTag: "focused_competency",
      }),
    ).toBe("screening");

    const round = planQuestionRound({
      assessments: [
        {
          key: WHY_THIS_COMPANY_TARGET_KEY,
          kind: "REQUIRED",
          text: "Why this company",
          strength: "NONE",
          supportingFactIds: [],
          explanation: "No motivation yet.",
          strategy: "ACKNOWLEDGE",
          strategyText: "Ask for motivation.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
        {
          key: "required:handoff",
          kind: "REQUIRED",
          text: "Patient handoffs",
          strength: "NONE",
          supportingFactIds: [],
          explanation: "No handoff story.",
          strategy: "PROVE_WITH_STORY",
          strategyText: "Ask for a handoff story.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
      ],
      modelQuestions: [
        {
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          text: "Why do you want this role at City Hospital?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs your motivation.",
          interviewTypeTag: "focused_competency",
        },
        {
          targetKey: "required:handoff",
          text: "Tell me about a difficult patient handoff you owned.",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs the handoff story.",
          interviewTypeTag: "reference_check_prep",
        },
        {
          targetKey: "chronology",
          text: "Starting with Contoso, walk me through your key roles and why you moved.",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs your career walk-through.",
          interviewTypeTag: "screening",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: true,
      chronologyAsked: false,
    });

    const why = round.questions.find(
      (item) => item.targetKey === WHY_THIS_COMPANY_TARGET_KEY,
    );
    const handoff = round.questions.find(
      (item) => item.targetKey === "required:handoff",
    );
    const chronology = round.questions.find(
      (item) => item.targetKey === "chronology",
    );
    expect(why?.interviewTypeTag).toBe("screening");
    expect(handoff?.interviewTypeTag).toBe("reference_check_prep");
    if (chronology) {
      expect(chronology.interviewTypeTag).toBe("chronological_walk_through");
    }
  });

  it("stores interviewTypeTag in questionContextJson on consultant turns", () => {
    const service = src("src/lib/consultation/service.ts");
    const start = service.indexOf("for (const question of voicedQuestions)");
    expect(start).toBeGreaterThanOrEqual(0);
    const storeBlock = service.slice(start, start + 800);
    expect(storeBlock).toContain("interviewTypeTag:");
    expect(storeBlock).toContain("question.interviewTypeTag");
    expect(storeBlock).toContain("questionContext:");
    expect(storeBlock).toContain("whoCaresNote: question.whoCaresNote");
  });

  it("orders interviewer questions by WHO tag; missing tag sorts as focused_competency", () => {
    const ref = question({
      questionTurnId: "q-ref",
      question: "What would your manager confirm?",
      targetKey: "person-prep:c1",
      interviewTypeTag: "reference_check_prep",
    });
    const screening = question({
      questionTurnId: "q-screen",
      question: "Why this team?",
      targetKey: "person-prep:c1",
      interviewTypeTag: "screening",
    });
    const chrono = question({
      questionTurnId: "q-chrono",
      question: "Walk me through your career.",
      targetKey: "person-prep:c1",
      interviewTypeTag: "chronological_walk_through",
    });
    const untagged = question({
      questionTurnId: "q-old",
      question: "Tell me about a gap.",
      targetKey: "person-prep:c1",
    });
    const focused = question({
      questionTurnId: "q-focus",
      question: "Tell me about a handoff.",
      targetKey: "person-prep:c1",
      interviewTypeTag: "focused_competency",
    });

    expect(
      sortQuestionsByWhoTag([ref, screening, chrono, untagged, focused]).map(
        (item) => item.questionTurnId,
      ),
    ).toEqual(["q-screen", "q-chrono", "q-old", "q-focus", "q-ref"]);

    const layout = buildHarperQaLayout({
      questions: [ref, screening, chrono, untagged, focused],
      interviewers: [
        {
          contactId: "c1",
          heading: "Alex Lee",
          sortAt: Date.parse("2026-10-01T12:00:00.000Z"),
        },
      ],
    });
    expect(layout.interviewers).toHaveLength(1);
    expect(layout.interviewers[0]!.questions.map((item) => item.questionTurnId)).toEqual(
      ["q-screen", "q-chrono", "q-old", "q-focus", "q-ref"],
    );
    expect(sortQuestionsOpenFirst([focused, screening]).map((item) => item.questionTurnId)).toEqual(
      ["q-screen", "q-focus"],
    );
  });

  it("Harper and Cheat Sheet UI do not render tags or WHO method names", () => {
    const files = [
      "src/components/ConsultationSection.tsx",
      "src/components/ConsultationStanding.tsx",
      "src/components/ConsultationThread.tsx",
      "src/components/HarperPersonView.tsx",
      "src/components/HarperSuggestionList.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/CheatSheetCoachItems.tsx",
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ];
    const banned = [
      "interviewTypeTag",
      "chronological_walk_through",
      "focused_competency",
      "reference_check_prep",
      "WHO interview",
      "Geoff Smart",
    ];
    for (const path of files) {
      const text = src(path);
      for (const term of banned) {
        expect(text).not.toContain(term);
      }
    }
  });

  it("rendering Harper layout enqueues no job and makes no paid call", () => {
    const layout = src("src/lib/consultation/harper-layout.ts");
    const display = src("src/lib/consultation/harper-display-qa.ts");
    const page = src("src/app/(app)/campaigns/[id]/consultation/page.tsx");
    expect(layout).not.toContain("enqueueApplicationJob");
    expect(layout).not.toContain("runPaidStructuredCall");
    expect(display).toContain("Does not enqueue jobs or make paid calls");
    expect(display).not.toContain("enqueueApplicationJob");
    expect(display).not.toContain("runPaidStructuredCall");
    expect(page).not.toContain("enqueueApplicationJob");
    expect(page).not.toContain("runPaidStructuredCall");
    expect(page).not.toContain("planConsultationWithModel");
  });
});
