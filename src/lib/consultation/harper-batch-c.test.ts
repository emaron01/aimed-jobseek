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
  evidenceTargets,
  isCompanyMissionOrTagline,
  looksLikeCompanyPitch,
  openGaps,
  type EvidenceAssessment,
} from "@/lib/consultation/assess";
import {
  additionalInterviewPrepQaForProfile,
  orderedAnsweredHarperQuestions,
  profilePrimaryQuestionTurnIdsFromInterviewerSection,
} from "@/lib/consultation/additional-prep-qa";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import type { HarperInterviewerSection } from "@/lib/consultation/harper-layout";
import {
  looksLikeCareerWalkThrough,
  looksLikeContextFreeTemplateQuestion,
  planQuestionRound,
  questionIntentClass,
  questionNearDuplicate,
  questionTextForGap,
} from "@/lib/consultation/questions";
import {
  isParaphrasedSeekerReply,
  isQuestionMetaCommentary,
  isRawSeekerResult,
} from "@/lib/consultation/results";
import { polishAnswerWithQuality } from "@/lib/consultation/service";
import {
  consultationConfig,
  consultationConversationCopy,
} from "@/lib/product-config/consultation";
import type { JobScorecard } from "@/lib/job-requirement/types";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

function emptyVerification() {
  return {
    originalStrength: "NONE" as const,
    invalidSupportingFactIds: [] as string[],
    invalidRoleIds: [] as string[],
    downgradeReasons: [] as string[],
  };
}

function gapAssessment(
  overrides: Partial<EvidenceAssessment> &
    Pick<EvidenceAssessment, "key" | "text">,
): EvidenceAssessment {
  return {
    kind: "REQUIRED",
    strength: "NONE",
    supportingFactIds: [],
    strategy: "PROVE_WITH_STORY",
    explanation: "No evidence yet.",
    strategyText: "Ask for a concrete example.",
    verification: emptyVerification(),
    experienceCalculation: null,
    ...overrides,
  };
}

function qaItem(
  overrides: Partial<ConsultationQaItem> &
    Pick<ConsultationQaItem, "questionTurnId" | "question">,
): ConsultationQaItem {
  return {
    questionTurnId: overrides.questionTurnId,
    question: overrides.question,
    targetKey: overrides.targetKey ?? null,
    followUp: overrides.followUp ?? null,
    ignored: overrides.ignored ?? false,
    seekerAnswers: overrides.seekerAnswers ?? [],
    statements: overrides.statements ?? [],
    resumeBullet: overrides.resumeBullet ?? null,
    talkingPoint: overrides.talkingPoint ?? null,
  };
}

describe("Harper Batch C question and result defects", () => {
  beforeEach(() => {
    generateStructured.mockReset();
    isConsultationAiConfigured.mockReturnValue(true);
  });

  it("8b: mission, pitch, and mission-like required/outcome text never become gaps or questions", () => {
    const pitch =
      "Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence.";
    const missionLikeRequired =
      "Our company mission is to transform how enterprises protect digital brands.";
    const missionLikeOutcome =
      "We exist to build the future of trusted brand protection platforms.";
    const realSkill = "Own a weekly enterprise forecast cadence";

    expect(looksLikeCompanyPitch(pitch)).toBe(true);
    expect(looksLikeCompanyPitch(missionLikeRequired)).toBe(true);
    expect(looksLikeCompanyPitch(missionLikeOutcome)).toBe(true);
    expect(looksLikeCompanyPitch(realSkill)).toBe(false);

    const scorecard: JobScorecard = {
      mission: { id: "m1", text: pitch, inferred: false },
      outcomes: [{ id: "o1", text: missionLikeOutcome, inferred: false }],
      competencies: [{ id: "c1", text: realSkill, inferred: false }],
    };

    const targets = evidenceTargets({
      scorecard,
      requiredItems: [missionLikeRequired, realSkill],
      preferredItems: [pitch],
    });
    expect(targets.map((t) => t.text)).toEqual([realSkill]);
    expect(
      targets.some((t) => looksLikeCompanyPitch(t.text) || t.kind === "MISSION"),
    ).toBe(false);

    const assessments = [
      gapAssessment({
        key: "required:0",
        kind: "REQUIRED",
        text: missionLikeRequired,
      }),
      gapAssessment({
        key: "outcome:o1",
        kind: "OUTCOME",
        text: missionLikeOutcome,
      }),
      gapAssessment({
        key: "mission:m1",
        kind: "MISSION",
        text: pitch,
      }),
      gapAssessment({
        key: "required:1",
        text: realSkill,
      }),
    ];
    expect(
      isCompanyMissionOrTagline({
        key: "required:0",
        kind: "REQUIRED",
        text: missionLikeRequired,
      }),
    ).toBe(true);
    expect(openGaps(assessments).map((g) => g.key)).toEqual(["required:1"]);

    const round = planQuestionRound({
      assessments,
      modelQuestions: [
        {
          targetKey: "required:0",
          text: `Do you have experience with ${missionLikeRequired}?`,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Should never ask.",
        },
        {
          targetKey: "required:1",
          text: "At Contoso, how did you own a weekly enterprise forecast cadence?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Forecast ownership.",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(round.questions.map((q) => q.targetKey)).toEqual(["required:1"]);
    expect(
      round.questions.some((q) =>
        /mission|protect the world|build the future/i.test(q.text),
      ),
    ).toBe(false);
  });

  it("8c: restated reply or question meta-commentary is rejected, regenerated within bound, never shown as Harper result", async () => {
    const seeker =
      "That company statement is not a skill. It should be an interview question about why I want to work here.";
    const metaBullet =
      "Clarified that a company statement needed to be reframed as an interview question.";
    const paraphrase =
      "That company statement is not really a skill and should be an interview question about why I want to work here.";

    expect(isQuestionMetaCommentary(metaBullet)).toBe(true);
    expect(isParaphrasedSeekerReply(paraphrase, [seeker])).toBe(true);
    expect(isRawSeekerResult(metaBullet, [seeker])).toBe(true);
    expect(isRawSeekerResult(paraphrase, [seeker])).toBe(true);
    expect(
      isRawSeekerResult(
        "At Contoso I owned the Monday forecast ritual and cut slip by 20%.",
        [seeker],
      ),
    ).toBe(false);

    generateStructured.mockResolvedValue({
      data: {
        interviewAnswer: paraphrase,
        resumeBullet: metaBullet,
        strengtheningNote: null,
      },
    });

    const polished = await polishAnswerWithQuality({
      answer: seeker,
      story: {
        situation: null,
        task: null,
        action: null,
        result: null,
      },
      sources: [{ id: "answer:1", text: seeker }],
      profileItems: [],
      declinedFollowUp: false,
      strengtheningNeeds: [],
      seekerAnswers: [seeker],
    });

    expect(polished.ok).toBe(false);
    if (!polished.ok) {
      expect(polished.message).toBe(
        consultationConversationCopy.generationFailed,
      );
    }
    // Bounded to existing qualityRegenerationAttempts (initial + regenerations).
    expect(generateStructured.mock.calls.length).toBe(
      consultationConfig.qualityRegenerationAttempts + 1,
    );
    // When result still fails: no Harper interview/bullet returned; UI shows generationFailed + Retry.
    expect(consultationConversationCopy.generationFailed).toBe(
      `${consultationConfig.displayName} could not finish this coaching. Retry.`,
    );
  });

  it("8d: context-free template questions are rejected, dropped, and not replaced by a template", () => {
    const orphan =
      "Tell me what happened, what you did, and what the result was.";
    expect(looksLikeContextFreeTemplateQuestion(orphan)).toBe(true);
    expect(
      looksLikeContextFreeTemplateQuestion(
        "At Contoso, tell me what happened on the forecast slip, what you did, and what the result was.",
      ),
    ).toBe(false);

    const gap = gapAssessment({
      key: "required:forecast",
      text: "Own a weekly forecast cadence",
    });
    expect(questionTextForGap(gap, orphan)).toBe("");
    expect(
      questionTextForGap(
        gap,
        "At Contoso, how did you install a weekly forecast cadence when deals slipped?",
      ),
    ).toMatch(/Contoso/);

    const round = planQuestionRound({
      assessments: [gap],
      modelQuestions: [
        {
          targetKey: gap.key,
          text: orphan,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Orphan STAR must not ship.",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(round.questions).toEqual([]);
    expect(round.dropped.some((d) => d.targetKey === gap.key)).toBe(true);
    expect(
      round.dropped.some((d) => /context-free template/i.test(d.reason)),
    ).toBe(true);
    expect(
      round.questions.some((q) => /tell me what happened/i.test(q.text)),
    ).toBe(false);
    expect(
      round.questions.some((q) => /harper does not see/i.test(q.text)),
    ).toBe(false);
  });

  it("8e: career walk-throughs with different employers share chronology intent; only one per application", () => {
    const merion =
      "Starting with Merion, walk me through your key accomplishments there and why you moved on to OpenText.";
    const aerotek =
      "Starting with Aerotek, walk me through your key accomplishments there and why you moved on to OpenText.";
    expect(looksLikeCareerWalkThrough(merion)).toBe(true);
    expect(looksLikeCareerWalkThrough(aerotek)).toBe(true);
    expect(questionIntentClass(merion)).toBe("chronology");
    expect(questionIntentClass(aerotek, "required:other")).toBe("chronology");
    expect(questionNearDuplicate(merion, aerotek)).toBe(true);

    const asked = [
      {
        text: merion,
        answered: true,
        ignored: false,
        targetKey: "chronology",
        followUp: false,
      },
    ];
    const skill = gapAssessment({
      key: "required:channel",
      text: "Build a partner channel motion",
    });
    const round = planQuestionRound({
      assessments: [skill],
      modelQuestions: [
        {
          targetKey: skill.key,
          text: aerotek,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Second walk-through must drop.",
        },
        {
          targetKey: "chronology",
          text: aerotek,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Also chronology.",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(["chronology"]),
      skippedKeys: new Set(),
      askedQuestions: asked,
      includeChronology: true,
      chronologyAsked: false,
    });
    expect(
      round.questions.some((q) => looksLikeCareerWalkThrough(q.text)),
    ).toBe(false);
    expect(
      round.questions.filter((q) => q.targetKey === "chronology"),
    ).toHaveLength(0);

    const sameRound = planQuestionRound({
      assessments: [
        gapAssessment({ key: "required:a", text: "Lead enterprise sales" }),
        gapAssessment({ key: "required:b", text: "Build channel motion" }),
      ],
      modelQuestions: [
        {
          targetKey: "required:a",
          text: merion,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "First walk-through.",
        },
        {
          targetKey: "required:b",
          text: aerotek,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Second walk-through.",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(
      sameRound.questions.filter((q) => looksLikeCareerWalkThrough(q.text)),
    ).toHaveLength(1);
  });

  it("rejections stay within the existing quality regeneration bound (no unbounded replan)", async () => {
    expect(consultationConfig.qualityRegenerationAttempts).toBe(2);
    const service = src("src/lib/consultation/service.ts");
    const planQuestions = src("src/lib/consultation/questions.ts");
    expect(service).toContain(
      "attempt <= consultationConfig.qualityRegenerationAttempts",
    );
    expect(service).not.toMatch(/while\s*\(\s*true\s*\)/);
    expect(planQuestions).not.toContain("runPaidStructuredCall");
    expect(planQuestions).not.toContain("generateStructured");

    const seeker =
      "copy me exactly as the seeker wrote it verbatim here now";
    generateStructured.mockResolvedValue({
      data: {
        interviewAnswer: seeker,
        resumeBullet: seeker,
        strengtheningNote: null,
      },
    });
    await polishAnswerWithQuality({
      answer: seeker,
      story: {
        situation: null,
        task: null,
        action: null,
        result: null,
      },
      sources: [{ id: "a", text: seeker }],
      profileItems: [],
      declinedFollowUp: false,
      strengtheningNeeds: [],
      seekerAnswers: [seeker],
    });
    expect(generateStructured.mock.calls.length).toBe(
      consultationConfig.qualityRegenerationAttempts + 1,
    );
  });

  it("B5 regression: profile's own coach items and interviewer questions never appear in Additional Interview Prep Q&A", () => {
    const contactId = "c-alex";
    const coachTurnId = "turn-coach-likely-1";
    const interviewerTurnId = "turn-person-prep-1";
    const otherTurnId = "turn-standing-why";

    const coachItem = qaItem({
      questionTurnId: coachTurnId,
      question: "What will Alex likely ask about forecast discipline?",
      targetKey: `cheatSheet:contact:${contactId}:likely:1`,
      talkingPoint: {
        id: "s-coach",
        turnId: coachTurnId,
        kind: "INTERVIEW_ANSWER",
        status: "APPROVED",
        content: "I install a Monday commit ritual.",
        strengtheningNote: null,
      },
    });
    const interviewerItem = qaItem({
      questionTurnId: interviewerTurnId,
      question: "What should I know about working with Alex?",
      targetKey: `person-prep:${contactId}`,
      seekerAnswers: [{ id: "a1", body: "Direct and metric-driven." }],
    });
    const standingWhy = qaItem({
      questionTurnId: otherTurnId,
      question: "Why this company?",
      targetKey: "why-this-company",
      talkingPoint: {
        id: "s-why",
        turnId: otherTurnId,
        kind: "INTERVIEW_ANSWER",
        status: "APPROVED",
        content: "Mission and product fit.",
        strengtheningNote: null,
      },
    });

    const section: HarperInterviewerSection = {
      contactId,
      heading: "Alex",
      questions: [coachItem, interviewerItem],
    };
    const primaryIds =
      profilePrimaryQuestionTurnIdsFromInterviewerSection(section);
    expect(primaryIds).toEqual([coachTurnId, interviewerTurnId]);

    const answered = orderedAnsweredHarperQuestions({
      dedicatedTopics: [
        {
          kind: "why-this-company",
          targetKey: "why-this-company",
          label: "Why this company",
          questions: [standingWhy],
        },
      ],
      standingRequirementRows: [],
      interviewers: [section],
    });
    expect(answered.map((q) => q.questionTurnId)).toEqual([
      otherTurnId,
      coachTurnId,
      interviewerTurnId,
    ]);

    const additional = additionalInterviewPrepQaForProfile({
      involvement: "DIRECT",
      profilePrimaryQuestionTurnIds: primaryIds,
      answeredInHarperOrder: answered,
    });
    expect(additional.map((row) => row.questionTurnId)).toEqual([otherTurnId]);
    expect(additional.some((row) => row.questionTurnId === coachTurnId)).toBe(
      false,
    );
    expect(
      additional.some((row) => row.questionTurnId === interviewerTurnId),
    ).toBe(false);
    expect(
      additional.some((row) =>
        row.targetKey?.startsWith(`cheatSheet:contact:${contactId}:likely:`),
      ),
    ).toBe(false);

    const display = src("src/lib/consultation/harper-display-qa.ts");
    expect(display).toContain(
      "profilePrimaryQuestionTurnIdsFromInterviewerSection",
    );
    expect(display).toContain("primaryTurnIdsForContact");
  });
});
