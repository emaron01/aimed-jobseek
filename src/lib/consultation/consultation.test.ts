import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.hoisted(() => vi.fn());
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
  };
});

import {
  calculateExperienceYears,
  evidenceTargets,
  gapsAreCovered,
  profileEvidenceItems,
  verifyModelAssessments,
} from "@/lib/consultation/assess";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  matchConsultationFocus,
  planQuestionRound,
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
  retryConsultationGeneration,
  resumeConsultation,
  skipConsultation,
  skipConsultationQuestion,
  startConsultation,
  confirmConsultationResult,
  continueConsultationPlanning,
} from "@/lib/consultation/service";
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
import { qualityMessages } from "@/lib/generation/quality";
import { CONSULTATION_COACH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";
import {
  parseCandidateProfile,
} from "@/lib/product-research/candidate-profile";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
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

function installConsultationModelFixture() {
  generateStructured.mockImplementation(async (request: {
    schemaName: string;
    messages: Array<{ content: string }>;
  }) => {
    const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
      targets?: Array<{ key: string; kind: string; text: string }>;
      answer?: string;
      target?: { key: string } | null;
      availableTargets?: Array<{ key: string; text: string }>;
      hiringTeam?: Array<{ id: string; name: string }>;
      allowedSources?: Array<{ id: string; text: string }>;
      statement?: string;
      kind?: "INTERVIEW_ANSWER" | "RESUME_BULLET";
      declinedFollowUp?: boolean;
      strengtheningNeeds?: string[];
      qualityFeedback?: string[];
    };
    if (request.schemaName === "consultation_plan") {
      const targets = payload.targets ?? [];
      const hiringRole = payload.hiringTeam?.[0] ?? {
        id: "hiring-manager",
        name: "Hiring Manager",
      };
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
          closingNote: null,
          assessments: targets.map((target) => {
            const incident = /incident response/i.test(target.text);
            const mission = target.kind === "MISSION";
            const production = /shipping production services/i.test(target.text);
            return {
              targetKey: target.key,
              strength: incident ? "STRONG" : mission || production ? "PARTIAL" : "NONE",
              supportingFactIds: incident
                ? ["skill_4"]
                : mission
                  ? ["skill_4", "ach_1"]
                  : production
                    ? ["role_1", "ach_1"]
                    : [],
              relevantRoleIds: [],
              explanation: incident
                ? "Alex's FACT profile explicitly includes incident response."
                : mission
                  ? "Alex's incident response and reduced billing failures are transferable reliability evidence, although not robotics evidence."
                  : production
                    ? "Alex owned a production payments service and improved its reliability."
                    : `The FACT profile does not yet establish ${target.text}.`,
              strategyMode:
                mission || production ? "REFRAME_ADJACENT" : "ACKNOWLEDGE",
              strategy: mission
                ? "Connect Northwind incident ownership and billing reliability to the warehouse-robot reliability mission, while acknowledging the new domain."
                : `Use Alex's Northwind work to address ${target.text} honestly and specifically.`,
            };
          }),
          questions: [
            ...targets.map((target) => ({
              targetKey: target.key,
              text: /5 years of Python/i.test(target.text)
                ? "Your Northwind and Contoso roles cover more than seven years, but the profile does not say where you used Python. In which roles did you use it, and what were the exact dates?"
                : `Your Northwind payments work is relevant to ${target.text}. Walk me through one example: what was at stake, what did you do, and what changed?`,
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
          ],
        },
      };
    }
    if (request.schemaName === "consultation_polish") {
      const source = payload.allowedSources?.[0] ?? {
        id: "answer",
        text: payload.answer ?? "",
      };
      if (
        payload.answer === "quality retry" &&
        (payload.qualityFeedback?.length ?? 0) === 0
      ) {
        return {
          data: {
            interviewAnswer: {
              text:
                "I cut failed runs from 8% to 1%. The starting point was 8%.",
              claims: [
                {
                  text: "I cut failed runs from 8% to 1%.",
                  supports: [
                    {
                      sourceId: source.id,
                      quote: "I cut failed runs from 8% to 1%.",
                    },
                  ],
                },
                {
                  text: "The starting point was 8%.",
                  supports: [
                    {
                      sourceId: source.id,
                      quote: "I cut failed runs from 8% to 1%.",
                    },
                  ],
                },
              ],
            },
            resumeBullet: {
              text: "I cut failed runs from 8% to 1%.",
              claims: [
                {
                  text: "I cut failed runs from 8% to 1%.",
                  supports: [
                    {
                      sourceId: source.id,
                      quote: "I cut failed runs from 8% to 1%.",
                    },
                  ],
                },
              ],
            },
            strengtheningNote: null,
          },
        };
      }
      const text =
        source.text
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
          .at(-1) ?? source.text;
      const support = [{ sourceId: source.id, quote: text }];
      const interviewClaims = text
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .map((claimText) => ({
          text: claimText,
          supports: [{ sourceId: source.id, quote: claimText }],
        }));
      const interview = {
        text,
        claims: interviewClaims,
      };
      const bullet = {
        text,
        claims: [{ text, supports: support }],
      };
      return {
        data: {
          interviewAnswer: interview,
          resumeBullet: bullet,
          strengtheningNote: payload.declinedFollowUp
            ? `The ${payload.strengtheningNeeds?.[0] ?? "Action"} would be stronger with more detail about what you personally did.`
            : null,
        },
      };
    }
    if (request.schemaName === "consultation_statement_grounding") {
      const text = payload.statement ?? "";
      const claimTexts =
        payload.kind === "INTERVIEW_ANSWER"
          ? text.split(/(?<=[.!?])\s+/).filter(Boolean)
          : [text];
      const claims = claimTexts.map((claimText) => {
        const source =
          payload.allowedSources?.find((item) =>
            item.text.includes(claimText),
          ) ?? payload.allowedSources?.[0] ?? { id: "answer", text: claimText };
        return {
          text: claimText,
          supports: [{ sourceId: source.id, quote: claimText }],
        };
      });
      return {
        data: {
          text,
          claims,
        },
      };
    }
    const answer = payload.answer ?? "";
    const thinInvoice =
      answer ===
      "Invoice generation had failed billing runs at 8%. I led the rewrite. Over two quarters, failed billing runs fell to under 1%.";
    if (thinInvoice) {
      return {
        data: {
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
        },
      };
    }
    const complete = /cut failed jobs by 40%/i.test(answer);
    const completeSpan = "I used Python for 5 years and cut failed jobs by 40%.";
    return {
      data: {
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
    expect(round.questions).toHaveLength(consultationConfig.roundSize);
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

  it("drops unsupported extraction and keeps semantic links pending confirmation", () => {
    const { profile, targets } = sample();
    const before = JSON.stringify(profile);
    const answer = "I used Python for 5 years and cut failed jobs by 40%.";
    const result = proposalsFromExtraction({
      answer,
      turnId: "turn_answer_1",
      extracted: {
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
      },
      targets: [
        ...targets,
        {
          key: "why-this-company",
          kind: "MISSION",
          text: "Why the seeker wants to work at this company",
        },
      ],
    });
    expect(why.dropped).toContain("target:why-this-company:motivation");

    const paraphrased = proposalsFromExtraction({
      answer,
      turnId: "turn_paraphrase",
      extracted: {
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
      },
      targets,
    });
    const modelMarkedActionMissing = proposalsFromExtraction({
      answer,
      turnId: "turn_action_present",
      extracted: {
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
        facts: [
          { text: "Python" },
          { text: "5 years" },
          { text: "I used Python for 5 years and cut failed jobs by 40%." },
        ],
        story: null,
        demonstratedTargets: [],
        missingStarElements: [],
        followUpQuestion: null,
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
    expect(missingQuestion.dropped[0]?.reason).toMatch(/later round/i);
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
    expect(CONSULTATION_PROMPT_VERSION).toBe("11");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("coach, not an interrogator");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("Never inflate fit");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "Never mention research status",
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("focusTargetKey");
    const workspace = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(workspace).toContain("consultationConfig.displayName");
    expect(workspace).not.toContain("Avery");
    expect(workspace).not.toContain("Save answer");
    expect(workspace).toContain("consultationConversationCopy.generationFailed");
    expect(thread).toContain("consultationConversationCopy.useThis");
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
    expect(assessment).not.toMatch(/Relevant evidence|No direct evidence|Strong match/i);
    expect(writeBack).not.toMatch(/split\([^)]*sentence|keyword/i);
  });

  it("rejects unsupported facts and numbers in polished statements", () => {
    const errors = validateGroundedStatement({
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
    });
    expect(qualityMessages(errors)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not connected"),
        expect.stringContaining('$9M'),
      ]),
    );
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

  it("rejects repeated facts and STAR meta-language, then regenerates", async () => {
    const directErrors = validateInterviewAnswerQuality({
      text:
        "I cut failed runs from 8% to 1%. The starting point was 8%.",
      maxWords: consultationConfig.interviewAnswerMaxWords,
      metaLanguagePhrases: consultationConfig.interviewAnswerMetaLanguage,
    });
    expect(qualityMessages(directErrors)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("described its structure"),
        expect.stringContaining("repeated the same number"),
      ]),
    );
    expect(
      validateRepetitionAndMetaLanguage({
        text: "ROS2 experience is a gap. I would ramp on ROS2 in the first weeks.",
        field: "briefing.importantGaps.0",
      }),
    ).toEqual([]);

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
    expect(generateStructured).toHaveBeenCalledTimes(2);
    if (polished.ok) {
      expect(polished.data.interviewAnswer.text).toBe(
        "I cut failed runs from 8% to 1%.",
      );
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
        polished.data.interviewAnswer.text.split(/\s+/).length,
      ).toBeLessThanOrEqual(consultationConfig.interviewAnswerMaxWords);
      expect(
        validateInterviewAnswerQuality({
          text: polished.data.interviewAnswer.text,
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
    expect(session?.promptVersion).toBe("11");
    expect(session?.generationStatus).toBe("READY");
    expect(session?.status).toBe("IN_PROGRESS");
    expect(session?.briefingJson).toMatchObject({
      strongestAngles: expect.any(Array),
      importantGaps: expect.any(Array),
      storyPlan: expect.any(Array),
    });
    const incident = session?.assessments.find((item) => item.text === "Leads incident response");
    expect(incident?.strength).toBe("STRONG");
    expect(incident?.supportingFactIds).toEqual(expect.arrayContaining(["skill_4"]));
    const first = session?.turns[0];
    expect(first?.speaker).toBe("CONSULTANT");
    expect(first?.targetKey?.startsWith("required:")).toBe(true);
    expect(first?.body).toContain("where you used Python");
    expect(first?.body).toContain("exact dates");
    expect(session?.turns.some((turn) => turn.body.includes("ROS2"))).toBe(false);

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
    expect(laterQuestions.length).toBeGreaterThan(beforeContinue);
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
      expect(interview?.content).toBe(answer);
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
    await expect(
      startConsultation({ organizationId, campaignId: campaign.id }),
    ).rejects.toThrow(/usable plan|timeout/i);
    const failed = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: true },
    });
    expect(failed?.generationStatus).toBe("FAILED");
    expect(failed?.status).toBe("IN_PROGRESS");
    expect(failed?.turns).toHaveLength(0);

    await retryConsultationGeneration({
      organizationId,
      campaignId: campaign.id,
    });
    const retried = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: true },
    });
    expect(retried?.generationStatus).toBe("READY");
    expect(retried?.turns.length).toBeGreaterThan(0);
  });

  it("keeps Harper coaching when extraction fails and asks for the missing story", async () => {
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
    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: question!.targetKey!,
      answer: "I used Python for 5 years and cut failed jobs by 40%.",
    });
    const after = await prisma.consultationSession.findUnique({
      where: { campaignId: campaign.id },
      include: { turns: { orderBy: { sequence: "asc" } } },
    });
    expect(after?.generationStatus).toBe("READY");
    expect(after?.generationError).toBeNull();
    const coaching = after?.turns
      .filter((turn) => turn.speaker === "CONSULTANT")
      .at(-1)?.body;
    expect(coaching).toContain(consultationConversationCopy.askForStory);
    expect(coaching).not.toMatch(/fully grounded story/i);
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
});
