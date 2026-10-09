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
  cheatSheetPersonSectionGenerateSchema,
  cheatSheetPersonSectionSchema,
  type CheatSheetPersonSection,
} from "@/lib/application-summary/contract";
import { resolvePersonLikelyQuestions } from "@/lib/application-summary/likely-questions";
import { DEFAULT_LIKELY_QUESTIONS_PER_PERSON } from "@/lib/application-summary/likely-question-limit";
import { mergePersonLikelyQuestions } from "@/lib/application-summary/likely-questions";
import { cheatSheetPersonSectionInputHash } from "@/lib/application-summary/people";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";
import { type ConsultationQaItem, type QaStatement } from "@/lib/consultation/qa-view";
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
  "Decide the questions this interviewer is most likely to ask, based on their role, their function, and what they care about. Write each question for this interviewer. Return up to 8, most likely first. Leave out any question outside this interviewer's function. For a recruiter or talent-acquisition interviewer, include the screen questions they would actually ask (why this company, why you are looking, motivation, compensation, timing, logistics, and high-level qualifying questions on the job's core requirements). For each question, if one of the seeker's approved answers fits it, set approvedAnswerId to that answer's id. An answer fits only when its story directly answers the question as written and shows the seeker working with this interviewer's function; a story that mentions their function only in passing does not fit. When a question names several functions, narrow it to this interviewer's function. Use each approved answer at most once, on the question it answers best. Otherwise set approvedAnswerId to null so the seeker can answer it. Never write or rewrite an answer. Do not return a Harper question id, and do not copy a Harper question word for word.";

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

function modelQuestion(prompt: string, approvedAnswerId: string | null) {
  return {
    prompt,
    approvedAnswerId,
    interviewTypeTag: "focused_competency" as const,
  };
}

const supplied = [
  {
    id: "stmt-approved",
    question: QUESTION,
    content: APPROVED,
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
        }),
      ),
    );

    for (const host of [harper, person, general]) {
      const printNodes = host.querySelectorAll(".consultation-question-print");
      expect(printNodes.length).toBeGreaterThan(0);
      for (const node of printNodes) {
        expect((node as HTMLElement).hidden).toBe(true);
      }
      const visible = screenText(host);
      expect(count(visible, QUESTION)).toBe(1);
      expect(visible).not.toContain("consultation-print-question");
    }
    const sectionVisible = screenText(section);
    expect(count(sectionVisible, QUESTION)).toBe(1);
    expect(sectionVisible).toContain(APPROVED);
    expect(section.querySelector("[data-testid='cheat-sheet-referenced-general-question']")).toBeNull();

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
    const approvedAnswers = [
      {
        id: "stmt-approved",
        question: QUESTION,
        content: APPROVED,
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
      approvedAnswers,
      likelyQuestionMax: 8,
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
    expect(shellUser.approvedAnswers).toBeUndefined();
    expect(shellUser.interviewer).toBeUndefined();
    const sent = JSON.parse(messages[2]!.content) as {
      approvedAnswers: typeof approvedAnswers;
      interviewer: typeof interviewer;
      people: unknown[];
    };
    expect(sent.approvedAnswers).toEqual(approvedAnswers);
    expect(sent.interviewer).toEqual(interviewer);
    expect(sent.people).toHaveLength(1);
    expect(JSON.parse(messages[1]!.content).careerStage).toBe("late_career");
    expect(messages[0]!.content).toContain(LIKELY_INSTRUCTION);
    expect(messages[0]!.content).toContain("Prompt version: 19");
  });

  it("accepts any count, copies an approved answer by id, and blanks an unknown id", () => {
    const four = [1, 2, 3, 4].map((index) => modelQuestion(`Question ${index}`, index === 1 ? "stmt-approved" : null));
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
    ).toBe(true);
    expect(
      cheatSheetPersonSectionGenerateSchema.safeParse({
        ...shellFields(),
        likelyQuestions: Array.from({ length: 13 }, (_, index) =>
          modelQuestion(`Question ${index + 1}`, null),
        ),
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

    const copied = resolvePersonLikelyQuestions({
      likelyQuestions: [
        modelQuestion("How did marketing and you work the launch?", "stmt-approved"),
        modelQuestion(NEW_QUESTION, "missing-id"),
        modelQuestion("What timing works for a start date?", null),
      ],
      harperAskedCareerWalkThrough: false,
      approvedAnswers: supplied,
    });
    expect(copied[0]?.prompt).toBe("How did marketing and you work the launch?");
    expect(copied[0]?.sampleAnswer).toBe(APPROVED);
    expect(copied[1]?.sampleAnswer).toBeNull();
    expect(copied[2]?.sampleAnswer).toBeNull();

    const overMax = [
      "Why are you leaving your current company?",
      "What compensation range are you targeting?",
      "When could you start?",
      "How large a team have you led?",
      "Which markets have you launched in?",
      "How do you measure a campaign?",
      "Who did you partner with in product marketing?",
      "What would you ask our customers first?",
      "How do you handle a missed launch date?",
      "What budget have you owned?",
    ].map((prompt) => modelQuestion(prompt, null));
    const trimmed = mergePersonLikelyQuestions({
      existing: [],
      incoming: resolvePersonLikelyQuestions({
        likelyQuestions: overMax,
        harperAskedCareerWalkThrough: false,
        approvedAnswers: [],
      }),
      max: DEFAULT_LIKELY_QUESTIONS_PER_PERSON,
    });
    expect(trimmed).toHaveLength(DEFAULT_LIKELY_QUESTIONS_PER_PERSON);
    expect(trimmed[0]?.prompt).toBe(overMax[0]?.prompt);

    const filtered = resolvePersonLikelyQuestions({
      likelyQuestions: [
        { ...modelQuestion(QUESTION, null), interviewTypeTag: "screening" },
        modelQuestion(NEW_QUESTION, null),
        {
          ...modelQuestion("Walk me through your career for the last ten years.", null),
          interviewTypeTag: "chronological_walk_through" as const,
        },
        modelQuestion("Tell me how you hired a sales lead.", null),
      ],
      harperAskedCareerWalkThrough: true,
      approvedAnswers: [],
    });
    expect(filtered.map((item) => item.prompt)).toEqual([
      QUESTION,
      NEW_QUESTION,
      "Tell me how you hired a sales lead.",
    ]);
  });

  it("renders each likely question's own text, a copied answer, and a blank reply", () => {
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
        personQuestions: [],
      }),
    );
    const items = [...host.querySelectorAll("[data-testid='cheat-sheet-coach-items'] > li")];
    expect(items).toHaveLength(3);
    expect(items[0]?.querySelector("[data-testid='cheat-sheet-referenced-general-question']")).toBeNull();
    expect(items[0]?.querySelector("[data-testid='cheat-sheet-shared-general-question']")).toBeNull();
    expect(items[0]?.textContent).toContain("stored prompt that must not replace the general text");
    expect(items[0]?.textContent).not.toContain(QUESTION);
    expect(items[0]?.querySelector("[data-testid='cheat-sheet-coach-reply-contact:c-1:likely:1']")).toBeTruthy();
    expect(items[1]?.textContent).toContain(NEW_QUESTION);
    expect(items[1]?.querySelector("[data-testid='cheat-sheet-sample-draft']")).toBeTruthy();
    expect(items[2]?.querySelector("[data-testid='cheat-sheet-shared-general-question']")).toBeNull();
    expect(items[2]?.textContent).toContain("Tell me how you built a partner channel from nothing.");
    expect(items[2]?.querySelector("[data-testid='cheat-sheet-coach-reply-contact:c-1:likely:3']")).toBeTruthy();
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
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("20");
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
      approvedAnswers: [
        {
          id: "stmt-approved",
          question: QUESTION,
          content: APPROVED,
        },
      ],
      likelyQuestionMax: 8,
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
    const personBlock = service.slice(
      service.indexOf("approvedAnswers: guideInputs.approvedAnswers"),
      service.indexOf("const shellSources = sourcesForShell"),
    );
    expect(personBlock).not.toContain("personLikelyQuestionCountDecision");
    expect(personBlock).not.toContain("for (let attempt = 0; attempt < 2; attempt += 1)");
  });

  it("sends the exact person instruction for a recruiter and for sales, nursing, and new-graduate guides", () => {
    const screen =
      "For a recruiter or talent-acquisition interviewer, include the screen questions they would actually ask (why this company, why you are looking, motivation, compensation, timing, logistics, and high-level qualifying questions on the job's core requirements).";
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(LIKELY_INSTRUCTION);
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).not.toContain(
      "Use one of Harper's General questions",
    );

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
      expect(system).not.toContain("answerFramework");
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
