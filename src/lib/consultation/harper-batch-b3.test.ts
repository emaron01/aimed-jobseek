import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildHarperQaLayout,
  collectRenderedHarperQuestionTurnIds,
  harperContentRenderCoverage,
  harperItemNeedsRender,
  isOverviewGapCheatSheetTarget,
  partitionGeneralQuestionsForStanding,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { applicationSummaryConfig } from "@/lib/product-config/application-summary";
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

describe("Harper Batch B3 person view, search, Add Interview Contact, assign-only", () => {
  it("places overview gap items under Where you stand with question text and no rating", () => {
    expect(isOverviewGapCheatSheetTarget("cheatSheet:overview:gap:2")).toBe(true);
    expect(isOverviewGapCheatSheetTarget("cheatSheet:contact:c1:likely:1")).toBe(false);

    const overview = question({
      questionTurnId: "q-gap",
      question: "What is the company growth story?",
      targetKey: "cheatSheet:overview:gap:2",
      seekerAnswers: [{ id: "a1", body: "Series C, expanding NA." }],
    });
    const partitioned = partitionGeneralQuestionsForStanding({
      general: [overview],
      requirementTargetKeys: [],
    });
    expect(partitioned.orphanedRequirementTopics).toHaveLength(1);
    expect(partitioned.orphanedRequirementTopics[0]?.label).toBe(
      "What is the company growth story?",
    );
    expect(partitioned.orphanedRequirementTopics[0]?.targetKey).toBe(
      "cheatSheet:overview:gap:2",
    );
    expect(partitioned.unmapped).toEqual([]);

    const rendered = collectRenderedHarperQuestionTurnIds({
      interviewers: [],
      dedicatedTopics: partitioned.dedicatedTopics,
      byRequirementKey: partitioned.byRequirementKey,
      orphanedRequirementTopics: partitioned.orphanedRequirementTopics,
    });
    const coverage = harperContentRenderCoverage({
      questions: [overview],
      renderedQuestionTurnIds: rendered,
    });
    expect(coverage.ok).toBe(true);
    expect(rendered).toEqual(["q-gap"]);

    const section = src("src/components/ConsultationSection.tsx");
    expect(section).toContain("orphanedStandingRequirements");
    expect(section).toContain("strength: null");
  });

  it("Harper renders Find a person search with Where you stand as the default view", () => {
    const section = src("src/components/ConsultationSection.tsx");
    const filter = src("src/components/HarperPeopleFilter.tsx");
    expect(applicationSummaryConfig.actions.filterPeople).toContain(
      "Find a person or",
    );
    expect(filter).toContain("applicationSummaryConfig.actions.filterPeople");
    expect(filter).toContain('data-testid="harper-people-filter"');
    expect(filter).toContain("HarperStandingView");
    expect(section).toContain("HarperPeopleFilter");
    expect(section).toContain("HarperStandingView");
    expect(section).toContain("consultation-standing-panel");
    const render = section.slice(section.indexOf("return ("));
    expect(render.indexOf("HarperStandingView")).toBeLessThan(
      render.indexOf("HarperPersonInlineProfile"),
    );
  });

  it("selecting a person opens full inline profile matching Cheat Sheet order plus inline Q&A", () => {
    const personView = src("src/components/HarperPersonView.tsx");
    const body = src("src/components/CheatSheetPersonBody.tsx");
    const section = src("src/components/ConsultationSection.tsx");

    expect(personView).toContain("CheatSheetPersonBody");
    expect(personView).toContain("showCoachAnswerForms");
    expect(personView).not.toContain("showCoachAnswerForms={false}");
    expect(personView).toContain('data-testid="harper-person-view"');
    expect(personView).toContain('data-testid="harper-person-qa"');
    expect(personView).toContain("personViewListQuestions");
    expect(personView).toContain("QuestionList");
    expect(body).toContain("caresAbout");
    expect(body).toContain("positioningStatements");
    expect(body).toContain("keyStatements");
    expect(body).toContain("likelyQuestions");
    expect(body).toContain("questionsToAsk");
    // Order in CheatSheetPersonBody: cares → positioning → key → likely → questionsToAsk
    const cares = body.indexOf("sections.caresAbout");
    const positioning = body.indexOf("sections.positioningStatements");
    const key = body.indexOf("sections.keyStatements");
    const likely = body.indexOf("sections.likelyQuestions");
    const ask = body.indexOf("sections.questionsToAsk");
    expect(cares).toBeGreaterThan(-1);
    expect(positioning).toBeGreaterThan(cares);
    expect(key).toBeGreaterThan(positioning);
    expect(likely).toBeGreaterThan(key);
    expect(ask).toBeGreaterThan(likely);
    expect(section).toContain("HarperPersonViewShell");
    expect(section).toContain("interviewerSection=");
  });

  it("interviewer cards and #harper-contact open the person inline profile", () => {
    const section = src("src/components/ConsultationSection.tsx");
    const filter = src("src/components/HarperPeopleFilter.tsx");
    expect(section).toContain("HarperSelectPersonLink");
    expect(section).toContain("harper-prep-card-");
    expect(section).toContain("interviewConfig.labels.personPrepOffer");
    expect(filter).toContain("harper-contact:");
    expect(filter).toContain("sectionKeyFromHarperHash");
    expect(filter).toContain("selectOption");
  });

  it("Add Interview Contact creates the contact and does not start prep", () => {
    const stages = src("src/lib/interview/stages.ts");
    const actions = src("src/app/actions/interview.ts");
    const personView = src("src/components/HarperPersonView.tsx");
    const panel = src("src/components/InterviewStagePanel.tsx");

    expect(interviewConfig.labels.addInterviewContact).toBe("Add Interview Contact");
    expect(personView).toContain("addInterviewContactAction");
    expect(personView).toContain("addInterviewContact");
    expect(actions).toContain("addInterviewContactAction");
    expect(actions).toContain("addInterviewContact");

    const addFn = stages.slice(
      stages.indexOf("export async function addInterviewContact"),
      stages.indexOf("export async function startPersonPrepForContact"),
    );
    expect(addFn).toContain("addApplicationContact");
    expect(addFn).not.toContain("await offerPersonPrep");
    expect(addFn).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(addFn).toContain("saveLinkedInPaste");
    expect(addFn).not.toContain("replaceStageInterviewer");

    // Contact remains available to Stage assign (assign lists campaign people)
    expect(panel).toContain("assignExistingInterviewerAction");
    expect(panel).toContain("people.map");
  });

  it("start-prep control appears only when prep has not started and uses existing paths", () => {
    const personView = src("src/components/HarperPersonView.tsx");
    const stages = src("src/lib/interview/stages.ts");
    const actions = src("src/app/actions/interview.ts");
    const section = src("src/components/ConsultationSection.tsx");

    expect(interviewConfig.labels.personPrepStart).toBe("Start interviewer prep");
    expect(personView).toContain("interviewConfig.labels.personPrepStart");
    expect(personView).toContain("startPersonPrepAction");
    expect(personView).toContain("{canEdit && !prepStarted ? (");
    expect(section).toContain("prepStarted={prepStartedByContact.has(person.contactId)}");
    expect(actions).toContain("startPersonPrepAction");
    expect(actions).toContain("startPersonPrepForContact");

    const startFn = stages.slice(
      stages.indexOf("export async function startPersonPrepForContact"),
      stages.indexOf("export function stageTypeLabel"),
    );
    expect(startFn).toContain("personPrepOfferedAt");
    expect(startFn).toContain("offerPersonPrep");
    expect(startFn).toContain("enqueueInterviewerCheatSheetSection");
    expect(startFn).toContain("alreadyStarted: true");
  });

  it("Use this interviewer assigns only and enqueues no prep or builds", () => {
    const stages = src("src/lib/interview/stages.ts");
    const assignFn = stages.slice(
      stages.indexOf("export async function assignExistingInterviewStageInterviewer"),
      stages.indexOf("export async function addInterviewStageInterviewer"),
    );
    expect(assignFn).toContain("replaceStageInterviewer");
    expect(assignFn).not.toContain("offerPersonPrep");
    expect(assignFn).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(assignFn).not.toContain("saveLinkedInPaste");
    expect(assignFn).not.toContain("queueHiringTeamBuild");
  });

  it("reply forms wait on Harper analyzing in the person view", () => {
    const personView = src("src/components/HarperPersonView.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    expect(personView).toContain("jobsActive");
    expect(personView).toContain("jobsActive={jobsActive}");
    expect(personView).toContain("showReply=");
    // Gate lives in QuestionList (actionsEnabled) so forms stay mounted while busy
    // and unsaved drafts survive — person view still passes jobsActive through.
    expect(thread).toContain("actionsEnabled = showReply && !jobsActive");
    const section = src("src/components/ConsultationSection.tsx");
    expect(section).toContain("jobsActive={consultationBusy}");
  });

  it("B2 render invariant still holds for standing + interviewer + overview gaps", () => {
    const overview = question({
      questionTurnId: "q-ov",
      question: "Company gap?",
      targetKey: "cheatSheet:overview:gap:1",
      seekerAnswers: [{ id: "a", body: "Growth." }],
    });
    const personQ = question({
      questionTurnId: "q-p",
      question: "Prep?",
      targetKey: "person-prep:c1",
    });
    const req = question({
      questionTurnId: "q-r",
      question: "Forecast?",
      targetKey: "required:forecast",
      seekerAnswers: [{ id: "b", body: "Yes." }],
    });
    const layout = buildHarperQaLayout({
      questions: [overview, personQ, req],
      interviewers: [{ contactId: "c1", heading: "Chris", sortAt: 1 }],
    });
    const partitioned = partitionGeneralQuestionsForStanding({
      general: layout.general,
      requirementTargetKeys: ["required:forecast"],
    });
    const rendered = collectRenderedHarperQuestionTurnIds({
      interviewers: layout.interviewers,
      dedicatedTopics: partitioned.dedicatedTopics,
      byRequirementKey: partitioned.byRequirementKey,
      orphanedRequirementTopics: partitioned.orphanedRequirementTopics,
    });
    const coverage = harperContentRenderCoverage({
      questions: [overview, personQ, req],
      renderedQuestionTurnIds: rendered,
    });
    expect(coverage.ok).toBe(true);
    expect(new Set(rendered).size).toBe(rendered.length);
    expect(
      [overview, personQ, req].filter(harperItemNeedsRender).map((q) => q.questionTurnId).sort(),
    ).toEqual([...rendered].sort());
  });

  it("rendering Harper and person view enqueues no job and makes no paid call", () => {
    const section = src("src/components/ConsultationSection.tsx");
    const personView = src("src/components/HarperPersonView.tsx");
    const filter = src("src/components/HarperPeopleFilter.tsx");
    for (const text of [section, personView, filter]) {
      expect(text).not.toContain("enqueueApplicationJob");
      expect(text).not.toContain("runPaidStructuredCall");
    }
    // Read-only summary load for person content — no generate on view
    expect(section).toContain("getApplicationSummaryView");
    expect(section).not.toContain("generateApplicationSummary(");
    expect(section).not.toContain("offerPersonPrep(");
  });
});
