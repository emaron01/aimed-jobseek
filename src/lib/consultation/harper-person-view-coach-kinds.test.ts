import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  personProfileCoachItemIds,
  personSectionRoleCoachViews,
} from "@/lib/application-summary/coach";
import {
  collectRenderedHarperQuestionTurnIds,
  harperContentRenderCoverage,
  personViewListQuestions,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { applicationSummaryConfig } from "@/lib/product-config/application-summary";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

function question(
  overrides: Partial<ConsultationQaItem> &
    Pick<ConsultationQaItem, "questionTurnId" | "question">,
): ConsultationQaItem {
  return {
    questionTurnId: overrides.questionTurnId,
    question: overrides.question,
    targetKey: overrides.targetKey ?? null,
    followUp: overrides.followUp ?? null,
    ignored: overrides.ignored ?? false,
    seekerAnswers: overrides.seekerAnswers ?? [],
    statements: overrides.statements ?? [],
    resumeBullet: overrides.resumeBullet ?? null,
    talkingPoint: overrides.talkingPoint ?? null,
  };
}

const sectionWithRoleCoach = {
  likelyQuestions: [{ id: "contact:c1:likely:1", prompt: "Likely?" }],
  recruiter: {
    sixtySecondSummary: { text: "I lead enterprise motions." },
    whyThisCompany: { text: "I want this mission." },
    whyThisRole: { text: "I want this scope." },
    logistics: { text: "Remote, flexible." },
    compensationReadiness: { text: "I can discuss band." },
    flagAnswers: [
      {
        id: "contact:c1:flagAnswers:1",
        prompt: "Job hop?",
        sampleAnswer: null,
        harperQuestion: "How long were you in each role?",
      },
    ],
  },
  hiringManager: {
    scorecardOutcomes: [{ outcome: "Forecast", note: "I own commit." }],
    firstNinetyDays: { text: "I would start in forecast." },
    drillDowns: [
      {
        id: "contact:c1:drill:1",
        prompt: "Walk a deal.",
        sampleAnswer: "I inspected one commit.",
        harperQuestion: null,
      },
    ],
    gaps: [
      {
        id: "contact:c1:gap:1",
        prompt: "Manager development",
        sampleAnswer: null,
        harperQuestion: "Have you coached a front-line manager?",
      },
    ],
  },
};

describe("Harper person-view coach kinds (flagAnswers, drill, gap)", () => {
  it("parses role coach views and profile coach item ids for all four kinds", () => {
    const views = personSectionRoleCoachViews(sectionWithRoleCoach);
    expect(views.recruiter?.flagAnswers).toHaveLength(1);
    expect(views.hiringManager?.drillDowns).toHaveLength(1);
    expect(views.hiringManager?.gaps).toHaveLength(1);
    expect(views.recruiter?.sixtySecondSummary).toBe("I lead enterprise motions.");
    expect(applicationSummaryConfig.sections.flagAnswers).toBe(
      "Flags to address honestly",
    );
    expect(applicationSummaryConfig.sections.drillDowns).toBe("Likely drill-downs");
    expect(personProfileCoachItemIds(sectionWithRoleCoach).sort()).toEqual(
      [
        "contact:c1:drill:1",
        "contact:c1:flagAnswers:1",
        "contact:c1:gap:1",
        "contact:c1:likely:1",
      ].sort(),
    );
  });

  it("Harper person view renders flagAnswers, drill, and gap in CS historical context", () => {
    const body = src("src/components/CheatSheetPersonBody.tsx");
    const personView = src("src/components/HarperPersonView.tsx");
    expect(personView).toContain("showRoleKindCoachSections");
    expect(body).toContain("showRoleKindCoachSections = false");
    expect(body).toContain('data-testid="harper-coach-flagAnswers"');
    expect(body).toContain('data-testid="harper-coach-drill"');
    expect(body).toContain('data-testid="harper-coach-gap"');
    expect(body).toContain("applicationSummaryConfig.sections.flagAnswers");
    expect(body).toContain("applicationSummaryConfig.sections.drillDowns");
    expect(body).toContain("applicationSummaryConfig.sections.gapsToPrepare");
    expect(body).toContain("applicationSummaryConfig.sections.recruiterSummary");
    expect(body).toContain("applicationSummaryConfig.sections.scorecard");
    expect(body).toContain("applicationSummaryConfig.sections.firstNinetyDays");
    // Same answer path as likely questions
    const coach = src("src/components/CheatSheetCoachItems.tsx");
    expect(coach).toContain("answerCheatSheetCoachAction");
    expect(coach).toContain("canEdit && !jobsActive");
  });

  it("answered role-coach items render once in profile, not in the separate list", () => {
    const flag = question({
      questionTurnId: "q-flag",
      question: "How long?",
      targetKey: "cheatSheet:contact:c1:flagAnswers:1",
      seekerAnswers: [{ id: "a", body: "Four years." }],
    });
    const drill = question({
      questionTurnId: "q-drill",
      question: "Walk a deal.",
      targetKey: "cheatSheet:contact:c1:drill:1",
      seekerAnswers: [{ id: "b", body: "I inspected." }],
    });
    const gap = question({
      questionTurnId: "q-gap",
      question: "Manager?",
      targetKey: "cheatSheet:contact:c1:gap:1",
      seekerAnswers: [{ id: "c", body: "Yes." }],
    });
    const prep = question({
      questionTurnId: "q-prep",
      question: "Prep",
      targetKey: "person-prep:c1",
    });
    const profileIds = personProfileCoachItemIds(sectionWithRoleCoach);
    const list = personViewListQuestions({
      questions: [flag, drill, gap, prep],
      profileCoachItemIds: profileIds,
    });
    expect(list.map((q) => q.questionTurnId)).toEqual(["q-prep"]);
    const rendered = collectRenderedHarperQuestionTurnIds({
      interviewers: [
        {
          contactId: "c1",
          heading: "Chris",
          questions: [flag, drill, gap, prep],
        },
      ],
      dedicatedTopics: [],
      byRequirementKey: new Map(),
      orphanedRequirementTopics: [],
    });
    expect(
      harperContentRenderCoverage({
        questions: [flag, drill, gap, prep],
        renderedQuestionTurnIds: rendered,
      }).ok,
    ).toBe(true);
  });

  it("Cheat Sheet page stays unchanged (no role-kind coach sections by default)", () => {
    const page = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    expect(page).toContain("CheatSheetPersonBody");
    expect(page).not.toContain("showRoleKindCoachSections");
    expect(page).not.toContain("harper-coach-flagAnswers");
  });

  it("rendering enqueues no job and makes no paid call", () => {
    for (const path of [
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/HarperPersonView.tsx",
      "src/lib/application-summary/coach.ts",
    ]) {
      const text = src(path);
      expect(text).not.toContain("enqueueApplicationJob");
      expect(text).not.toContain("runPaidStructuredCall");
    }
  });
});
