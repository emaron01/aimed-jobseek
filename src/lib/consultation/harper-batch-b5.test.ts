import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  workspaceHarperQuestionHref,
  workspaceHarperStandingQuestionHref,
} from "@/lib/application/workspace-links";
import {
  ADDITIONAL_INTERVIEW_PREP_QA_HEADING,
  additionalInterviewPrepQaForProfile,
  consultationItemDisplayAnswer,
  consultationItemIsAnswered,
  orderedAnsweredHarperQuestions,
  profilePrimaryQuestionTurnIdsFromInterviewerSection,
} from "@/lib/consultation/additional-prep-qa";
import {
  collectRenderedHarperQuestionTurnIds,
  harperContentRenderCoverage,
  type HarperInterviewerSection,
  type StandingInlineTopic,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

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

describe("Harper Batch B5 Additional Interview Prep Q&A", () => {
  const why = question({
    questionTurnId: "q-why",
    question: "Why this company?",
    targetKey: "why-this-company",
    talkingPoint: {
      id: "s-why",
      turnId: "q-why",
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      content: "Mission fit and product.",
      strengtheningNote: null,
    },
  });
  const chronology = question({
    questionTurnId: "q-ch",
    question: "Walk me through your career.",
    targetKey: "chronology",
    seekerAnswers: [{ id: "a-ch", body: "Built GSI motion." }],
  });
  const req = question({
    questionTurnId: "q-req",
    question: "How do you forecast?",
    targetKey: "required:forecast",
    talkingPoint: {
      id: "s-req",
      turnId: "q-req",
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      content: "Monday commit ritual.",
      strengtheningNote: null,
    },
  });
  const otherPerson = question({
    questionTurnId: "q-other",
    question: "What should I know about you?",
    targetKey: "person-prep:c-recruiter",
    seekerAnswers: [{ id: "a-o", body: "I ran enterprise sales." }],
  });
  const selfPrep = question({
    questionTurnId: "q-self",
    question: "Prep for the HM",
    targetKey: "person-prep:c-hm",
    seekerAnswers: [{ id: "a-s", body: "Own the narrative." }],
  });
  const unanswered = question({
    questionTurnId: "q-open",
    question: "Still open?",
    targetKey: "required:open",
  });

  const dedicatedTopics: StandingInlineTopic[] = [
    {
      kind: "why-this-company",
      targetKey: "why-this-company",
      label: "Why you want to work at this company",
      questions: [why],
    },
    {
      kind: "chronology",
      targetKey: "chronology",
      label: "Career walk-through",
      questions: [chronology],
    },
  ];
  const interviewers: HarperInterviewerSection[] = [
    {
      contactId: "c-recruiter",
      heading: "Recruiter",
      questions: [otherPerson],
    },
    {
      contactId: "c-hm",
      heading: "Hiring Manager",
      questions: [selfPrep],
    },
  ];

  it("Direct profiles get Additional Interview Prep Q&A in Harper order; Indirect do not", () => {
    const answered = orderedAnsweredHarperQuestions({
      dedicatedTopics,
      standingRequirementRows: [
        { targetKey: "required:forecast", questions: [req, unanswered] },
      ],
      interviewers,
    });
    expect(answered.map((item) => item.questionTurnId)).toEqual([
      "q-why",
      "q-ch",
      "q-req",
      "q-other",
      "q-self",
    ]);

    const forHm = additionalInterviewPrepQaForProfile({
      involvement: "DIRECT",
      profilePrimaryQuestionTurnIds:
        profilePrimaryQuestionTurnIdsFromInterviewerSection(interviewers[1]),
      answeredInHarperOrder: answered,
    });
    expect(forHm.map((row) => row.questionTurnId)).toEqual([
      "q-why",
      "q-ch",
      "q-req",
      "q-other",
    ]);
    expect(forHm.map((row) => row.answer)).toEqual([
      "Mission fit and product.",
      "Built GSI motion.",
      "Monday commit ritual.",
      "I ran enterprise sales.",
    ]);
    expect(forHm.some((row) => row.questionTurnId === "q-self")).toBe(false);

    const forIndirect = additionalInterviewPrepQaForProfile({
      involvement: "INDIRECT",
      profilePrimaryQuestionTurnIds: [],
      answeredInHarperOrder: answered,
    });
    expect(forIndirect).toEqual([]);

    expect(ADDITIONAL_INTERVIEW_PREP_QA_HEADING).toBe(
      "Additional Interview Prep Q&A",
    );
    const personView = src("src/components/HarperPersonView.tsx");
    const body = src("src/components/CheatSheetPersonBody.tsx");
    const page = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    const section = src("src/components/ConsultationSection.tsx");
    expect(personView).toContain("AdditionalInterviewPrepQa");
    expect(personView).toContain("additionalPrepEntries");
    expect(body).toContain("AdditionalInterviewPrepQa");
    expect(page).toContain("additionalPrepEntries");
    expect(page).toContain('person.involvement === "DIRECT"');
    expect(section).toContain("additionalInterviewPrepQaForProfile");
    expect(section).toContain("involvement: person.involvement");
  });

  it("questions already in the profile are not repeated; empty list renders no heading", () => {
    const answered = orderedAnsweredHarperQuestions({
      dedicatedTopics: [],
      standingRequirementRows: [],
      interviewers,
    });
    const onlySelf = additionalInterviewPrepQaForProfile({
      involvement: "DIRECT",
      profilePrimaryQuestionTurnIds: ["q-other", "q-self"],
      answeredInHarperOrder: answered,
    });
    expect(onlySelf).toEqual([]);

    const component = src("src/components/AdditionalInterviewPrepQa.tsx");
    expect(component).toContain("if (entries.length === 0) return null");
    expect(component).toContain("ADDITIONAL_INTERVIEW_PREP_QA_HEADING");
    expect(component).not.toContain("ApplicationActionForm");
    expect(component).not.toContain("textarea");
    expect(component).not.toContain("replyConsultationAction");
    expect(component).toContain("consultationConversationCopy.editAnswer");
    expect(consultationConversationCopy.editAnswer).toBe("Edit");
  });

  it("Edit links target the one Harper question (standing or person)", () => {
    const component = src("src/components/AdditionalInterviewPrepQa.tsx");
    expect(component).toContain("workspaceHarperQuestionHref");
    expect(component).toContain("workspaceHarperStandingQuestionHref");
    expect(component).toContain("workspaceHarperCoachItemHref");
    expect(workspaceHarperStandingQuestionHref("camp_1", "q-why")).toContain(
      "harper-q%3Aq-why",
    );
    expect(workspaceHarperStandingQuestionHref("camp_1", "q-why")).not.toContain(
      "person=",
    );
    expect(workspaceHarperQuestionHref("camp_1", "c-recruiter", "q-other")).toContain(
      "person=contact%3Ac-recruiter",
    );
    expect(workspaceHarperQuestionHref("camp_1", "c-recruiter", "q-other")).toContain(
      "harper-q%3Aq-other",
    );
  });

  it("section reads the same answered records Harper shows; no second editable copy", () => {
    expect(consultationItemIsAnswered(why)).toBe(true);
    expect(consultationItemDisplayAnswer(why)).toBe("Mission fit and product.");
    expect(consultationItemIsAnswered(unanswered)).toBe(false);
    const component = src("src/components/AdditionalInterviewPrepQa.tsx");
    // Display-only: Edit is an <a>, not a form that writes answers.
    expect(component).toMatch(/<a\s[\s\S]*editAnswer/);
    expect(component).not.toContain("answerCheatSheetCoachAction");
    expect(component).not.toContain("editConsultationAnswerAction");
  });

  it("render invariant still counts each item once at its primary place", () => {
    const answered = orderedAnsweredHarperQuestions({
      dedicatedTopics,
      standingRequirementRows: [
        { targetKey: "required:forecast", questions: [req] },
      ],
      interviewers,
    });
    const primaryIds = collectRenderedHarperQuestionTurnIds({
      interviewers,
      dedicatedTopics,
      byRequirementKey: new Map([["required:forecast", [req]]]),
      orphanedRequirementTopics: [],
    });
    const coverage = harperContentRenderCoverage({
      questions: [why, chronology, req, otherPerson, selfPrep],
      renderedQuestionTurnIds: primaryIds,
    });
    expect(coverage.ok).toBe(true);
    // Secondary section uses the same turn ids but is not fed into the invariant.
    const secondary = additionalInterviewPrepQaForProfile({
      involvement: "DIRECT",
      profilePrimaryQuestionTurnIds: ["q-self"],
      answeredInHarperOrder: answered,
    });
    expect(secondary.every((row) => primaryIds.includes(row.questionTurnId))).toBe(
      true,
    );
    const section = src("src/components/ConsultationSection.tsx");
    expect(section).toContain("collectRenderedHarperQuestionTurnIds");
    expect(section).toContain("harperContentRenderCoverage");
    // Additional entries are not passed into collectRenderedHarperQuestionTurnIds.
    const collectCall = section.slice(
      section.indexOf("collectRenderedHarperQuestionTurnIds"),
      section.indexOf("collectRenderedHarperQuestionTurnIds") + 400,
    );
    expect(collectCall).not.toContain("additionalPrep");
    expect(collectCall).not.toContain("answeredInHarperOrder");
  });

  it("Cheat Sheet (including print) and Harper both mount the section for Direct", () => {
    const page = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    const body = src("src/components/CheatSheetPersonBody.tsx");
    const filter = src("src/components/CheatSheetPeopleFilter.tsx");
    expect(page).toContain("loadOrderedAnsweredHarperQuestions");
    expect(page).toContain("additionalInterviewPrepQaForProfile");
    expect(body).toContain("additionalPrepEntries");
    // Print uses the same person body inside summary sections.
    expect(filter).toContain("CheatSheetPrintButton");
    expect(page).toContain("CheatSheetPrintButton");
  });

  it("rendering enqueues no job and makes no paid call", () => {
    for (const path of [
      "src/components/AdditionalInterviewPrepQa.tsx",
      "src/lib/consultation/additional-prep-qa.ts",
      "src/lib/consultation/harper-display-qa.ts",
      "src/components/HarperPersonView.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("enqueueApplicationJob");
      expect(text).not.toContain("runPaidStructuredCall");
    }
  });
});
