import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cheatSheetPersonSectionInputHash } from "@/lib/application-summary/people";

function src(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

describe("no AI on page view / skip unchanged / research cost", () => {
  it("application page render paths enqueue no AI", () => {
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    const model = src("src/components/application-workspace-model.ts");
    const overview = src("src/lib/application/overview.ts");
    const nextStep = src("src/lib/application/next-step.ts");

    expect(workspace).toContain("loadApplicationWorkspaceModel");
    expect(model).toContain("readApplicationNextStep");
    for (const source of [workspace, model]) {
      expect(source).not.toContain("ensureApplicationNextStep");
      expect(source).not.toContain("ensureNamedEmployerResearch");
      expect(source).not.toContain("ensureHiringTeamAfterResearch");
      expect(source).not.toContain("enqueueApplicationJob");
      expect(source).not.toContain("queueApplicationResearch");
    }

    expect(overview).toContain("readApplicationNextStep");
    expect(overview).not.toContain("ensureApplicationNextStep");
    expect(overview).not.toContain("ensureNamedEmployerResearch");
    expect(overview).not.toContain("ensureHiringTeamAfterResearch");

    expect(nextStep).toContain("readApplicationNextStep");
    expect(nextStep).toContain("queueApplicationNextStepIfNeeded");
    expect(nextStep).not.toContain("ensureApplicationNextStep");
  });

  it("next-step updates after jobs and mark-applied, not on page view", () => {
    const process = src("src/lib/application-jobs/process.ts");
    const outreach = src("src/lib/application-assets/outreach.ts");
    expect(process).toMatch(
      /completeApplicationJob[\s\S]*queueApplicationNextStepIfNeeded/,
    );
    expect(outreach).toMatch(
      /markApplicationApplied[\s\S]*queueApplicationNextStepIfNeeded/,
    );
  });

  it("persona identification runs once when research completes", () => {
    const finish = src("src/lib/application/research-finish.ts");
    expect(finish).toContain('type: "HIRING_TEAM_IDENTIFY"');
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    expect(workspace).not.toContain("ensureHiringTeamAfterResearch");
  });

  it("research queues on create or employer update only, with freshness skip", () => {
    const service = src("src/lib/application/service.ts");
    expect(service).toMatch(
      /async function queueApplicationResearch[\s\S]*isResearchFresh[\s\S]*enqueueApplicationResearch/,
    );
    expect(service).toMatch(
      /export async function attachParsedPosting[\s\S]*queueApplicationResearch/,
    );
    expect(service).toMatch(
      /export async function nameApplicationEmployer[\s\S]*queueApplicationResearch/,
    );
    expect(service).toMatch(
      /export async function ensureNamedEmployerResearch[\s\S]*isResearchFresh/,
    );
  });

  it("unchanged stage notes and identical paste skip AI", () => {
    const stages = src("src/lib/interview/stages.ts");
    const interviewAction = src("src/app/actions/interview.ts");
    const contactProfile = src("src/lib/contact-profile/service.ts");
    const hiringTeam = src("src/app/actions/hiring-team.ts");
    const process = src("src/lib/application-jobs/process.ts");

    expect(stages).toContain("notesTextChanged");
    expect(interviewAction).not.toContain("updated.notesTextChanged");
    expect(interviewAction).not.toContain("regenerateApplicationJobRequirement");
    expect(interviewAction).not.toContain("enqueueLearningsReassessIfChanged");

    expect(contactProfile).toContain("queued: false");
    expect(contactProfile).toContain(
      "A person's cheat sheet section is not queued from profile completion.",
    );
    expect(contactProfile).not.toMatch(
      /saveLinkedInPaste[\s\S]*enqueueInterviewerCheatSheetSection/,
    );

    expect(hiringTeam).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(process).not.toMatch(
      /case "CONTACT_PROFILE":[\s\S]*enqueueInterviewerCheatSheetSection/,
    );
  });

  it("cheat sheet sections skip regen when inputs are unchanged", () => {
    const people = src("src/lib/application-summary/people.ts");
    const service = src("src/lib/application-summary/service.ts");
    const enqueue = src("src/lib/application-summary/enqueue.ts");
    expect(people).toContain("cheatSheetPersonSectionInputHash");
    expect(service).toContain("personSectionInputsUnchanged");
    expect(service).toContain("inputHash");
    expect(enqueue).toContain("personSectionInputsUnchanged");

    const hashA = cheatSheetPersonSectionInputHash({
      person: {
        sectionKey: "contact:1",
        roleId: "role-1",
        contactId: "1",
        heading: "Alex",
        roleName: "Hiring Manager",
        titles: ["Director"],
        sectionKind: "HIRING_MANAGER",
      },
      sources: [{ id: "job:title", text: "Engineer" }],
      careerStage: "early_career",
    });
    const hashB = cheatSheetPersonSectionInputHash({
      person: {
        sectionKey: "contact:1",
        roleId: "role-1",
        contactId: "1",
        heading: "Alex",
        roleName: "Hiring Manager",
        titles: ["Director"],
        sectionKind: "HIRING_MANAGER",
      },
      sources: [{ id: "job:title", text: "Engineer" }],
      careerStage: "early_career",
    });
    const hashC = cheatSheetPersonSectionInputHash({
      person: {
        sectionKey: "contact:1",
        roleId: "role-1",
        contactId: "1",
        heading: "Alex",
        roleName: "Hiring Manager",
        titles: ["Director"],
        sectionKind: "HIRING_MANAGER",
      },
      sources: [{ id: "job:title", text: "Staff Engineer" }],
      careerStage: "early_career",
    });
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });

  it("every research stage records usage via aiCallTracking with campaign id", () => {
    const provider = src("src/lib/research/provider.ts");
    const types = src("src/lib/research/types.ts");
    const companyResearch = src("src/lib/tenant/company-research-service.ts");
    const runs = src("src/lib/research/runs-service.ts");

    expect(types).toContain("campaignId?: string | null");
    expect(provider).toContain("aiCallTracking");
    expect(provider).toContain('operation: "RESEARCH_SYNTHESIS"');
    expect(provider).toContain("campaignId: input.campaignId");
    expect(companyResearch).toContain("campaignId: options?.campaignId");
    expect(companyResearch).toContain("tokensRecordedPerStage: true");
    expect(runs).toContain("campaignId: run.campaignId");
  });

  it("Harper consultation page render enqueues no job and makes no paid call", () => {
    const page = src("src/app/(app)/campaigns/[id]/consultation/page.tsx");
    const section = src("src/components/ConsultationSection.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    const standing = src("src/components/ConsultationStanding.tsx");
    const personView = src("src/components/HarperPersonView.tsx");
    const peopleFilter = src("src/components/HarperPeopleFilter.tsx");

    expect(page).toContain("ConsultationSection");
    expect(page).toContain("getApplicationWorkspaceLive");
    expect(page).not.toContain("enqueueApplicationJob");
    expect(page).not.toContain("runPaidStructuredCall");
    expect(page).not.toContain("startConsultation");
    expect(page).not.toContain("planAndStoreRound");

    expect(section).not.toContain("enqueueApplicationJob");
    expect(section).not.toContain("runPaidStructuredCall");
    expect(section).not.toContain("reassessConsultationStanding");
    expect(section).not.toContain("startConsultation(");
    expect(section).not.toContain("planAndStoreRound");
    expect(section).not.toContain("shouldEnqueueConsultationStandingRegen");
    expect(section).toContain("buildHarperQaLayout");
    expect(section).toContain("partitionGeneralQuestionsForStanding");
    expect(section).toContain("consultationBusy");
    expect(section).not.toContain("getApplicationSummaryView");
    expect(page).toContain("jobs={live.jobs}");

    expect(thread).not.toContain("enqueueApplicationJob");
    expect(thread).not.toContain("runPaidStructuredCall");
    expect(standing).not.toContain("enqueueApplicationJob");
    expect(standing).not.toContain("runPaidStructuredCall");
    expect(standing).toContain("QuestionList");
    expect(personView).not.toContain("enqueueApplicationJob");
    expect(personView).not.toContain("runPaidStructuredCall");
    expect(peopleFilter).not.toContain("enqueueApplicationJob");
    expect(peopleFilter).not.toContain("runPaidStructuredCall");
  });

  it("Stage and Outreach page render enqueue no job and make no paid call", () => {
    const interviewsPage = src("src/app/(app)/campaigns/[id]/interviews/page.tsx");
    const outreachPage = src("src/app/(app)/campaigns/[id]/outreach/page.tsx");
    const stages = src("src/components/InterviewStagesSection.tsx");
    const panel = src("src/components/InterviewStagePanel.tsx");
    const outreach = src("src/components/ApplicationOutreachSections.tsx");

    expect(interviewsPage).not.toContain("enqueueApplicationJob");
    expect(interviewsPage).not.toContain("runPaidStructuredCall");
    expect(outreachPage).not.toContain("enqueueApplicationJob");
    expect(outreachPage).not.toContain("runPaidStructuredCall");

    expect(stages).not.toContain("enqueueApplicationJob");
    expect(stages).not.toContain("runPaidStructuredCall");
    expect(panel).not.toContain("enqueueApplicationJob");
    expect(panel).not.toContain("runPaidStructuredCall");
    // Removing Stage UI must not call summary/consultation enqueue on render
    expect(stages).not.toContain("getApplicationSummaryView");
    expect(stages).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(stages).not.toContain("offerPersonPrep");

    expect(outreach).not.toContain("enqueueApplicationJob");
    expect(outreach).not.toContain("runPaidStructuredCall");
  });

  it("workspace and campaign page loads do not merge hiring-team roles", () => {
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    const campaignPage = src("src/app/(app)/campaigns/[id]/page.tsx");
    const sync = src("src/lib/hiring-team/build.ts");

    expect(workspace).not.toContain("mergeExistingHiringTeamRoles");
    expect(campaignPage).not.toContain("mergeExistingHiringTeamRoles");
    expect(sync).toContain("mergeExistingHiringTeamRoles");
    expect(sync).toMatch(
      /export async function syncApplicationHiringTeam[\s\S]*mergeExistingHiringTeamRoles/,
    );
  });
});
