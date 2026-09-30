import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.hoisted(() => vi.fn());
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    isConsultationReplyAiConfigured: isConsultationAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

import {
  CONSULTATION_PROMPT_VERSION,
} from "@/lib/consultation/contract";
import {
  buildConsultationExtractMessages,
  buildConsultationPolishMessages,
} from "@/lib/consultation/prompt";
import {
  seekerRepliesHaveUsableContent,
} from "@/lib/consultation/results";
import {
  buildConsultationQaView,
  consultationQuestionHasVisibleOutcome,
  needsMoreDetailFromAnalysis,
} from "@/lib/consultation/qa-view";
import {
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
  CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content/consultation";
import { consultationConversationCopy } from "@/lib/product-config/consultation";
import { extractWithModel, polishAnswerWithModel } from "@/lib/consultation/ai";
import { polishAnswerWithQuality } from "@/lib/consultation/service";
import { deriveCareerStage } from "@/lib/consultation/career-stage";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const BEST_ANSWER_SENTENCE =
  "Always write the strongest answer the person's replies support, even when details are missing. Never invent facts to fill gaps. When an important detail is missing, also ask one follow-up question that would make the answer stronger.";

const REPLY_1 =
  "The GTM I developed at OpenText was split into two - GSI and end customers. GSI partners brought large enterprise deals through their install base while end-customer sellers worked named accounts directly; this splits to about 60/40.";
const REPLY_2 =
  "The GTM I developed at OpenText was split into two - GSI and end customers. GSI partners brought large enterprise deals through their install base while end-customer sellers worked named accounts directly; this splits to about 70/30. We revenue generated was $6.8MM in FY26 - With over $3.5MM in new enterprise revenue.";
const REPLY_3 = "revenue generated was $6.8MM in FY26";

const META =
  "Clarified that a company statement needed to be reframed as an interview question.";

function parseUserPayloads(messages: Array<{ role: string; content: string }>) {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => {
      try {
        return JSON.parse(message.content) as Record<string, unknown>;
      } catch {
        return {};
      }
    });
}

function seekerPayload(messages: Array<{ role: string; content: string }>) {
  const payloads = parseUserPayloads(messages);
  return payloads.find((payload) => Array.isArray(payload.seekerReplies)) ?? null;
}

describe("Harper reply chain fix", () => {
  beforeEach(() => {
    generateStructured.mockReset();
    isConsultationAiConfigured.mockReturnValue(true);
  });

  it("ITEM 4: extract and polish instructions contain the exact best-answer sentence; version is 35", () => {
    expect(CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS).toContain(BEST_ANSWER_SENTENCE);
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(BEST_ANSWER_SENTENCE);
    expect(CONSULTATION_PROMPT_VERSION).toBe("35");
  });

  it("seekerRepliesHaveUsableContent: empty / meta / non-answer false; real content true", () => {
    expect(seekerRepliesHaveUsableContent([])).toBe(false);
    expect(seekerRepliesHaveUsableContent([""])).toBe(false);
    expect(seekerRepliesHaveUsableContent([META])).toBe(false);
    expect(seekerRepliesHaveUsableContent(["n/a"])).toBe(false);
    expect(seekerRepliesHaveUsableContent(["?"])).toBe(false);
    expect(seekerRepliesHaveUsableContent([REPLY_1])).toBe(true);
    expect(
      seekerRepliesHaveUsableContent([
        "At OpenText I owned enterprise GTM split between GSI and end customers.",
      ]),
    ).toBe(true);
    expect(seekerRepliesHaveUsableContent([META, REPLY_2])).toBe(true);
  });

  it("ITEM 1: three replies send seekerReplies in order to extract and polish with latest-wins", async () => {
    const replies = [REPLY_1, REPLY_2, REPLY_3];
    const answer = replies.join("\n");
    const captured: Array<{ schema: string; seekerReplies: unknown; latest: unknown }> =
      [];

    generateStructured.mockImplementation(async (request: {
      schemaName: string;
      messages: Array<{ role: string; content: string }>;
    }) => {
      const payload = seekerPayload(request.messages);
      captured.push({
        schema: request.schemaName,
        seekerReplies: payload?.seekerReplies,
        latest: payload?.latestReplyTakesPrecedence,
      });
      if (request.schemaName === "consultation_extract") {
        return {
          data: {
            replyType: "answer",
            revisedQuestion: null,
            facts: [
              {
                text: "I split OpenText GTM about 70/30 between GSI and end customers.",
              },
              {
                text: "That approach generated $6.8MM in FY26 with over $3.5MM in new enterprise revenue.",
              },
            ],
            story: {
              situation: "At OpenText I owned North American GTM for GSI and end customers.",
              task: "I needed to divide ownership between winning new enterprise and expanding accounts.",
              action:
                "I split the motion about 70/30 between GSI partners and end-customer sellers.",
              result:
                "We generated $6.8MM in FY26 with over $3.5MM in new enterprise revenue.",
            },
            demonstratedTargets: [],
            missingStarElements: [],
            coaching: null,
            followUpQuestion: null,
            gapDecision: "evidence",
            companyMotivation: null,
          },
        };
      }
      return {
        data: {
          answerFramework: "CAR",
          interviewAnswer: null,
          challenge:
            "At OpenText I needed a clear GTM split between GSI partners and end-customer sellers.",
          situation: null,
          task: null,
          action:
            "I divided ownership about 70/30 so partners covered install-base enterprises while sellers worked named accounts.",
          result:
            "That approach generated $6.8MM in FY26 with over $3.5MM in new enterprise revenue.",
          resumeBullet:
            "Split OpenText GTM ~70/30 GSI vs end customers, generating $6.8MM in FY26 including $3.5MM+ new enterprise revenue.",
          strengtheningNote: null,
        },
      };
    });

    const extractMessages = buildConsultationExtractMessages({
      answer,
      seekerReplies: replies,
      question:
        "In one of your recent North American sales leadership roles, how did you divide ownership between winning new enterprise customers and expanding existing accounts, and what revenue result did that approach produce?",
      target: {
        key: "required:gtm",
        kind: "REQUIRED",
        text: "Enterprise GTM ownership",
      },
      targets: [],
      profileItems: [],
    });
    const extractPayload = seekerPayload(extractMessages);
    expect(extractPayload?.seekerReplies).toEqual(replies);
    expect(extractPayload?.latestReplyTakesPrecedence).toBe(true);

    const polishMessages = buildConsultationPolishMessages({
      answer,
      seekerReplies: replies,
      story: {
        situation: "At OpenText",
        task: "Divide ownership",
        action: "70/30 split",
        result: "$6.8MM in FY26",
      },
      declinedFollowUp: false,
      strengtheningNeeds: [],
      careerStage: deriveCareerStage({ experience: [], education: [] }),
      profileItems: [],
    });
    const polishPayload = seekerPayload(polishMessages);
    expect(polishPayload?.seekerReplies).toEqual(replies);
    expect(polishPayload?.latestReplyTakesPrecedence).toBe(true);

    await extractWithModel({
      answer,
      seekerReplies: replies,
      question: "How did you divide ownership?",
      target: null,
      targets: [],
      profileItems: [],
    });
    await polishAnswerWithModel({
      answer,
      seekerReplies: replies,
      story: {
        situation: "At OpenText",
        task: "Divide ownership",
        action: "70/30 split",
        result: "$6.8MM in FY26",
      },
      declinedFollowUp: false,
      strengtheningNeeds: [],
      careerStage: deriveCareerStage({ experience: [], education: [] }),
      profileItems: [],
    });

    expect(captured.length).toBeGreaterThanOrEqual(2);
    const extractCap = captured.find((row) => row.schema === "consultation_extract");
    const polishCap = captured.find((row) => row.schema === "consultation_polish");
    expect(extractCap?.seekerReplies).toEqual(replies);
    expect(extractCap?.latest).toBe(true);
    expect(polishCap?.seekerReplies).toEqual(replies);
    expect(polishCap?.latest).toBe(true);

    // Reset so polishAnswerWithQuality starts a fresh quality loop.
    generateStructured.mockClear();
    generateStructured.mockImplementation(async (request: {
      schemaName: string;
      messages: Array<{ role: string; content: string }>;
    }) => {
      if (request.schemaName === "consultation_extract") {
        return {
          data: {
            replyType: "answer",
            revisedQuestion: null,
            facts: [],
            story: null,
            demonstratedTargets: [],
            missingStarElements: [],
            coaching: null,
            followUpQuestion: null,
            gapDecision: "evidence",
            companyMotivation: null,
          },
        };
      }
      return {
        data: {
          answerFramework: "CAR",
          interviewAnswer: null,
          challenge:
            "At OpenText I needed a clear GTM split between GSI partners and end-customer sellers.",
          situation: null,
          task: null,
          action:
            "I divided ownership about 70/30 so partners covered install-base enterprises while sellers worked named accounts.",
          result:
            "That approach generated $6.8MM in FY26 with over $3.5MM in new enterprise revenue.",
          resumeBullet:
            "Split OpenText GTM ~70/30 GSI vs end customers, generating $6.8MM in FY26 including $3.5MM+ new enterprise revenue.",
          strengtheningNote: null,
        },
      };
    });

    const polished = await polishAnswerWithQuality({
      answer,
      seekerReplies: replies,
      story: {
        situation: "At OpenText I owned North American GTM.",
        task: "Divide ownership between new and expand.",
        action: "I split about 70/30 between GSI and end customers.",
        result: "Generated $6.8MM in FY26 with over $3.5MM new enterprise.",
      },
      sources: [{ id: "a", text: answer }],
      declinedFollowUp: false,
      strengtheningNeeds: [],
      seekerAnswers: replies,
      profileItems: [],
    });
    expect(polished.ok).toBe(true);
    if (!polished.ok) return;
    expect(polished.data.interviewAnswer).toMatch(/70\/30/);
    expect(polished.data.interviewAnswer).not.toMatch(/60\/40/);
    expect(polished.data.resumeBullet).toBeTruthy();
  });

  it("ITEM 4: usable content missing a detail yields draft + follow-up path, not needs-more-detail", () => {
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain("seekerRepliesHaveUsableContent");
    expect(service).toContain("incomplete && !repliesUsable");
    expect(service).toContain("declinedFollowUp: incomplete");
    expect(service).toContain("polishFollowUp");
    expect(service).toContain("bestEffortNormalizedPolish");
    // Draft + optional follow-up when usable; needs-more-detail only when not usable.
    expect(service).toContain(
      "Boolean(processed.followUpQuestion) && allowFollowUp",
    );
    expect(service).not.toContain(
      "!processed.wroteResult &&\n    Boolean(processed.followUpQuestion)",
    );

    const usableMissingDetail =
      "At OpenText I split GTM between GSI partners and end-customer sellers about 70/30.";
    expect(seekerRepliesHaveUsableContent([usableMissingDetail])).toBe(true);
    expect(seekerRepliesHaveUsableContent([META])).toBe(false);

    const view = buildConsultationQaView({
      turns: [
        {
          id: "q1",
          speaker: "CONSULTANT",
          body: "How did you divide ownership and what revenue resulted?",
          targetKey: "required:gtm",
          followUp: false,
          sequence: 1,
        },
        {
          id: "s1",
          speaker: "SEEKER",
          body: usableMissingDetail,
          targetKey: "required:gtm",
          followUp: false,
          sequence: 2,
          analysisJson: {
            replyToTurnId: "q1",
            status: "READY",
            gapDecision: "incomplete",
            needsMoreDetail: false,
          },
        },
        {
          id: "f1",
          speaker: "CONSULTANT",
          body: "What revenue result did that 70/30 approach produce?",
          targetKey: "required:gtm",
          followUp: true,
          sequence: 3,
          analysisJson: { replyToTurnId: "q1" },
        },
      ],
      statements: [
        {
          id: "draft-tp",
          turnId: "s1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content:
            "At OpenText I split GTM between GSI partners and end-customer sellers about 70/30.",
          strengtheningNote: null,
        },
        {
          id: "draft-rb",
          turnId: "s1",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content:
            "Split OpenText GTM ~70/30 between GSI partners and end-customer sellers.",
          strengtheningNote: null,
        },
      ],
    });
    const item = view.questions[0];
    expect(item?.talkingPoint?.content).toContain("70/30");
    expect(item?.resumeBullet?.content).toContain("70/30");
    expect(item?.needsMoreDetail).toBe(false);
    expect(item?.followUp?.text).toMatch(/revenue/i);
    expect(consultationConversationCopy.needsMoreDetailToShape).toBe(
      "Add a bit more detail so Harper can shape this answer.",
    );
  });

  it("ITEM 4: empty / meta / non-answer → needs-more-detail, no draft", () => {
    expect(seekerRepliesHaveUsableContent([""])).toBe(false);
    expect(seekerRepliesHaveUsableContent([META])).toBe(false);
    expect(seekerRepliesHaveUsableContent(["n/a"])).toBe(false);

    const view = buildConsultationQaView({
      turns: [
        {
          id: "q1",
          speaker: "CONSULTANT",
          body: "How do you forecast?",
          targetKey: "required:forecast",
          followUp: false,
          sequence: 1,
        },
        {
          id: "s1",
          speaker: "SEEKER",
          body: META,
          targetKey: "required:forecast",
          followUp: false,
          sequence: 2,
          analysisJson: {
            replyToTurnId: "q1",
            status: "READY",
            needsMoreDetail: true,
            gapDecision: "incomplete",
          },
        },
      ],
      statements: [],
    });
    const item = view.questions[0];
    expect(item?.needsMoreDetail).toBe(true);
    expect(item?.talkingPoint).toBeNull();
    expect(item?.resumeBullet).toBeNull();
    expect(needsMoreDetailFromAnalysis(item?.seekerAnswers.at(-1)?.analysisJson)).toBe(
      true,
    );
  });

  it("ITEM 2: same-body incomplete reuses one turn; complete with outcome is no-op; complete without outcome reprocesses; edit always processes", () => {
    const service = src("src/lib/consultation/service.ts");
    const actions = src("src/app/actions/consultation.ts");
    const qaView = src("src/lib/consultation/qa-view.ts");
    const config = src("src/lib/product-config/consultation.ts");

    expect(config).toContain('answerUnchanged: "No Changes To Your Answer"');
    expect(consultationConversationCopy.answerUnchanged).toBe(
      "No Changes To Your Answer",
    );

    expect(qaView).toContain("consultationQuestionHasVisibleOutcome");
    expect(qaView).toContain("item.needsMoreDetail === true");
    expect(qaView).toContain("item.followUp != null");

    const recordStart = service.indexOf(
      "export async function recordConsultationReply",
    );
    const recordFn = service.slice(recordStart, recordStart + 6500);
    expect(recordFn).toContain("matchingSeekerTurns");
    expect(recordFn).toContain("turn.body.trim() === answer");
    expect(recordFn).toContain("consultationQuestionHasVisibleOutcome(item)");
    expect(recordFn).toContain("unchanged: true");
    // Incomplete path: reuse without resetting a complete turn.
    expect(recordFn).toContain("!analysisIsComplete(existing.analysisJson)");
    // Legacy complete-without-outcome still resets to PENDING once.
    expect(recordFn).toContain('status: "PENDING"');
    expect(recordFn).toContain("unchanged: false");

    // Actions: unchanged → message, no enqueue; otherwise enqueue.
    for (const name of [
      "export async function answerConsultationAction",
      "export async function replyConsultationAction",
    ]) {
      const start = actions.indexOf(name);
      const fn = actions.slice(start, start + 1800);
      expect(fn).toContain("recorded.unchanged");
      expect(fn).toContain("consultationConversationCopy.answerUnchanged");
      expect(fn).toContain("enqueueApplicationJob");
      const unchangedIdx = fn.indexOf("recorded.unchanged");
      const enqueueIdx = fn.indexOf("enqueueApplicationJob");
      expect(unchangedIdx).toBeGreaterThan(-1);
      expect(enqueueIdx).toBeGreaterThan(unchangedIdx);
    }

    // Sync path also skips process when unchanged.
    const answerQ = service.slice(
      service.indexOf("export async function answerConsultationQuestion"),
      service.indexOf("export async function answerConsultationQuestion") + 900,
    );
    expect(answerQ).toContain("if (recorded.unchanged) return");
    expect(answerQ).toContain("processConsultationReply");

    // Edit path always records PENDING and enqueues (changed body processes).
    const editRecord = service.slice(
      service.indexOf("export async function recordConsultationAnswerEdit"),
      service.indexOf("export async function recordConsultationAnswerEdit") + 2000,
    );
    expect(editRecord).toContain('status: "PENDING"');
    const editAction = actions.slice(
      actions.indexOf("export async function editConsultationAnswerAction"),
      actions.indexOf("export async function editConsultationAnswerAction") + 1600,
    );
    expect(editAction).toContain("recordConsultationAnswerEdit");
    expect(editAction).toContain("enqueueApplicationJob");
    expect(editAction).not.toContain("answerUnchanged");

    // Message renders via ApplicationActionForm status from action result.
    const form = src("src/components/ApplicationActionForm.tsx");
    expect(form).toContain("state.message");
    expect(form).toContain('role="status"');

    // At most one needs-more-detail per question (latest seeker analysis).
    expect(qaView).toContain("item.seekerAnswers.at(-1)?.analysisJson");
    const view = buildConsultationQaView({
      turns: [
        {
          id: "q1",
          speaker: "CONSULTANT",
          body: "How did you divide ownership?",
          targetKey: "required:gtm",
          followUp: false,
          sequence: 1,
        },
        {
          id: "s1",
          speaker: "SEEKER",
          body: REPLY_3,
          targetKey: "required:gtm",
          followUp: false,
          sequence: 2,
          analysisJson: {
            replyToTurnId: "q1",
            status: "READY",
            needsMoreDetail: true,
          },
        },
      ],
      statements: [],
    });
    expect(view.questions[0]?.seekerAnswers).toHaveLength(1);
    expect(view.questions[0]?.needsMoreDetail).toBe(true);
    expect(
      consultationQuestionHasVisibleOutcome(view.questions[0]!),
    ).toBe(true);
  });

  it("ITEM 2 helper: visible outcome detection for draft, follow-up, needs-more-detail", () => {
    const base = {
      questionTurnId: "q1",
      targetKey: "required:gtm",
      question: "How did you divide ownership?",
      followUp: null as { turnId: string; text: string } | null,
      seekerAnswers: [{ id: "s1", body: REPLY_2 }],
      statements: [] as Array<{
        id: string;
        turnId: string;
        kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
        status: string;
        content: string;
        strengtheningNote: string | null;
      }>,
      resumeBullet: null as null,
      talkingPoint: null as null,
      needsMoreDetail: false,
    };
    expect(consultationQuestionHasVisibleOutcome(base)).toBe(false);
    expect(
      consultationQuestionHasVisibleOutcome({
        ...base,
        needsMoreDetail: true,
      }),
    ).toBe(true);
    expect(
      consultationQuestionHasVisibleOutcome({
        ...base,
        followUp: { turnId: "f1", text: "What was the result?" },
      }),
    ).toBe(true);
    expect(
      consultationQuestionHasVisibleOutcome({
        ...base,
        talkingPoint: {
          id: "st1",
          turnId: "s1",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I split GTM 70/30 and generated $6.8MM.",
          strengtheningNote: null,
        },
      }),
    ).toBe(true);
  });

  it("ITEM 3: editing a saved reply records PENDING then enqueues processing to a visible outcome", () => {
    const service = src("src/lib/consultation/service.ts");
    const actions = src("src/app/actions/consultation.ts");

    const editRecordStart = service.indexOf(
      "export async function recordConsultationAnswerEdit",
    );
    const editRecord = service.slice(editRecordStart, editRecordStart + 2000);
    expect(editRecord).toContain('status: "PENDING"');
    expect(editRecord).toContain("generationStatus: \"GENERATING\"");
    expect(editRecord).toContain("replyToTurnId");

    const editDirect = service.slice(
      service.indexOf("export async function editConsultationAnswer"),
      service.indexOf("export async function editConsultationAnswer") + 900,
    );
    expect(editDirect).toContain("recordConsultationAnswerEdit");
    expect(editDirect).toContain("processConsultationReply");

    const actionStart = actions.indexOf(
      "export async function editConsultationAnswerAction",
    );
    const actionFn = actions.slice(actionStart, actionStart + 1600);
    expect(actionFn).toContain("recordConsultationAnswerEdit");
    expect(actionFn).toContain('operation: "process_reply"');
    expect(actionFn).toContain("enqueueApplicationJob");

    expect(service).toContain("ensureConsultationReplyVisibleOutcome");
    expect(service).toContain("await ensureConsultationReplyVisibleOutcome({");
  });

  it("rendering paths make no paid call and enqueue no job", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    const qaView = src("src/lib/consultation/qa-view.ts");
    expect(thread).not.toMatch(
      /enqueueApplicationJob|generateStructured|getConsultationAiProvider/,
    );
    expect(qaView).not.toMatch(
      /enqueueApplicationJob|generateStructured|prisma\./,
    );
  });

  it("wires seekerReplies through extract/polish/processAnswerGeneration", () => {
    const prompt = src("src/lib/consultation/prompt.ts");
    const ai = src("src/lib/consultation/ai.ts");
    const service = src("src/lib/consultation/service.ts");
    expect(prompt).toContain("seekerReplies");
    expect(prompt).toContain("latestReplyTakesPrecedence: true");
    expect(ai).toContain("seekerReplies?: string[]");
    expect(service).toContain("seekerReplies");
    expect(service).toContain("seekerRepliesHaveUsableContent(seekerReplies)");
  });
});
