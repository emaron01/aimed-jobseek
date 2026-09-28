import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHRONOLOGY_TARGET_KEY,
  ROLE_EXPERTISE_TARGET_PREFIX,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import {
  buildHarperQaLayout,
  harperQuestionAnchorId,
  HARPER_GENERAL_ANCHOR,
  HARPER_STANDING_ANCHOR,
  partitionGeneralQuestionsForStanding,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import {
  consultationConversationCopy,
  evidenceStrengthLabels,
} from "@/lib/product-config";

function question(
  partial: Partial<ConsultationQaItem> &
    Pick<ConsultationQaItem, "questionTurnId" | "question">,
): ConsultationQaItem {
  return {
    targetKey: null,
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    ignored: false,
    ...partial,
  };
}

describe("Harper Batch B2 — Where you stand inline Q&A", () => {
  it("maps every former General question onto a standing topic without an Other bucket", () => {
    const layout = buildHarperQaLayout({
      questions: [
        question({
          questionTurnId: "q-why",
          question: consultationConversationCopy.whyThisCompanyTarget,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        }),
        question({
          questionTurnId: "q-chrono",
          question: "Walk me through your career.",
          targetKey: CHRONOLOGY_TARGET_KEY,
        }),
        question({
          questionTurnId: "q-gap",
          question: "How do you run forecast?",
          targetKey: "required:forecast",
          seekerAnswers: [{ id: "a1", body: "I owned the weekly call." }],
        }),
        question({
          questionTurnId: "q-role",
          question: "What does enterprise CS expertise look like for you?",
          targetKey: `${ROLE_EXPERTISE_TARGET_PREFIX}enterprise-cs`,
        }),
        question({
          questionTurnId: "q-cheat",
          question: "Coach item answer",
          targetKey: "cheatSheet:contact:alex:likely:1",
          seekerAnswers: [{ id: "a-cheat", body: "I led the QBR." }],
        }),
        question({
          questionTurnId: "q-cheat-overview",
          question: "Overview gap coach",
          targetKey: "cheatSheet:overview:gap:1",
          seekerAnswers: [{ id: "a-ov", body: "Overview answer." }],
        }),
        question({
          questionTurnId: "q-person",
          question: "Prep for Alex",
          targetKey: "person-prep:alex",
        }),
      ],
      interviewers: [{ contactId: "alex", heading: "Alex", sortAt: 1 }],
    });

    expect(layout.general.map((item) => item.questionTurnId)).toEqual([
      "q-why",
      "q-chrono",
      "q-gap",
      "q-role",
      "q-cheat-overview",
    ]);
    expect(layout.interviewers[0]?.questions.map((q) => q.questionTurnId)).toEqual([
      "q-cheat",
      "q-person",
    ]);

    const partitioned = partitionGeneralQuestionsForStanding({
      general: layout.general,
      requirementTargetKeys: ["required:forecast", "required:channel"],
    });

    expect(partitioned.dedicatedTopics.map((topic) => topic.kind)).toEqual([
      "why-this-company",
      "chronology",
      "role-expertise",
    ]);
    expect(partitioned.dedicatedTopics.map((topic) => topic.label)).toEqual([
      consultationConversationCopy.whyThisCompanyTarget,
      consultationConversationCopy.careerWalkThroughTarget,
      "What does enterprise CS expertise look like for you?",
    ]);
    expect(partitioned.dedicatedTopics.every((topic) => topic.questions.length === 1)).toBe(
      true,
    );
    expect(partitioned.byRequirementKey.get("required:forecast")?.map((q) => q.questionTurnId)).toEqual([
      "q-gap",
    ]);
    expect(
      partitioned.byRequirementKey.get("required:forecast")?.[0]?.seekerAnswers,
    ).toEqual([{ id: "a1", body: "I owned the weekly call." }]);
    // overview:gap cheatSheet cannot be tied to a contact — STOP / report-only, no Other.
    expect(partitioned.unmapped.map((item) => item.questionTurnId)).toEqual([
      "q-cheat-overview",
    ]);
    expect(partitioned.dedicatedTopics.some((topic) => topic.kind === "requirement")).toBe(
      false,
    );
  });

  it("renders why-company and career walk-through once each as standing topics", () => {
    const partitioned = partitionGeneralQuestionsForStanding({
      general: [
        question({
          questionTurnId: "q-why",
          question: consultationConversationCopy.whyThisCompanyTarget,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        }),
        question({
          questionTurnId: "q-chrono",
          question: "Walk me through your career.",
          targetKey: CHRONOLOGY_TARGET_KEY,
        }),
      ],
      requirementTargetKeys: [],
    });
    const why = partitioned.dedicatedTopics.filter((t) => t.kind === "why-this-company");
    const chrono = partitioned.dedicatedTopics.filter((t) => t.kind === "chronology");
    expect(why).toHaveLength(1);
    expect(chrono).toHaveLength(1);
    expect(why[0]?.label).toBe(consultationConversationCopy.whyThisCompanyTarget);
    expect(chrono[0]?.label).toBe(consultationConversationCopy.careerWalkThroughTarget);

    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standing).toContain('data-testid={`standing-topic-${topic.kind}`}');
    expect(standing).toContain("dedicatedTopics.map");
    expect(standing).not.toContain("Other prep");
    expect(standing).not.toContain("Role expertise coming soon");
  });

  it("Where you stand is the default view with summary counts and inline questions; no free-floating General list", () => {
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");

    const render = section.slice(section.indexOf("return ("));
    expect(render.indexOf("consultation-standing-panel")).toBeLessThan(
      render.indexOf("<ConsultationThread"),
    );
    expect(section).toContain("consultationConversationCopy.whereYouStand");
    expect(standing).toContain("consultation-standing-counts");
    expect(standing).toContain("consultation-standing-requirements");
    expect(standing).toContain("evidenceStrengthLabels.STRONG");
    expect(evidenceStrengthLabels.STRONG).toBe("Strong");
    expect(thread).not.toContain("harper-general-questions");
    expect(thread).not.toContain("consultationConversationCopy.generalQuestions");
    expect(section).not.toContain("generalQuestions={qaLayout.general}");
    expect(section).toContain("dedicatedTopics={standingInline.dedicatedTopics}");
    expect(section).toContain("requirementQuestions=");
  });

  it("keeps Batch A inline behaviors: Share/Ignore/Ignored, Expand evidence, Show replies, Edit-after-click", () => {
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");

    expect(standing).toContain("shareSomeDetails");
    expect(standing).toContain("ignore-gap-");
    expect(standing).toContain("reopenIgnored");
    expect(standing).not.toContain("answerGap");
    expect(standing).toMatch(
      /<a[\s\S]*data-testid=\{`toggle-evidence-\$\{item\.id\}`\}[\s\S]*expandEvidence/,
    );
    expect(thread).toMatch(
      /<a[\s\S]*data-testid="consultation-toggle-replies"[\s\S]*showYourReplies/,
    );
    expect(thread).toContain("consultation-edit-reply");
    expect(thread).toContain("hasPriorReply && !editing");
    expect(consultationConversationCopy.editAnswer).toBe("Edit");
    expect(consultationConversationCopy.reopenIgnored).toBe("Ignored");
    expect(consultationConversationCopy.expandEvidence).toBe("Expand evidence");
    expect(consultationConversationCopy.showYourReplies).toBe("Show your replies");
  });

  it("anchors: #harper-standing, #harper-general topics root, #harper-q on inline QuestionCard", () => {
    expect(HARPER_STANDING_ANCHOR).toBe("harper-standing");
    expect(HARPER_GENERAL_ANCHOR).toBe("harper-general");
    expect(harperQuestionAnchorId("turn-99")).toBe("harper-q:turn-99");

    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(standing).toContain("id={HARPER_STANDING_ANCHOR}");
    expect(standing).toContain("id={HARPER_GENERAL_ANCHOR}");
    expect(standing).toContain("QuestionList");
    expect(thread).toContain("id={harperQuestionAnchorId(item.questionTurnId)}");
    expect(thread).toContain("data-harper-question={item.questionTurnId}");
  });

  it("reply forms stay gated while Harper is analyzing on standing and interviewer sections", () => {
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");

    expect(standing).toContain('sessionStatus !== "SKIPPED"');
    expect(standing).toContain('sessionStatus !== "PAUSED"');
    expect(standing).toContain("!jobsActive");
    expect(standing).toContain("showReply={showReply}");
    expect(thread).toContain("!jobsActive");
    expect(thread).toContain("showReply={showReply}");
    expect(section).toContain("sessionStatus={threadStatus}");
    expect(section).toContain("jobsActive={consultationBusy}");
  });

  it("reserves role-expertise under standing without rendering an empty placeholder", () => {
    const empty = partitionGeneralQuestionsForStanding({
      general: [],
      requirementTargetKeys: [],
    });
    expect(empty.dedicatedTopics.filter((t) => t.kind === "role-expertise")).toEqual([]);

    const withRole = partitionGeneralQuestionsForStanding({
      general: [
        question({
          questionTurnId: "q-role",
          question: "Role expertise?",
          targetKey: `${ROLE_EXPERTISE_TARGET_PREFIX}ops`,
        }),
      ],
      requirementTargetKeys: [],
    });
    expect(withRole.dedicatedTopics).toHaveLength(1);
    expect(withRole.dedicatedTopics[0]?.kind).toBe("role-expertise");
    expect(withRole.dedicatedTopics[0]?.targetKey.startsWith(ROLE_EXPERTISE_TARGET_PREFIX)).toBe(
      true,
    );

    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standing).toContain("dedicatedTopics.map");
    expect(standing).not.toMatch(/role-expertise[\s\S]{0,40}coming/i);
  });
});
