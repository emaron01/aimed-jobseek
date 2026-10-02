// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const personaFind = vi.hoisted(() => vi.fn());
const personaUpdate = vi.hoisted(() => vi.fn(async () => ({ id: "p-1" })));
const summaryFind = vi.hoisted(() => vi.fn());
const summaryUpdate = vi.hoisted(() => vi.fn());
const synthesizeUnchanged = vi.hoisted(() => vi.fn());
const queueBuild = vi.hoisted(() =>
  vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return { id: "build-job" };
  }),
);
const enqueueJob = vi.hoisted(() =>
  vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return { id: "section-job" };
  }),
);
const inputsUnchanged = vi.hoisted(() => vi.fn(async () => false));
const generateStructured = vi.hoisted(() => vi.fn());
const runPaid = vi.hoisted(() =>
  vi.fn(async (input: { callProvider: () => Promise<unknown>; operation?: string }) => ({
    data: await input.callProvider(),
    skipped: false,
  })),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    persona: { findFirst: personaFind, update: personaUpdate },
    applicationSummary: { findFirst: summaryFind, update: summaryUpdate },
  },
}));

vi.mock("@/lib/hiring-team/build", () => ({
  hiringTeamSynthesizeUnchanged: synthesizeUnchanged,
  queueHiringTeamBuild: queueBuild,
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: enqueueJob,
}));

vi.mock("@/lib/application-summary/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/application-summary/service")>();
  return { ...actual, personSectionInputsUnchanged: inputsUnchanged };
});

vi.mock("@/lib/ai/paid-call-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/paid-call-gate")>();
  return { ...actual, runPaidStructuredCall: runPaid };
});

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationReplyAiConfigured: () => true,
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

import { CheatSheetSection } from "@/components/CheatSheetCollapsible";
import { CheatSheetEmptyState } from "@/components/CheatSheetEmptyState";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import {
  HiringTeamCheatSheetToggle,
  HiringTeamRecommendedLine,
  HiringTeamRecommendedMark,
} from "@/components/HiringTeamCheatSheetControls";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { generateCheatSheetPersonSectionGuidance } from "@/lib/application-summary/ai";
import { cheatSheetPersonSectionSchema } from "@/lib/application-summary/contract";
import { enqueuePersonaCheatSheetSection } from "@/lib/application-summary/enqueue";
import { buildCheatSheetPeople } from "@/lib/application-summary/people";
import {
  addPersonaToCheatSheet,
  removePersonaFromCheatSheet,
} from "@/lib/application-summary/persona-cheat-sheet";
import {
  applicationSummaryConfig,
  hiringTeamConfig,
} from "@/lib/product-config";

const ROLE_NOTE =
  "These are Harper's top picks for this role. They represent the types of questions someone in this role may ask. Make sure you study General Questions.";
const EMPTY_PEOPLE =
  "When you know who you will interview with, add them here for Interview Prep.";
const RECOMMENDED_LINE =
  "Harper recommends studying these roles. They're the ones most likely to interview you for this job.";

function storedSection(sectionKey: string) {
  return cheatSheetPersonSectionSchema.parse({
    sectionKey,
    roleId: "p-1",
    contactId: null,
    heading: "Hiring Manager",
    sectionKind: "HIRING_MANAGER",
    caresAbout: [{ text: "Pipeline health" }],
    positioningStatements: [{ text: "Own the forecast" }],
    keyStatements: [{ text: "Weekly cadence" }],
    likelyQuestions: [{ id: "q-kept", prompt: "How do you run a forecast?" }],
    questionsToAsk: [{ text: "What does success look like?" }],
  });
}

function role(id: string, name: string) {
  return {
    id,
    name,
    titles: ["Director"],
    involvement: "DIRECT" as const,
    suggestionKey: null,
  };
}

let root: Root | null = null;

function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  personaFind.mockReset();
  personaUpdate.mockClear();
  summaryFind.mockReset();
  summaryUpdate.mockClear();
  synthesizeUnchanged.mockReset();
  queueBuild.mockClear();
  enqueueJob.mockClear();
  inputsUnchanged.mockReset();
  inputsUnchanged.mockResolvedValue(false);
  generateStructured.mockReset();
  runPaid.mockClear();
  document.body.innerHTML = "";
});

describe("persona cheat sheet activation", () => {
  it("adds only a nullable cheatSheetActivatedAt column", () => {
    const sql = readFileSync(
      "prisma/migrations/20261001190000_persona_cheat_sheet_activated_at/migration.sql",
      "utf8",
    );
    const statement = sql
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("ALTER TABLE"));
    expect(statement).toBe(
      'ALTER TABLE "Persona" ADD COLUMN "cheatSheetActivatedAt" TIMESTAMP(3);',
    );
    expect(sql.toUpperCase()).not.toContain("NOT NULL");
    expect(sql.toUpperCase()).not.toContain("UPDATE ");
    expect(statement?.toUpperCase()).not.toContain("DEFAULT");
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("cheatSheetActivatedAt       DateTime?");
    expect(schema).not.toContain("cheatSheetActivatedAt       DateTime?   @default");
  });

  it("leaves a persona off the Cheat Sheet, with no generate control, until it is added", () => {
    const people = buildCheatSheetPeople({
      roles: [role("p-1", "Hiring Manager"), role("p-2", "Recruiter")],
      contacts: [],
      interviewerContactIds: [],
    });
    expect(people.map((person) => person.sectionKey)).not.toContain("persona:p-1");
    render(
      createElement(
        HarperDraftProvider,
        null,
        createElement(
          CheatSheetSection,
          { id: "general-questions", title: "General Questions" },
          "General",
        ),
      ),
    );
    expect(document.body.textContent).not.toContain("Hiring Manager");
    expect(document.querySelector("[data-testid='generate-cheat-sheet-persona:p-1']")).toBeNull();
    expect(document.querySelector("[data-testid='build-cheat-sheet-persona-persona:p-1']")).toBeNull();
  });

  it("runs the build only when the role changed, then one writing-model section through the gate", async () => {
    personaFind.mockResolvedValue({ id: "p-1", cheatSheetActivatedAt: new Date() });
    summaryFind.mockResolvedValue(null);
    synthesizeUnchanged.mockResolvedValue({ unchanged: false });
    const built = await addPersonaToCheatSheet({
      organizationId: "org-1",
      campaignId: "camp-1",
      personaId: "p-1",
      userId: "user-1",
    });
    expect(built).toEqual({ kind: "build", jobId: "build-job" });
    expect(queueBuild).toHaveBeenCalledTimes(1);
    expect(queueBuild.mock.calls[0]?.[0]).toMatchObject({
      personaId: "p-1",
      deferCheatSheetSection: true,
    });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(personaUpdate).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { cheatSheetActivatedAt: expect.any(Date) },
    });

    synthesizeUnchanged.mockResolvedValue({ unchanged: true });
    queueBuild.mockClear();
    const ready = await addPersonaToCheatSheet({
      organizationId: "org-1",
      campaignId: "camp-1",
      personaId: "p-1",
      userId: "user-1",
    });
    expect(ready.kind).toBe("section");
    expect(queueBuild).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob.mock.calls[0]?.[0]).toMatchObject({
      type: "APPLICATION_SUMMARY",
      targetId: "persona:p-1",
    });

    generateStructured.mockResolvedValue({
      data: {
        sectionKey: "persona:p-1",
        likelyQuestions: [{ prompt: "How do you run a forecast?" }],
      },
    });
    const written = await generateCheatSheetPersonSectionGuidance({
      sources: [{ id: "job:title", text: "Director", category: "JOB" }],
      person: {
        sectionKey: "persona:p-1",
        roleId: "p-1",
        contactId: null,
        heading: "Hiring Manager",
        roleName: "Hiring Manager",
        titles: ["Director"],
        sectionKind: "HIRING_MANAGER",
      },
      careerStage: "mid_career",
      usage: {
        organizationId: "org-1",
        campaignId: "camp-1",
        category: "CONSULTATION",
        operation: "APPLICATION_SUMMARY",
      },
    });
    expect(written.ok).toBe(true);
    expect(runPaid).toHaveBeenCalledTimes(1);
    expect(runPaid.mock.calls[0]?.[0]).toMatchObject({
      operation: "APPLICATION_SUMMARY_PERSON",
    });
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const writer = readFileSync("src/lib/application-summary/ai.ts", "utf8");
    const personFn = writer.slice(writer.indexOf("export async function generateCheatSheetPersonSectionGuidance"));
    expect(personFn).toContain("getConsultationReplyAiProvider");
    expect(personFn).not.toContain("getConsultationAiProvider");
    expect(personFn).not.toContain("getPersonaAiProvider");

    const activated = buildCheatSheetPeople({
      roles: [role("p-1", "Hiring Manager")],
      contacts: [],
      interviewerContactIds: [],
      activatedRoles: [role("p-1", "Hiring Manager")],
    });
    expect(activated[0]).toMatchObject({
      sectionKey: "persona:p-1",
      contactId: null,
      heading: "Hiring Manager",
    });
    const section = storedSection("persona:p-1");
    render(
      createElement(
        HarperDraftProvider,
        null,
        createElement(
          CheatSheetSection,
          { id: "persona:p-1", title: "Hiring Manager" },
          createElement(CheatSheetPersonBody, {
            campaignId: "camp-1",
            canEdit: true,
            sectionKey: "persona:p-1",
            section,
            notes: [],
            personaBuilt: true,
            personaId: "p-1",
          }),
        ),
      ),
    );
    const note = document.querySelector("[data-testid='likely-questions-note']");
    expect(note?.textContent).toBe(ROLE_NOTE);
    expect(note?.querySelector("a")?.getAttribute("href")).toBe(
      "/campaigns/camp-1/summary#general-questions",
    );
    expect(note?.querySelector("a")?.textContent).toBe("General Questions");
    expect(
      applicationSummaryConfig.roleLikelyQuestionsLead +
        applicationSummaryConfig.generalQuestionsLink +
        ".",
    ).toBe(ROLE_NOTE);
  });

  it("hides a removed persona and shows the same stored section on the next add with no job", async () => {
    const section = storedSection("persona:p-1");
    summaryFind.mockResolvedValue({ guidanceJson: { people: [section] } });
    personaFind.mockResolvedValue({ id: "p-1" });
    await removePersonaFromCheatSheet({
      organizationId: "org-1",
      campaignId: "camp-1",
      personaId: "p-1",
    });
    expect(personaUpdate).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { cheatSheetActivatedAt: null },
    });
    expect(summaryUpdate).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(section.likelyQuestions[0]?.id).toBe("q-kept");

    synthesizeUnchanged.mockResolvedValue({ unchanged: false });
    const again = await addPersonaToCheatSheet({
      organizationId: "org-1",
      campaignId: "camp-1",
      personaId: "p-1",
      userId: "user-1",
    });
    expect(again).toEqual({ kind: "stored", jobId: null });
    expect(synthesizeUnchanged).not.toHaveBeenCalled();
    expect(queueBuild).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(runPaid).not.toHaveBeenCalled();
    expect(summaryFind.mock.results.at(-1)).toBeDefined();
    const still = cheatSheetPersonSectionSchema.parse(
      summaryFind.mock.results[0]?.value
        ? (await summaryFind.mock.results[0]?.value).guidanceJson.people[0]
        : null,
    );
    expect(still.likelyQuestions.map((item) => item.id)).toEqual(["q-kept"]);
  });

  it("marks only Direct personas and adds nothing until the seeker chooses", () => {
    render(
      createElement(
        "div",
        null,
        createElement(HiringTeamRecommendedLine),
        createElement(HiringTeamRecommendedMark, { personaId: "direct-1" }),
        createElement(HiringTeamRecommendedMark, { personaId: "direct-2" }),
        createElement(HiringTeamCheatSheetToggle, {
          campaignId: "camp-1",
          personaId: "direct-1",
          added: false,
        }),
        createElement(HiringTeamCheatSheetToggle, {
          campaignId: "camp-1",
          personaId: "direct-2",
          added: false,
        }),
        createElement(HiringTeamCheatSheetToggle, {
          campaignId: "camp-1",
          personaId: "indirect-1",
          added: false,
        }),
      ),
    );
    expect(document.querySelector("[data-testid='hiring-team-recommended-line']")?.textContent).toBe(
      RECOMMENDED_LINE,
    );
    expect(hiringTeamConfig.recommendedLine).toBe(RECOMMENDED_LINE);
    expect(document.querySelector("[data-testid='hiring-team-recommended-direct-1']")?.textContent).toBe(
      "Recommended",
    );
    expect(document.querySelector("[data-testid='hiring-team-recommended-direct-2']")).not.toBeNull();
    expect(document.querySelector("[data-testid='hiring-team-recommended-indirect-1']")).toBeNull();
    expect(document.body.textContent).toContain("Add to Cheat Sheet");
    expect(document.body.textContent).not.toContain("Remove from Cheat Sheet");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.body.textContent?.toLowerCase()).not.toContain("confirm");
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    expect(workspace).toContain("narrative?.involvement !== \"INDIRECT\"");
    expect(workspace).toContain("directRoles.length > 0");
    expect(workspace).toContain("HiringTeamRecommendedMark");
    expect(workspace).not.toContain("window.confirm");
    const controls = readFileSync("src/components/HiringTeamCheatSheetControls.tsx", "utf8");
    expect(controls).not.toContain("window.confirm");
    expect(controls).not.toContain("confirm(");
  });

  it("shows the empty Cheat Sheet line and opens Add Contact for that application", () => {
    render(createElement(CheatSheetEmptyState, { campaignId: "camp-1" }));
    const line = document.querySelector("[data-testid='cheat-sheet-empty-people']");
    expect(line?.textContent).toBe(EMPTY_PEOPLE);
    expect(line?.querySelector("a")?.textContent).toBe("add them here");
    expect(line?.querySelector("a")?.getAttribute("href")).toBe("/contacts?campaignId=camp-1");
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(page).toContain("view.people.length === 0");
    expect(page).toContain("CheatSheetEmptyState");
  });

  it("does not start interviewer prep from any add-person path", () => {
    const stages = readFileSync("src/lib/interview/stages.ts", "utf8");
    const startAt = stages.indexOf("async function startPersonPrepForContact");
    expect(stages.slice(0, startAt)).not.toContain("await offerPersonPrep");
    expect(stages.slice(startAt)).toContain("await offerPersonPrep");
    const hiring = readFileSync("src/app/actions/hiring-team.ts", "utf8");
    expect(hiring).not.toContain("offerPersonPrep");
    const prep = readFileSync("src/lib/interview/person-prep.ts", "utf8");
    expect(prep).toContain('operation: "person_prep"');
  });

  it("makes no paid call and enqueues no job while rendering either page", () => {
    render(
      createElement(
        "div",
        null,
        createElement(CheatSheetEmptyState, { campaignId: "camp-1" }),
        createElement(HiringTeamCheatSheetToggle, {
          campaignId: "camp-1",
          personaId: "p-1",
          added: false,
        }),
      ),
    );
    expect(runPaid).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(queueBuild).not.toHaveBeenCalled();
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    for (const source of [page, workspace]) {
      expect(source).not.toContain("runPaidStructuredCall");
      expect(source).not.toContain("enqueueApplicationJob");
      expect(source).not.toContain("queueHiringTeamBuild");
    }
    const worker = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(worker).toContain("payload.deferCheatSheetSection");
    expect(worker).toContain("enqueuePersonaCheatSheetSection");
    expect(worker).not.toContain("enqueueCheatSheetSectionsForPersona");
  });

  it("skips the role section when the persona is not on the Cheat Sheet", async () => {
    personaFind.mockResolvedValue({ cheatSheetActivatedAt: null });
    const jobId = await enqueuePersonaCheatSheetSection({
      organizationId: "org-1",
      campaignId: "camp-1",
      personaId: "p-1",
      userId: "user-1",
    });
    expect(jobId).toBeNull();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(runPaid).not.toHaveBeenCalled();
  });
});
