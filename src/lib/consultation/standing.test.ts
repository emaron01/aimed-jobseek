import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { planQuestionRound } from "@/lib/consultation/questions";
import {
  briefingNeedsStandingRegen,
  buildStandingGaps,
  qaItemForTargetKey,
  shouldEnqueueConsultationStandingRegen,
  standingGapStatus,
  standingWorkIsComplete,
} from "@/lib/consultation/standing";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { consultationGapStatusCopy } from "@/lib/product-config/consultation";

const emptyVerification = {
  originalStrength: "NONE" as const,
  invalidSupportingFactIds: [],
  invalidRoleIds: [],
  downgradeReasons: [],
};

function gap(input: {
  key: string;
  kind: "REQUIRED" | "COMPETENCY";
  text: string;
  strength: "NONE" | "PARTIAL" | "STRONG";
}) {
  return {
    key: input.key,
    kind: input.kind,
    text: input.text,
    strength: input.strength,
    supportingFactIds: [],
    strategy: "ACKNOWLEDGE" as const,
    explanation: "No evidence yet.",
    strategyText: "Ask for the story.",
    verification: {
      ...emptyVerification,
      originalStrength: input.strength,
    },
    experienceCalculation: null,
  };
}

describe("Harper core loop standing", () => {
  it("asks one question per surfaced gap, most important first", () => {
    const assessments = [
      gap({
        key: "required:managers",
        kind: "REQUIRED",
        text: "Built front-line sales managers",
        strength: "NONE",
      }),
      gap({
        key: "required:channel",
        kind: "REQUIRED",
        text: "Lead a channel motion",
        strength: "PARTIAL",
      }),
      gap({
        key: "competency:forecast",
        kind: "COMPETENCY",
        text: "Run a weekly forecast",
        strength: "NONE",
      }),
    ];
    const questions = planQuestionRound({
      assessments,
      modelQuestions: assessments.map((assessment) => ({
        targetKey: assessment.key,
        text: `The job wants ${assessment.text.toLowerCase()}. I do not see that in your background. Tell me about it.`,
        requirementInterpretation: null,
        hiringTeamRoleId: "hm",
        whoCaresNote: "The Hiring Manager needs this story.",
      interviewTypeTag: "focused_competency" as const,
      })),
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(questions.questions.map((question) => question.targetKey)).toEqual([
      "required:managers",
      "required:channel",
      "competency:forecast",
    ]);
  });

  it("keeps an open gap after its question is ignored so standing can show Ignored", () => {
    const standing = buildStandingGaps({
      assessments: [
        gap({
          key: "required:forecast",
          kind: "REQUIRED",
          text: "Run a weekly forecast",
          strength: "NONE",
        }),
      ],
      questions: [],
    });
    expect(standing).toEqual([
      {
        targetKey: "required:forecast",
        label: "Run a weekly forecast",
        status: "open",
        talkTrack: null,
      },
    ]);
    expect(consultationGapStatusCopy.open).toBeTruthy();
    const standingUi = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standingUi).toContain("reopenIgnored");
    // Batch B2: Answer jump link removed; question cards render inline under the requirement.
    expect(standingUi).not.toContain("answerGap");
    expect(standingUi).toContain("shareSomeDetails");
    expect(standingUi).toContain("ignoreQuestion");
    expect(standingUi).toContain("QuestionList");
  });

  it("shows each gap's status and never tells the seeker to go close it", () => {
    const assessments = [
      gap({
        key: "required:managers",
        kind: "REQUIRED",
        text: "Built front-line sales managers",
        strength: "NONE",
      }),
      gap({
        key: "required:meddic",
        kind: "REQUIRED",
        text: "Installed a MEDDIC cadence",
        strength: "NONE",
      }),
    ];
    const standing = buildStandingGaps({
      assessments,
      questions: [
        {
          questionTurnId: "q1",
          targetKey: "required:managers",
          question: "Tell me about a manager you developed.",
          followUp: null,
          seekerAnswers: [
            {
              id: "s1",
              body: "I coached Priya into a first-line manager.",
              analysisJson: { gapDecision: "evidence" },
            },
          ],
          statements: [],
          resumeBullet: {
            id: "b1",
            turnId: "s1",
            kind: "RESUME_BULLET",
            status: "DRAFT",
            content: "Coached an AE into a first-line manager.",
            strengtheningNote: null,
          },
          talkingPoint: {
            id: "i1",
            turnId: "s1",
            kind: "INTERVIEW_ANSWER",
            status: "DRAFT",
            content:
              "I coached Priya from a high-performing AE into a first-line manager.",
            strengtheningNote: null,
          },
        },
        {
          questionTurnId: "q2",
          targetKey: "required:meddic",
          question: "How did you install MEDDIC?",
          followUp: null,
          seekerAnswers: [
            {
              id: "s2",
              body: "I have never installed MEDDIC.",
              analysisJson: { gapDecision: "no_evidence" },
            },
          ],
          statements: [],
          resumeBullet: null,
          talkingPoint: {
            id: "i2",
            turnId: "s2",
            kind: "INTERVIEW_ANSWER",
            status: "DRAFT",
            content:
              "I have not installed a MEDDIC cadence. In an interview I would say that and talk about the forecast rhythm I do run.",
            strengtheningNote: null,
          },
        },
      ],
    });
    expect(standing).toEqual([
      {
        targetKey: "required:managers",
        label: "Built front-line sales managers",
        status: "closed",
        talkTrack:
          "I coached Priya from a high-performing AE into a first-line manager.",
      },
      {
        targetKey: "required:meddic",
        label: "Installed a MEDDIC cadence",
        status: "confirmed",
        talkTrack:
          "I have not installed a MEDDIC cadence. In an interview I would say that and talk about the forecast rhythm I do run.",
      },
    ]);
    expect(consultationGapStatusCopy.closed).toBe("Closed");
    expect(consultationGapStatusCopy.confirmed).toBe("Confirmed gap");
    expect(
      standingGapStatus({
        questionTurnId: "q-inc",
        targetKey: "required:forecast",
        question: "How do you forecast?",
        followUp: {
          turnId: "f1",
          text: "What result did you get when you used forecasting?",
        },
        seekerAnswers: [
          {
            id: "s-inc",
            body: "I have used forecasting.",
            analysisJson: { gapDecision: "incomplete" },
          },
        ],
        statements: [],
        resumeBullet: {
          id: "b-inc",
          turnId: "s-inc",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content: "Used forecasting.",
          strengtheningNote: null,
        },
        talkingPoint: {
          id: "i-inc",
          turnId: "s-inc",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I have experience using forecasting.",
          strengtheningNote: null,
        },
      }),
    ).toEqual({ status: "open", talkTrack: null });
    expect(
      standingGapStatus({
        questionTurnId: "q-no",
        targetKey: "required:domain",
        question: "Have you sold brand protection?",
        followUp: {
          turnId: "f2",
          text: "What adjacent work would you bring?",
        },
        seekerAnswers: [
          {
            id: "s-no",
            body:
              "I have never sold digital brand protection, domain services, or digital-risk products. My closest work is patient-identity software at Contoso Health.",
            analysisJson: { gapDecision: "no_evidence" },
          },
        ],
        statements: [],
        resumeBullet: {
          id: "b-no",
          turnId: "s-no",
          kind: "RESUME_BULLET",
          status: "DRAFT",
          content:
            "Bring adjacent patient-identity software experience rather than direct sales experience.",
          strengtheningNote: null,
        },
        talkingPoint: {
          id: "i-no",
          turnId: "s-no",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content:
            "I have not done that work yet. The closest related experience I have is patient-identity software at Contoso Health, and I would close the gap in this role by ramping on digital brand protection in the first weeks.",
          strengtheningNote: null,
        },
      }).status,
    ).toBe("confirmed");

    const dualQuestions = [
      {
        questionTurnId: "q-decided",
        targetKey: "outcome:cs-expansion",
        question: "Have you partnered with customer success on expansion?",
        followUp: null,
        seekerAnswers: [
          {
            id: "s-decided",
            body: "I have never partnered with customer success on expansion.",
            analysisJson: { gapDecision: "no_evidence" as const },
          },
        ],
        statements: [],
        resumeBullet: null,
        talkingPoint: {
          id: "i-decided",
          turnId: "s-decided",
          kind: "INTERVIEW_ANSWER" as const,
          status: "DRAFT",
          content:
            "I have not partnered with customer success on expansion in existing accounts.",
          strengtheningNote: null,
        },
      },
      {
        questionTurnId: "q-later",
        targetKey: "outcome:cs-expansion",
        question: "Walk me through one expansion with the post-sale team.",
        followUp: null,
        seekerAnswers: [],
        statements: [],
        resumeBullet: null,
        talkingPoint: null,
      },
    ];
    const decided = qaItemForTargetKey(dualQuestions, "outcome:cs-expansion");
    expect(decided?.questionTurnId).toBe("q-decided");
    expect(standingGapStatus(decided).status).toBe("confirmed");
    const dualGaps = buildStandingGaps({
      assessments: [
        {
          key: "outcome:cs-expansion",
          kind: "OUTCOME",
          text: "Partner with customer success on expansion in existing accounts",
          strength: "NONE",
        },
      ],
      questions: dualQuestions,
    });
    expect(dualGaps[0]?.status).toBe("confirmed");
    expect(dualGaps[0]?.status).toBe(standingGapStatus(decided).status);

    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const standingUi = readFileSync(
      "src/components/ConsultationStanding.tsx",
      "utf8",
    );
    expect(section).not.toContain("storyPlan.map");
    expect(section).toContain("buildStandingGaps");
    expect(section).toContain("qaItemForTargetKey");
    // Gap Open/Closed/Confirmed labels removed from UI (standing-structure Item 2);
    // rating is Strong/Partial/None only. Share form retained on entries without questions.
    expect(standingUi).toContain("evidenceStrengthLabels");
    expect(standingUi).toContain("shareSomeDetails");
    expect(standingUi).toContain("replyConsultationAction");
    // Three-section page: section title lives on the collapsible heading in Standing.
    expect(standingUi).toContain("consultationConversationCopy.whereYouStand");
    expect(section).toContain("consultationConversationCopy.pageIntro");
    expect(section).not.toContain("consultationConversationCopy.whereYouStand");
    expect(section).toContain("latestClosingNote");
    expect(section).not.toContain("prepareExistingConsultationSession");
    expect(section).not.toContain("shouldEnqueueConsultationStandingRegen");
    expect(section).not.toContain("briefingNeedsStandingRegen");
    expect(
      standingWorkIsComplete({
        gaps: [
          { status: "closed" },
          { status: "confirmed" },
        ],
        unansweredQuestions: false,
      }),
    ).toBe(true);
    expect(
      standingWorkIsComplete({
        gaps: [{ status: "closed" }, { status: "open" }],
        unansweredQuestions: false,
      }),
    ).toBe(false);
    expect(
      standingWorkIsComplete({
        gaps: [{ status: "closed" }],
        unansweredQuestions: true,
      }),
    ).toBe(false);
    const withPitch = buildStandingGaps({
      assessments: [
        {
          key: "required:pitch",
          kind: "REQUIRED",
          text: "Join us to help protect the world's most valuable digital brands",
          strength: "NONE",
        },
        {
          key: "person-prep:c1",
          kind: "COMPETENCY",
          text: "Harper prepares the seeker for Christina Schivley",
          strength: "NONE",
        },
        {
          key: "required:channel",
          kind: "REQUIRED",
          text: "Build and lead a partner and channel motion",
          strength: "NONE",
        },
      ],
      questions: [],
    });
    expect(withPitch.map((gap) => gap.targetKey)).toEqual(["required:channel"]);
    expect(withPitch[0]?.status).toBe("open");
  });

  it("regenerates standing when the prompt version is stale", () => {
    expect(
      briefingNeedsStandingRegen({
        texts: ["You have a strong enterprise-sales record."],
        firstName: "Jordan",
        promptVersion: "15",
        currentPromptVersion: CONSULTATION_PROMPT_VERSION,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueConsultationStandingRegen({
        needsRegen: true,
        busy: false,
        lastReassessAttemptAt: null,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueConsultationStandingRegen({
        needsRegen: true,
        busy: false,
        lastReassessAttemptAt: new Date("2026-09-26T19:00:00.000Z"),
        lastReassessSucceeded: true,
        stalePromptVersion: false,
      }),
    ).toBe(false);
    expect(
      briefingNeedsStandingRegen({
        texts: ["The seeker has a strong enterprise-sales record."],
        firstName: "Jordan",
        promptVersion: CONSULTATION_PROMPT_VERSION,
        currentPromptVersion: CONSULTATION_PROMPT_VERSION,
      }),
    ).toBe(false);
  });
});
