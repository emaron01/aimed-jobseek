import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isCompleteAnswerResult,
  isParaphrasedSeekerReply,
  isQuestionMetaCommentary,
  isRawSeekerResult,
  isSeekerAnswerFragment,
} from "@/lib/consultation/results";
import { buildConsultationQaView } from "@/lib/consultation/qa-view";
import {
  CHRONOLOGY_TARGET_KEY,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

/** Reported production reply: complete answer nearly identical to Harper cleanup. */
const REPORTED_COMPLETE_REPLY =
  "Enterprise demand generation works best when Marketing and Sales share a precise view of priority accounts so both teams chase the same opportunities. Across my career, most recently at Login VSI and OpenText, I built cross-functional partnerships with Marketing that aligned ABM lists, SDR coverage, and sales follow-up so pipeline converted faster and forecast risk dropped.";

const META_COMMENTARY =
  "Clarified that a company statement needed to be reframed as an interview question.";

describe("Harper answer refresh (complete reply replaces DRAFT)", () => {
  it("accepts a complete well-formed seeker answer even when cleanup matches the reply", () => {
    const cleanup = REPORTED_COMPLETE_REPLY.replace(/\.$/, "");
    expect(isCompleteAnswerResult(REPORTED_COMPLETE_REPLY)).toBe(true);
    expect(isParaphrasedSeekerReply(cleanup, [REPORTED_COMPLETE_REPLY])).toBe(
      true,
    );
    expect(
      isRawSeekerResult(REPORTED_COMPLETE_REPLY, [REPORTED_COMPLETE_REPLY]),
    ).toBe(false);
    expect(isRawSeekerResult(cleanup, [REPORTED_COMPLETE_REPLY])).toBe(false);
  });

  it("still rejects fragments, meta commentary, and raw notes", () => {
    const fragment =
      "Across my career, most recently at Login VSI and OpenText, I built cross-functional partnerships with Marketing";
    expect(isQuestionMetaCommentary(META_COMMENTARY)).toBe(true);
    expect(isRawSeekerResult(META_COMMENTARY, [REPORTED_COMPLETE_REPLY])).toBe(
      true,
    );
    expect(isSeekerAnswerFragment(fragment, [REPORTED_COMPLETE_REPLY])).toBe(
      true,
    );
    expect(isRawSeekerResult(fragment, [REPORTED_COMPLETE_REPLY])).toBe(true);
    // Short incomplete echo of a reply stays rejected (not a complete answer).
    expect(
      isRawSeekerResult(
        "I coached a manager who was not inspecting deals.",
        [
          "I coached a manager who was not inspecting deals. The manager later became an RVP of North America Channels running a team.",
        ],
      ),
    ).toBe(true);
  });

  it("replaces a prior DRAFT on the question turn with the new cleanup DRAFT for every question kind", () => {
    const kinds = [
      { key: "role-expertise:demand-gen", questionId: "q-role" },
      { key: "required:forecast", questionId: "q-gap" },
      { key: WHY_THIS_COMPANY_TARGET_KEY, questionId: "q-why" },
      { key: CHRONOLOGY_TARGET_KEY, questionId: "q-career" },
    ] as const;

    for (const kind of kinds) {
      const view = buildConsultationQaView({
        turns: [
          {
            id: kind.questionId,
            speaker: "CONSULTANT",
            body: "Tell me about demand generation partnerships.",
            targetKey: kind.key,
            followUp: false,
            sequence: 1,
          },
          {
            id: "s1",
            speaker: "SEEKER",
            body: REPORTED_COMPLETE_REPLY,
            targetKey: kind.key,
            followUp: false,
            sequence: 2,
            analysisJson: { replyToTurnId: kind.questionId },
          },
        ],
        statements: [
          {
            id: "old-draft",
            turnId: kind.questionId,
            kind: "INTERVIEW_ANSWER",
            status: "DRAFT",
            content: "Harper's original suggested draft about demand gen.",
            strengtheningNote: null,
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
          {
            id: "new-draft",
            turnId: "s1",
            kind: "INTERVIEW_ANSWER",
            status: "DRAFT",
            content: REPORTED_COMPLETE_REPLY,
            strengtheningNote: null,
            createdAt: new Date("2026-01-02T00:00:00Z"),
          },
        ],
      });
      const item = view.questions.find(
        (q) => q.questionTurnId === kind.questionId,
      );
      expect(item?.talkingPoint?.id).toBe("new-draft");
      expect(item?.talkingPoint?.status).toBe("DRAFT");
      expect(item?.talkingPoint?.content).toBe(REPORTED_COMPLETE_REPLY);
    }
  });

  it("never replaces an APPROVED answer with a later reply draft", () => {
    const view = buildConsultationQaView({
      turns: [
        {
          id: "q1",
          speaker: "CONSULTANT",
          body: "How do you partner with Marketing?",
          targetKey: "role-expertise:demand-gen",
          followUp: false,
          sequence: 1,
        },
        {
          id: "s-approved",
          speaker: "SEEKER",
          body: "Earlier approved reply.",
          targetKey: "role-expertise:demand-gen",
          followUp: false,
          sequence: 2,
          analysisJson: { replyToTurnId: "q1" },
        },
        {
          id: "s-later",
          speaker: "SEEKER",
          body: REPORTED_COMPLETE_REPLY,
          targetKey: "role-expertise:demand-gen",
          followUp: false,
          sequence: 3,
          analysisJson: { replyToTurnId: "q1" },
        },
      ],
      statements: [
        {
          id: "approved",
          turnId: "s-approved",
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content: "I partnered with Marketing on ABM at Login VSI.",
          strengtheningNote: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "later-draft",
          turnId: "s-later",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: REPORTED_COMPLETE_REPLY,
          strengtheningNote: null,
          createdAt: new Date("2026-01-03T00:00:00Z"),
        },
      ],
    });
    expect(view.questions[0]?.talkingPoint?.id).toBe("approved");
    expect(view.questions[0]?.talkingPoint?.status).toBe("APPROVED");
  });

  it("supersede deletes only DRAFT statements, never APPROVED", () => {
    const service = src("src/lib/consultation/service.ts");
    const supersedeBlocks = [
      ...service.matchAll(
        /turnId:\s*\{\s*in:\s*supersedeTurnIds\s*\}[\s\S]{0,220}?kind:/g,
      ),
    ].map((match) => match[0]);
    expect(supersedeBlocks.length).toBeGreaterThanOrEqual(1);
    for (const block of supersedeBlocks) {
      expect(block).toContain('status: "DRAFT"');
    }
  });
});

describe("Harper follow-up hint and section heading chrome", () => {
  it("shows the exact follow-up hint only under follow-up questions", () => {
    expect(consultationConversationCopy.followUpReplyHint).toBe(
      "To answer Harper's follow-up, open Your reply, add the details she's asking for, and save.",
    );
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain("consultation-follow-up-hint");
    expect(thread).toContain("followUpReplyHint");
    expect(thread).toMatch(
      /item\.followUp && !item\.ignored \? \([\s\S]*consultation-follow-up-hint/,
    );
  });

  it("styles section headings with primary blue and expand/collapse indicators", () => {
    const standing = src("src/components/ConsultationStanding.tsx");
    expect(standing).toContain("text-primary");
    expect(standing).toContain("!bg-primary/10");
    expect(standing).toContain(
      'data-harper-section-indicator={open ? "open" : "collapsed"}',
    );
    expect(standing).toContain('{open ? "▼" : "▶"}');
    expect(standing).toContain("aria-expanded={open}");
    // Distinct from question text (text-ink) on the question card.
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain(
      'className="text-sm font-medium text-ink"',
    );
    expect(standing).toContain(
      "flex items-center gap-2 text-sm font-semibold text-primary",
    );
  });

  it("rendering makes no paid call and enqueues no job", () => {
    const standing = src("src/components/ConsultationStanding.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    for (const source of [standing, thread, src("src/lib/consultation/results.ts")]) {
      expect(source).not.toMatch(
        /enqueueApplicationJob|runPaidCall|generateStructured/,
      );
    }
  });
});
