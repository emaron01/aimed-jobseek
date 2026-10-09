import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { latestApplicationSummaryFailure } from "@/lib/application-summary/failure-message";
import { applicationSummaryConfig } from "@/lib/product-config";

const campaignFind = vi.hoisted(() => vi.fn());
const membershipFind = vi.hoisted(() => vi.fn());
const personaMany = vi.hoisted(() => vi.fn());
const personaFind = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const assignPersona = vi.hoisted(() => vi.fn());
const unchanged = vi.hoisted(() => vi.fn());
const rebuild = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    campaign: { findFirst: campaignFind },
    campaignContact: { findFirst: membershipFind },
    persona: { findMany: personaMany, findFirst: personaFind },
  },
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: enqueue,
}));

vi.mock("@/lib/application/contacts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/application/contacts")>(
    "@/lib/application/contacts",
  );
  return {
    ...actual,
    assignApplicationContactToPersona: assignPersona,
  };
});

vi.mock("@/lib/application-summary/service", () => ({
  personSectionInputsUnchanged: unchanged,
}));

vi.mock("@/lib/hiring-team/build", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hiring-team/build")>(
    "@/lib/hiring-team/build",
  );
  return {
    ...actual,
    rebuildApplicationHiringTeamRole: rebuild,
  };
});

const failure = `${applicationSummaryConfig.title} could not be generated. Retry.`;

describe("Interview prep guide", () => {
  beforeEach(() => {
    campaignFind.mockReset();
    membershipFind.mockReset();
    personaMany.mockReset();
    personaFind.mockReset();
    enqueue.mockReset();
    assignPersona.mockReset();
    unchanged.mockReset();
    rebuild.mockReset();
    campaignFind.mockResolvedValue({ id: "camp" });
    enqueue.mockResolvedValue({ id: "job-1" });
    assignPersona.mockResolvedValue({ contactId: "ashley", personaId: "rec", moved: true });
    unchanged.mockResolvedValue(false);
    rebuild.mockResolvedValue({ identifySkipped: true, synthesizeSkipped: false });
  });

  it("does not queue paid work when an interviewer is added or a page is viewed", () => {
    const stages = readFileSync("src/lib/interview/stages.ts", "utf8");
    const interviews = readFileSync(
      "src/app/(app)/campaigns/[id]/interviews/page.tsx",
      "utf8",
    );
    const summary = readFileSync(
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "utf8",
    );
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const addInterviewer = stages.slice(
      stages.indexOf("export async function addInterviewStageInterviewer"),
      stages.indexOf("export async function addInterviewContact"),
    );
    expect(addInterviewer).not.toContain("queueInterviewPrepGuide");
    expect(addInterviewer).not.toContain("createInterviewPrepGuideAction");
    expect(stages).not.toContain("createInterviewPrepGuideAction");
    expect(interviews).not.toContain("queueInterviewPrepGuide");
    expect(interviews).not.toContain("createInterviewPrepGuideAction");
    expect(summary).not.toContain("queueInterviewPrepGuide");
    expect(workspace).not.toContain("queueInterviewPrepGuide");
    expect(workspace).not.toContain("createInterviewPrepGuideAction");
  });

  it("wires both buttons to the same action", () => {
    const button = readFileSync("src/components/InterviewPrepGuideButton.tsx", "utf8");
    const notes = readFileSync("src/components/InterviewStagesSection.tsx", "utf8");
    const summary = readFileSync(
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
      "utf8",
    );
    expect(button).toContain("createInterviewPrepGuideAction");
    expect(button).toContain("InterviewPrepGuideForm");
    expect(button).toContain("CheatSheetInterviewPrepGuideButton");
    expect(notes).toContain("InterviewPrepGuideForm");
    expect(summary).toContain("CheatSheetInterviewPrepGuideButton");
    expect(applicationSummaryConfig.actions.createInterviewPrepGuide).toBe(
      "Create Interview Prep Guide",
    );
    expect(applicationSummaryConfig.actions.updateInterviewPrepGuide).toBe(
      "Update Interview Prep Guide",
    );
  });

  it("matches Sales Recruiter by title, builds only when needed, then queues the guide", async () => {
    const { queueInterviewPrepGuide, prepareInterviewPrepGuideGeneration } =
      await import("@/lib/interview/prep-guide");
    membershipFind.mockResolvedValue({
      chosenPersonaId: null,
      contact: { title: "Sales Recruiter" },
    });
    personaMany.mockResolvedValue([
      {
        id: "rec",
        name: "Recruiter",
        suggestionKey: "recruiter",
        targetTitles: ["Sales Recruiter", "Recruiter"],
      },
    ]);
    personaFind.mockResolvedValue({ id: "rec", profileJson: {} });

    const queued = await queueInterviewPrepGuide({
      organizationId: "org",
      campaignId: "camp",
      userId: "user",
      contactId: "ashley",
    });

    expect(assignPersona).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "ashley", personaId: "rec" }),
    );
    expect(unchanged).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        type: "APPLICATION_SUMMARY",
        targetId: "contact:ashley",
        payload: { userId: "user", sectionKey: "contact:ashley" },
      }),
    );
    expect(queued).toEqual({
      jobId: "job-1",
      unchanged: false,
      needsPersonaChoice: false,
    });

    rebuild.mockImplementation(async () => {
      personaFind.mockResolvedValue({
        profileJson: { narrative: { overview: { text: "Ashley owns the slate." } } },
      });
    });
    await prepareInterviewPrepGuideGeneration({
      organizationId: "org",
      campaignId: "camp",
      personaId: "rec",
      personaBuilt: false,
    });
    expect(rebuild).toHaveBeenCalledTimes(1);

    rebuild.mockClear();
    await prepareInterviewPrepGuideGeneration({
      organizationId: "org",
      campaignId: "camp",
      personaId: "rec",
      personaBuilt: true,
    });
    expect(rebuild).not.toHaveBeenCalled();

    const service = readFileSync("src/lib/application-summary/service.ts", "utf8");
    const generation = service.slice(
      service.indexOf("export async function generateApplicationSummary"),
    );
    const prepareAt = generation.indexOf("prepareInterviewPrepGuideGeneration");
    const modelAt = generation.indexOf("generateCheatSheetPersonSectionGuidance(");
    expect(prepareAt).toBeGreaterThan(0);
    expect(modelAt).toBeGreaterThan(prepareAt);
  });

  it("pays nothing on a second click when the built persona and guide inputs are unchanged", async () => {
    const { queueInterviewPrepGuide } = await import("@/lib/interview/prep-guide");
    membershipFind.mockResolvedValue({
      chosenPersonaId: "rec",
      contact: { title: "Sales Recruiter" },
    });
    personaFind.mockResolvedValue({
      id: "rec",
      profileJson: { narrative: { overview: { text: "Built." } } },
    });
    unchanged.mockResolvedValue(true);

    const queued = await queueInterviewPrepGuide({
      organizationId: "org",
      campaignId: "camp",
      userId: "user",
      contactId: "ashley",
    });

    expect(queued).toEqual({
      jobId: null,
      unchanged: true,
      needsPersonaChoice: false,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
    expect(assignPersona).not.toHaveBeenCalled();
  });

  it("still fails with one message when the persona build does not finish", async () => {
    const { prepareInterviewPrepGuideGeneration } = await import(
      "@/lib/interview/prep-guide"
    );
    personaFind.mockResolvedValue({ profileJson: {} });
    await expect(
      prepareInterviewPrepGuideGeneration({
        organizationId: "org",
        campaignId: "camp",
        personaId: "rec",
        personaBuilt: false,
      }),
    ).rejects.toThrow(/no narrative/);

    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const notes = readFileSync("src/components/ApplicationInterviewsBody.tsx", "utf8");
    expect(page.match(/could not be generated/g)).toHaveLength(1);
    expect(page).toContain("hideFailure");
    expect(page).toContain("suppressJobFailure");
    expect(page).toContain("CheatSheetGenerationError");
    expect(page).not.toContain("border-danger");
    expect(page).not.toContain("Use Retry above");
    expect(notes.match(/could not be generated/g)).toHaveLength(1);
    expect(notes).toContain('type="APPLICATION_SUMMARY"');
    expect(notes).toContain("hideFailure");

    const shown = latestApplicationSummaryFailure({
      jobs: [
        {
          type: "APPLICATION_SUMMARY",
          status: "FAILED",
          error: failure,
          targetId: "contact:ashley",
        },
      ],
      summaryStatus: "FAILED",
      generationError: failure,
      fallback: failure,
    });
    expect(shown).toEqual({ message: failure, sectionKey: "contact:ashley" });
    const underlying = latestApplicationSummaryFailure({
      jobs: [
        {
          type: "APPLICATION_SUMMARY",
          status: "FAILED",
          error: "schema mismatch at likelyQuestions",
          targetId: "contact:ashley",
        },
      ],
      summaryStatus: "FAILED",
      generationError: failure,
      fallback: failure,
    });
    expect(underlying).toEqual({ message: failure, sectionKey: "contact:ashley" });
  });

  it("asks for the existing persona dropdown when the title matches no single role", async () => {
    const { queueInterviewPrepGuide, interviewPrepGuideNeedsPersonaChoice } =
      await import("@/lib/interview/prep-guide");
    membershipFind.mockResolvedValue({
      chosenPersonaId: null,
      contact: { title: "Sales Recruiter" },
    });
    const roles = [
      {
        id: "rec",
        name: "Recruiter",
        suggestionKey: "recruiter",
        targetTitles: ["Sales Recruiter"],
      },
      {
        id: "hm",
        name: "Hiring Manager",
        suggestionKey: "hiring_manager",
        targetTitles: ["Sales Recruiter"],
      },
    ];
    personaMany.mockResolvedValue(roles);
    expect(
      interviewPrepGuideNeedsPersonaChoice({
        chosenPersonaId: null,
        title: "Sales Recruiter",
        roles,
      }),
    ).toBe(true);

    const choice = await queueInterviewPrepGuide({
      organizationId: "org",
      campaignId: "camp",
      userId: "user",
      contactId: "ashley",
    });
    expect(choice).toEqual({
      jobId: null,
      unchanged: false,
      needsPersonaChoice: true,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(assignPersona).not.toHaveBeenCalled();

    personaFind.mockResolvedValue({ id: "hm", profileJson: {} });
    const picked = await queueInterviewPrepGuide({
      organizationId: "org",
      campaignId: "camp",
      userId: "user",
      contactId: "ashley",
      personaId: "hm",
    });
    expect(assignPersona).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "ashley", personaId: "hm" }),
    );
    expect(picked.needsPersonaChoice).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(1);

    const stages = readFileSync("src/lib/interview/stages.ts", "utf8");
    const startPrep = stages.slice(
      stages.indexOf("export async function startPersonPrepForContact"),
      stages.indexOf("export async function removeInterviewForPerson"),
    );
    expect(startPrep).toContain("queueInterviewPrepGuide");
    expect(startPrep).not.toContain("offerPersonPrep");
    expect(startPrep).not.toContain("enqueueInterviewerCheatSheetSection");
    const action = readFileSync("src/app/actions/application-summary.ts", "utf8");
    expect(action).toContain('sectionKey?.startsWith("contact:")');
    expect(action).toContain("queueInterviewPrepGuide");
    const service = readFileSync("src/lib/application-summary/service.ts", "utf8");
    const generation = service.slice(
      service.indexOf("export async function generateApplicationSummary"),
    );
    const personBlock = generation.slice(
      generation.indexOf("if (input.sectionKey)"),
      generation.indexOf("const shellSources"),
    );
    expect(personBlock).not.toContain("markSummaryFailed");
    expect(personBlock).not.toContain('status: "FAILED"');
    const ai = readFileSync("src/lib/application-summary/ai.ts", "utf8");
    expect(ai).toContain("cause: error instanceof Error ? error.message : \"unknown\"");
  });
});
