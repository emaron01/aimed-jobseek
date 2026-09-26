import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  calculateExperienceYears,
  evidenceTargets,
  gapsAreCovered,
  isCompanyMissionOrTagline,
  looksLikeCompanyPitch,
  profileEvidenceItems,
  verifyModelAssessments,
} from "@/lib/consultation/assess";
import { buildOpenAiJsonSchemaFormat } from "@/lib/ai/zod-json-schema";
import {
  CONSULTATION_PROMPT_VERSION,
  consultationExtractSchema,
} from "@/lib/consultation/contract";
import {
  matchConsultationFocus,
  planQuestionRound,
  questionDuplicatesAsked,
  questionNearDuplicate,
  questionTextForGap,
  seniorityWarrantsChronology,
} from "@/lib/consultation/questions";
import { nextConsultationStatus } from "@/lib/consultation/state";
import {
  answerConsultationQuestion,
  approveConsultationStatement,
  completeConsultation,
  confirmConsultationProposal,
  dismissConsultationProposal,
  pauseConsultation,
  polishAnswerWithQuality,
  resumeConsultation,
  skipConsultation,
  skipConsultationQuestion,
  startConsultation,
  confirmConsultationResult,
  continueConsultationPlanning,
  editConsultationAnswer,
  repairConsultationResults,
} from "@/lib/consultation/service";
import {
  buildConsultationQaView,
  consultationQuestionAcceptsReply,
} from "@/lib/consultation/qa-view";
import {
  looksLikeInternalId,
  profileItemDisplayLabel,
  resolveEvidenceLabels,
} from "@/lib/consultation/evidence-display";
import {
  appendConfirmedFact,
  groundedInAnswer,
  isCompleteFactStatement,
  proposalsFromExtraction,
} from "@/lib/consultation/write-back";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import {
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "@/lib/job-requirement/fixtures";
import {
  consultationConfig,
  consultationConversationCopy,
} from "@/lib/product-config/consultation";
import {
  validateGroundedStatement,
  validateInterviewAnswerQuality,
  validateRepetitionAndMetaLanguage,
} from "@/lib/consultation/output-quality";
import { CONSULTATION_COACH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";
import {
  parseCandidateProfile,
} from "@/lib/product-research/candidate-profile";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { saveSeekerStatedBackground } from "@/lib/product-research/seeker-background";
import { hasTestDatabase } from "@/test/database";

function sample() {
  const profile = fixtureAlexChenProfile();
  const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
  const targets = evidenceTargets({
    requiredItems: parsed.requiredItems,
    preferredItems: parsed.preferredItems,
    scorecard: parsed.scorecard,
  });
  return { profile, parsed, targets };
}

function questionForConsultationTarget(target: {
  key: string;
  kind: string;
  text: string;
}): string {
  if (target.key === "why-this-company") {
    return "Why do you want this role at this company, given the reliability work you have already done at Northwind?";
  }
  if (/5 years of Python/i.test(target.text)) {
    return "Your Northwind and Contoso roles cover more than seven years, but the profile does not say where you used Python. In which roles did you use it, and what were the exact dates?";
  }
  if (/incident response/i.test(target.text)) {
    return "You already have incident response on the profile. Is there a later example at Northwind that shows how you ran the response and what changed afterward?";
  }
  if (target.kind === "MISSION") {
    return "What about this company's work draws you, given the reliability problems you have already owned?";
  }
  return "In your Northwind payments work, what was at stake on one hard problem, what did you personally do, and what changed?";
}

function installConsultationModelFixture() {
  generateStructured.mockImplementation(async (request: {
    schemaName: string;
    messages: Array<{ content: string }>;
  }) => {
    const payload = request.messages.reduce((acc, message) => {
      try {
        return { ...acc, ...JSON.parse(message.content) };
      } catch {
        return acc;
      }
    }, {}) as {
      targets?: Array<{ key: string; kind: string; text: string }>;
      answer?: string;
      target?: { key: string } | null;
      availableTargets?: Array<{ key: string; text: string }>;
      hiringTeam?: Array<{ id: string; name: string }>;
      askedQuestions?: Array<{ text: string; answered: boolean }>;
      seekerStatedFacts?: Array<{ id: string; text: string; source: string }>;
      allowedSources?: Array<{ id: string; text: string }>;
      statement?: string;
      kind?: "INTERVIEW_ANSWER" | "RESUME_BULLET";
      declinedFollowUp?: boolean;
      confirmedGap?: boolean;
      strengtheningNeeds?: string[];
      qualityFeedback?: string[];
    };
    if (request.schemaName === "consultation_plan") {
      const targets = payload.targets ?? [];
      const askedQuestions = payload.askedQuestions ?? [];
      const stated = (payload.seekerStatedFacts ?? [])
        .map((item) => item.text)
        .join(" ");
      const hiringRole = payload.hiringTeam?.[0] ?? {
        id: "hiring-manager",
        name: "Hiring Manager",
      };
      const questions = [
        ...targets.map((target) => ({
          targetKey: target.key,
          text: questionForConsultationTarget(target),
          requirementInterpretation: null,
          hiringTeamRoleId: hiringRole.id,
          whoCaresNote: `${hiringRole.name} needs to hear concrete evidence tied to this requirement.`,
        })),
        {
          targetKey: "chronology",
          text: "Starting with Northwind Analytics, walk me through your key accomplishments there and why you moved on from each role.",
          requirementInterpretation: null,
          hiringTeamRoleId: hiringRole.id,
          whoCaresNote: `${hiringRole.name} needs to understand the progression of your work.`,
        },
      ].filter(
        (question) =>
          !askedQuestions.some((asked) => asked.text === question.text),
      );
      return {
        data: {
          commentary:
            "Your production ownership is relevant here; the main questions are duration, robotics transfer, and measurable outcomes.",
          briefing: {
            overall:
              "You have transferable production ownership, and the gaps that matter are duration proof, robotics transfer, and measured outcomes.",
            strongestAngles: [
              "Production ownership at Northwind",
              "Incident response already on the profile",
            ],
            importantGaps: [
              "Robotics domain experience",
              "Measured outcomes for the posted requirements",
            ],
            storyPlan: [
              "Start with the Python duration and a measured production result.",
            ],
          },
          closingNote:
            questions.length === 0
              ? "The plan for this conversation is complete."
              : null,
          assessments: targets.map((target) => {
            const incident = /incident response/i.test(target.text);
            const mission = target.kind === "MISSION";
            const production = /shipping production services/i.test(target.text);
            const coveredByStated =
              stated.length > 0 &&
              target.text
                .toLowerCase()
                .split(/\s+/)
                .filter((token) => token.length >= 5)
                .some((token) => stated.toLowerCase().includes(token));
            return {
              targetKey: target.key,
              strength: incident
                ? "STRONG"
                : coveredByStated
                  ? "STRONG"
                  : mission || production
                    ? "PARTIAL"
                    : "NONE",
              supportingFactIds: incident
                ? ["skill_4"]
                : coveredByStated
                  ? [payload.seekerStatedFacts?.[0]?.id ?? "stated"]
                  : mission
                    ? ["skill_4", "ach_1"]
                    : production
                      ? ["role_1", "ach_1"]
                      : [],
              relevantRoleIds: [],
              explanation: incident
                ? "Your FACT profile explicitly includes incident response."
                : coveredByStated
                  ? "Your added background and interview notes close this gap."
                  : mission
                    ? "Your incident response and reduced billing failures are transferable reliability evidence, although not robotics evidence."
                    : production
                      ? "You owned a production payments service and improved its reliability."
                      : `The FACT profile does not yet establish ${target.text}.`,
              strategyMode:
                mission || production || coveredByStated
                  ? "REFRAME_ADJACENT"
                  : "ACKNOWLEDGE",
              strategy: mission
                ? "Connect Northwind incident ownership and billing reliability to the warehouse-robot reliability mission, while acknowledging the new domain."
                : `Use your Northwind work to address ${target.text} honestly and specifically.`,
            };
          }),
          questions,
        },
      };
    }
    if (request.schemaName === "consultation_polish") {
      const answerText = payload.answer ?? "";
      if (payload.confirmedGap) {
        return {
          data: {
            interviewAnswer:
              "I have not done that work yet. The closest related experience I have is the reliability work I already own, and I would close the gap in this role by ramping on the missing piece in the first weeks.",
            resumeBullet: null,
            strengtheningNote: null,
          },
        };
      }
      if (
        answerText === "copy me exactly" &&
        (payload.qualityFeedback?.length ?? 0) === 0
      ) {
        return {
          data: {
            interviewAnswer: "copy me exactly",
            resumeBullet: "copy me exactly",
            strengtheningNote: null,
          },
        };
      }
      if (
        answerText === "quality retry" &&
        (payload.qualityFeedback?.length ?? 0) === 0
      ) {
        return {
          data: {
            interviewAnswer:
              "I cut failed runs from 8% to 1%. The starting point was 8%.",
            resumeBullet: "I cut failed runs from 8% to 1%.",
            strengtheningNote: null,
          },
        };
      }
      const text =
        answerText
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
          .at(-1) ?? answerText;
      return {
        data: {
          interviewAnswer: `In my words, ${text}`,
          resumeBullet: `Result: ${text}`,
          strengtheningNote: payload.declinedFollowUp
            ? `The ${payload.strengtheningNeeds?.[0] ?? "Action"} would be stronger with more detail about what you personally did.`
            : null,
        },
      };
    }
    const answer = payload.answer ?? "";
    if (/company statement/i.test(answer) && /better question/i.test(answer)) {
      return {
        data: {
          replyType: "feedback",
          revisedQuestion:
            "What concrete operating cadence do you use when a team has to move quickly without losing forecast discipline?",
        },
      };
    }
    const thinInvoice =
      answer ===
      "Invoice generation had failed billing runs at 8%. I led the rewrite. Over two quarters, failed billing runs fell to under 1%.";
    if (thinInvoice) {
      return {
        data: {
          replyType: "answer",
          facts: [],
          story: {
            situation: "Invoice generation had failed billing runs at 8%.",
            task: "I led the rewrite.",
            action: "I led the rewrite.",
            result:
              "Over two quarters, failed billing runs fell to under 1%.",
          },
          demonstratedTargets: [],
          missingStarElements: ["ACTION"],
          followUpQuestion:
            "When you led the rewrite, what did you personally change, what options did you weigh, and who did you work with?",
          gapDecision: "incomplete",
        },
      };
    }
    if (/I have never /i.test(answer) || /I do not have /i.test(answer)) {
      return {
        data: {
          replyType: "answer",
          facts: [],
          story: null,
          demonstratedTargets: [],
          missingStarElements: [],
          followUpQuestion: null,
          gapDecision: "no_evidence",
        },
      };
    }
    const complete = /cut failed jobs by 40%/i.test(answer);
    const completeSpan = "I used Python for 5 years and cut failed jobs by 40%.";
    return {
      data: {
        replyType: "answer",
        facts: complete ? [{ text: completeSpan }, { text: "Invented $9M metric" }] : [],
        story: complete
          ? {
              situation: completeSpan,
              task: completeSpan,
              action: completeSpan,
              result: completeSpan,
            }
          : {
              situation: "I have used Python on backend services.",
              task: null,
              action: null,
              result: null,
            },
        demonstratedTargets: complete
          ? [
              {
                targetKey: payload.target?.key ?? "required:0",
                explanation: "The answer directly describes Python duration and a measured production result.",
              },
              {
                targetKey:
                  payload.availableTargets?.find((target) =>
                    /incident response/i.test(target.text),
                  )?.key ?? "competency:incident",
                explanation: "Reducing failed production jobs is semantically relevant to reliability work.",
              },
            ]
          : [],
        missingStarElements: complete ? [] : ["TASK", "ACTION", "RESULT", "METRIC"],
        followUpQuestion: complete
          ? null
          : "On that Python backend work, what changed because of your contribution, ideally a concrete result or metric?",
        gapDecision: complete ? "evidence" : "incomplete",
      },
    };
  });
}

beforeEach(() => {
  generateStructured.mockReset();
  isConsultationAiConfigured.mockReturnValue(true);
  installConsultationModelFixture();
});

describe("consultation evidence and questions", () => {
  it("downgrades assessments that cite missing or INFERENCE items", () => {
    const { profile, targets } = sample();
    const python = targets.find((item) => item.text === "5 years of Python");
    expect(python).toBeTruthy();
    const inferenceProfile = parseCandidateProfile({
      ...profile,
      positioning: {
        id: "id_positioning",
        kind: "INFERENCE",
        text: "5 years of Python",
        provenance: [],
      },
      compensation: {
        id: "comp_1",
        kind: "FACT",
        text: "5 years of Python",
        provenance: [{ sourceId: "src_resume_alex_chen" }],
      },
    });
    const items = profileEvidenceItems(inferenceProfile);
    expect(items.find((item) => item.id === "id_positioning")?.kind).toBe("INFERENCE");
    expect(items.some((item) => item.id === "comp_1")).toBe(false);
    const [assessed] = verifyModelAssessments({
      targets: [python!],
      profileItems: items,
      asOf: new Date("2026-09-23T00:00:00.000Z"),
      assessments: [{
        targetKey: python!.key,
        strength: "STRONG",
        supportingFactIds: ["id_positioning", "does_not_exist"],
        relevantRoleIds: [],
        explanation: "The profile appears to state Python duration.",
        strategyMode: "PROVE_WITH_STORY",
        strategy: "Ask Alex to establish the actual Python timeline.",
      }],
    });
    expect(assessed?.strength).toBe("NONE");
    expect(assessed?.supportingFactIds).toEqual([]);
    expect(assessed?.verification.invalidSupportingFactIds).toEqual([
      "id_positioning",
      "does_not_exist",
    ]);
    expect(assessed?.verification.downgradeReasons.length).toBeGreaterThan(0);
  });

  it("accepts semantic reliability evidence for the fixture mission", () => {
    const { profile, targets } = sample();
    const assessments = verifyModelAssessments({
      targets,
      profileItems: profileEvidenceItems(profile),
      assessments: targets.map((target) => ({
        targetKey: target.key,
        strength:
          target.kind === "MISSION"
            ? ("PARTIAL" as const)
            : target.text === "Leads incident response"
              ? ("STRONG" as const)
              : ("NONE" as const),
        supportingFactIds:
          target.kind === "MISSION" || target.text === "Leads incident response"
            ? ["skill_4"]
            : [],
        relevantRoleIds: [],
        explanation:
          target.kind === "MISSION"
            ? "Incident response is transferable reliability work, although it does not establish robotics experience."
            : `Assessment for ${target.text}.`,
        strategyMode: "ACKNOWLEDGE" as const,
        strategy: `Address ${target.text} honestly.`,
      })),
      asOf: new Date("2026-09-23T00:00:00.000Z"),
    });
    const mission = assessments.find((item) => item.kind === "MISSION");
    expect(mission?.text).toBe("make warehouse robots reliable");
    expect(mission?.strength).toBe("PARTIAL");
    expect(mission?.supportingFactIds).toEqual(["skill_4"]);
    expect(mission?.explanation).toContain("transferable reliability work");
  });

  it("prioritizes model questions and never re-asks a covered gap", () => {
    const { profile, targets } = sample();
    const assessments = verifyModelAssessments({
      targets,
      profileItems: profileEvidenceItems(profile),
      assessments: targets.map((target) => ({
        targetKey: target.key,
        strength: "NONE" as const,
        supportingFactIds: [],
        relevantRoleIds: [],
        explanation: `No FACT evidence establishes ${target.text}.`,
        strategyMode: "ACKNOWLEDGE" as const,
        strategy: `Address ${target.text} honestly.`,
      })),
      asOf: new Date("2026-09-23T00:00:00.000Z"),
    });
    const hiringTeam = [{ id: "hm", name: "Hiring Manager" }];
    const modelQuestions = assessments.map((assessment) => ({
      targetKey: assessment.key,
      text: `In your Northwind work, what specific experience connects to ${assessment.text}, and what changed?`,
      requirementInterpretation: null,
      hiringTeamRoleId: "hm",
      whoCaresNote: "The Hiring Manager needs concrete evidence of the outcome.",
    }));
    modelQuestions.push({
      targetKey: "chronology",
      text: "Starting with Northwind, walk me through your accomplishments and reasons for each move.",
      requirementInterpretation: null,
      hiringTeamRoleId: "hm",
      whoCaresNote: "The Hiring Manager needs to understand the progression of your work.",
    });
    const round = planQuestionRound({
      assessments,
      modelQuestions,
      hiringTeam,
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: seniorityWarrantsChronology({
        seniority: "Senior",
        title: "Senior Product Engineer",
      }),
      chronologyAsked: false,
    });
    expect(round.questions.length).toBeGreaterThan(0);
    expect(round.questions.length).toBeLessThanOrEqual(consultationConfig.roundSize);
    expect(round.questions[0]?.targetKey.startsWith("required:")).toBe(true);

    const incident = assessments.find((item) =>
      /incident/i.test(item.text),
    );
    expect(incident).toBeTruthy();
    const focused = planQuestionRound({
      assessments,
      modelQuestions,
      hiringTeam,
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
      focusTargetKey: incident!.key,
    });
    expect(focused.questions[0]?.targetKey).toBe(incident!.key);
    expect(
      matchConsultationFocus({
        focusNote: "The hiring manager will focus on incident leadership.",
        targets: assessments.map((item) => ({ key: item.key, text: item.text })),
      }),
    ).toBe(incident!.key);
    const covered = round.questions[0]!.targetKey;
    const coveredText = assessments.find((item) => item.key === covered)!.text;
    const next = planQuestionRound({
      assessments,
      modelQuestions,
      hiringTeam,
      askedKeys: new Set(),
      skippedKeys: new Set([covered]),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(next.questions.some((question) => question.targetKey === covered)).toBe(false);
    expect(
      next.questions.some(
        (question) =>
          assessments.find((item) => item.key === question.targetKey)?.text ===
          coveredText,
      ),
    ).toBe(false);
  });

  it("uses Harper's question as written and never pastes requirement text", () => {
    const gapText = "9 years of security sales";
    expect(questionTextForGap({ key: "required:security-sales", text: gapText })).toBe(
      "",
    );
    expect(questionTextForGap({ key: "required:security-sales", text: gapText }, "  ")).toBe(
      "",
    );
    const harperQuestion =
      "Your Fabrikam continuity work is the closest on the profile. Have you also sold security or brand-protection services, and if so in which roles?";
    expect(
      questionTextForGap(
        { key: "required:security-sales", text: gapText },
        harperQuestion,
      ),
    ).toBe(harperQuestion);
    const hiringTeam = [{ id: "hm", name: "Hiring manager" }];
    const assessment = {
      key: "required:security-sales",
      kind: "REQUIRED" as const,
      text: gapText,
      strength: "NONE" as const,
      supportingFactIds: [],
      strategy: "ACKNOWLEDGE" as const,
      explanation: "No evidence yet.",
      strategyText: "Ask for a concrete sales motion.",
      verification: {
        originalStrength: "NONE" as const,
        invalidSupportingFactIds: [],
        invalidRoleIds: [],
        downgradeReasons: [],
      },
      experienceCalculation: null,
    };
    const withoutModel = planQuestionRound({
      assessments: [assessment],
      modelQuestions: [],
      hiringTeam,
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(withoutModel.questions).toHaveLength(0);
    expect(withoutModel.dropped[0]?.reason).toMatch(/did not return a question/i);
    const withModel = planQuestionRound({
      assessments: [assessment],
      modelQuestions: [
        {
          targetKey: "required:security-sales",
          text: harperQuestion,
          requirementInterpretation: "Security or brand-protection sales motion.",
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring manager needs a concrete sales motion, not the posting line.",
        },
      ],
      hiringTeam,
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(withModel.questions).toHaveLength(1);
    expect(withModel.questions[0]!.text).toBe(harperQuestion);
    expect(withModel.questions[0]!.text).not.toContain(gapText);
    expect(withModel.questions[0]!.text).not.toMatch(/does not see/i);
  });

  it("never treats a mission statement or recruiting pitch as an experience gap", () => {
    const cscMission =
      "Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.";
    expect(looksLikeCompanyPitch(cscMission)).toBe(true);
    expect(
      isCompanyMissionOrTagline({
        key: "required:0",
        kind: "REQUIRED",
        text: cscMission,
      }),
    ).toBe(true);
    expect(
      isCompanyMissionOrTagline({
        key: "mission:csc",
        kind: "MISSION",
        text: cscMission,
      }),
    ).toBe(true);
    expect(
      isCompanyMissionOrTagline({
        key: "why-this-company",
        kind: "MISSION",
        text: consultationConversationCopy.whyThisCompanyTarget,
      }),
    ).toBe(false);
    expect(
      looksLikeCompanyPitch("9 years of enterprise security sales leadership"),
    ).toBe(false);

    const emptyVerification = {
      originalStrength: "NONE" as const,
      invalidSupportingFactIds: [],
      invalidRoleIds: [],
      downgradeReasons: [],
    };
    const missionAssessment = {
      key: "mission:csc",
      kind: "MISSION" as const,
      text: cscMission,
      strength: "NONE" as const,
      supportingFactIds: [],
      strategy: "ACKNOWLEDGE" as const,
      explanation: "Company purpose, not a skill.",
      strategyText: "Do not ask for experience with the mission.",
      verification: emptyVerification,
      experienceCalculation: null,
    };
    const pitchAsRequired = {
      ...missionAssessment,
      key: "required:pitch",
      kind: "REQUIRED" as const,
    };
    const skillGap = {
      key: "required:channel",
      kind: "REQUIRED" as const,
      text: "Build and lead a partner and channel motion",
      strength: "NONE" as const,
      supportingFactIds: [],
      strategy: "PROVE_WITH_STORY" as const,
      explanation: "No channel motion on the profile.",
      strategyText: "Ask about partner-led selling.",
      verification: emptyVerification,
      experienceCalculation: null,
    };
    const hiringTeam = [{ id: "hm", name: "Hiring Manager" }];
    const round = planQuestionRound({
      assessments: [missionAssessment, pitchAsRequired, skillGap],
      modelQuestions: [
        {
          targetKey: "mission:csc",
          text: `Do you have experience with ${cscMission} that Harper does not see?`,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Should never be asked.",
        },
        {
          targetKey: "required:pitch",
          text: `Do you have experience with ${cscMission} that Harper does not see?`,
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "Should never be asked.",
        },
        {
          targetKey: "required:channel",
          text: "At Contoso you opened new logos yourself. Have you also built or run a partner or channel motion, or should we treat that as new for this CSC role?",
          requirementInterpretation: "Partner and channel leadership, not direct-only selling.",
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs a partner-motion story.",
        },
      ],
      hiringTeam,
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(round.questions.map((question) => question.targetKey)).toEqual([
      "required:channel",
    ]);
    expect(round.questions[0]!.text).not.toContain(cscMission);
    expect(round.questions[0]!.text).not.toMatch(/experience with Join us/i);
    expect(
      gapsAreCovered(
        [missionAssessment, pitchAsRequired, { ...skillGap, strength: "STRONG" }],
        new Set(),
      ),
    ).toBe(true);
  });

  it("writes three CSC gap questions in Harper's words without posting text", () => {
    const cscMission =
      "Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.";
    const emptyVerification = {
      originalStrength: "NONE" as const,
      invalidSupportingFactIds: [],
      invalidRoleIds: [],
      downgradeReasons: [],
    };
    const channelQuestion =
      "At Contoso you opened new logos yourself. Have you also built or run a partner or channel motion, or should we treat that as new for this CSC role?";
    const domainQuestion =
      "You sold business continuity and compliance at Fabrikam. What is the closest you have come to selling brand protection, domain, or digital-risk services?";
    const benchQuestion =
      "You built a front-line manager bench at Northwind and ran a weekly MEDDIC forecast. Walk me through how you hired or developed those managers, and what changed in the team's execution afterward?";
    const assessments = [
      {
        key: "mission:csc",
        kind: "MISSION" as const,
        text: cscMission,
        strength: "NONE" as const,
        supportingFactIds: [],
        strategy: "ACKNOWLEDGE" as const,
        explanation: "Company purpose.",
        strategyText: "Not an experience gap.",
        verification: emptyVerification,
        experienceCalculation: null,
      },
      {
        key: "required:0",
        kind: "REQUIRED" as const,
        text: cscMission,
        strength: "NONE" as const,
        supportingFactIds: [],
        strategy: "ACKNOWLEDGE" as const,
        explanation: "Recruiting pitch stored as a requirement.",
        strategyText: "Not an experience gap.",
        verification: emptyVerification,
        experienceCalculation: null,
      },
      {
        key: "required:channel",
        kind: "REQUIRED" as const,
        text: "Lead and grow a channel and partner sales motion",
        strength: "NONE" as const,
        supportingFactIds: [],
        strategy: "PROVE_WITH_STORY" as const,
        explanation: "Profile shows direct enterprise selling.",
        strategyText: "Ask about partner-led selling.",
        verification: emptyVerification,
        experienceCalculation: null,
      },
      {
        key: "required:domain",
        kind: "REQUIRED" as const,
        text: "Sell digital brand protection and domain services to enterprise buyers",
        strength: "NONE" as const,
        supportingFactIds: [],
        strategy: "REFRAME_ADJACENT" as const,
        explanation: "Closest evidence is Fabrikam continuity sales.",
        strategyText: "Ask for the closest adjacent motion.",
        verification: emptyVerification,
        experienceCalculation: null,
      },
      {
        key: "competency:bench",
        kind: "COMPETENCY" as const,
        text: "Build a front-line sales manager bench and a disciplined forecast cadence",
        strength: "PARTIAL" as const,
        supportingFactIds: ["ach_meddic"],
        strategy: "PROVE_WITH_STORY" as const,
        explanation: "Northwind has a bench and MEDDIC, without the hiring story.",
        strategyText: "Ask how the bench was built and what changed.",
        verification: {
          ...emptyVerification,
          originalStrength: "PARTIAL" as const,
        },
        experienceCalculation: null,
      },
    ];
    const round = planQuestionRound({
      assessments,
      modelQuestions: [
        {
          targetKey: "required:channel",
          text: channelQuestion,
          requirementInterpretation: "Partner and channel leadership.",
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs a partner-motion story.",
        },
        {
          targetKey: "required:domain",
          text: domainQuestion,
          requirementInterpretation: "Brand-protection or digital-risk selling.",
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs the closest domain-adjacent sale.",
        },
        {
          targetKey: "competency:bench",
          text: benchQuestion,
          requirementInterpretation: "How the manager bench was built and what changed.",
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs the people-development story behind the forecast.",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(round.questions.map((question) => question.text)).toEqual([
      channelQuestion,
      domainQuestion,
      benchQuestion,
    ]);
    for (const question of round.questions) {
      expect(question.text).not.toContain(cscMission);
      expect(question.text).not.toMatch(/Join us to help protect/i);
      expect(question.text).not.toMatch(/does not see/i);
      expect(question.text).not.toMatch(/^Do you have experience with /i);
    }
  });

  it("drops unsupported extraction and keeps semantic links pending confirmation", () => {
    const { profile, targets } = sample();
    const before = JSON.stringify(profile);
    const answer = "I used Python for 5 years and cut failed jobs by 40%.";
    const result = proposalsFromExtraction({
      answer,
      turnId: "turn_answer_1",
      extracted: {
        replyType: "answer" as const,
        revisedQuestion: null,
        coaching: null,
        facts: [
          { text: answer },
          { text: "The team created a nine million dollar metric last year." },
        ],
        story: {
          situation: answer,
          task: answer,
          action: answer,
          result: answer,
        },
        demonstratedTargets: [
          {
            targetKey: targets.find((item) => item.text === "Leads incident response")!.key,
            explanation: "Reducing failed jobs is semantically relevant to reliability.",
          },
        ],
        missingStarElements: [],
        followUpQuestion: null,
        gapDecision: "evidence",
      },
      targets,
    });
    expect(JSON.stringify(profile)).toBe(before);
    expect(result.dropped).toContain("fact:1");
    expect(result.proposals.every((proposal) => groundedInAnswer(proposal.text, answer))).toBe(
      true,
    );
    const story = result.proposals.find((proposal) => proposal.kind === "STORY");
    expect(story?.story?.competencyLinks[0]?.text).toBe("Leads incident response");
    const why = proposalsFromExtraction({
      answer,
      turnId: "turn_why",
      extracted: {
        replyType: "answer" as const,
        revisedQuestion: null,
        coaching: null,
        facts: [],
        story: {
          situation: answer,
          task: answer,
          action: answer,
          result: answer,
        },
        demonstratedTargets: [
          {
            targetKey: "why-this-company",
            explanation: "The go-to-market story shows motivation.",
          },
        ],
        missingStarElements: [],
        followUpQuestion: null,
        gapDecision: "evidence",
      },
      targets: [
        ...targets,
        {
          key: "why-this-company",
          kind: "MISSION",
          text: "Why you want to work at this company",
        },
      ],
    });
    expect(why.dropped).toContain("target:why-this-company:motivation");

    const paraphrased = proposalsFromExtraction({
      answer,
      turnId: "turn_paraphrase",
      extracted: {
        replyType: "answer" as const,
        revisedQuestion: null,
        coaching: null,
        facts: [
          {
            text: "I spent five years using Python and reduced unsuccessful jobs by 40 percent.",
          },
        ],
        story: {
          situation:
            "Python work over five years needed more reliable job processing.",
          task: "I needed to reduce unsuccessful jobs.",
          action: "I used Python to stabilize the job pipeline.",
          result: "Unsuccessful jobs fell by 40 percent.",
        },
        demonstratedTargets: [],
        missingStarElements: [],
        followUpQuestion: null,
        gapDecision: "evidence",
      },
      targets,
    });
    const modelMarkedActionMissing = proposalsFromExtraction({
      answer,
      turnId: "turn_action_present",
      extracted: {
        replyType: "answer" as const,
        revisedQuestion: null,
        coaching: null,
        facts: [],
        story: {
          situation:
            "Python work over five years needed more reliable job processing.",
          task: "I needed to reduce unsuccessful jobs.",
          action: "I used Python to stabilize the job pipeline.",
          result: "Unsuccessful jobs fell by 40 percent.",
        },
        demonstratedTargets: [],
        missingStarElements: ["ACTION"],
        followUpQuestion: "What did you personally do?",
        gapDecision: "incomplete",
      },
      targets,
    });
    expect(
      modelMarkedActionMissing.proposals.some((proposal) => proposal.kind === "STORY"),
    ).toBe(true);
    expect(modelMarkedActionMissing.missingStarElements).not.toContain("ACTION");

    expect(paraphrased.proposals.some((proposal) => proposal.kind === "STORY")).toBe(
      true,
    );
    expect(paraphrased.dropped).not.toContain("fact:0");

    const changedNumber = proposalsFromExtraction({
      answer,
      turnId: "turn_changed_number",
      extracted: {
        replyType: "answer" as const,
        revisedQuestion: null,
        coaching: null,
        facts: [],
        story: {
          situation: answer,
          task: answer,
          action: answer,
          result: "Unsuccessful jobs fell by 60 percent.",
        },
        demonstratedTargets: [],
        missingStarElements: [],
        followUpQuestion: null,
        gapDecision: "evidence",
      },
      targets,
    });
    expect(changedNumber.dropped).toContain("story:result");
    expect(changedNumber.proposals.find((proposal) => proposal.kind === "STORY")).toBeUndefined();
    expect(changedNumber.missingStarElements).toContain("RESULT");
    expect(changedNumber.followUpQuestion).toMatch(/result/i);
    expect(why.proposals.find((proposal) => proposal.kind === "STORY")?.story?.competencyLinks).toEqual(
      [],
    );

    const confirmed = appendConfirmedFact(profile, {
      id: "consult_turn_answer_1_fact",
      text: answer,
      turnId: "turn_answer_1",
    });
    const written = confirmed.experience
      .flatMap((role) => role.achievements)
      .find((item) => item.id === "consult_turn_answer_1_fact");
    expect(written?.kind).toBe("FACT");
    expect(written?.provenance).toEqual([{ sourceId: "turn_answer_1" }]);
  });

  it("rejects fragment facts and does not show them for confirmation", () => {
    const { targets } = sample();
    const answer =
      "I used Python for 5 years and cut failed jobs by 40%. Python. 5 years.";
    expect(isCompleteFactStatement("Python")).toBe(false);
    expect(isCompleteFactStatement("5 years")).toBe(false);
    expect(
      isCompleteFactStatement("I used Python for 5 years and cut failed jobs by 40%."),
    ).toBe(true);
    expect(
      isCompleteFactStatement("The team created a nine million dollar metric last year."),
    ).toBe(true);
    expect(
      isCompleteFactStatement("I automated nightly jobs that cut failed billing runs."),
    ).toBe(true);
    expect(
      isCompleteFactStatement(
        "Grew Harborline's annual contract value from $9 million to $21 million over three years.",
      ),
    ).toBe(true);
    const result = proposalsFromExtraction({
      answer,
      turnId: "turn_fragment",
      extracted: {
        replyType: "answer" as const,
        revisedQuestion: null,
        coaching: null,
        facts: [
          { text: "Python" },
          { text: "5 years" },
          { text: "I used Python for 5 years and cut failed jobs by 40%." },
        ],
        story: null,
        demonstratedTargets: [],
        missingStarElements: [],
        followUpQuestion: null,
        gapDecision: "evidence",
      },
      targets,
    });
    expect(result.dropped).toEqual(
      expect.arrayContaining(["fact:0:fragment", "fact:1:fragment"]),
    );
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.text).toContain("I used Python");
  });

  it("calculates years without double-counting overlap and asks when dates are missing", () => {
    const calculated = calculateExperienceYears({
      requiredYears: 5,
      roleIds: ["a", "b"],
      asOf: new Date("2026-09-23T00:00:00.000Z"),
      profileItems: [
        { id: "a", kind: "FACT", text: "Role A", itemType: "EXPERIENCE", startDate: "2020-01", endDate: "2023-01" },
        { id: "b", kind: "FACT", text: "Role B", itemType: "EXPERIENCE", startDate: "2022-01", endDate: "2024-12" },
      ],
    });
    expect(calculated.totalMonths).toBe(60);
    expect(calculated.totalYears).toBe(5);
    expect(calculated.missingDateRoleIds).toEqual([]);

    const missing = calculateExperienceYears({
      requiredYears: 5,
      roleIds: ["a"],
      asOf: new Date("2026-09-23T00:00:00.000Z"),
      profileItems: [
        { id: "a", kind: "FACT", text: "Role A", itemType: "EXPERIENCE", startDate: null, endDate: null },
      ],
    });
    expect(missing.totalMonths).toBe(0);
    expect(missing.missingDateRoleIds).toEqual(["a"]);
    const yearOnly = calculateExperienceYears({
      requiredYears: 5,
      roleIds: ["a"],
      asOf: new Date("2026-09-23T00:00:00.000Z"),
      profileItems: [
        { id: "a", kind: "FACT", text: "Role A", itemType: "EXPERIENCE", startDate: "2020", endDate: "2024" },
      ],
    });
    expect(yearOnly.totalMonths).toBe(38);
    expect(yearOnly.maximumMonths).toBe(60);
    expect(yearOnly.missingDateRoleIds).toEqual([]);
    const twoThousand = calculateExperienceYears({
      requiredYears: 3,
      roleIds: ["a"],
      asOf: new Date("2026-09-25T00:00:00.000Z"),
      profileItems: [
        { id: "a", kind: "FACT", text: "Role A", itemType: "EXPERIENCE", startDate: "2002", endDate: "2006" },
      ],
    });
    expect(twoThousand.totalMonths).toBe(38);
    expect(twoThousand.totalYears).toBe(3.2);
    expect(twoThousand.maximumYears).toBe(5);

    const target = { key: "required:python", kind: "REQUIRED" as const, text: "5 years of Python" };
    const [assessment] = verifyModelAssessments({
      targets: [target],
      profileItems: [
        { id: "python", kind: "FACT", text: "Python", itemType: "ITEM" },
        { id: "a", kind: "FACT", text: "Backend Engineer", itemType: "EXPERIENCE", startDate: null, endDate: null },
      ],
      assessments: [{
        targetKey: target.key,
        strength: "STRONG",
        supportingFactIds: ["python"],
        relevantRoleIds: ["a"],
        explanation: "The profile states Python, but the role dates are incomplete.",
        strategyMode: "PROVE_WITH_STORY",
        strategy: "Establish the exact Python timeline and one production example.",
      }],
      asOf: new Date("2026-09-23T00:00:00.000Z"),
    });
    expect(assessment?.experienceCalculation?.totalMonths).toBe(0);
    const withoutDates = planQuestionRound({
      assessments: [assessment!],
      modelQuestions: [{
        targetKey: target.key,
        text: "Tell me more about how you used Python in that backend engineering role.",
        requirementInterpretation: null,
        hiringTeamRoleId: "hm",
        whoCaresNote: "The Hiring Manager needs to understand your Python experience.",
      }],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(withoutDates.questions[0]?.text).toContain("Python");
    expect(
      planQuestionRound({
        assessments: [assessment!],
        modelQuestions: [{
          targetKey: target.key,
          text: "What month and year did you start and stop using Python in that role?",
          requirementInterpretation: null,
          hiringTeamRoleId: "hm",
          whoCaresNote: "The Hiring Manager needs to verify the duration of your Python experience.",
        }],
        hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
        askedKeys: new Set(),
        skippedKeys: new Set(),
        includeChronology: false,
        chronologyAsked: false,
      }).questions[0]?.text,
    ).toContain("month and year");
    const missingQuestion = planQuestionRound({
      assessments: [{
        ...assessment!,
        key: "required:0",
        text: "10+ years of progressive leadership",
      }],
      modelQuestions: [],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(missingQuestion.questions).toEqual([]);
    expect(missingQuestion.dropped[0]?.targetKey).toBe("required:0");
    expect(missingQuestion.dropped[0]?.reason).toMatch(/did not return a question/i);
  });

  it("uses a model-written follow-up for the missing Result and metric", async () => {
    const extraction = await generateStructured({
      schemaName: "consultation_extraction",
      messages: [{ content: JSON.stringify({ answer: "I have used Python on backend services." }) }],
    });
    expect(extraction.data.missingStarElements).toEqual(
      expect.arrayContaining(["RESULT", "METRIC"]),
    );
    expect(extraction.data.followUpQuestion).toContain("concrete result or metric");
  });

  it("covers skip, pause, resume, and done", () => {
    expect(nextConsultationStatus("IN_PROGRESS", "pause")).toBe("PAUSED");
    expect(nextConsultationStatus("PAUSED", "resume")).toBe("IN_PROGRESS");
    expect(nextConsultationStatus("SKIPPED", "resume")).toBe("IN_PROGRESS");
    expect(nextConsultationStatus("IN_PROGRESS", "skip")).toBe("SKIPPED");
    expect(nextConsultationStatus("IN_PROGRESS", "done")).toBe("DONE");
    expect(nextConsultationStatus("PAUSED", "done")).toBe("DONE");
    expect(() => nextConsultationStatus("DONE", "pause")).toThrow(/already done/);
    expect(() => nextConsultationStatus("SKIPPED", "done")).toThrow(/skip/);
    expect(() => nextConsultationStatus("PAUSED", "pause")).toThrow(/in-progress/);
    const { targets } = sample();
    const skipped = new Set(
      targets.filter((item) => item.kind !== "PREFERRED").map((item) => item.key),
    );
    const assessments = verifyModelAssessments({
      targets,
      profileItems: profileEvidenceItems(sample().profile),
      assessments: targets.map((target) => ({
        targetKey: target.key,
        strength: "NONE" as const,
        supportingFactIds: [],
        relevantRoleIds: [],
        explanation: `No evidence for ${target.text}.`,
        strategyMode: "ACKNOWLEDGE" as const,
        strategy: `Address ${target.text} honestly.`,
      })),
      asOf: new Date("2026-09-23T00:00:00.000Z"),
    });
    expect(gapsAreCovered(assessments, skipped)).toBe(true);
    expect(gapsAreCovered(assessments, new Set())).toBe(false);
  });

  it("names the consultant from product configuration and keeps prompt content honest", () => {
    expect(consultationConfig.displayName).toBe("Harper");
    expect(CONSULTATION_PROMPT_VERSION).toBe("18");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("You coach; you do not interrogate");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("askedQuestions");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "Never mention research status",
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("focusTargetKey");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "Never paste requirement, responsibility, or posting text",
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "Mission statements, company taglines, and recruiting pitches are not gaps",
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "there are never more than 10",
    );
    const extractFormat = buildOpenAiJsonSchemaFormat(
      "consultation_extract",
      consultationExtractSchema,
    );
    expect(extractFormat.schema.type).toBe("object");
    expect(extractFormat.schema.anyOf).toBeUndefined();
    const workspace = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(workspace).toContain("consultationConfig.displayName");
    expect(workspace).not.toContain("Avery");
    expect(workspace).not.toContain("Save answer");
    expect(workspace).toContain("consultationConversationCopy.generationFailed");
    expect(thread).toContain("consultationConversationCopy.approve");
    expect(thread).toContain("consultationConversationCopy.thinking");
    expect(workspace).not.toContain("supportingFactIds).join");
  });

  it("merges posting requirements and scorecard items that mean the same thing", () => {
    const targets = evidenceTargets({
      requiredItems: ["5 years of enterprise sales leadership"],
      preferredItems: [],
      scorecard: {
        mission: null,
        outcomes: [
          {
            id: "outcome_sales",
            text: "Enterprise sales leadership for five years",
            inferred: false,
          },
        ],
        competencies: [],
      },
    });
    expect(targets).toHaveLength(1);
    expect(targets[0]?.kind).toBe("REQUIRED");
    expect(targets[0]?.text).toBe("5 years of enterprise sales leadership");
  });

  it("shows evidence in plain language and never treats internal ids as labels", () => {
    expect(looksLikeInternalId("direction_function_1")).toBe(true);
    expect(looksLikeInternalId("role_5")).toBe(true);
    const items = profileEvidenceItems(fixtureAlexChenProfile());
    const role = items.find((item) => item.id === "role_1");
    expect(role).toBeTruthy();
    expect(profileItemDisplayLabel(role!)).toMatch(/ at /);
    expect(profileItemDisplayLabel(role!)).not.toBe("role_1");
    expect(resolveEvidenceLabels(["role_1"], items)[0]?.label).not.toMatch(
      /role_1/,
    );
  });

  it("contains no deterministic consultation narrative generators", () => {
    const questions = readFileSync("src/lib/consultation/questions.ts", "utf8");
    const assessment = readFileSync("src/lib/consultation/assess.ts", "utf8");
    const writeBack = readFileSync("src/lib/consultation/write-back.ts", "utf8");
    expect(questions).not.toMatch(/Tell a story|Walk me through|concrete result/i);
    expect(questions).not.toMatch(/Do you have experience with/i);
    expect(questions).not.toContain("{requirement}");
    expect(assessment).not.toMatch(/Relevant evidence|No direct evidence|Strong match/i);
    expect(writeBack).not.toMatch(/split\([^)]*sentence|keyword/i);
    const copy = readFileSync("src/lib/product-config/consultation.ts", "utf8");
    expect(copy).not.toContain("unseenExperienceGapQuestion");
    expect(copy).not.toContain("unseenExperienceFollowOn");
    expect(copy).not.toContain("{requirement}");
  });

  it("does not use grounded-statement checks to reject generated output", () => {
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const ai = readFileSync("src/lib/consultation/ai.ts", "utf8");
    const prompt = readFileSync("src/lib/consultation/prompt.ts", "utf8");
    const content = readFileSync("src/lib/prompt-content/consultation.ts", "utf8");
    expect(service).not.toContain("validateGroundedStatement");
    expect(service).not.toContain("logQualityRejection");
    expect(service).not.toContain("groundStatementWithModel");
    expect(ai).not.toContain("groundStatementWithModel");
    expect(prompt).not.toContain("STATEMENT_GROUNDING");
    expect(content).not.toContain("CONSULTATION_STATEMENT_GROUNDING");
    expect(readFileSync("src/lib/consultation/contract.ts", "utf8")).not.toContain(
      "claims",
    );
    expect(
      validateGroundedStatement({
        statement: {
          text: "I increased revenue by $9M.",
          claims: [
            {
              text: "I increased revenue by $9M.",
              supports: [{ sourceId: "answer", quote: "I improved the service." }],
            },
          ],
        },
        sources: [{ id: "answer", text: "I improved the service." }],
        requireSentenceClaims: true,
      }),
    ).toEqual(expect.any(Array));
  });

  it("translates a vague requirement into a concrete, role-grounded question", () => {
    const assessment = {
      key: "required:strategy",
      kind: "REQUIRED" as const,
      text: "Strong strategic thinking and problem-solving skills with the ability to drive results in a fast-paced, dynamic environment",
      strength: "NONE" as const,
      supportingFactIds: [],
      strategy: "ACKNOWLEDGE" as const,
      explanation: "No evidence yet.",
      strategyText: "Ask for a concrete prioritization decision.",
      verification: {
        originalStrength: "NONE" as const,
        invalidSupportingFactIds: [],
        invalidRoleIds: [],
        downgradeReasons: [],
      },
      experienceCalculation: null,
    };
    const [question] = planQuestionRound({
      assessments: [assessment],
      modelQuestions: [
        {
          targetKey: assessment.key,
          text: "At Northwind, how did you decide which enterprise account to pursue when several deals competed for your team's time?",
          requirementInterpretation:
            "Prioritize scarce sales capacity and explain the commercial tradeoff.",
          hiringTeamRoleId: "sales-vp",
          whoCaresNote:
            "The VP of Sales needs to hear how you make defensible account-priority decisions.",
        },
      ],
      hiringTeam: [{ id: "sales-vp", name: "VP of Sales" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    }).questions;
    expect(question?.text).not.toContain(assessment.text);
    expect(question?.requirementInterpretation).toContain("Prioritize");
    expect(question?.whoCaresNote).toContain("VP of Sales");
    expect(
      validateRepetitionAndMetaLanguage({
        text: "This is a fast-paced, results-driven role in a dynamic environment with a proven track record.",
        field: "briefing.overall",
      }),
    ).toEqual([]);
  });

  it("never saves a duplicate or rephrased question and asks chronology at most once", () => {
    const asked = [
      {
        text: "At Northwind, how did you decide which enterprise account to pursue when several deals competed for your team's time?",
        answered: true,
        targetKey: "required:strategy",
        followUp: false,
      },
      {
        text: "Starting with Northwind Analytics, walk me through your key accomplishments there and why you moved on from each role.",
        answered: false,
        targetKey: "chronology",
        followUp: false,
      },
    ];
    expect(
      questionNearDuplicate(
        asked[0]!.text,
        "When several Northwind deals competed for your team's time, how did you decide which enterprise account to pursue?",
      ),
    ).toBe(true);
    expect(questionDuplicatesAsked(asked[0]!.text, asked)).toBe(true);
    const assessment = {
      key: "required:strategy",
      kind: "REQUIRED" as const,
      text: "Strong strategic thinking",
      strength: "NONE" as const,
      supportingFactIds: [],
      strategy: "ACKNOWLEDGE" as const,
      explanation: "No evidence yet.",
      strategyText: "Ask for a concrete decision.",
      verification: {
        originalStrength: "NONE" as const,
        invalidSupportingFactIds: [],
        invalidRoleIds: [],
        downgradeReasons: [],
      },
      experienceCalculation: null,
    };
    const nextGap = {
      ...assessment,
      key: "required:other",
      text: "Own a weekly forecast cadence",
    };
    const round = planQuestionRound({
      assessments: [assessment, nextGap],
      modelQuestions: [
        {
          targetKey: nextGap.key,
          text: "At Northwind, how did you decide which enterprise account to pursue when several deals competed for your team's time?",
          requirementInterpretation: null,
          hiringTeamRoleId: "sales-vp",
          whoCaresNote: "The VP of Sales needs a forecast example.",
        },
        {
          targetKey: "chronology",
          text: "Starting with Northwind Analytics, walk me through your key accomplishments there and why you moved on from each role.",
          requirementInterpretation: null,
          hiringTeamRoleId: "sales-vp",
          whoCaresNote: "The VP needs the career walk-through.",
        },
      ],
      hiringTeam: [{ id: "sales-vp", name: "VP of Sales" }],
      askedKeys: new Set(["required:strategy"]),
      skippedKeys: new Set(),
      includeChronology: true,
      chronologyAsked: false,
      askedQuestions: asked,
    });
    expect(round.questions.some((question) => question.targetKey === "chronology")).toBe(
      false,
    );
    expect(
      round.questions.some((question) =>
        questionNearDuplicate(question.text, asked[0]!.text),
      ),
    ).toBe(false);
  });

  it("caps Harper questions at ten for the whole application", () => {
    const askedQuestions = Array.from({ length: 10 }, (_, index) => ({
      text: `Asked question number ${index + 1} about a distinct gap in this application.`,
      answered: index < 8,
      targetKey: `required:${index}`,
      followUp: index === 9,
    }));
    const assessments = [
      {
        key: "required:11",
        kind: "REQUIRED" as const,
        text: "A new remaining gap after ten questions",
        strength: "NONE" as const,
        supportingFactIds: [],
        strategy: "ACKNOWLEDGE" as const,
        explanation: "Still open.",
        strategyText: "Ask for evidence.",
        verification: {
          originalStrength: "NONE" as const,
          invalidSupportingFactIds: [],
          invalidRoleIds: [],
          downgradeReasons: [],
        },
        experienceCalculation: null,
      },
    ];
    const round = planQuestionRound({
      assessments,
      modelQuestions: [
        {
          targetKey: "required:11",
          text: "What is a new remaining story after ten questions?",
          requirementInterpretation: null,
          hiringTeamRoleId: "sales-vp",
          whoCaresNote: "The VP of Sales still wants one more story.",
        },
      ],
      hiringTeam: [{ id: "sales-vp", name: "VP of Sales" }],
      askedKeys: new Set(askedQuestions.map((item) => item.targetKey!)),
      skippedKeys: new Set(),
      includeChronology: true,
      chronologyAsked: false,
      askedQuestions,
    });
    expect(consultationConfig.applicationQuestionLimit).toBe(10);
    expect(round.questions).toHaveLength(0);
  });

  it("writes a confirmed-gap talk track that acknowledges, bridges, and says how to close it", async () => {
    const polished = await polishAnswerWithQuality({
      answer: "I have never partnered with customer success on expansion.",
      story: {
        situation: null,
        task: null,
        action: null,
        result: null,
      },
      sources: [
        {
          id: "answer:gap",
          text: "I have never partnered with customer success on expansion.",
        },
      ],
      declinedFollowUp: false,
      confirmedGap: true,
      strengtheningNeeds: [],
    });
    expect(polished.ok).toBe(true);
    if (polished.ok) {
      expect(polished.data.resumeBullet).toBeNull();
      expect(polished.data.interviewAnswer).toMatch(/I have not|I have never/i);
      expect(polished.data.interviewAnswer).toMatch(/closest related|already own|reliability/i);
      expect(polished.data.interviewAnswer).toMatch(/close the gap|ramping/i);
      expect(polished.data.interviewAnswer).not.toMatch(/\$9M|invented/i);
    }
  });

  it("accepts polished output without content-quality retries", async () => {
    expect(
      validateRepetitionAndMetaLanguage({
        text: "ROS2 experience is a gap. I would ramp on ROS2 in the first weeks.",
        field: "briefing.importantGaps.0",
      }),
    ).toEqual([]);

    const copied = await polishAnswerWithQuality({
      answer: "copy me exactly",
      story: {
        situation: null,
        task: null,
        action: null,
        result: null,
      },
      sources: [{ id: "answer:copy", text: "copy me exactly" }],
      declinedFollowUp: false,
      strengtheningNeeds: [],
      seekerAnswers: ["copy me exactly"],
    });
    expect(copied.ok).toBe(true);
    if (copied.ok) {
      expect(copied.data.interviewAnswer).not.toBe("copy me exactly");
      expect(copied.data.resumeBullet).not.toBe("copy me exactly");
    }
    generateStructured.mockClear();

    const polished = await polishAnswerWithQuality({
      answer: "quality retry",
      story: {
        situation: "I inherited failed runs at 8%.",
        task: "I needed to stabilize them.",
        action: "I rewrote the failing path.",
        result: "I cut failed runs from 8% to 1%.",
      },
      sources: [
        {
          id: "answer:quality",
          text: "I cut failed runs from 8% to 1%.",
        },
      ],
      declinedFollowUp: false,
      strengtheningNeeds: [],
    });
    expect(polished.ok).toBe(true);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    if (polished.ok) {
      expect(polished.data.interviewAnswer).toContain("8%");
    }
  });

  it("keeps a rich grounded answer natural and within the maximum", async () => {
    const answer =
      "At Northwind, failed invoice runs were delaying billing. I owned the fix and needed to reduce failures without disrupting payments. I reviewed incident patterns with the payments team, compared a patch with a rewrite, chose the rewrite, and tracked releases through on-call. Over two quarters, failed runs fell from 8% to under 1%.";
    const polished = await polishAnswerWithQuality({
      answer,
      story: {
        situation:
          "At Northwind, failed invoice runs were delaying billing.",
        task:
          "I owned the fix and needed to reduce failures without disrupting payments.",
        action:
          "I reviewed incident patterns with the payments team, compared a patch with a rewrite, chose the rewrite, and tracked releases through on-call.",
        result:
          "Over two quarters, failed runs fell from 8% to under 1%.",
      },
      sources: [{ id: "answer:rich", text: answer }],
      declinedFollowUp: false,
      strengtheningNeeds: [],
    });
    expect(polished.ok).toBe(true);
    if (polished.ok) {
      expect(polished.data.strengtheningNote).toBeNull();
      expect(
        polished.data.interviewAnswer.split(/\s+/).length,
      ).toBeLessThanOrEqual(consultationConfig.interviewAnswerMaxWords);
      expect(
        validateInterviewAnswerQuality({
          text: polished.data.interviewAnswer,
          maxWords: consultationConfig.interviewAnswerMaxWords,
          metaLanguagePhrases: consultationConfig.interviewAnswerMetaLanguage,
        }),
      ).toEqual([]);
    }
  });
});

describe.skipIf(!hasTestDatabase())("consultation session", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";
  let icpId = "";
  let campaignId = "";
  const profile = fixtureAlexChenProfile();
  async function addHiringManager(campaignIdForRole: string) {
    await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId: campaignIdForRole,
        name: "Hiring Manager",
        targetTitles: ["Director of Engineering"],
        whyThisPersonaMatters: "Owns the role and its hiring decision.",
      },
    });
  }

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const org = await prisma.organization.create({
      data: { name: `[TEST] Consultation ${suffix}`, slug: `consultation-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `consultation-${suffix}@example.test`,
        emailNormalized: `consultation-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        profileJson: profile,
      },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId, name: `Employer ${suffix}` },
    });
    icpId = icp.id;
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Application ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    campaignId = campaign.id;
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        responsibilities: parsed.responsibilities,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaignId);
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("runs a round, keeps answers off the profile until confirmation, and updates evidence", async () => {
    await startConsultation({ organizationId, campaignId });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId },
      include: { assessments: true, turns: { orderBy: { sequence: "asc" } } },
    });
    expect(session?.promptVersion).toBe("18");
    expect(session?.generationStatus).toBe("READY");
    expect(session?.status).toBe("IN_PROGRESS");
    expect(session?.briefingJson).toMatchObject({
      strongestAngles: expect.any(Array),
      importantGaps: expect.any(Array),
      storyPlan: [],
    });
    const incident = session?.assessments.find((item) => item.text === "Leads incident response");
    expect(incident?.strength).toBe("STRONG");
    expect(incident?.supportingFactIds).toEqual(expect.arrayContaining(["skill_4"]));
    const first = session?.turns[0];
    expect(first?.speaker).toBe("CONSULTANT");
    expect(first?.targetKey?.startsWith("required:")).toBe(true);
    expect(first?.body).toContain("where you used Python");
    expect(first?.body).toContain("exact dates");
    const draftedQuestions =
      session?.turns.filter((turn) => turn.speaker === "CONSULTANT" && !turn.followUp) ??
      [];
    expect(draftedQuestions.length).toBeGreaterThan(1);
    expect(draftedQuestions.length).toBeLessThanOrEqual(10);
    expect(
      draftedQuestions.some((turn) => turn.targetKey?.startsWith("mission:")),
    ).toBe(false);
    for (const turn of draftedQuestions) {
      const assessment = session?.assessments.find(
        (item) => item.targetKey === turn.targetKey,
      );
      if (assessment && assessment.text.trim().length >= 24) {
        expect(turn.body).not.toContain(assessment.text);
      }
      expect(turn.body).not.toMatch(/does not see/i);
      expect(turn.body).not.toMatch(/^Do you have experience with /i);
    }

    const storedBefore = await prisma.product.findUnique({ where: { id: productId } });
    await answerConsultationQuestion({
      organizationId,
      campaignId,
      targetKey: first!.targetKey!,
      answer: "I have used Python on backend services.",
    });
    const afterAnswer = await prisma.product.findUnique({ where: { id: productId } });
    expect(afterAnswer?.profileJson).toEqual(storedBefore?.profileJson);
    const followUps = await prisma.consultationTurn.findMany({
      where: { sessionId: session!.id, followUp: true, speaker: "CONSULTANT" },
    });
    expect(followUps[0]?.body).toContain("concrete result");
    expect(await prisma.consultationProposal.count({ where: { sessionId: session!.id } })).toBe(0);
    expect(
      await prisma.consultationStatement.count({
        where: { sessionId: session!.id },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.consultationTurn.findMany({
          where: { sessionId: session!.id, speaker: "CONSULTANT", followUp: false },
        })
      ).length,
    ).toBe(draftedQuestions.length);

    await answerConsultationQuestion({
      organizationId,
      campaignId,
      targetKey: first!.targetKey!,
      answer: "I used Python for 5 years and cut failed jobs by 40%.",
    });
    const stillUnwritten = await prisma.product.findUnique({ where: { id: productId } });
    expect(stillUnwritten?.profileJson).toEqual(storedBefore?.profileJson);
    const proposals = await prisma.consultationProposal.findMany({
      where: { sessionId: session!.id, status: "PENDING" },
    });
    const fact = proposals.find((item) => item.kind === "FACT");
    const story = proposals.find((item) => item.kind === "STORY");
    expect(fact).toBeTruthy();
    const seeker = await prisma.consultationTurn.findFirst({
      where: { sessionId: session!.id, speaker: "SEEKER", skipped: false },
      orderBy: { sequence: "desc" },
    });
    expect(seeker?.body).toBe("I used Python for 5 years and cut failed jobs by 40%.");
    expect(seeker?.seekerAuthored).toBe(true);
    const statements = await prisma.consultationStatement.findMany({
      where: { turnId: seeker!.id },
      orderBy: { kind: "asc" },
    });
    expect(statements).toHaveLength(2);
    const interviewStatement = statements.find(
      (statement) => statement.kind === "INTERVIEW_ANSWER",
    );
    const priorAnswer = "I have used Python on backend services.";
    const latestAnswer = "I used Python for 5 years and cut failed jobs by 40%.";
    expect(interviewStatement?.content).not.toBe(
      `${priorAnswer}\n${latestAnswer}`,
    );
    expect(interviewStatement?.content).not.toBe(priorAnswer);
    expect(interviewStatement?.content).toContain("40%");
    const firstSeeker = await prisma.consultationTurn.findFirst({
      where: {
        sessionId: session!.id,
        speaker: "SEEKER",
        skipped: false,
        body: priorAnswer,
      },
    });
    expect(
      await prisma.consultationStatement.count({
        where: { turnId: firstSeeker!.id },
      }),
    ).toBe(0);
    const interviewWordCount =
      interviewStatement?.content.trim().split(/\s+/).filter(Boolean).length ??
      0;
    expect(interviewWordCount).toBeLessThanOrEqual(
      consultationConfig.interviewAnswerMaxWords,
    );
    expect(
      statements.flatMap((statement) =>
        validateRepetitionAndMetaLanguage({
          text: statement.content,
          field: statement.kind,
        }),
      ),
    ).toEqual([]);
    await approveConsultationStatement({
      organizationId,
      statementId: statements[0]!.id,
      content: statements[0]!.content,
    });
    const polishedStory = await prisma.profileStory.findFirst({
      where: { consultationTurnId: seeker!.id },
    });
    expect(polishedStory?.verbatimAnswer).toContain("cut failed jobs by 40%");
    expect(
      polishedStory?.interviewAnswer ?? polishedStory?.resumeBullet,
    ).toBe(statements[0]!.content);

    await confirmConsultationProposal({
      organizationId,
      proposalId: fact!.id,
      text: fact!.text,
      situation: null,
      task: null,
      action: null,
      result: null,
    });
    const written = parseCandidateProfile(
      (await prisma.product.findUnique({ where: { id: productId } }))?.profileJson,
    );
    const saved = written.experience
      .flatMap((role) => role.achievements)
      .find((item) => item.id === fact!.profileItemId);
    expect(saved?.provenance).toEqual([{ sourceId: seeker!.id }]);
    if (story) {
      const links = story.competencyLinks;
      expect(JSON.stringify(links).toLowerCase()).toContain("python");
      await confirmConsultationProposal({
        organizationId,
        proposalId: story.id,
        text: story.text,
        situation: "I used Python for 5 years and cut failed jobs by 40%.",
        task: "I used Python for 5 years and cut failed jobs by 40%.",
        action: "I used Python for 5 years and cut failed jobs by 40%.",
        result: "I used Python for 5 years and cut failed jobs by 40%.",
      });
      const bank = await prisma.profileStory.findFirst({
        where: { productId, consultationTurnId: seeker!.id },
      });
      expect(bank?.seekerAuthored).toBe(true);
      expect(JSON.stringify(bank?.competencyLinks).toLowerCase()).toContain("python");
    }
    const otherQuestion = draftedQuestions.find(
      (turn) => turn.id !== first!.id && turn.targetKey,
    );
    if (otherQuestion) {
      await answerConsultationQuestion({
        organizationId,
        campaignId,
        targetKey: `question:${otherQuestion.id}`,
        answer: "I have never developed a sales manager.",
      });
      const confirmedTurn = await prisma.consultationTurn.findFirst({
        where: {
          sessionId: session!.id,
          speaker: "SEEKER",
          body: "I have never developed a sales manager.",
        },
      });
      const confirmedInterview = await prisma.consultationStatement.findFirst({
        where: { turnId: confirmedTurn!.id, kind: "INTERVIEW_ANSWER" },
      });
      const confirmedBullet = await prisma.consultationStatement.findFirst({
        where: { turnId: confirmedTurn!.id, kind: "RESUME_BULLET" },
      });
      expect(confirmedInterview?.content).toMatch(/I have not done that work yet/i);
      expect(confirmedInterview?.content).not.toBe(
        "I have never developed a sales manager.",
      );
      expect(confirmedBullet).toBeNull();
    }
    await editConsultationAnswer({
      organizationId,
      campaignId,
      turnId: seeker!.id,
      answer: "I used Python for 6 years and cut failed jobs by 55%.",
    });
    const edited = await prisma.consultationTurn.findUnique({
      where: { id: seeker!.id },
    });
    expect(edited?.body).toBe("I used Python for 6 years and cut failed jobs by 55%.");
    const editedInterview = await prisma.consultationStatement.findFirst({
      where: { turnId: seeker!.id, kind: "INTERVIEW_ANSWER" },
    });
    expect(editedInterview?.content).toContain("55%");
    expect(editedInterview?.content).not.toBe(
      `${priorAnswer}\nI used Python for 6 years and cut failed jobs by 55%.`,
    );
    const beforeContinue = await prisma.consultationTurn.count({
      where: { sessionId: session!.id, speaker: "CONSULTANT" },
    });
    await confirmConsultationResult({ organizationId, campaignId });
    const afterUse = await prisma.consultationStatement.findMany({
      where: { sessionId: session!.id, status: "DRAFT" },
    });
    expect(afterUse).toHaveLength(0);
    expect(
      await prisma.consultationTurn.count({
        where: { sessionId: session!.id, speaker: "CONSULTANT" },
      }),
    ).toBe(beforeContinue);
    await continueConsultationPlanning({ organizationId, campaignId });
    const laterQuestions = await prisma.consultationTurn.findMany({
      where: { sessionId: session!.id, speaker: "CONSULTANT" },
      orderBy: { sequence: "asc" },
    });
    const afterContinue = await prisma.consultationSession.findUnique({
      where: { campaignId },
    });
    expect(laterQuestions.length).toBeGreaterThanOrEqual(beforeContinue);
    if (laterQuestions.length === beforeContinue) {
      expect(["DONE", "IN_PROGRESS"]).toContain(afterContinue?.status);
    }
  });

  it("asks the next Harper question after every current result is used", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Continue after use ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        responsibilities: parsed.responsibilities,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    await startConsultation({ organizationId, campaignId: campaign.id });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
    });
    expect(session?.status).toBe("IN_PROGRESS");
    const questions = await prisma.consultationTurn.findMany({
      where: { sessionId: session!.id, speaker: "CONSULTANT" },
      orderBy: { sequence: "asc" },
    });
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      await answerConsultationQuestion({
        organizationId,
        campaignId: campaign.id,
        targetKey: `question:${question.id}`,
        answer: "I used Python for 5 years and cut failed jobs by 40%.",
      });
    }
    await confirmConsultationResult({
      organizationId,
      campaignId: campaign.id,
    });
    const before = await prisma.consultationTurn.count({
      where: { sessionId: session!.id, speaker: "CONSULTANT" },
    });
    await continueConsultationPlanning({
      organizationId,
      campaignId: campaign.id,
    });
    const after = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
    });
    const later = await prisma.consultationTurn.count({
      where: { sessionId: session!.id, speaker: "CONSULTANT" },
    });
    expect(later > before || after?.status === "DONE").toBe(true);
  });

  it("repairs a raw joined interview and fragment bullet into Harper-written results", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Repair results ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        responsibilities: parsed.responsibilities,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    await startConsultation({ organizationId, campaignId: campaign.id });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    const question = session?.turns.find(
      (turn) => turn.speaker === "CONSULTANT" && !turn.followUp,
    );
    expect(question).toBeTruthy();
    const firstAnswer =
      "I coached a manager who was not inspecting deals. The manager later became an RVP of North America Channels running a team.";
    const secondAnswer =
      "I sat with that manager on the weekly forecast, set an inspection cadence, and stayed with it until the team ran it without me.";
    const joined = `${firstAnswer}\n${secondAnswer}`;
    const fragment =
      "The manager later became an RVP of North America Channels running a team.";
    const nextSequence =
      (session?.turns.reduce((maximum, turn) => Math.max(maximum, turn.sequence), 0) ??
        0) + 1;
    const first = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: session!.id,
        sequence: nextSequence,
        speaker: "SEEKER",
        body: firstAnswer,
        targetKey: question!.targetKey,
        seekerAuthored: true,
        analysisJson: {
          status: "READY",
          replyToTurnId: question!.id,
          answerContext: firstAnswer,
        },
      },
    });
    const second = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: session!.id,
        sequence: nextSequence + 1,
        speaker: "SEEKER",
        body: secondAnswer,
        targetKey: question!.targetKey,
        seekerAuthored: true,
        analysisJson: {
          status: "READY",
          replyToTurnId: question!.id,
          answerContext: joined,
        },
      },
    });
    await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: session!.id,
        turnId: first.id,
        kind: "INTERVIEW_ANSWER",
        content: joined,
        groundingJson: [],
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
    });
    await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: session!.id,
        turnId: first.id,
        kind: "RESUME_BULLET",
        content: fragment,
        groundingJson: [],
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
    });
    await repairConsultationResults({
      organizationId,
      campaignId: campaign.id,
    });
    const repaired = await prisma.consultationStatement.findMany({
      where: { sessionId: session!.id, turnId: second.id },
    });
    const interview = repaired.find((row) => row.kind === "INTERVIEW_ANSWER");
    const bullet = repaired.find((row) => row.kind === "RESUME_BULLET");
    expect(interview?.content).toBeTruthy();
    expect(interview?.content).not.toBe(joined);
    expect(bullet?.content).toBeTruthy();
    expect(bullet?.content).not.toBe(fragment);
    expect(
      await prisma.consultationStatement.count({
        where: { turnId: first.id },
      }),
    ).toBe(0);
  });

  it("records an unparseable plan as failed so the seeker can retry", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Failed plan ${suffix}`,
        productId,
        icpId,
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        responsibilities: parsed.responsibilities,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    generateStructured.mockImplementation(async () => {
      throw new Error(
        "Consultation structured output failed validation after normalization.",
      );
    });
    await expect(
      startConsultation({ organizationId, campaignId: campaign.id }),
    ).rejects.toThrow(/could not plan|failed validation|Retry/i);
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
    });
    expect(session?.generationStatus).toBe("FAILED");
    expect(session?.generationError).toBeTruthy();
    installConsultationModelFixture();
  });

  it("asks about a thin Action and polishes honestly when the follow-up is declined", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Thin STAR ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    await startConsultation({ organizationId, campaignId: campaign.id });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    const question = session?.turns.find(
      (turn) => turn.speaker === "CONSULTANT" && turn.targetKey,
    );
    const answer =
      "Invoice generation had failed billing runs at 8%. I led the rewrite. Over two quarters, failed billing runs fell to under 1%.";
    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: question!.targetKey!,
      answer,
    });
    const afterAnswer = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: {
        turns: { orderBy: { sequence: "asc" } },
        statements: true,
      },
    });
    const followUp = afterAnswer?.turns.find(
      (turn) => turn.speaker === "CONSULTANT" && turn.followUp,
    );
    if (followUp) {
      expect(followUp.body.toLowerCase()).toMatch(
        /what did you|tell me what you did|personally/,
      );
      expect(afterAnswer?.statements).toHaveLength(0);
      await skipConsultationQuestion({
        organizationId,
        campaignId: campaign.id,
        targetKey: question!.targetKey!,
      });
    }
    const polished = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: {
        turns: { orderBy: { sequence: "asc" } },
        statements: { orderBy: { kind: "asc" } },
      },
    });
    const interview = polished?.statements.find(
      (statement) => statement.kind === "INTERVIEW_ANSWER",
    );
    expect(interview?.content).toMatch(/8%/);
    expect(interview?.content.match(/8%/g)).toHaveLength(1);
    if (followUp) {
      expect(interview?.content).not.toBe(answer);
      expect(interview?.strengtheningNote).toContain("ACTION");
      expect(
        polished?.turns.some(
          (turn) =>
            turn.skipped &&
            turn.analysisJson &&
            typeof turn.analysisJson === "object" &&
            (turn.analysisJson as { followUpDeclined?: unknown })
              .followUpDeclined === true,
        ),
      ).toBe(true);
    }
  });

  it("shows a failed generation state with no substitute questions and retries", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Retry ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    generateStructured.mockRejectedValueOnce(new Error("provider timeout"));
    await startConsultation({ organizationId, campaignId: campaign.id });
    const failed = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: true },
    });
    expect(failed?.generationStatus).toBe("READY");
    expect(failed?.status).toBe("IN_PROGRESS");
    expect(failed?.turns.length).toBeGreaterThan(0);
    expect(failed?.turns.some((turn) => turn.speaker === "CONSULTANT")).toBe(true);
  });

  it("records an unparseable answer extraction as failed so the seeker can retry", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Extract fail ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    await startConsultation({ organizationId, campaignId: campaign.id });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    const question = session?.turns.find((turn) => turn.speaker === "CONSULTANT");
    generateStructured.mockImplementation(async (request: { schemaName: string }) => {
      if (request.schemaName === "consultation_extract") {
        throw new Error("extraction provider failed");
      }
      throw new Error(`Unexpected schema ${request.schemaName}`);
    });
    await expect(
      answerConsultationQuestion({
        organizationId,
        campaignId: campaign.id,
        targetKey: question!.targetKey!,
        answer: "I used Python for 5 years and cut failed jobs by 40%.",
      }),
    ).rejects.toThrow(consultationConversationCopy.generationFailed);
    const after = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    expect(after?.generationStatus).toBe("FAILED");
    expect(after?.generationError).toBeTruthy();
    expect(
      after?.turns.some((turn) => turn.body === consultationConversationCopy.askForStory),
    ).toBe(false);
  });

  it("dismisses a proposal without writing the Personal Profile", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Dismiss ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    const before = await prisma.product.findUnique({ where: { id: productId } });
    const storiesBefore = await prisma.profileStory.count({ where: { productId } });
    await startConsultation({ organizationId, campaignId: campaign.id });
    const question = await prisma.consultationTurn.findFirst({
      where: { session: { campaignId: campaign.id }, speaker: "CONSULTANT" },
      orderBy: { sequence: "asc" },
    });
    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: question!.targetKey!,
      answer: "I used Python for 5 years and cut failed jobs by 40%.",
    });
    const pending = await prisma.consultationProposal.findMany({
      where: { session: { campaignId: campaign.id }, status: "PENDING" },
    });
    expect(pending.length).toBeGreaterThan(0);
    for (const proposal of pending) {
      await dismissConsultationProposal({ organizationId, proposalId: proposal.id });
    }
    const after = await prisma.product.findUnique({ where: { id: productId } });
    expect(after?.profileJson).toEqual(before?.profileJson);
    expect(await prisma.profileStory.count({ where: { productId } })).toBe(storiesBefore);
    const dismissed = await prisma.consultationProposal.findMany({
      where: { session: { campaignId: campaign.id } },
    });
    expect(dismissed.every((item) => item.status === "DISMISSED")).toBe(true);
  });

  it("pauses, resumes, skips a question, and marks done without blocking a skipped application", async () => {
    await pauseConsultation({ organizationId, campaignId });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId } }))?.status,
    ).toBe("PAUSED");
    await resumeConsultation({ organizationId, campaignId });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId } }))?.status,
    ).toBe("IN_PROGRESS");

    const turns = await prisma.consultationTurn.findMany({
      where: { session: { campaignId } },
      orderBy: { sequence: "asc" },
    });
    const target = [...turns]
      .reverse()
      .find((turn) => {
        if (turn.speaker !== "CONSULTANT" || !turn.targetKey) return false;
        return !turns.some(
          (other) =>
            other.speaker === "SEEKER" &&
            other.targetKey === turn.targetKey &&
            other.sequence > turn.sequence,
        );
      });
    if (target?.targetKey) {
      await skipConsultationQuestion({
        organizationId,
        campaignId,
        targetKey: target.targetKey,
      });
      const skipped = await prisma.consultationTurn.findFirst({
        where: { session: { campaignId }, speaker: "SEEKER", skipped: true, targetKey: target.targetKey },
      });
      expect(skipped?.seekerAuthored).toBe(true);
    }

    await completeConsultation({ organizationId, campaignId });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId } }))?.status,
    ).toBe("DONE");

    const other = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Skipped ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: other.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    expect(await prisma.consultationSession.findUnique({ where: { campaignId: other.id } })).toBeNull();
    await skipConsultation({ organizationId, campaignId: other.id });
    const skippedSession = await prisma.consultationSession.findUnique({
      where: { campaignId: other.id },
    });
    expect(skippedSession?.status).toBe("SKIPPED");
    expect(skippedSession?.coachNote).toBeNull();
    await resumeConsultation({ organizationId, campaignId: other.id });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId: other.id } }))?.status,
    ).toBe("IN_PROGRESS");
  });

  it("opens a focused session after a new gap even when consultation is done", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Gap consult ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    await startConsultation({ organizationId, campaignId: campaign.id });
    const first = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    expect(first?.status).toBe("IN_PROGRESS");
    const firstTurnIds = first?.turns.map((turn) => turn.id) ?? [];
    await completeConsultation({ organizationId, campaignId: campaign.id });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId: campaign.id } }))
        ?.status,
    ).toBe("DONE");

    await startConsultation({
      organizationId,
      campaignId: campaign.id,
      focusNote: "Need a concrete story for shipping production services.",
    });
    const reopened = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    expect(reopened?.status).toBe("IN_PROGRESS");
    expect(reopened?.turns.map((turn) => turn.id)).toEqual(
      expect.arrayContaining(firstTurnIds),
    );
    expect(reopened!.turns.length).toBeGreaterThan(firstTurnIds.length);
    expect(
      reopened?.turns.some(
        (turn) =>
          turn.speaker === "CONSULTANT" &&
          !firstTurnIds.includes(turn.id),
      ),
    ).toBe(true);
  });

  it("accepts a reply on every Reply-box question even when target keys are shared", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Shared key reply ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    await startConsultation({ organizationId, campaignId: campaign.id });
    const started = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    const startedPrimaries =
      started?.turns.filter(
        (turn) => turn.speaker === "CONSULTANT" && !turn.followUp,
      ) ?? [];
    const extras = startedPrimaries.slice(3);
    if (extras.length > 0) {
      await prisma.consultationTurn.deleteMany({
        where: { id: { in: extras.map((turn) => turn.id) } },
      });
    }
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    const primaries =
      session?.turns.filter(
        (turn) => turn.speaker === "CONSULTANT" && !turn.followUp,
      ) ?? [];
    expect(primaries.length).toBeGreaterThanOrEqual(3);
    const earlier = primaries[0]!;
    const later = primaries[1]!;
    const other = primaries[2]!;
    await prisma.consultationTurn.update({
      where: { id: later.id },
      data: { targetKey: earlier.targetKey },
    });

    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: `question:${later.id}`,
      answer: "I used Python for 5 years and cut failed jobs by 40%.",
    });

    const afterLater = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: {
        turns: { orderBy: { sequence: "asc" } },
        statements: true,
      },
    });
    expect(afterLater?.generationError).toBeNull();
    const laterView = buildConsultationQaView({
      turns: afterLater!.turns.map((turn) => ({
        id: turn.id,
        speaker: turn.speaker,
        body: turn.body,
        targetKey: turn.targetKey,
        followUp: turn.followUp,
        sequence: turn.sequence,
        analysisJson: turn.analysisJson,
      })),
      statements: afterLater!.statements.map((statement) => ({
        id: statement.id,
        turnId: statement.turnId,
        kind: statement.kind,
        status: statement.status,
        content: statement.content,
        strengtheningNote: statement.strengtheningNote,
      })),
    });
    const earlierCard = laterView.questions.find(
      (item) => item.questionTurnId === earlier.id,
    );
    const laterCard = laterView.questions.find(
      (item) => item.questionTurnId === later.id,
    );
    expect(consultationQuestionAcceptsReply(earlierCard!)).toBe(true);
    expect(consultationQuestionAcceptsReply(laterCard!)).toBe(false);

    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: `question:${earlier.id}`,
      answer: "I have used Python on backend services.",
    });

    const afterEarlier = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: {
        turns: { orderBy: { sequence: "asc" } },
        statements: true,
      },
    });
    expect(afterEarlier?.generationError).toBeNull();
    expect(afterEarlier?.generationError ?? "").not.toMatch(/not open/i);
    const earlierFollowUps = afterEarlier!.turns.filter(
      (turn) =>
        turn.speaker === "CONSULTANT" &&
        turn.followUp &&
        (turn.targetKey === earlier.targetKey ||
          (turn.analysisJson &&
            typeof turn.analysisJson === "object" &&
            (turn.analysisJson as { replyToTurnId?: unknown }).replyToTurnId ===
              earlier.id)),
    );
    expect(earlierFollowUps).toHaveLength(1);

    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: `question:${other.id}`,
      answer:
        "Invoice generation had failed billing runs at 8%. I led the rewrite. Over two quarters, failed billing runs fell to under 1%.",
    });
    const afterOther = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    expect(afterOther?.generationError).toBeNull();
    expect(
      afterOther!.turns.some(
        (turn) =>
          turn.speaker === "SEEKER" &&
          turn.body.includes("failed billing runs"),
      ),
    ).toBe(true);
    const otherFollowUps = afterOther!.turns.filter(
      (turn) =>
        turn.speaker === "CONSULTANT" &&
        turn.followUp &&
        (turn.analysisJson &&
        typeof turn.analysisJson === "object" &&
        (turn.analysisJson as { replyToTurnId?: unknown }).replyToTurnId ===
          other.id),
    );
    const otherStatements = await prisma.consultationStatement.count({
      where: {
        sessionId: afterOther!.id,
        turn: { targetKey: other.targetKey },
      },
    });
    expect(otherFollowUps.length + otherStatements).toBeGreaterThan(0);
  });

  it("replaces a question on feedback and does not write statements", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Feedback reply ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    await addHiringManager(campaign.id);
    await startConsultation({ organizationId, campaignId: campaign.id });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    const question = session?.turns.find(
      (turn) => turn.speaker === "CONSULTANT" && !turn.followUp,
    );
    expect(question).toBeTruthy();
    const original = question!.body;
    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: `question:${question!.id}`,
      answer: "This is a company statement, write a better question.",
    });
    const after = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: {
        turns: { orderBy: { sequence: "asc" } },
        statements: true,
      },
    });
    const revised = after?.turns.find((turn) => turn.id === question!.id);
    expect(revised?.body).not.toBe(original);
    expect(revised?.body).toMatch(/operating cadence|forecast/i);
    expect(after?.statements).toHaveLength(0);
    expect(
      after?.turns.filter((turn) => turn.speaker === "CONSULTANT" && turn.followUp),
    ).toHaveLength(0);
  });

  it("sends added background and interview learnings to the coach call", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Seeker facts ${suffix}`,
        productId,
        icpId,
        whyThisCompany: "The warehouse robotics mission matches my reliability work.",
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
        seekerLearnedNotes:
          "The hiring manager said they need shipping production services with a weekly forecast.",
      },
    });
    await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        sortOrder: 0,
        type: "RECRUITER_SCREEN",
        scheduledAt: new Date("2026-10-08T19:00:00.000Z"),
        format: "VIDEO",
        notesAfter:
          "They want someone who has shipped production services and can run a weekly forecast.",
      },
    });
    await saveSeekerStatedBackground({
      organizationId,
      productId,
      userId,
      campaignId: campaign.id,
      text: "I shipped production services at Harborline and ran the weekly forecast myself.",
    });
    await addHiringManager(campaign.id);
    generateStructured.mockClear();
    await startConsultation({ organizationId, campaignId: campaign.id });
    const coachCall = generateStructured.mock.calls.find(
      (call) => call[0]?.schemaName === "consultation_plan",
    );
    expect(coachCall).toBeTruthy();
    const payload = (coachCall![0].messages as Array<{ content: string }>).reduce(
      (acc, message) => {
        try {
          return { ...acc, ...JSON.parse(message.content) };
        } catch {
          return acc;
        }
      },
      {} as {
        askedQuestions?: unknown;
        seekerStatedFacts?: Array<{ text: string; source: string }>;
      },
    );
    expect(Array.isArray(payload.askedQuestions)).toBe(true);
    expect(payload.seekerStatedFacts?.some((item) => item.source === "added_background")).toBe(
      true,
    );
    expect(
      payload.seekerStatedFacts?.some((item) =>
        /weekly forecast/i.test(item.text),
      ),
    ).toBe(true);
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { assessments: true },
    });
    expect(
      session?.assessments.some(
        (item) =>
          /shipping production services/i.test(item.text) &&
          item.strength === "STRONG",
      ),
    ).toBe(true);
    await prisma.product.update({
      where: { id: productId },
      data: { profileJson: profile },
    });
  });
});
