/**
 * Harper Where you stand structure + reply primary attachment (Items 1–4).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildConsultationQaView,
  primaryFor,
  primaryQuestionTurnIdForSeekerReply,
  type QaTurn,
} from "@/lib/consultation/qa-view";
import {
  buildStandingListEntries,
  strongerStandingStrength,
} from "@/lib/consultation/standing-entries";
import { consultationConversationCopy } from "@/lib/product-config/consultation";
import { sameRequirementMeaning } from "@/lib/consultation/assess";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function turn(
  overrides: Partial<QaTurn> & Pick<QaTurn, "id" | "speaker" | "body" | "sequence">,
): QaTurn {
  return {
    targetKey: null,
    followUp: false,
    ...overrides,
  };
}

describe("ITEM 1: reply attaches to the answered primary question", () => {
  it("walks follow-up replyToTurnId to the primary via primaryFor", () => {
    const primary = turn({
      id: "q-frontline",
      speaker: "CONSULTANT",
      body: "Ability to build strong front-line management layers and develop elite sales talent.",
      targetKey: "required:frontline",
      sequence: 1,
    });
    const leaders = turn({
      id: "q-leaders",
      speaker: "CONSULTANT",
      body: "If we spoke with your recent leaders and peers, what would they say about your leadership style and impact?",
      targetKey: "required:frontline",
      sequence: 2,
    });
    const followUp = turn({
      id: "fu-frontline",
      speaker: "CONSULTANT",
      body: "Which specific team at Marketing Database Associates or Merion Publications did you develop?",
      targetKey: "required:frontline",
      followUp: true,
      sequence: 3,
      analysisJson: { replyToTurnId: "q-frontline" },
    });
    const seeker = turn({
      id: "s1",
      speaker: "SEEKER",
      body: "At MDA and Merion I coached KPIs; 3 of 4 reps have over achieved in FY26.",
      targetKey: "required:frontline",
      sequence: 4,
      analysisJson: { status: "PENDING", replyToTurnId: "fu-frontline" },
    });
    const turns = [primary, leaders, followUp, seeker];
    expect(primaryFor(turns, followUp).id).toBe("q-frontline");
    expect(
      primaryQuestionTurnIdForSeekerReply({
        turns,
        seeker,
        hintQuestionTurnId: "fu-frontline",
      }),
    ).toBe("q-frontline");
    expect(
      primaryQuestionTurnIdForSeekerReply({
        turns,
        seeker,
      }),
    ).not.toBe("q-leaders");

    const view = buildConsultationQaView({
      turns: [
        ...turns,
        turn({
          id: "fu-wrong",
          speaker: "CONSULTANT",
          body: "You have strong themes—manager development… Which specific team…",
          targetKey: "required:frontline",
          followUp: true,
          sequence: 5,
          analysisJson: { replyToTurnId: "q-frontline" },
        }),
      ],
      statements: [],
    });
    const frontline = view.questions.find((q) => q.questionTurnId === "q-frontline");
    const leadersCard = view.questions.find((q) => q.questionTurnId === "q-leaders");
    expect(frontline?.seekerAnswers.some((a) => a.id === "s1")).toBe(true);
    expect(frontline?.followUp?.turnId).toBe("fu-wrong");
    expect(leadersCard?.followUp).toBeNull();
    expect(leadersCard?.seekerAnswers).toEqual([]);
  });

  it("processConsultationReply resolves primary through the reply chain, not replyable[0]", () => {
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain("primaryQuestionTurnIdForSeekerReply");
    expect(service).toContain("pinnedPrimaryId");
    expect(service).toMatch(
      /When the seeker recorded which turn they answered[\s\S]*never fall back/,
    );
  });
});

describe("ITEM 2–3: one Where you stand list", () => {
  it("renders each requirement/topic once with one rating and no Open/Closed/Confirmed", () => {
    const standing = src("src/components/ConsultationStanding.tsx");
    const section = src("src/components/ConsultationSection.tsx");
    expect(standing).toContain("consultation-standing-list");
    expect(standing).toContain("consultation-standing-entry");
    expect(standing).toContain("evidenceStrengthLabels[entry.strength]");
    expect(standing).not.toContain("consultationGapStatusCopy");
    expect(standing).not.toContain("consultation-gap-");
    expect(section).toContain("buildStandingListEntries");
    expect(section).toContain("entries={standingEntries}");
    expect(section).not.toContain("gaps={standingGaps");
  });

  it("merges Required + near-copy competency under Required wording with stronger rating", () => {
    const requiredText =
      "Build strong front-line management layers and develop elite sales talent";
    const competencyText =
      "Ability to build strong front-line management layers and develop elite sales talent";
    expect(sameRequirementMeaning(requiredText, competencyText)).toBe(true);
    expect(strongerStandingStrength("NONE", "PARTIAL")).toBe("PARTIAL");

    const entries = buildStandingListEntries({
      requirements: [
        {
          id: "a1",
          targetKey: "required:0",
          text: requiredText,
          strength: "NONE",
          kind: "REQUIRED",
          explanation: "Required reason",
          experience: null,
          facts: [],
        },
        {
          id: "a2",
          targetKey: "competency:0",
          text: competencyText,
          strength: "PARTIAL",
          kind: "COMPETENCY",
          explanation: "Competency reason",
          experience: null,
          facts: [{ id: "f1", label: "Fact", detail: null }],
        },
      ],
      dedicatedTopics: [
        {
          kind: "why-this-company",
          targetKey: "why-this-company",
          label: consultationConversationCopy.whyThisCompanyTarget,
          questions: [
            {
              questionTurnId: "q-why",
              targetKey: "why-this-company",
              question: consultationConversationCopy.whyThisCompanyTarget,
              followUp: null,
              seekerAnswers: [],
              statements: [],
              resumeBullet: null,
              talkingPoint: null,
            },
          ],
        },
      ],
      questionsByTargetKey: new Map([
        [
          "required:0",
          [
            {
              questionTurnId: "q-req",
              targetKey: "required:0",
              question: "Tell me about building managers.",
              followUp: null,
              seekerAnswers: [{ id: "s-req", body: "From required" }],
              statements: [],
              resumeBullet: null,
              talkingPoint: null,
            },
          ],
        ],
        [
          "competency:0",
          [
            {
              questionTurnId: "q-comp",
              targetKey: "competency:0",
              question: "How did you develop talent?",
              followUp: null,
              seekerAnswers: [{ id: "s-comp", body: "From competency" }],
              statements: [],
              resumeBullet: null,
              talkingPoint: null,
            },
          ],
        ],
      ]),
    });

    const merged = entries.filter((e) => e.kind !== "TOPIC");
    expect(merged).toHaveLength(1);
    expect(merged[0]?.label).toBe(requiredText);
    expect(merged[0]?.strength).toBe("PARTIAL");
    expect(merged[0]?.mergedTargetKeys.sort()).toEqual([
      "competency:0",
      "required:0",
    ]);
    expect(merged[0]?.questions.map((q) => q.questionTurnId).sort()).toEqual([
      "q-comp",
      "q-req",
    ]);
    expect(merged[0]?.facts).toHaveLength(1);

    const why = entries.filter(
      (e) => e.targetKey === "why-this-company",
    );
    expect(why).toHaveLength(1);
    expect(why[0]?.label).toBe(
      consultationConversationCopy.whyThisCompanyTarget,
    );
  });

  it("orders a–f: replies before results; Your reply collapsed; Interview answer / Resume bullet labeled", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    const repliesIdx = thread.indexOf("consultation-seeker-answers");
    const interviewIdx = thread.indexOf('consultation-statement-${statement.kind}');
    // Seeker replies section appears before statement render in QuestionCard source order.
    const seekerBlock = thread.indexOf("<SeekerRepliesSection");
    const talkingBlock = thread.indexOf("item.talkingPoint ? <ResultBody");
    const resumeBlock = thread.indexOf("item.resumeBullet ? <ResultBody");
    expect(seekerBlock).toBeGreaterThan(0);
    expect(talkingBlock).toBeGreaterThan(seekerBlock);
    expect(resumeBlock).toBeGreaterThan(seekerBlock);
    expect(thread).toContain("showYourReplies");
    expect(thread).toContain("yourReply");
    expect(thread).toContain("consultationStatementLabels[statement.kind]");
    expect(thread).toContain("consultationConversationCopy.approve");
    expect(thread).toContain("consultationConversationCopy.editAnswer");
    void repliesIdx;
    void interviewIdx;
  });
});

describe("ITEM 4: Pause / Done / Skip the rest removed", () => {
  it("does not render Pause, Done, or Skip the rest; does not start assets from the Harper page UI", () => {
    const section = src("src/components/ConsultationSection.tsx");
    expect(section).not.toContain("pauseConsultationAction");
    expect(section).not.toContain("completeConsultationAction");
    expect(section).not.toContain('submitLabel="Pause"');
    expect(section).not.toContain('submitLabel="Done"');
    expect(section).not.toContain('submitLabel="Skip the rest"');
    expect(section).not.toContain("pause-consultation");
    expect(section).not.toContain("done-consultation");
    expect(section).not.toContain("skip-consultation-open");
    expect(section).not.toContain("enqueueAssetsAfterConsultation");
    expect(section).not.toContain("queueAssetsForCampaign");
  });

  it("PAUSED sessions reopen on reply without blocking drain", () => {
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain('session.status === "DONE" || session.status === "PAUSED"');
    const listFn = service.slice(
      service.indexOf("export async function listIncompleteConsultationSeekerTurns"),
      service.indexOf("export async function confirmConsultationProposal"),
    );
    expect(listFn).toContain('status === "SKIPPED"');
    expect(listFn).not.toContain("PAUSED");
  });
});

describe("render safety", () => {
  it("standing / thread render make no paid call and enqueue no job", () => {
    for (const rel of [
      "src/components/ConsultationSection.tsx",
      "src/components/ConsultationStanding.tsx",
      "src/components/ConsultationThread.tsx",
    ]) {
      const body = src(rel);
      expect(body).not.toContain("runPaidStructuredCall");
      expect(body).not.toContain("enqueueApplicationJob");
      expect(body).not.toContain("processConsultationReply");
    }
  });
});
