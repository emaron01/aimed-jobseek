import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import {
  buildHarperQaLayout,
  harperContactAnchorId,
  harperQuestionAnchorId,
  HARPER_GENERAL_ANCHOR,
  HARPER_STANDING_ANCHOR,
  mapOpenGapsToAnswerableQuestions,
  partitionGeneralQuestionsForStanding,
  sortQuestionsOpenFirst,
  standingFormsSafeToRemove,
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

describe("Harper Batch A layout", () => {
  it("orders open questions before answered ones", () => {
    const open = question({
      questionTurnId: "q-open",
      question: "Open gap?",
      targetKey: "required:a",
    });
    const answered = question({
      questionTurnId: "q-done",
      question: "Done gap?",
      targetKey: "required:b",
      talkingPoint: {
        id: "s1",
        turnId: "a1",
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: "I led the forecast.",
        strengtheningNote: null,
      },
    });
    expect(
      sortQuestionsOpenFirst([answered, open]).map((item) => item.questionTurnId),
    ).toEqual(["q-open", "q-done"]);
  });

  it("puts Where you stand before interviewers in Stage date order (General is inline under standing)", () => {
    const layout = buildHarperQaLayout({
      questions: [
        question({
          questionTurnId: "q-why",
          question: "Why this company?",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        }),
        question({
          questionTurnId: "q-later",
          question: "What will Sam probe?",
          targetKey: "person-prep:contact-later",
        }),
        question({
          questionTurnId: "q-earlier-open",
          question: "What will Alex probe?",
          targetKey: "person-prep:contact-earlier",
        }),
        question({
          questionTurnId: "q-earlier-done",
          question: "Answered prep for Alex",
          targetKey: "person-prep:contact-earlier",
          talkingPoint: {
            id: "s2",
            turnId: "a2",
            kind: "INTERVIEW_ANSWER",
            status: "DRAFT",
            content: "I will lead with MEDDPICC.",
            strengtheningNote: null,
          },
        }),
      ],
      interviewers: [
        {
          contactId: "contact-later",
          heading: "Sam Later",
          sortAt: Date.parse("2026-10-20T15:00:00.000Z"),
        },
        {
          contactId: "contact-earlier",
          heading: "Alex Earlier",
          sortAt: Date.parse("2026-10-08T15:00:00.000Z"),
        },
      ],
    });

    expect(layout.general.map((item) => item.questionTurnId)).toEqual(["q-why"]);
    expect(layout.interviewers.map((section) => section.contactId)).toEqual([
      "contact-earlier",
      "contact-later",
    ]);
    expect(layout.interviewers[0]?.heading).toBe("Alex Earlier");
    expect(
      layout.interviewers[0]?.questions.map((item) => item.questionTurnId),
    ).toEqual(["q-earlier-open", "q-earlier-done"]);

    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const render = section.slice(section.indexOf("return ("));
    expect(render.indexOf("consultation-standing-panel")).toBeLessThan(
      render.indexOf("<ConsultationThread"),
    );
    // Batch B2: General questions partition into standing; Thread only gets interviewers.
    expect(section).toContain("partitionGeneralQuestionsForStanding");
    expect(section).toContain("dedicatedTopics={standingInline.dedicatedTopics}");
    expect(section).toContain("interviewerSections={qaLayout.interviewers}");
    expect(section).not.toContain("generalQuestions={qaLayout.general}");
    expect(section).toContain("buildHarperQaLayout");

    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(thread).not.toContain("harper-general-questions");
    expect(thread).toContain("harper-interviewer-section");
    expect(standing).toContain("HARPER_GENERAL_ANCHOR");
    expect(standing).toContain("harper-standing-topics");
  });

  it("uses stable anchors without showing ids as visible text", () => {
    expect(HARPER_STANDING_ANCHOR).toBe("harper-standing");
    expect(HARPER_GENERAL_ANCHOR).toBe("harper-general");
    expect(harperContactAnchorId("c1")).toBe("harper-contact:c1");
    expect(harperQuestionAnchorId("q1")).toBe("harper-q:q1");

    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(standing).toContain("id={HARPER_STANDING_ANCHOR}");
    // Batch B2: #harper-general aliases the standing topics root (no free-floating General list).
    expect(standing).toContain("id={HARPER_GENERAL_ANCHOR}");
    expect(thread).toContain("id={harperContactAnchorId(section.contactId)}");
    expect(thread).toContain("id={harperQuestionAnchorId(item.questionTurnId)}");
    // Ids may appear in attributes / fragments, never as rendered label text.
    expect(thread).not.toMatch(/>\s*\{[^}]*questionTurnId[^}]*\}\s*</);
    expect(thread).not.toMatch(/>\s*\{[^}]*contactId[^}]*\}\s*</);
    expect(thread).toContain("{section.heading}");
    expect(thread).toContain("stripInternalIdsFromDisplayText(item.question)");
  });

  it("renders Expand evidence and Show your replies as links, not buttons", () => {
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(standing).not.toContain("AppButton");
    expect(thread).not.toContain("AppButton");
    expect(standing).toMatch(
      /<a[\s\S]*data-testid=\{`toggle-evidence-\$\{item\.id\}`\}[\s\S]*expandEvidence/,
    );
    expect(thread).toMatch(
      /<a[\s\S]*data-testid="consultation-toggle-replies"[\s\S]*showYourReplies/,
    );
    expect(consultationConversationCopy.expandEvidence).toBe("Expand evidence");
    expect(consultationConversationCopy.showYourReplies).toBe("Show your replies");
  });

  it("replaces Add another reply with Edit that reveals the box only after click", () => {
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).not.toContain("addAnotherReply");
    expect(thread).toContain("consultation-edit-reply");
    expect(thread).toContain("consultationConversationCopy.editAnswer");
    expect(thread).toContain("const [editing, setEditing] = useState(false)");
    expect(thread).toContain("hasPriorReply && !editing");
    expect(thread).toContain("consultation-reply-box");
    expect(consultationConversationCopy.editAnswer).toBe("Edit");
  });

  it("keeps reply forms gated while Harper is analyzing in every section", () => {
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("!jobsActive");
    expect(thread).toContain("sessionStatus !== \"SKIPPED\"");
    expect(thread).toContain("sessionStatus !== \"PAUSED\"");
    expect(thread).toContain("showReply={showReply}");

    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standing).toContain("acceptingReplies");
    expect(standing).toContain("canEdit && acceptingReplies");
    // Batch B2: inline QuestionList under standing also gates on jobsActive / sessionStatus.
    expect(standing).toContain("!jobsActive");
    expect(standing).toContain("showReply={showReply}");

    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(section).toContain("jobsActive={consultationBusy}");
    expect(section).toContain("acceptingReplies={");
    expect(section).toContain("!consultationBusy");
  });

  it("documents REQUIRED CHECK: open gaps without questions keep Share forms; Answer jump removed when inline", () => {
    const withQuestion = mapOpenGapsToAnswerableQuestions({
      gaps: [
        {
          targetKey: "required:forecast",
          label: "Run a weekly forecast",
          status: "open",
        },
      ],
      requirements: [
        {
          targetKey: "required:forecast",
          text: "Run a weekly forecast",
          strength: "PARTIAL",
          gapStatus: "open",
        },
      ],
      questions: [
        question({
          questionTurnId: "q1",
          question: "How do you run forecast?",
          targetKey: "required:forecast",
        }),
      ],
    });
    expect(withQuestion.gapsWithoutAnswerableQuestion).toEqual([]);
    expect(standingFormsSafeToRemove({
      gaps: withQuestion.mappings.map((row) => ({
        targetKey: row.targetKey,
        label: row.label,
        status: row.status,
      })),
      requirements: [
        {
          targetKey: "required:forecast",
          text: "Run a weekly forecast",
          strength: "PARTIAL",
          gapStatus: "open",
        },
      ],
      questions: [
        question({
          questionTurnId: "q1",
          question: "How do you run forecast?",
          targetKey: "required:forecast",
        }),
      ],
    })).toBe(true);

    const withoutQuestion = mapOpenGapsToAnswerableQuestions({
      gaps: [
        {
          targetKey: "required:channel",
          label: "Build a partner motion",
          status: "open",
        },
      ],
      requirements: [
        {
          targetKey: "required:channel",
          text: "Build a partner motion",
          strength: "NONE",
          gapStatus: null,
        },
      ],
      questions: [],
    });
    expect(withoutQuestion.gapsWithoutAnswerableQuestion).toEqual([
      {
        targetKey: "required:channel",
        label: "Build a partner motion",
        status: "open",
        questionTurnId: null,
        answerableViaQuestion: false,
      },
    ]);
    expect(
      standingFormsSafeToRemove({
        gaps: [
          {
            targetKey: "required:channel",
            label: "Build a partner motion",
            status: "open",
          },
        ],
        requirements: [
          {
            targetKey: "required:channel",
            text: "Build a partner motion",
            strength: "NONE",
            gapStatus: null,
          },
        ],
        questions: [],
      }),
    ).toBe(false);

    // Batch B2: Share/Ignore remain for gaps without questions; Answer jump removed (Q inline).
    const standing = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standing).toContain("shareSomeDetails");
    expect(standing).not.toContain("answerGap");
    expect(standing).toContain("QuestionList");
    expect(evidenceStrengthLabels.PARTIAL).toBe("Partial");
  });

  it("why-this-company question lives once under the standing why topic, not a free-floating General list", () => {
    const layout = buildHarperQaLayout({
      questions: [
        question({
          questionTurnId: "q-why",
          question: consultationConversationCopy.whyThisCompanyTarget,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        }),
        question({
          questionTurnId: "q-prep",
          question: "Prep for Alex",
          targetKey: "person-prep:alex",
        }),
      ],
      interviewers: [
        { contactId: "alex", heading: "Alex", sortAt: 1 },
      ],
    });
    const whyCards = [...layout.general, ...layout.interviewers.flatMap((s) => s.questions)]
      .filter((item) => item.targetKey === WHY_THIS_COMPANY_TARGET_KEY);
    expect(whyCards).toHaveLength(1);
    expect(layout.general).toContainEqual(whyCards[0]);

    const partitioned = partitionGeneralQuestionsForStanding({
      general: layout.general,
      requirementTargetKeys: [],
    });
    expect(partitioned.dedicatedTopics).toHaveLength(1);
    expect(partitioned.dedicatedTopics[0]?.kind).toBe("why-this-company");
    expect(partitioned.dedicatedTopics[0]?.questions).toHaveLength(1);
  });
});
