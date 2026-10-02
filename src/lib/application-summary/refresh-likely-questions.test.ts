// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.hoisted(() =>
  vi.fn(async (input: {
    campaignId?: string;
    type?: string;
    targetId?: string | null;
  }) => {
    void input.campaignId;
    return { id: "summary-job" };
  }),
);
const rebuild = vi.hoisted(() => vi.fn(async () => false));
const generateStructured = vi.hoisted(() => vi.fn());
const runPaid = vi.hoisted(() =>
  vi.fn(
    async (input: {
      callProvider: () => Promise<unknown>;
      operation?: string;
      subjectKey?: string;
      organizationId?: string;
      inputFingerprint?: string;
    }) => ({
      data: await input.callProvider(),
      skipped: false,
    }),
  ),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: async () => ({ id: "user-1" }),
}));

vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  requireOrganizationId: async () => "org-1",
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: enqueue,
}));

vi.mock("@/lib/application-summary/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/application-summary/service")>();
  return {
    ...actual,
    applicationSummaryNothingToRebuild: rebuild,
  };
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

import { generateApplicationSummaryAction } from "@/app/actions/application-summary";
import { CheatSheetSection } from "@/components/CheatSheetCollapsible";
import {
  CheatSheetPersonBody,
  RefreshLikelyQuestionsButton,
} from "@/components/CheatSheetPersonBody";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { HarperPersonInlineProfile } from "@/components/HarperPersonView";
import { generateCheatSheetPersonSectionGuidance } from "@/lib/application-summary/ai";
import {
  assignCoachItemIds,
  stableLikelyQuestionId,
} from "@/lib/application-summary/coach";
import {
  cheatSheetPersonSectionGenerateSchema,
  cheatSheetPersonSectionSchema,
  type ApplicationSummaryGuidance,
  type CheatSheetCoachItem,
  type CheatSheetPersonSection,
} from "@/lib/application-summary/contract";
import {
  mergePersonLikelyQuestions,
  personLikelyQuestionCountDecision,
} from "@/lib/application-summary/likely-questions";
import { contactIdFromCheatSheetTarget } from "@/lib/consultation/harper-layout";

const FORECAST = "How do you run a weekly forecast?";
const COACHING = "What would you inspect first in a missed-quarter pipeline review?";
const GENERAL_TEXT = "Tell me about a time you rebuilt a forecast cadence for a sales team.";
const SECTION_KEY = "contact:c1";

function item(
  partial: Partial<CheatSheetCoachItem> & Pick<CheatSheetCoachItem, "prompt">,
): CheatSheetCoachItem {
  return {
    sampleAnswer: null,
    harperQuestion: null,
    supports: [],
    ...partial,
  };
}

function assignLikely(items: CheatSheetCoachItem[]) {
  return assignCoachItemIds({
    stories: [],
    people: [
      {
        sectionKey: SECTION_KEY,
        roleId: "role-1",
        contactId: "c1",
        heading: "Alex",
        sectionKind: "HIRING_MANAGER",
        caresAbout: [],
        positioningStatements: [],
        keyStatements: [],
        likelyQuestions: items,
        questionsToAsk: [],
        bestMaterial: [],
        storyIds: [],
      },
    ],
  } as ApplicationSummaryGuidance).people[0]!.likelyQuestions;
}

function storedSection(questions: CheatSheetCoachItem[]): CheatSheetPersonSection {
  return cheatSheetPersonSectionSchema.parse({
    sectionKey: "contact:c-1",
    roleId: "role-1",
    contactId: "c-1",
    heading: "Alex Rivera",
    sectionKind: "HIRING_MANAGER",
    caresAbout: [{ text: "Quota", seekerConnection: "I have carried one.", supports: [] }],
    positioningStatements: [{ text: "I run the forecast.", supports: [] }],
    keyStatements: [{ text: "I inspect the pipeline.", supports: [] }],
    likelyQuestions: questions,
    questionsToAsk: [{ text: "What does success look like?", followUps: [], supports: [] }],
    bestMaterial: [],
    storyIds: [],
  });
}

function mount(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(createElement(HarperDraftProvider, null, node));
  });
  return host;
}

function refreshButton(host: ParentNode): HTMLButtonElement {
  const form = host.querySelector(
    "[data-testid='refresh-likely-questions-contact:c-1']",
  );
  const button = form?.querySelector("button");
  if (!button) throw new Error("Refresh likely questions button was not rendered.");
  return button;
}

describe("stable likely-question identity", () => {
  it("keeps a reply, draft, and approved answer on the same question after the writer reorders", () => {
    const answered = item({
      id: "contact:c1:likely:1",
      prompt: FORECAST,
      sampleAnswer: "I run a Monday commit against pipeline quality.",
    });
    const second = item({
      id: "contact:c1:likely:2",
      prompt: "How do you inspect a late-stage deal?",
      sampleAnswer: null,
    });
    const answers = new Map<string, { reply: string; draft: string; approved: string }>([
      [
        "cheatSheet:contact:c1:likely:1",
        {
          reply: "I name slip risk out loud.",
          draft: "Monday commit draft",
          approved: "I run a Monday commit against pipeline quality.",
        },
      ],
    ]);
    const writerOrder = [
      item({ prompt: COACHING, sampleAnswer: "I start with the slipped commit." }),
      item({ prompt: FORECAST, sampleAnswer: "A different sample that must not replace the stored one." }),
      item({ prompt: second.prompt, sampleAnswer: "Replacement that must not land." }),
    ];
    const merged = mergePersonLikelyQuestions({
      existing: [answered, second],
      incoming: writerOrder,
    });
    const stored = assignLikely(merged);
    const forecast = stored.find((row) => row.prompt === FORECAST);
    const keptSecond = stored.find((row) => row.prompt === second.prompt);
    expect(forecast?.id).toBe("contact:c1:likely:1");
    expect(keptSecond?.id).toBe("contact:c1:likely:2");
    expect(forecast?.sampleAnswer).toBe(answered.sampleAnswer);
    expect(answers.get(`cheatSheet:${forecast?.id}`)).toEqual({
      reply: "I name slip risk out loud.",
      draft: "Monday commit draft",
      approved: "I run a Monday commit against pipeline quality.",
    });
    expect(contactIdFromCheatSheetTarget(`cheatSheet:${forecast?.id}`)).toBe("c1");
    const added = stored.find((row) => row.prompt === COACHING);
    expect(added?.id).toBeTruthy();
    expect(added?.id).not.toBe("contact:c1:likely:1");
    expect(added?.id).not.toBe("contact:c1:likely:3");
    expect(answers.has(`cheatSheet:${added?.id}`)).toBe(false);
  });

  it("gives a new question an id from its text or General question id, not its position", () => {
    const coaching = item({ prompt: COACHING });
    const general = item({
      prompt: GENERAL_TEXT,
      generalQuestionId: "turn-general",
    });
    const first = assignLikely([coaching]);
    const reordered = assignLikely([general, coaching]);
    expect(first[0]?.id).toBe(reordered[1]?.id);
    expect(first[0]?.id).not.toMatch(/:likely:\d+$/);
    expect(reordered[0]?.id).toBe(
      stableLikelyQuestionId(SECTION_KEY, general, new Set()),
    );
    expect(reordered[0]?.id?.startsWith("contact:c1:likely:")).toBe(true);
    expect(contactIdFromCheatSheetTarget(`cheatSheet:${reordered[0]?.id}`)).toBe("c1");
    const positioned = assignLikely([
      item({ ...coaching, id: "contact:c1:likely:2" }),
      item({ id: "contact:c1:likely:1", prompt: FORECAST }),
    ]);
    expect(positioned.map((row) => row.id)).toEqual([
      "contact:c1:likely:2",
      "contact:c1:likely:1",
    ]);
  });
});

describe("additive person-section regeneration", () => {
  it("appends a new question and a new General reference, and drops duplicates", () => {
    const existing = [
      item({
        id: "contact:c1:likely:1",
        prompt: FORECAST,
        sampleAnswer: "Approved Monday commit.",
      }),
      item({
        id: "contact:c1:likely:2",
        prompt: GENERAL_TEXT,
        generalQuestionId: "turn-general",
        sampleAnswer: null,
      }),
    ];
    const incoming = [
      item({
        prompt: "How do you run a weekly forecast?",
        sampleAnswer: "Must not replace the approved answer.",
      }),
      item({
        prompt: "A reworded general question that still points at the same id.",
        generalQuestionId: "turn-general",
      }),
      item({ prompt: COACHING, sampleAnswer: "I start with the slipped commit." }),
      item({
        prompt: "Tell me how you would open a first meeting with this hiring manager.",
        generalQuestionId: "turn-new",
      }),
      item({
        prompt: "Another wording of the new general question.",
        generalQuestionId: "turn-new",
      }),
    ];
    const merged = mergePersonLikelyQuestions({ existing, incoming });
    expect(merged.map((row) => row.prompt)).toEqual([
      FORECAST,
      GENERAL_TEXT,
      COACHING,
      "Tell me how you would open a first meeting with this hiring manager.",
    ]);
    expect(merged[0]?.sampleAnswer).toBe("Approved Monday commit.");
    expect(merged[0]?.id).toBe("contact:c1:likely:1");
    expect(merged[1]?.generalQuestionId).toBe("turn-general");
    expect(merged[3]?.generalQuestionId).toBe("turn-new");
  });

  it("applies 4-12 to the writer's new list and lets the stored total grow past 12", () => {
    expect(personLikelyQuestionCountDecision(4, 0)).toBe("save");
    expect(personLikelyQuestionCountDecision(12, 0)).toBe("save");
    expect(personLikelyQuestionCountDecision(13, 0)).toBe("retry");
    expect(personLikelyQuestionCountDecision(3, 0)).toBe("retry");
    expect(personLikelyQuestionCountDecision(3, 1)).toBe("accept-short");
    const existingPrompts = [
      "How did you rebuild the weekly forecast cadence?",
      "How do you coach a manager through a missed commit?",
      "What do you inspect in a late-stage enterprise deal?",
      "How do you hire the first enterprise account executive?",
      "How do you run a Monday pipeline review?",
      "What story would you tell about a lost renewal?",
      "How do you partner with product on a pricing change?",
      "How do you prepare a board update on pipeline coverage?",
      "What would you change in the first thirty days?",
      "How do you handle a discount request from a strategic account?",
    ];
    const incomingPrompts = [
      "Which customer references would you call before an onsite?",
      "How do you qualify a multi-threaded buying committee?",
      "What operating metric would you put on the wall?",
      "How do you recover a region that missed two quarters?",
      "What would you ask finance before a large discount?",
      "How do you onboard a sales engineer onto a new motion?",
      "Which enablement gap would you close first?",
      "How do you decide which deals get executive coverage?",
      "What would you stop doing in a bloated forecast meeting?",
      "How do you teach managers to inspect call recordings?",
      "Which hiring profile fits an expansion territory?",
      "How do you write a mutual action plan with a champion?",
    ];
    const existing = existingPrompts.map((prompt, index) =>
      item({
        id: `contact:c-1:likely:${index + 1}`,
        prompt,
      }),
    );
    const incoming = incomingPrompts.map((prompt) => item({ prompt }));
    const merged = mergePersonLikelyQuestions({ existing, incoming });
    expect(merged).toHaveLength(22);
    expect(merged.slice(0, 10).map((row) => row.id)).toEqual(
      existing.map((row) => row.id),
    );
    const parsed = storedSection(merged);
    expect(parsed.likelyQuestions).toHaveLength(22);
    const twelve = incoming.slice(0, 12).map((row) => ({
      ...row,
      interviewTypeTag: "focused_competency" as const,
      answerFramework: null,
      challenge: null,
      situation: null,
      task: null,
      action: null,
      result: null,
      generalQuestionId: null,
    }));
    expect(
      cheatSheetPersonSectionGenerateSchema.safeParse({
        sectionKey: "contact:c-1",
        roleId: "role-1",
        contactId: "c-1",
        heading: "Alex",
        sectionKind: "HIRING_MANAGER",
        caresAbout: [{ text: "Quota", seekerConnection: "", supports: [] }],
        positioningStatements: [{ text: "I run the forecast.", supports: [] }],
        keyStatements: [{ text: "I inspect the pipeline.", supports: [] }],
        likelyQuestions: twelve,
        questionsToAsk: [{ text: "What does success look like?", followUps: [], supports: [] }],
      }).success,
    ).toBe(true);
    expect(
      cheatSheetPersonSectionGenerateSchema.safeParse({
        sectionKey: "contact:c-1",
        roleId: "role-1",
        contactId: "c-1",
        heading: "Alex",
        sectionKind: "HIRING_MANAGER",
        caresAbout: [{ text: "Quota", seekerConnection: "", supports: [] }],
        positioningStatements: [{ text: "I run the forecast.", supports: [] }],
        keyStatements: [{ text: "I inspect the pipeline.", supports: [] }],
        likelyQuestions: [
          ...twelve,
          {
            ...twelve[0],
            prompt: "One question past the writer cap about a new topic?",
          },
        ],
        questionsToAsk: [{ text: "What does success look like?", followUps: [], supports: [] }],
      }).success,
    ).toBe(false);
  });
});

describe("person sections run only when the seeker chooses that person", () => {
  it("does not enqueue a person section from notes, stages, hiring team, or profile completion", () => {
    const stages = readFileSync("src/lib/interview/stages.ts", "utf8");
    const hiringTeam = readFileSync("src/app/actions/hiring-team.ts", "utf8");
    const summary = readFileSync("src/lib/application-summary/service.ts", "utf8");
    const learned = readFileSync("src/lib/application/service.ts", "utf8");
    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    const updateStage = stages.slice(
      stages.indexOf("export async function updateInterviewStage"),
      stages.indexOf("export async function setApplicationProgress"),
    );
    const addStageInterviewer = stages.slice(
      stages.indexOf("export async function addInterviewStageInterviewer"),
      stages.indexOf("export async function addInterviewContact"),
    );
    const learnedNotes = learned.slice(
      learned.indexOf("export async function saveApplicationJobLearnedNotes"),
    );
    expect(updateStage).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(addStageInterviewer).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(hiringTeam).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(summary).not.toContain("enqueueCheatSheetPersonSection");
    expect(summary).not.toContain("enqueueMissingInterviewerCheatSheetSections");
    expect(learnedNotes).not.toContain("enqueueCheatSheetPersonSection");
    expect(learnedNotes).not.toContain('type: "APPLICATION_SUMMARY"');
    expect(learnedNotes).not.toContain("enqueueApplicationJob");
    expect(process).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(process).not.toContain("enqueueCheatSheetSectionsForPersona");
    const startPrep = stages.slice(
      stages.indexOf("export async function startPersonPrepForContact"),
      stages.indexOf("export function stageTypeLabel"),
    );
    expect(startPrep).toContain("enqueueInterviewerCheatSheetSection");
    expect(startPrep).toContain("personSectionInputsUnchanged");
  });

  it("shows No Changes To Likely Questions and makes no paid call when inputs are unchanged", async () => {
    rebuild.mockResolvedValue(true);
    enqueue.mockClear();
    runPaid.mockClear();
    const formData = new FormData();
    formData.set("campaignId", "camp");
    formData.set("sectionKey", "contact:c-1");
    const result = await generateApplicationSummaryAction(null, formData);
    expect(result).toEqual({
      ok: true,
      message: "No Changes To Likely Questions",
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(runPaid).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();

    const pageData = new FormData();
    pageData.set("campaignId", "camp");
    const pageResult = await generateApplicationSummaryAction(null, pageData);
    expect(pageResult.message).toBe("No Changes To Cheat Sheet");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueues only that person's section when inputs changed", async () => {
    rebuild.mockResolvedValue(false);
    enqueue.mockClear();
    const formData = new FormData();
    formData.set("campaignId", "camp");
    formData.set("sectionKey", "contact:c-1");
    const result = await generateApplicationSummaryAction(null, formData);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Refreshing likely questions…");
    expect(result.jobId).toBe("summary-job");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({
      campaignId: "camp",
      type: "APPLICATION_SUMMARY",
      targetId: "contact:c-1",
    });
  });

  it("makes one writing-model call through the paid-call gate, and a retry uses a different fingerprint", async () => {
    generateStructured.mockReset();
    runPaid.mockClear();
    generateStructured.mockResolvedValue({
      data: {
        sectionKey: SECTION_KEY,
        likelyQuestions: [item({ prompt: FORECAST })],
      },
    });
    const input = {
      sources: [{ id: "job:title", text: "Director", category: "JOB" }],
      person: {
        sectionKey: SECTION_KEY,
        roleId: "role-1",
        contactId: "c1",
        heading: "Alex",
        roleName: "Hiring Manager",
        titles: ["Director"],
        sectionKind: "HIRING_MANAGER",
      },
      careerStage: "mid_career" as const,
      usage: {
        organizationId: "org-1",
        campaignId: "camp",
        category: "CONSULTATION" as const,
        operation: "APPLICATION_SUMMARY" as const,
      },
    };
    const first = await generateCheatSheetPersonSectionGuidance(input);
    expect(first.ok).toBe(true);
    expect(runPaid).toHaveBeenCalledTimes(1);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(runPaid.mock.calls[0]?.[0]).toMatchObject({
      operation: "APPLICATION_SUMMARY_PERSON",
      subjectKey: `camp:${SECTION_KEY}`,
      organizationId: "org-1",
    });
    const second = await generateCheatSheetPersonSectionGuidance({
      ...input,
      qualityFeedback: ["Return between 4 and 12 likely questions in total."],
    });
    expect(second.ok).toBe(true);
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(runPaid).toHaveBeenCalledTimes(2);
    expect(runPaid.mock.calls[0]?.[0].inputFingerprint).not.toBe(
      runPaid.mock.calls[1]?.[0].inputFingerprint,
    );
  });
});

describe("Refresh likely questions button", () => {
  const section = storedSection([
    item({
      id: "contact:c-1:likely:1",
      prompt: FORECAST,
      sampleAnswer: "I run a Monday commit.",
    }),
  ]);

  beforeEach(() => {
    document.body.innerHTML = "";
    enqueue.mockClear();
    runPaid.mockClear();
    generateStructured.mockClear();
    rebuild.mockReset();
    rebuild.mockResolvedValue(false);
  });

  it("renders in each person section on the cheat sheet and Harper, beside print, in primary blue, hidden in print", () => {
    const sheet = mount(
      createElement(
        CheatSheetSection,
        {
          id: "contact:c-1",
          title: "Alex Rivera",
          headerAside: createElement(RefreshLikelyQuestionsButton, {
            campaignId: "camp",
            sectionKey: "contact:c-1",
          }),
        },
        createElement(CheatSheetPersonBody, {
          campaignId: "camp",
          canEdit: true,
          sectionKey: "contact:c-1",
          section,
          notes: [],
          personaBuilt: true,
          personaId: "role-1",
        }),
      ),
    );
    const harper = mount(
      createElement(HarperPersonInlineProfile, {
        campaignId: "camp",
        canEdit: true,
        contactId: "c-1",
        heading: "Alex Rivera",
        sectionKey: "contact:c-1",
        section,
        notes: [],
        personaBuilt: true,
        personaId: "role-1",
        prepStarted: true,
        interviewerSection: null,
        sessionStatus: "IN_PROGRESS",
        jobsActive: false,
      }),
    );
    for (const host of [sheet, harper]) {
      const button = refreshButton(host);
      expect(button.textContent).toBe("Refresh likely questions");
      expect(button.className).toContain("bg-primary");
      const form = button.closest("form");
      expect(form?.className).toContain("print:hidden");
      const row = form?.parentElement;
      const printButton = [...(row?.querySelectorAll("button") ?? [])].find(
        (node) => node.textContent === "Print this section",
      );
      expect(printButton).toBeTruthy();
      expect(printButton?.className).toContain("print:hidden");
      expect(row?.textContent?.indexOf("Print this section")).toBeLessThan(
        row?.textContent?.indexOf("Refresh likely questions") ?? -1,
      );
    }
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(page).toContain("RefreshLikelyQuestionsButton");
    expect(page).toContain("headerAside");
    expect(page).not.toContain("enqueueApplicationJob");
    expect(page).not.toContain("runPaidStructuredCall");
    expect(enqueue).not.toHaveBeenCalled();
    expect(runPaid).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("clicking it with unchanged inputs shows the exact message and enqueues nothing", async () => {
    rebuild.mockResolvedValue(true);
    const host = mount(
      createElement(RefreshLikelyQuestionsButton, {
        campaignId: "camp",
        sectionKey: "contact:c-1",
      }),
    );
    const form = host.querySelector("form");
    await act(async () => {
      form?.requestSubmit();
    });
    expect(host.textContent).toContain("No Changes To Likely Questions");
    expect(enqueue).not.toHaveBeenCalled();
    expect(runPaid).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("clicking it with changed inputs enqueues only that person's section job", async () => {
    rebuild.mockResolvedValue(false);
    const host = mount(
      createElement(RefreshLikelyQuestionsButton, {
        campaignId: "camp",
        sectionKey: "contact:c-1",
      }),
    );
    const form = host.querySelector("form");
    await act(async () => {
      form?.requestSubmit();
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({
      type: "APPLICATION_SUMMARY",
      targetId: "contact:c-1",
      campaignId: "camp",
    });
    expect(runPaid).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
