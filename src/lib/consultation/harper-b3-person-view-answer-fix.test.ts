import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  coachItemIdFromCheatSheetTarget,
  collectRenderedHarperQuestionTurnIds,
  harperContentRenderCoverage,
  harperItemNeedsRender,
  personViewListQuestions,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { interviewConfig } from "@/lib/product-config/interview";

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
    pendingDraftTalkingPoint: overrides.pendingDraftTalkingPoint ?? null,
    pendingDraftResumeBullet: overrides.pendingDraftResumeBullet ?? null,
  };
}

describe("Harper B3 person-view answer fix and Stage help", () => {
  it("unanswered coach item shows answer form inline via existing path; forms wait on jobsActive", () => {
    const coach = src("src/components/CheatSheetCoachItems.tsx");
    const personView = src("src/components/HarperPersonView.tsx");
    const body = src("src/components/CheatSheetPersonBody.tsx");

    expect(coach).toContain("answerCheatSheetCoachAction");
    expect(coach).toContain("cheat-sheet-harper-question");
    expect(coach).toContain("allowCoachForm");
    expect(coach).toContain("canEdit && !jobsActive");
    expect(coach).toContain("jobsActive");
    expect(personView).toContain("showCoachAnswerForms");
    expect(personView).toContain("jobsActive={jobsActive}");
    expect(personView).toContain("coachQaItems={coachQaItems}");
    expect(body).toContain("showCoachAnswerForms");
    expect(body).toContain("coachQaItems");
    // Not forced off on Harper anymore
    expect(personView).not.toContain("showCoachAnswerForms={false}");
  });

  it("answered coach item renders once in the profile, not also in the separate list", () => {
    const answered = question({
      questionTurnId: "q-coach",
      question: "How do you run forecast?",
      targetKey: "cheatSheet:contact:c1:likely:1",
      seekerAnswers: [{ id: "a1", body: "Monday commit." }],
    });
    const personPrep = question({
      questionTurnId: "q-prep",
      question: "What should I know about you?",
      targetKey: "person-prep:c1",
    });
    const list = personViewListQuestions({
      questions: [answered, personPrep],
      profileCoachItemIds: ["contact:c1:likely:1"],
    });
    expect(list.map((q) => q.questionTurnId)).toEqual(["q-prep"]);
    expect(coachItemIdFromCheatSheetTarget(answered.targetKey)).toBe(
      "contact:c1:likely:1",
    );

    const personView = src("src/components/HarperPersonView.tsx");
    const coach = src("src/components/CheatSheetCoachItems.tsx");
    expect(personView).toContain("personViewListQuestions");
    expect(personView).toContain("coachQaItems");
    expect(coach).toContain("cheat-sheet-coach-harper-qa");
    expect(coach).toContain("QuestionList");
    // Batch A Edit / replies / Ignore live on QuestionCard via QuestionList
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain("consultationConversationCopy.editAnswer");
    expect(thread).toContain("consultationConversationCopy.showYourReplies");
  });

  it("person-prep questions render once in the person view list", () => {
    const prep = question({
      questionTurnId: "q-prep",
      question: "Prep ask",
      targetKey: "person-prep:c1",
    });
    const list = personViewListQuestions({
      questions: [prep],
      profileCoachItemIds: ["contact:c1:likely:1"],
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.questionTurnId).toBe("q-prep");
    const personView = src("src/components/HarperPersonView.tsx");
    expect(personView).toContain('data-testid="harper-person-qa"');
    expect(personView).toContain("listQuestions");
  });

  it("render invariant: profile coach + list person-prep each counted once", () => {
    const answered = question({
      questionTurnId: "q-coach",
      question: "Coach",
      targetKey: "cheatSheet:contact:c1:likely:1",
      seekerAnswers: [{ id: "a", body: "Ans" }],
    });
    const prep = question({
      questionTurnId: "q-prep",
      question: "Prep",
      targetKey: "person-prep:c1",
    });
    const profileIds = ["contact:c1:likely:1"];
    const list = personViewListQuestions({
      questions: [answered, prep],
      profileCoachItemIds: profileIds,
    });
    // Layout still assigns both under interviewer; UI renders coach in profile + prep in list.
    const rendered = collectRenderedHarperQuestionTurnIds({
      interviewers: [
        {
          contactId: "c1",
          heading: "Chris",
          questions: [answered, prep],
        },
      ],
      dedicatedTopics: [],
      byRequirementKey: new Map(),
      orphanedRequirementTopics: [],
    });
    const coverage = harperContentRenderCoverage({
      questions: [answered, prep],
      renderedQuestionTurnIds: rendered,
    });
    expect(coverage.ok).toBe(true);
    expect(list.map((q) => q.questionTurnId)).toEqual(["q-prep"]);
    expect(rendered.sort()).toEqual(["q-coach", "q-prep"].sort());
    expect([answered, prep].filter(harperItemNeedsRender)).toHaveLength(2);
  });

  it("Cheat Sheet and Harper share the coach answer forms", () => {
    const page = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    const body = src("src/components/CheatSheetPersonBody.tsx");
    const coach = src("src/components/CheatSheetCoachItems.tsx");
    const personView = src("src/components/HarperPersonView.tsx");
    expect(page).toContain("CheatSheetPersonBody");
    expect(page).not.toContain("showCoachAnswerForms={false}");
    expect(page).not.toContain("harperLinkContactId");
    expect(body).toContain("showCoachAnswerForms = true");
    expect(body).not.toContain("harperLinkContactId");
    expect(coach).toContain("QuestionList");
    expect(coach).toContain("answerCheatSheetCoachAction");
    expect(personView).toContain("showCoachAnswerForms");
    expect(personView).not.toContain("showCoachAnswerForms={false}");
  });

  it("Interview stages help text is exactly the new wording", () => {
    expect(interviewConfig.labels.sectionHelp).toBe(
      "Record each interview: who you're meeting, when, and how. After each one, add your Post Interview Notes.",
    );
  });

  it("Batch A Edit / Show replies / Ignore remain available on profile-owned coach QA", () => {
    const coach = src("src/components/CheatSheetCoachItems.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    expect(coach).toContain("QuestionList");
    expect(thread).toContain("consultationConversationCopy.editAnswer");
    expect(thread).toContain("consultationConversationCopy.showYourReplies");
    expect(thread).toContain("ignoreConsultationQuestionAction");
    expect(thread).toContain("consultation-ignored-question");
  });

  it("rendering still enqueues no job and makes no paid call", () => {
    for (const path of [
      "src/components/HarperPersonView.tsx",
      "src/components/CheatSheetCoachItems.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/ConsultationSection.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("enqueueApplicationJob");
      expect(text).not.toContain("runPaidStructuredCall");
    }
  });
});
