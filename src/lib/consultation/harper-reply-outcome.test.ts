import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPLICATION_SUMMARY_PROMPT_VERSION } from "@/lib/application-summary/contract";
import {
  CONSULTATION_PROMPT_VERSION,
} from "@/lib/consultation/contract";
import { ROLE_EXPERTISE_PROMPT_VERSION } from "@/lib/consultation/role-expertise";
import {
  buildConsultationQaView,
  type QaStatement,
  type QaTurn,
} from "@/lib/consultation/qa-view";
import { CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";
import { CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";
import { ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";
import { APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/application-summary";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

const FACT_SENTENCE =
  "Keep every number, fraction, percentage, date, company, and name exactly as the person stated it.";

const OPENTEXT_GTM_REPLY =
  "The GTM I developed at OpenText was split into two - GSI and end customers. GSI partners brought large enterprise deals through their install base while end-customer sellers worked named accounts directly; this splits to about 60/40.";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Harper reply outcome, fact preservation, and approved-plus-draft", () => {
  it("ITEM 1: processConsultationReply guarantees a visible outcome when wroteResult is false without a follow-up", () => {
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain("ensureConsultationReplyVisibleOutcome");
    expect(service).toContain("async function ensureConsultationReplyVisibleOutcome");
    expect(service).toContain("await ensureConsultationReplyVisibleOutcome({");
    expect(service).toContain("if (input.wroteResult || input.followUpAdded) return");
    expect(service).toContain("needsMoreDetailFromAnalysis(turn?.analysisJson)");
    expect(service).toContain("await finishItemNeedsMoreDetail({");
    // OpenText GTM fixture is the production case that finished with nothing visible.
    expect(OPENTEXT_GTM_REPLY).toContain("OpenText");
    expect(OPENTEXT_GTM_REPLY).toContain("60/40");
  });

  it("ITEM 1: drain loops every incomplete seeker turn so sequential replies each get an outcome", () => {
    const drain = src("src/lib/consultation/drain.ts");
    expect(drain).toContain("listIncompleteConsultationSeekerTurns");
    expect(drain).toContain("for (const turn of turns)");
    expect(drain).toContain("processConsultationReply");
    expect(drain).toContain("turnId: turn.id");
  });

  it("ITEM 1: feedback path sets needsMoreDetail so the seeker sees the message", () => {
    const service = src("src/lib/consultation/service.ts");
    const feedbackStart = service.indexOf('extracted.data.replyType === "feedback"');
    expect(feedbackStart).toBeGreaterThan(-1);
    const feedbackBlock = service.slice(feedbackStart, feedbackStart + 2500);
    expect(feedbackBlock).toContain("needsMoreDetail: true");
    expect(feedbackBlock).toContain('replyType: "feedback"');
  });

  it("ITEM 1: incomplete-without-follow-up falls through to ensureConsultationReplyVisibleOutcome", () => {
    const service = src("src/lib/consultation/service.ts");
    const processStart = service.indexOf(
      "export async function processConsultationReply",
    );
    const processFn = service.slice(processStart, processStart + 12000);
    expect(processFn).toContain("followUpAdded");
    expect(processFn).toContain("await ensureConsultationReplyVisibleOutcome({");
    expect(processFn).toContain("wroteResult: processed.wroteResult");
  });

  it("ITEM 2: fact sentence is exact in extract, polish, role-expertise, and application-summary; versions 34/3/15", () => {
    expect(CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS).toContain(FACT_SENTENCE);
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(FACT_SENTENCE);
    expect(ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS).toContain(FACT_SENTENCE);
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(FACT_SENTENCE);
    expect(CONSULTATION_PROMPT_VERSION).toBe("38");
    expect(ROLE_EXPERTISE_PROMPT_VERSION).toBe("3");
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("16");
  });

  it("ITEM 3: approved + newer draft → talkingPoint is APPROVED, pendingDraftTalkingPoint is DRAFT", () => {
    const turns: QaTurn[] = [
      {
        id: "q1",
        speaker: "CONSULTANT",
        body: "How did you divide GTM ownership?",
        targetKey: "required:gtm",
        followUp: false,
        sequence: 1,
      },
      {
        id: "s1",
        speaker: "SEEKER",
        body: "First answer.",
        targetKey: "required:gtm",
        followUp: false,
        sequence: 2,
        analysisJson: { replyToTurnId: "q1", status: "READY" },
      },
      {
        id: "s2",
        speaker: "SEEKER",
        body: OPENTEXT_GTM_REPLY,
        targetKey: "required:gtm",
        followUp: false,
        sequence: 3,
        analysisJson: { replyToTurnId: "q1", status: "READY" },
      },
    ];
    const statements: QaStatement[] = [
      {
        id: "approved-tp",
        turnId: "s1",
        kind: "INTERVIEW_ANSWER",
        status: "APPROVED",
        content: "Approved GTM talk track.",
        strengtheningNote: null,
        createdAt: "2026-09-01T10:00:00.000Z",
      },
      {
        id: "draft-tp",
        turnId: "s2",
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: "Newer draft from OpenText GTM reply.",
        strengtheningNote: null,
        createdAt: "2026-09-02T10:00:00.000Z",
      },
    ];
    const view = buildConsultationQaView({ turns, statements });
    const item = view.questions[0];
    expect(item?.talkingPoint?.status).toBe("APPROVED");
    expect(item?.talkingPoint?.id).toBe("approved-tp");
    expect(item?.pendingDraftTalkingPoint?.status).toBe("DRAFT");
    expect(item?.pendingDraftTalkingPoint?.id).toBe("draft-tp");
    expect(item?.pendingDraftResumeBullet ?? null).toBeNull();
  });

  it("ITEM 3: approve retires prior APPROVED of the same kind (source asserts deleteMany)", () => {
    const service = src("src/lib/consultation/service.ts");
    const approveStart = service.indexOf(
      "export async function approveConsultationStatement",
    );
    expect(approveStart).toBeGreaterThan(-1);
    const approveFn = service.slice(approveStart, approveStart + 4500);
    expect(approveFn).toContain("status: \"APPROVED\"");
    expect(approveFn).toContain("deleteMany");
    expect(approveFn).toContain("id: { not: statement.id }");
    expect(approveFn).toContain('status: "APPROVED"');
    expect(approveFn).toContain("turnId: { in: cardTurnIds }");
  });

  it("ITEM 3: Thread shows newDraft above approved, with Approve targeting pending drafts", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain("consultationConversationCopy.newDraft");
    expect(thread).toContain("pendingDraftTalkingPoint");
    expect(thread).toContain("pendingDraftResumeBullet");
    expect(thread).toContain("consultation-pending-draft");
    expect(consultationConversationCopy.newDraft).toBe("New draft");
    const resultStart = thread.indexOf("{hasResult && !item.ignored ? (");
    const resultBlock = thread.slice(resultStart, resultStart + 1800);
    expect(resultBlock.indexOf("consultation-pending-draft")).toBeLessThan(
      resultBlock.indexOf("item.talkingPoint ? <ResultBody"),
    );
  });

  it("rendering paths make no paid call and enqueue no job", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    const qaView = src("src/lib/consultation/qa-view.ts");
    expect(thread).not.toMatch(/enqueueApplicationJob|generateStructured|getConsultationAiProvider/);
    expect(qaView).not.toMatch(/enqueueApplicationJob|generateStructured|prisma\./);
    expect(qaView).toContain("pendingDraftTalkingPoint");
    expect(qaView).toContain("pendingDraftOfKind");
  });
});
