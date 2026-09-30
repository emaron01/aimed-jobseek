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
import { cscSeniorDirectorSalesParsed } from "@/lib/consultation/csc-senior-director-sales-fixture";
import {
  buildConsultationQaView,
  needsMoreDetailFromAnalysis,
} from "@/lib/consultation/qa-view";

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
    pendingDraftTalkingPoint: overrides.pendingDraftTalkingPoint ?? null,
    pendingDraftResumeBullet: overrides.pendingDraftResumeBullet ?? null,
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
        interviewTypeTag: "focused_competency" as const,
        },
        {
          targetKey: "required:1",
          text: "At Contoso, how did you own a weekly enterprise forecast cadence?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Forecast ownership.",
        interviewTypeTag: "focused_competency" as const,
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

  it("8c: nearly-verbatim echo and question meta-commentary are rejected; polished coaching is not", async () => {
    const seeker =
      "At Contoso I owned the Monday forecast ritual. I sat with managers on deal inspection until slip fell under ten percent.";
    const metaBullet =
      "Clarified that a company statement needed to be reframed as an interview question.";
    const nearlyVerbatim =
      "At Contoso I owned the Monday forecast ritual I sat with managers on deal inspection until slip fell under ten percent";
    const polishedCoaching =
      "At Contoso I installed a Monday forecast ritual and coached managers through weekly deal inspection until forecast slip fell under 10%.";

    expect(isQuestionMetaCommentary(metaBullet)).toBe(true);
    expect(isParaphrasedSeekerReply(nearlyVerbatim, [seeker])).toBe(true);
    expect(isParaphrasedSeekerReply(polishedCoaching, [seeker])).toBe(false);
    expect(isRawSeekerResult(metaBullet, [seeker])).toBe(true);
    expect(isRawSeekerResult(nearlyVerbatim, [seeker])).toBe(true);
    expect(isRawSeekerResult(polishedCoaching, [seeker])).toBe(false);
    expect(isRawSeekerResult(seeker, [seeker])).toBe(true);

    generateStructured.mockResolvedValue({
      data: {
        interviewAnswer: nearlyVerbatim,
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
    expect(generateStructured.mock.calls.length).toBe(
      consultationConfig.qualityRegenerationAttempts + 1,
    );
    expect(consultationConversationCopy.needsMoreDetailToShape).toBe(
      "Add a bit more detail so Harper can shape this answer.",
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
        interviewTypeTag: "focused_competency" as const,
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

  it("8e: career chronology walk-throughs share intent; behavioral walk-throughs do not", () => {
    const merion =
      "Starting with Merion, walk me through your key accomplishments there and why you moved on to OpenText.";
    const aerotek =
      "Starting with Aerotek, walk me through your key accomplishments there and why you moved on to OpenText.";
    const career =
      "Walk me through your career from Merion to OpenText and why you moved on from each role.";
    expect(looksLikeCareerWalkThrough(merion)).toBe(true);
    expect(looksLikeCareerWalkThrough(aerotek)).toBe(true);
    expect(looksLikeCareerWalkThrough(career)).toBe(true);
    expect(looksLikeCareerWalkThrough("Walk me through your career.")).toBe(
      true,
    );
    expect(
      looksLikeCareerWalkThrough(
        "Walk me through your experience building a front-line management layer.",
      ),
    ).toBe(false);
    expect(
      looksLikeCareerWalkThrough(
        "Walk me through how you went from an unreliable forecast to 5-10% accuracy.",
      ),
    ).toBe(false);
    expect(
      looksLikeCareerWalkThrough(
        "Walk me through your background with MEDDIC.",
      ),
    ).toBe(false);
    expect(questionIntentClass(merion)).toBe("chronology");
    expect(questionIntentClass(aerotek, "required:other")).toBe("chronology");
    expect(questionNearDuplicate(merion, aerotek)).toBe(true);
    expect(
      questionNearDuplicate(
        merion,
        "Walk me through your experience building a front-line management layer.",
      ),
    ).toBe(false);

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
        interviewTypeTag: "focused_competency" as const,
        },
        {
          targetKey: "chronology",
          text: aerotek,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Also chronology.",
        interviewTypeTag: "focused_competency" as const,
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
        interviewTypeTag: "focused_competency" as const,
        },
        {
          targetKey: "required:b",
          text: aerotek,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Second walk-through.",
        interviewTypeTag: "focused_competency" as const,
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

    // Behavioral walk-through after a career walk-through is still planned.
    const behavioralAfter = planQuestionRound({
      assessments: [
        gapAssessment({
          key: "required:bench",
          text: "Build a front-line management layer",
        }),
      ],
      modelQuestions: [
        {
          targetKey: "required:bench",
          text: "Walk me through your experience building a front-line management layer.",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Not chronology.",
        interviewTypeTag: "focused_competency" as const,
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(["chronology"]),
      skippedKeys: new Set(),
      askedQuestions: asked,
      includeChronology: true,
      chronologyAsked: true,
    });
    expect(behavioralAfter.questions).toHaveLength(1);
    expect(behavioralAfter.questions[0]?.text).toMatch(/front-line management/i);
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

  it("FIX 3: failed polish keeps session READY, stores no Harper draft, never deletes APPROVED", () => {
    expect(consultationConversationCopy.needsMoreDetailToShape).toBe(
      "Add a bit more detail so Harper can shape this answer.",
    );
    const service = src("src/lib/consultation/service.ts");
    const thread = src("src/components/ConsultationThread.tsx");
    expect(service).toContain("finishItemNeedsMoreDetail");
    expect(service).toContain("needsMoreDetail: true");
    expect(service).toContain('generationStatus: "READY"');
    const finishStart = service.indexOf("async function finishItemNeedsMoreDetail");
    const finishBody = service.slice(finishStart, finishStart + 1400);
    expect(finishBody).toContain('status: "DRAFT"');
    expect(finishBody).toContain("turnId: input.resultTurnId");
    expect(finishBody).not.toContain("turnId: { in: turnIds }");
    expect(finishBody).not.toContain("input.supersedeTurnIds");
    expect(thread).toContain("needsMoreDetailToShape");
    expect(thread).toContain("consultation-needs-more-detail");
    expect(thread).toMatch(/item\.needsMoreDetail && !item\.ignored/);
    expect(service).toContain("await finishItemNeedsMoreDetail({");
    expect(
      service.split("await finishItemNeedsMoreDetail({").length - 1,
    ).toBeGreaterThanOrEqual(2);
  });

  it("FIX 4: canned-question guard still covers questions.ts; detection lives in a separate module", () => {
    const questions = src("src/lib/consultation/questions.ts");
    const detection = src("src/lib/consultation/question-detection.ts");
    expect(questions).not.toMatch(/Tell a story|Walk me through|concrete result/i);
    expect(questions).not.toMatch(/Do you have experience with/i);
    expect(questions).not.toContain("{requirement}");
    expect(questions).not.toContain('["walk", "me", "through"].join');
    expect(questions).toContain('from "@/lib/consultation/question-detection"');
    expect(detection).toContain("looksLikeCareerWalkThrough");
    expect(detection).toContain("looksLikeContextFreeTemplateQuestion");
    expect(detection).not.toContain("planQuestionRound");
    expect(detection).not.toContain("questionTextForGap");
    expect(detection).toMatch(/Detection-only helpers/);
  });

  it("FIX 5: real CSC Senior Director posting excludes only mission and mission-echo outcome", () => {
    const { responsibilities, requiredItems, preferredItems, scorecard } =
      cscSeniorDirectorSalesParsed;
    const missionEcho = scorecard.outcomes[4]!;
    const keptOutcomes = scorecard.outcomes.slice(0, 4);

    expect(looksLikeCompanyPitch(scorecard.mission.text)).toBe(true);
    expect(looksLikeCompanyPitch(missionEcho.text)).toBe(true);
    for (const text of responsibilities) {
      expect(looksLikeCompanyPitch(text)).toBe(false);
    }
    expect(
      looksLikeCompanyPitch(
        "Position domain and brand protection solutions as mission-critical controls within enterprise risk and security strategies",
      ),
    ).toBe(false);
    for (const text of requiredItems) {
      expect(looksLikeCompanyPitch(text)).toBe(false);
    }
    for (const item of keptOutcomes) {
      expect(looksLikeCompanyPitch(item.text)).toBe(false);
    }
    for (const item of scorecard.competencies) {
      expect(looksLikeCompanyPitch(item.text)).toBe(false);
    }

    const targets = evidenceTargets({
      scorecard,
      requiredItems: [...requiredItems],
      preferredItems: [...preferredItems],
    });
    // Pitch exclusions only: mission + mission-echo outcome.
    expect(targets.some((t) => t.kind === "MISSION")).toBe(false);
    expect(targets.some((t) => t.text === scorecard.mission.text)).toBe(false);
    expect(targets.some((t) => t.text === missionEcho.text)).toBe(false);
    expect(targets.some((t) => looksLikeCompanyPitch(t.text))).toBe(false);

    for (const text of requiredItems) {
      expect(targets.some((t) => t.text === text)).toBe(true);
    }
    // First, second, and fourth outcomes are distinct targets.
    expect(targets.some((t) => t.text === keptOutcomes[0]!.text)).toBe(true);
    expect(targets.some((t) => t.text === keptOutcomes[1]!.text)).toBe(true);
    expect(targets.some((t) => t.text === keptOutcomes[3]!.text)).toBe(true);
    // Third outcome shares meaning with a required item — not a pitch exclusion.
    expect(looksLikeCompanyPitch(keptOutcomes[2]!.text)).toBe(false);
    // Competencies share meaning with required items — kept by pitch, not separate targets.
    for (const item of scorecard.competencies) {
      expect(looksLikeCompanyPitch(item.text)).toBe(false);
    }
  });

  it("FIX 3 view: needsMoreDetail with no approved answer shows the message and no Harper result", () => {
    expect(needsMoreDetailFromAnalysis({ needsMoreDetail: true })).toBe(true);
    expect(needsMoreDetailFromAnalysis({ gapDecision: "evidence" })).toBe(false);
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
          body: "I ran a Monday ritual.",
          targetKey: "required:forecast",
          followUp: false,
          sequence: 2,
          analysisJson: {
            replyToTurnId: "q1",
            gapDecision: "evidence",
            needsMoreDetail: true,
          },
        },
      ],
      statements: [],
    });
    expect(view.questions[0]?.needsMoreDetail).toBe(true);
    expect(view.questions[0]?.talkingPoint).toBeNull();
    expect(view.questions[0]?.resumeBullet).toBeNull();
    expect(view.questions[0]?.seekerAnswers[0]?.body).toBe(
      "I ran a Monday ritual.",
    );
  });

  it("FIX 3 view: failed new reply keeps approved answer shown and still asks for more detail", () => {
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
          id: "s-approved",
          speaker: "SEEKER",
          body: "I owned the Monday commit ritual and cut slip under ten percent.",
          targetKey: "required:forecast",
          followUp: false,
          sequence: 2,
          analysisJson: {
            replyToTurnId: "q1",
            gapDecision: "evidence",
          },
        },
        {
          id: "s-new",
          speaker: "SEEKER",
          body: "Also something thin.",
          targetKey: "required:forecast",
          followUp: false,
          sequence: 3,
          analysisJson: {
            replyToTurnId: "q1",
            gapDecision: "evidence",
            needsMoreDetail: true,
          },
        },
      ],
      statements: [
        {
          id: "st-approved",
          turnId: "s-approved",
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content:
            "At Contoso I owned the Monday commit ritual until forecast slip fell under 10%.",
          strengtheningNote: null,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          id: "st-bullet",
          turnId: "s-approved",
          kind: "RESUME_BULLET",
          status: "APPROVED",
          content:
            "Owned Contoso Monday commit ritual; forecast slip fell under 10%.",
          strengtheningNote: null,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ],
    });
    expect(view.questions[0]?.needsMoreDetail).toBe(true);
    expect(view.questions[0]?.talkingPoint?.status).toBe("APPROVED");
    expect(view.questions[0]?.talkingPoint?.content).toContain(
      "Monday commit ritual",
    );
    expect(view.questions[0]?.resumeBullet?.status).toBe("APPROVED");
    expect(view.questions[0]?.seekerAnswers.map((a) => a.body)).toEqual([
      "I owned the Monday commit ritual and cut slip under ten percent.",
      "Also something thin.",
    ]);
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain("hasResult");
    expect(thread).toMatch(/item\.needsMoreDetail && !item\.ignored/);
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
