// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as applicationJobs from "@/lib/application-jobs/service";
import * as paidGate from "@/lib/ai/paid-call-gate";
import { CheatSheetPrintBanner } from "@/components/CheatSheetCollapsible";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import { CheatSheetQuestionCards } from "@/components/CheatSheetQuestionCards";
import { ConsultationThread } from "@/components/ConsultationThread";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { HarperPersonInlineProfile } from "@/components/HarperPersonView";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  cheatSheetPersonSectionGenerateRecoverSchema,
  cheatSheetPersonSectionGenerateSchema,
  cheatSheetPersonSectionSchema,
  type CheatSheetPersonSection,
} from "@/lib/application-summary/contract";
import {
  personLikelyQuestionCountDecision,
  resolvePersonLikelyQuestions,
  type SuppliedGeneralQuestion,
} from "@/lib/application-summary/likely-questions";
import { cheatSheetPersonSectionInputHash } from "@/lib/application-summary/people";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";
import { consultationReplyTargetKey, type ConsultationQaItem, type QaStatement } from "@/lib/consultation/qa-view";
import { APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import {
  ENTERPRISE_SALES_DIRECTOR_POSTING,
  NURSE_MANAGER_POSTING,
} from "@/lib/job-requirement/fixtures";

const generateStructured = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationReplyAiConfigured: () => true,
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

import { generateCheatSheetPersonSectionGuidance } from "@/lib/application-summary/ai";

const enqueueSpy = vi.spyOn(applicationJobs, "enqueueApplicationJob");
const paidSpy = vi.spyOn(paidGate, "runPaidStructuredCall");

const QUESTION = "Tell me about your background and why you are interested in this role.";
const APPROVED = "I led the national sales motion and grew the book.";
const NEW_QUESTION = "Tell me how you coach a sales manager through a missed quarter.";
const GENERAL_NOTE =
  "These are Harper's top picks. They represent the types of questions this interviewer may ask. Make sure you study General Study Questions.";
const LIKELY_INSTRUCTION =
  "You are given Harper's General questions for this application. Choose the 4 to 12 questions this interviewer is most likely to ask, most likely first, based on who they are: their title and function, and their relationship to the job being interviewed for, inferred from their title and the job's title (for example the hiring manager or a more senior leader, a peer, someone this role would lead, a cross-functional partner, or a recruiter). A recruiter or talent-acquisition interviewer covers the standard screen (why this company, why you are leaving or looking, motivation, compensation expectations, timing, and logistics) along with high-level qualifying questions about the job's core requirements, such as scope, team size, and approach. Use one of Harper's General questions (by id) only when this interviewer would genuinely ask it; otherwise write the question from this interviewer's perspective. Do not include questions outside their area.";

function statement(
  partial: Partial<QaStatement> & Pick<QaStatement, "id" | "kind" | "status" | "content">,
): QaStatement {
  return { turnId: "q-1", strengtheningNote: null, ...partial };
}

function qaItem(partial: Partial<ConsultationQaItem> & Pick<ConsultationQaItem, "questionTurnId" | "question">): ConsultationQaItem {
  return {
    targetKey: partial.targetKey ?? `target:${partial.questionTurnId}`,
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    pendingDraftTalkingPoint: null,
    pendingDraftResumeBullet: null,
    interviewTypeTag: "focused_competency",
    ignored: false,
    needsMoreDetail: false,
    ...partial,
  };
}

function approvedQuestion(): ConsultationQaItem {
  const talkingPoint = statement({
    id: "st-approved",
    kind: "INTERVIEW_ANSWER",
    status: "APPROVED",
    content: APPROVED,
  });
  return qaItem({
    questionTurnId: "q-screen",
    targetKey: "why-this-company",
    question: QUESTION,
    talkingPoint,
    statements: [talkingPoint],
    followUp: { turnId: "fu-1", text: "What metric did you move?" },
    seekerAnswers: [{ id: "reply-1", body: "Raw note that stays off the print copy." }],
    resumeBullet: statement({
      id: "st-resume",
      kind: "RESUME_BULLET",
      status: "APPROVED",
      content: "Grew the national book.",
    }),
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

function screenText(host: ParentNode): string {
  const clone = (host as HTMLElement).cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[hidden], .consultation-question-print, .cheat-sheet-print-banner").forEach((node) => {
    node.remove();
  });
  return clone.textContent ?? "";
}

function printText(host: ParentNode): string {
  const clone = (host as HTMLElement).cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".consultation-question-screen").forEach((node) => node.remove());
  clone.querySelectorAll(".consultation-question-print").forEach((node) => {
    node.removeAttribute("hidden");
  });
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function personSection(
  likelyQuestions: CheatSheetPersonSection["likelyQuestions"],
): CheatSheetPersonSection {
  return {
    sectionKey: "contact:c-1",
    roleId: "role-1",
    contactId: "c-1",
    heading: "Alex Rivera",
    sectionKind: "HIRING_MANAGER",
    caresAbout: [{ text: "Quota", seekerConnection: "I have carried one.", supports: [] }],
    positioningStatements: [{ text: "I run the forecast.", supports: [] }],
    keyStatements: [{ text: "I inspect the pipeline.", supports: [] }],
    likelyQuestions,
    questionsToAsk: [{ text: "What does success look like?", followUps: [], supports: [] }],
    bestMaterial: [],
    storyIds: [],
  };
}

function shellFields() {
  return {
    sectionKey: "contact:c-1",
    roleId: "role-1",
    contactId: "c-1",
    heading: "Alex Rivera",
    sectionKind: "HIRING_MANAGER" as const,
    caresAbout: [{ text: "Quota", seekerConnection: "I have carried one.", supports: [] }],
    positioningStatements: [{ text: "I run the forecast.", supports: [] }],
    keyStatements: [{ text: "I inspect the pipeline.", supports: [] }],
    questionsToAsk: [{ text: "What does success look like?", followUps: [], supports: [] }],
  };
}

function modelQuestion(prompt: string, generalQuestionId: string | null) {
  return {
    prompt,
    interviewTypeTag: "focused_competency" as const,
    sampleAnswer: null as string | null,
    harperQuestion: generalQuestionId ? null : "Which quarter was that?",
    answerFramework: null,
    challenge: null,
    situation: null,
    task: null,
    action: null,
    result: null,
    generalQuestionId,
    supports: [] as Array<{ sourceId: string; quote: string }>,
  };
}

const supplied: SuppliedGeneralQuestion[] = [
  {
    id: "turn-general",
    text: QUESTION,
    interviewTypeTag: "screening",
    targetKey: "why-this-company",
  },
  {
    id: "turn-walk",
    text: "Walk me through your career for the last ten years.",
    interviewTypeTag: "chronological_walk_through",
    targetKey: "chronology",
  },
];

describe("likely questions from Harper's General questions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    enqueueSpy.mockClear();
    paidSpy.mockClear();
    generateStructured.mockReset();
  });

  it("hides the print-only block on screen and shows only the clean question and approved answer in print", () => {
    const item = approvedQuestion();
    const harper = mount(
      createElement(ConsultationThread, {
        campaignId: "camp",
        canEdit: true,
        sessionStatus: "IN_PROGRESS",
        jobsActive: false,
        turns: [],
        statements: [],
        interviewerSections: [{ contactId: "c-1", heading: "Alex Rivera", questions: [item] }],
      }),
    );
    const person = mount(
      createElement(HarperPersonInlineProfile, {
        campaignId: "camp",
        canEdit: true,
        contactId: "c-1",
        heading: "Alex Rivera",
        sectionKey: "contact:c-1",
        section: null,
        notes: [],
        personaBuilt: true,
        personaId: "persona-1",
        prepStarted: true,
        interviewerSection: { contactId: "c-1", heading: "Alex Rivera", questions: [item] },
        sessionStatus: "IN_PROGRESS",
        jobsActive: false,
      }),
    );
    const general = mount(
      createElement("div", { className: "application-summary" },
        createElement(CheatSheetPrintBanner),
        createElement(CheatSheetQuestionCards, {
          campaignId: "camp",
          canEdit: true,
          questions: [item],
        }),
      ),
    );
    const section = mount(
      createElement("div", { className: "application-summary" },
        createElement(CheatSheetPrintBanner),
        createElement(CheatSheetPersonBody, {
          campaignId: "camp",
          canEdit: true,
          sectionKey: "contact:c-1",
          section: personSection([
            {
              id: "contact:c-1:likely:1",
              prompt: QUESTION,
              sampleAnswer: APPROVED,
              harperQuestion: null,
              supports: [],
            },
          ]),
          notes: [],
          personaBuilt: true,
          personaId: "role-1",
          generalQuestions: [item],
        }),
      ),
    );

    for (const host of [harper, person, general, section]) {
      const printNodes = host.querySelectorAll(".consultation-question-print");
      expect(printNodes.length).toBeGreaterThan(0);
      for (const node of printNodes) {
        expect((node as HTMLElement).hidden).toBe(true);
      }
      const visible = screenText(host);
      expect(count(visible, QUESTION)).toBe(1);
      expect(visible).not.toContain("consultation-print-question");
    }

    const printed = printText(general);
    expect(printed.startsWith("Approved answers only.")).toBe(true);
    expect(count(printed, QUESTION)).toBe(1);
    expect(printed).toContain(APPROVED);
    expect(printed.replace("Approved answers only.", "")).not.toContain("Approved");
    expect(printed).not.toContain("Interview answer");
    expect(printed).not.toContain("What metric did you move?");
    expect(printed).not.toContain("Raw note that stays off the print copy.");
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("passes Harper's General questions and the interviewer into the person-section call", async () => {
    generateStructured.mockImplementation(async (request: {
      messages: Array<{ role: string; content: string }>;
      parseOutput: (raw: unknown) => { data: unknown };
    }) => {
      const data = request.parseOutput({
        ...shellFields(),
        likelyQuestions: [1, 2, 3, 4].map((index) =>
          modelQuestion(`Tell me how you handled case ${index}.`, null),
        ),
      }).data;
      return { data };
    });
    const interviewer = {
      hiringTeamRole: "Hiring Manager",
      title: "VP Sales",
      persona: "Owns the number.",
      responsibilities: "Forecast, hiring, and the weekly commit.",
      caresAbout: ["Repeatable execution"],
    };
    const generalQuestions = [
      {
        id: "turn-general",
        text: QUESTION,
        interviewTypeTag: "screening" as const,
        targetKey: "why-this-company",
      },
    ];
    const result = await generateCheatSheetPersonSectionGuidance({
      sources: [{ id: "job:1", text: "Own the number.", category: "JOB" }],
      person: {
        sectionKey: "contact:c-1",
        roleId: "role-1",
        contactId: "c-1",
        heading: "Alex Rivera",
        roleName: "Hiring Manager",
        titles: ["VP Sales"],
        sectionKind: "HIRING_MANAGER",
      },
      careerStage: "late_career",
      generalQuestions,
      interviewer,
    });
    expect(result.ok).toBe(true);
    const messages = generateStructured.mock.calls[0]?.[0].messages as Array<{
      role: string;
      content: string;
    }>;
    const shell = buildApplicationSummaryGuidanceMessages({
      sources: [{ id: "job:1", text: "Own the number.", category: "JOB" }],
      people: [],
      mode: "shell",
    });
    const shellUser = JSON.parse(shell[2]!.content) as Record<string, unknown>;
    expect(shellUser.generalQuestions).toBeUndefined();
    expect(shellUser.interviewer).toBeUndefined();
    const sent = JSON.parse(messages[2]!.content) as {
      generalQuestions: typeof generalQuestions;
      interviewer: typeof interviewer;
      people: unknown[];
    };
    expect(sent.generalQuestions).toEqual(generalQuestions);
    expect(sent.interviewer).toEqual(interviewer);
    expect(sent.people).toHaveLength(1);
    expect(JSON.parse(messages[1]!.content).careerStage).toBe("late_career");
    expect(messages[0]!.content).toContain(LIKELY_INSTRUCTION);
    expect(messages[0]!.content).toContain("Prompt version: 18");
  });

  it("accepts 4 to 12 likely questions, rejects fewer or more, and drops an unknown reference", () => {
    const four = [1, 2, 3, 4].map((index) => modelQuestion(`Question ${index}`, index === 1 ? "turn-general" : null));
    expect(
      cheatSheetPersonSectionGenerateSchema.safeParse({ ...shellFields(), likelyQuestions: four }).success,
    ).toBe(true);
    expect(
      cheatSheetPersonSectionGenerateSchema.safeParse({
        ...shellFields(),
        likelyQuestions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((index) =>
          modelQuestion(`Question ${index}`, null),
        ),
      }).success,
    ).toBe(true);
    expect(
      cheatSheetPersonSectionGenerateSchema.safeParse({
        ...shellFields(),
        likelyQuestions: [1, 2, 3].map((index) => modelQuestion(`Question ${index}`, null)),
      }).success,
    ).toBe(false);
    expect(
      cheatSheetPersonSectionGenerateSchema.safeParse({
        ...shellFields(),
        likelyQuestions: Array.from({ length: 13 }, (_, index) =>
          modelQuestion(`Question ${index + 1}`, null),
        ),
      }).success,
    ).toBe(false);
    expect(
      cheatSheetPersonSectionGenerateRecoverSchema.safeParse({
        ...shellFields(),
        likelyQuestions: [modelQuestion("Only one", null)],
      }).success,
    ).toBe(true);

    const stored = cheatSheetPersonSectionSchema.safeParse({
      ...shellFields(),
      likelyQuestions: [
        {
          prompt: "Tell me how you run a weekly forecast?",
          sampleAnswer: "I rebuilt the forecast cadence.",
          harperQuestion: null,
        },
      ],
    });
    expect(stored.success).toBe(true);
    if (stored.success) {
      expect(stored.data.likelyQuestions[0]?.generalQuestionId).toBeUndefined();
    }

    const unknown = resolvePersonLikelyQuestions({
      likelyQuestions: [
        {
          prompt: "Unused",
          generalQuestionId: "not-supplied",
          interviewTypeTag: "focused_competency",
          sampleAnswer: null,
          harperQuestion: null,
          supports: [],
        },
        {
          prompt: NEW_QUESTION,
          generalQuestionId: "also-missing",
          interviewTypeTag: "focused_competency",
          sampleAnswer: null,
          harperQuestion: "Which team was that?",
          answerFramework: null,
          challenge: null,
          situation: null,
          task: null,
          action: null,
          result: null,
          supports: [],
        },
      ],
      harperAskedCareerWalkThrough: false,
      generalQuestions: supplied,
    });
    expect(unknown.unusedReferenceIds).toEqual(["not-supplied", "also-missing"]);
    expect(unknown.items).toHaveLength(1);
    expect(unknown.items[0]?.generalQuestionId).toBeNull();
    expect(unknown.items[0]?.prompt).toBe(NEW_QUESTION);

    expect(personLikelyQuestionCountDecision(3, 0)).toBe("retry");
    expect(personLikelyQuestionCountDecision(3, 1)).toBe("accept-short");
    expect(personLikelyQuestionCountDecision(4, 0)).toBe("save");
    expect(personLikelyQuestionCountDecision(13, 1)).toBe("retry");

    const filtered = resolvePersonLikelyQuestions({
      likelyQuestions: [
        { ...modelQuestion(QUESTION, "why-this-company"), interviewTypeTag: "screening" },
        modelQuestion(NEW_QUESTION, null),
        modelQuestion("Walk me through your career for the last ten years.", "turn-walk"),
        modelQuestion("Tell me how you hired a sales lead.", null),
      ],
      harperAskedCareerWalkThrough: true,
      generalQuestions: supplied,
    });
    expect(filtered.items.map((item) => item.prompt)).toEqual([
      QUESTION,
      NEW_QUESTION,
      "Tell me how you hired a sales lead.",
    ]);
    expect(filtered.items[0]?.generalQuestionId).toBe("turn-general");
    expect(personLikelyQuestionCountDecision(filtered.items.length, 0)).toBe("retry");
    expect(personLikelyQuestionCountDecision(filtered.items.length, 1)).toBe("accept-short");
  });

  it("renders a referenced General card in writer order, a new question as the person's own item, and an older section without references as before", () => {
    const general = qaItem({
      questionTurnId: "turn-general",
      targetKey: "why-this-company",
      question: QUESTION,
    });
    const otherGeneral = qaItem({
      questionTurnId: "turn-other",
      targetKey: "other",
      question: "Tell me how you built a partner channel from nothing.",
    });
    const host = mount(
      createElement(CheatSheetPersonBody, {
        campaignId: "camp",
        canEdit: true,
        sectionKey: "contact:c-1",
        section: personSection([
          {
            id: "contact:c-1:likely:1",
            prompt: "stored prompt that must not replace the general text",
            generalQuestionId: "turn-general",
            interviewTypeTag: "screening",
            sampleAnswer: null,
            harperQuestion: null,
            supports: [],
          },
          {
            id: "contact:c-1:likely:2",
            prompt: NEW_QUESTION,
            sampleAnswer: "I reset the forecast and coached the manager through the gap.",
            harperQuestion: null,
            supports: [],
          },
          {
            id: "contact:c-1:likely:3",
            prompt: "Tell me how you built a partner channel from nothing.",
            sampleAnswer: null,
            harperQuestion: null,
            supports: [],
          },
        ]),
        notes: [],
        personaBuilt: true,
        personaId: "role-1",
        generalQuestions: [general, otherGeneral],
      }),
    );
    const items = [...host.querySelectorAll("[data-testid='cheat-sheet-coach-items'] > li")];
    expect(items).toHaveLength(3);
    expect(items[0]?.querySelector("[data-testid='cheat-sheet-referenced-general-question']")).toBeTruthy();
    expect(items[0]?.textContent).toContain(QUESTION);
    expect(items[0]?.textContent).not.toContain("stored prompt that must not replace the general text");
    const target = items[0]?.querySelector("input[name='targetKey']") as HTMLInputElement | null;
    expect(target?.value).toBe(consultationReplyTargetKey("turn-general"));
    expect(items[1]?.querySelector("[data-testid='cheat-sheet-referenced-general-question']")).toBeNull();
    expect(items[1]?.querySelector("[data-testid='cheat-sheet-shared-general-question']")).toBeNull();
    expect(items[1]?.textContent).toContain(NEW_QUESTION);
    expect(items[1]?.querySelector("[data-testid='cheat-sheet-sample-draft']")).toBeTruthy();
    expect(items[2]?.querySelector("[data-testid='cheat-sheet-shared-general-question']")).toBeTruthy();
    expect(items[2]?.querySelector("input[name='targetKey']")?.getAttribute("value")).toBe(
      consultationReplyTargetKey("turn-other"),
    );
    expect(screenText(host).match(/Tell me how you built a partner channel from nothing\./g)).toHaveLength(1);
  });

  it("shows the likely-questions note at the end of each person section and prints it as plain text", () => {
    const section = personSection([
      {
        id: "contact:c-1:likely:1",
        prompt: NEW_QUESTION,
        sampleAnswer: "I coached the manager through the gap.",
        harperQuestion: null,
        supports: [],
      },
    ]);
    const props = {
      campaignId: "camp",
      canEdit: true,
      sectionKey: "contact:c-1",
      section,
      notes: [],
      personaBuilt: true,
      personaId: "role-1",
    };
    const sheet = mount(
      createElement("div", { className: "application-summary" },
        createElement(CheatSheetPersonBody, props),
      ),
    );
    const harper = mount(
      createElement(HarperPersonInlineProfile, {
        ...props,
        contactId: "c-1",
        heading: "Alex Rivera",
        prepStarted: true,
        interviewerSection: null,
        sessionStatus: "IN_PROGRESS",
        jobsActive: false,
      }),
    );
    for (const host of [sheet, harper]) {
      const note = host.querySelector("[data-testid='likely-questions-note']");
      const likely = host.querySelector("[id$='-likely-questions']");
      expect(note).toBeTruthy();
      expect(likely?.contains(note!)).toBe(true);
      expect(note?.textContent).toBe(GENERAL_NOTE);
      const link = note?.querySelector("a");
      expect(link?.getAttribute("href")).toBe("/campaigns/camp/summary#general-questions");
      expect(link?.textContent).toBe("General Study Questions");
      expect(likely?.querySelector(".mt-2")?.lastElementChild).toBe(note);
    }
    const css = readFileSync("src/app/globals.css", "utf8");
    const printBlocks = css.split("@media print").slice(1);
    expect(printBlocks.some((block) => block.includes(".likely-questions-note a") && block.includes("text-decoration: none"))).toBe(true);
    expect(css).toMatch(/\.consultation-question-print \{\s*display: none !important;/);
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("keeps the approved instruction text, bumps the prompt version, and does not regenerate on a page view", () => {
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(LIKELY_INSTRUCTION);
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("18");
    const person = {
      sectionKey: "contact:1",
      roleId: "role-1",
      contactId: "1",
      heading: "Alex",
      roleName: "Hiring Manager",
      titles: ["Director"],
      sectionKind: "HIRING_MANAGER",
    };
    const sources = [{ id: "job:title", text: "Engineer" }];
    const withoutGeneral = cheatSheetPersonSectionInputHash({
      person,
      sources,
      careerStage: "mid_career",
    });
    const withGeneral = cheatSheetPersonSectionInputHash({
      person,
      sources,
      careerStage: "mid_career",
      generalQuestions: [
        {
          id: "turn-general",
          text: QUESTION,
          interviewTypeTag: "screening",
          targetKey: "why-this-company",
        },
      ],
      interviewer: {
        hiringTeamRole: "Hiring Manager",
        title: "Director",
        persona: "Owns the number.",
        responsibilities: "Forecast.",
        caresAbout: ["Execution"],
      },
    });
    expect(withGeneral).not.toBe(withoutGeneral);
    const service = readFileSync("src/lib/application-summary/service.ts", "utf8");
    const viewStart = service.indexOf("export async function getApplicationSummaryView");
    const viewEnd = service.indexOf("export async function addCheatSheetInterviewNote");
    const view = service.slice(viewStart, viewEnd);
    expect(view).not.toContain("enqueueApplicationJob");
    expect(view).not.toContain("generateCheatSheetPersonSectionGuidance");
    expect(view).not.toContain("generateStructured");
    expect(service).toContain("personLikelyQuestionCountDecision");
    expect(service).toContain("for (let attempt = 0; attempt < 2; attempt += 1)");
  });

  it("sends the exact person instruction for a recruiter and for sales, nursing, and new-graduate guides", () => {
    const screen =
      "A recruiter or talent-acquisition interviewer covers the standard screen (why this company, why you are leaving or looking, motivation, compensation expectations, timing, and logistics) along with high-level qualifying questions about the job's core requirements, such as scope, team size, and approach.";
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(LIKELY_INSTRUCTION);
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).not.toContain(
      "relevant to their role and responsibilities",
    );
    expect(
      APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS.split(
        "You are given Harper's General questions",
      ),
    ).toHaveLength(2);

    const cases = [
      {
        careerStage: "late_career" as const,
        posting: ENTERPRISE_SALES_DIRECTOR_POSTING,
        roleName: "Recruiter",
        titles: ["Talent Acquisition Partner"],
        sectionKind: "RECRUITER",
        interviewerTitle: "Talent Acquisition Partner",
      },
      {
        careerStage: "mid_career" as const,
        posting: NURSE_MANAGER_POSTING,
        roleName: "Hiring Manager",
        titles: ["Clinical Nurse Manager"],
        sectionKind: "HIRING_MANAGER",
        interviewerTitle: "Clinical Nurse Manager",
      },
      {
        careerStage: "college_graduate" as const,
        posting: ENTERPRISE_SALES_DIRECTOR_POSTING,
        roleName: "Recruiter",
        titles: ["Campus Recruiter"],
        sectionKind: "RECRUITER",
        interviewerTitle: "Campus Recruiter",
      },
      {
        careerStage: "new_to_workforce" as const,
        posting: NURSE_MANAGER_POSTING,
        roleName: "Hiring Manager",
        titles: ["Clinical Nurse Manager"],
        sectionKind: "HIRING_MANAGER",
        interviewerTitle: "Clinical Nurse Manager",
      },
    ];

    for (const item of cases) {
      const messages = buildApplicationSummaryGuidanceMessages({
        sources: [{ id: "job:posting", text: item.posting, category: "JOB" }],
        people: [
          {
            sectionKey: "contact:1",
            roleId: "role-1",
            contactId: "1",
            heading: "Alex",
            roleName: item.roleName,
            titles: item.titles,
            sectionKind: item.sectionKind,
          },
        ],
        mode: "person",
        careerStage: item.careerStage,
        interviewer: {
          hiringTeamRole: item.roleName,
          title: item.interviewerTitle,
          persona: "Runs this conversation.",
          responsibilities: "Decides whether to continue.",
          caresAbout: ["Fit"],
        },
      });
      const system = messages[0]?.content ?? "";
      expect(system).toContain(LIKELY_INSTRUCTION);
      expect(system).toContain(screen);
      expect(system).toContain(
        "Every sampleAnswer is returned as answerFramework plus its parts",
      );
      const sources = JSON.parse(messages[1]?.content ?? "{}") as {
        allowedSources?: Array<{ text?: string }>;
        careerStage?: string;
      };
      const people = JSON.parse(messages[2]?.content ?? "{}") as {
        interviewer?: { title?: string };
      };
      expect(sources.allowedSources?.[0]?.text).toBe(item.posting);
      expect(sources.careerStage).toBe(item.careerStage);
      expect(people.interviewer?.title).toBe(item.interviewerTitle);
    }
  });
});
