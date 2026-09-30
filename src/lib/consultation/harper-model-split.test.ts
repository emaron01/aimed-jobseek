import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.hoisted(() => vi.fn());
const generateReplyStructured = vi.hoisted(() => vi.fn());
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));
const isConsultationReplyAiConfigured = vi.hoisted(() => vi.fn(() => true));
const runPaidStructuredCall = vi.hoisted(() => vi.fn());
const recordUsageEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    isConsultationReplyAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
    getConsultationReplyAiProvider: () => ({
      generateStructured: generateReplyStructured,
    }),
  };
});

vi.mock("@/lib/ai/paid-call-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/paid-call-gate")>();
  return {
    ...actual,
    runPaidStructuredCall,
  };
});

vi.mock("@/lib/usage/events-service", () => ({
  recordUsageEvent,
  sanitizeUsageMetadata: (metadata: Record<string, unknown> | null | undefined) =>
    metadata ?? undefined,
}));

import { recordAiStructuredUsage } from "@/lib/usage/ai-call";
import {
  ROLE_EXPERTISE_PROMPT_VERSION,
  generateRoleExpertiseWithModel,
  roleExpertiseAnswersFingerprint,
  roleExpertiseJobFingerprint,
  validateRoleExpertiseQuestions,
  type RoleExpertiseQuestion,
} from "@/lib/consultation/role-expertise";
import {
  ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS,
  ROLE_EXPERTISE_QUESTIONS_SYSTEM_INSTRUCTIONS,
  ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS_BEFORE_SPLIT,
} from "@/lib/prompt-content/role-expertise";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

function carAnswer(text: string) {
  return {
    text,
    answerFramework: "CAR" as const,
    challenge: "I faced a staffing gap on the unit.",
    situation: null,
    task: null,
    action: "I rebalanced assignments across the shift.",
    result: "Coverage held and patients stayed safe through the night.",
  };
}

function carQuestion(
  text: string,
  tag: RoleExpertiseQuestion["interviewTypeTag"] = "focused_competency",
): RoleExpertiseQuestion {
  const answer = carAnswer(text);
  return {
    interviewTypeTag: tag,
    ...answer,
  };
}

const nurseJob = {
  title: "ICU Nurse",
  companyName: "City Hospital",
  seniority: "mid",
  location: "Boston, MA",
  workArrangement: "onsite",
  requiredItems: ["BLS", "patient prioritization"],
  preferredItems: [],
  responsibilities: ["triage", "escalation"],
  scorecardJson: {},
};

describe("Harper model-split — role-expertise providers + usage metadata", () => {
  beforeEach(() => {
    generateStructured.mockReset();
    generateReplyStructured.mockReset();
    runPaidStructuredCall.mockReset();
    recordUsageEvent.mockReset();
    isConsultationAiConfigured.mockReturnValue(true);
    isConsultationReplyAiConfigured.mockReturnValue(true);
    runPaidStructuredCall.mockImplementation(async (input: {
      operation: string;
      callProvider: () => Promise<unknown>;
    }) => ({ data: await input.callProvider(), skipped: false }));
  });

  it("questions step uses consultation provider; answers step uses reply provider", async () => {
    generateStructured.mockResolvedValue({
      data: {
        questions: [
          {
            text: "How do you prioritize patients on a busy shift?",
            interviewTypeTag: "focused_competency",
          },
        ],
      },
    });
    generateReplyStructured.mockResolvedValue({
      data: {
        answers: [carAnswer("How do you prioritize patients on a busy shift?")],
      },
    });

    const result = await generateRoleExpertiseWithModel({
      organizationId: "org",
      campaignId: "camp",
      job: nurseJob,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "early_career",
      profileItems: [],
      usage: {
        organizationId: "org",
        campaignId: "camp",
        category: "CONSULTATION",
        operation: "CONSULTATION",
      },
    });

    expect(result.ok).toBe(true);
    expect(generateStructured).toHaveBeenCalled();
    expect(generateReplyStructured).toHaveBeenCalled();
    expect(runPaidStructuredCall.mock.calls[0]?.[0]?.operation).toBe(
      "ROLE_EXPERTISE_QUESTIONS",
    );
    expect(runPaidStructuredCall.mock.calls[1]?.[0]?.operation).toBe(
      "ROLE_EXPERTISE_ANSWERS",
    );

    const questionCall = generateStructured.mock.calls[0]?.[0] as {
      usage?: { operation?: string; metadata?: { step?: string; attempt?: number } };
      messages?: Array<{ content: string }>;
    };
    const answerCall = generateReplyStructured.mock.calls[0]?.[0] as {
      usage?: { operation?: string; metadata?: { step?: string; attempt?: number } };
      messages?: Array<{ content: string }>;
    };
    expect(questionCall.usage?.operation).toBe("CONSULTATION");
    expect(questionCall.usage?.metadata).toMatchObject({
      step: "role_expertise_questions",
      attempt: 1,
    });
    expect(answerCall.usage?.operation).toBe("CONSULTATION_REPLY");
    expect(answerCall.usage?.metadata).toMatchObject({
      step: "role_expertise_answers",
      attempt: 1,
    });
    expect(questionCall.messages?.[0]?.content).toContain(
      ROLE_EXPERTISE_QUESTIONS_SYSTEM_INSTRUCTIONS.slice(0, 80),
    );
    expect(answerCall.messages?.[0]?.content).toContain(
      ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS.slice(0, 80),
    );
  });

  it("keeps existing role-expertise validation rules after the split", () => {
    const checked = validateRoleExpertiseQuestions({
      questions: [
        carQuestion("How do you prioritize patients on a busy shift?"),
        {
          text: "How do you hand off at change of shift?",
          interviewTypeTag: "focused_competency",
          answerFramework: "CAR",
          challenge: "Busy floor.",
          situation: null,
          task: null,
          action: "",
          result: "Things improved overnight for the team.",
        },
      ],
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
    });
    expect(checked.valid).toHaveLength(1);
    expect(checked.issues.length).toBeGreaterThan(0);
    expect(ROLE_EXPERTISE_PROMPT_VERSION).toBe("3");
    expect(ROLE_EXPERTISE_SYSTEM_INSTRUCTIONS_BEFORE_SPLIT).toContain(
      "and a suggested answer for each",
    );
  });

  it("questions skipped when job fingerprint unchanged; profile alone does not re-run either step", async () => {
    const fp = roleExpertiseJobFingerprint(nurseJob);
    expect(roleExpertiseJobFingerprint(nurseJob)).toBe(fp);

    runPaidStructuredCall
      .mockResolvedValueOnce({
        data: {
          questions: [
            {
              text: "How do you prioritize patients?",
              interviewTypeTag: "focused_competency",
            },
          ],
        },
        skipped: true,
      })
      .mockResolvedValueOnce({
        data: {
          answers: [carAnswer("How do you prioritize patients?")],
        },
        skipped: true,
      });

    const result = await generateRoleExpertiseWithModel({
      organizationId: "org",
      campaignId: "camp",
      job: nurseJob,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "early_career",
      profileItems: [{ id: "profile-change", text: "brand new fact" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questionsSkipped).toBe(true);
    expect(result.answersSkipped).toBe(true);
    expect(result.skipped).toBe(true);
    expect(generateStructured).not.toHaveBeenCalled();
    expect(generateReplyStructured).not.toHaveBeenCalled();
  });

  it("new question set generates answers once (answers fingerprint follows questions)", async () => {
    const choices = [
      {
        text: "How do you prioritize patients?",
        interviewTypeTag: "focused_competency" as const,
      },
    ];
    const fpQuestions = roleExpertiseAnswersFingerprint(choices);
    expect(roleExpertiseAnswersFingerprint(choices)).toBe(fpQuestions);
    expect(
      roleExpertiseAnswersFingerprint([
        { ...choices[0]!, text: "Different question?" },
      ]),
    ).not.toBe(fpQuestions);

    generateStructured.mockResolvedValue({
      data: { questions: choices },
    });
    generateReplyStructured.mockResolvedValue({
      data: { answers: [carAnswer(choices[0]!.text)] },
    });

    const result = await generateRoleExpertiseWithModel({
      organizationId: "org",
      campaignId: "camp",
      job: nurseJob,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "early_career",
      profileItems: [],
    });
    expect(result.ok).toBe(true);
    expect(generateReplyStructured).toHaveBeenCalledTimes(1);
    expect(runPaidStructuredCall).toHaveBeenCalledTimes(2);
  });

  it("records step+attempt on Harper usage events including regenerations", async () => {
    await recordAiStructuredUsage({
      context: {
        organizationId: "org",
        campaignId: "camp",
        category: "CONSULTATION",
        operation: "CONSULTATION",
        metadata: { step: "plan", attempt: 1 },
      },
      provider: "openai-responses",
      model: "gpt-5.6-terra",
      usage: { inputTokens: 10, outputTokens: 5 },
      durationMs: 12,
      status: "SUCCESS",
    });
    await recordAiStructuredUsage({
      context: {
        organizationId: "org",
        campaignId: "camp",
        category: "CONSULTATION",
        operation: "CONSULTATION",
        metadata: { step: "plan", attempt: 2 },
      },
      provider: "openai-responses",
      model: "gpt-5.6-terra",
      usage: { inputTokens: 11, outputTokens: 6 },
      durationMs: 14,
      status: "SUCCESS",
    });
    await recordAiStructuredUsage({
      context: {
        organizationId: "org",
        campaignId: "camp",
        category: "CONSULTATION",
        operation: "CONSULTATION_REPLY",
        metadata: { step: "role_expertise_answers", attempt: 3 },
      },
      provider: "openai-responses",
      model: "gpt-5.6-luna",
      usage: { inputTokens: 20, outputTokens: 40 },
      durationMs: 20,
      status: "SUCCESS",
    });

    expect(recordUsageEvent).toHaveBeenCalledTimes(3);
    expect(recordUsageEvent.mock.calls[0]?.[0]).toMatchObject({
      operation: "CONSULTATION",
      metadata: { step: "plan", attempt: 1 },
    });
    expect(recordUsageEvent.mock.calls[1]?.[0]).toMatchObject({
      metadata: { step: "plan", attempt: 2 },
    });
    expect(recordUsageEvent.mock.calls[2]?.[0]).toMatchObject({
      operation: "CONSULTATION_REPLY",
      metadata: { step: "role_expertise_answers", attempt: 3 },
    });

    generateStructured
      .mockResolvedValueOnce({
        data: {
          questions: [
            {
              text: "Tell me about a time.",
              interviewTypeTag: "focused_competency",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          questions: [
            {
              text: "How do you prioritize patients on a busy shift?",
              interviewTypeTag: "focused_competency",
            },
          ],
        },
      });
    generateReplyStructured
      .mockResolvedValueOnce({
        data: {
          answers: [
            {
              text: "How do you prioritize patients on a busy shift?",
              answerFramework: "CAR",
              challenge: null,
              situation: null,
              task: null,
              action: "I acted.",
              result: "Ok.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          answers: [
            carAnswer("How do you prioritize patients on a busy shift?"),
          ],
        },
      });

    await generateRoleExpertiseWithModel({
      organizationId: "org",
      campaignId: "camp",
      job: nurseJob,
      minCount: 1,
      maxCount: 2,
      askedQuestions: [],
      chronologyAlreadyAsked: true,
      recentRoles: [],
      careerStage: "early_career",
      profileItems: [],
      usage: {
        organizationId: "org",
        campaignId: "camp",
        category: "CONSULTATION",
        operation: "CONSULTATION",
      },
    });

    const questionAttempts = generateStructured.mock.calls.map(
      (call) =>
        (call[0] as { usage?: { metadata?: { attempt?: number; step?: string } } })
          .usage?.metadata,
    );
    const answerAttempts = generateReplyStructured.mock.calls.map(
      (call) =>
        (call[0] as { usage?: { metadata?: { attempt?: number; step?: string } } })
          .usage?.metadata,
    );
    expect(questionAttempts[0]).toMatchObject({
      step: "role_expertise_questions",
      attempt: 1,
    });
    expect(questionAttempts[1]).toMatchObject({
      step: "role_expertise_questions",
      attempt: 2,
    });
    expect(answerAttempts[0]).toMatchObject({
      step: "role_expertise_answers",
      attempt: 1,
    });
    expect(answerAttempts[1]).toMatchObject({
      step: "role_expertise_answers",
      attempt: 2,
    });
  });

  it("nothing runs on a page view", () => {
    for (const path of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ConsultationSection.tsx",
      "src/components/ConsultationStanding.tsx",
      "src/components/HarperPersonView.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("generateRoleExpertiseWithModel");
      expect(text).not.toContain("ROLE_EXPERTISE_ANSWERS");
    }
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain('? "reassess" : "plan"');
    expect(service).toContain('"extract"');
    expect(service).toContain('"polish"');
    expect(service).toContain('"statement_regeneration"');
    expect(service).toContain("withHarperUsageAttempt");
  });
});
