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
  CONSULTATION_PROMPT_VERSION,
  consultationPolishSchema,
} from "@/lib/consultation/contract";
import {
  composeInterviewAnswerFromParts,
  containsFrameworkOrPartLabel,
  normalizePolishAnswer,
  parseAnswerPartsGrounding,
  resultStatesOutcome,
  validatePolishPartsQuality,
} from "@/lib/consultation/polish-parts";
import { polishAnswerWithQuality } from "@/lib/consultation/service";
import { CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import {
  consultationConfig,
  consultationConversationCopy,
} from "@/lib/product-config/consultation";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

function polishFields(
  partial: Partial<{
    answerFramework: "CAR" | "STAR" | null;
    interviewAnswer: string | null;
    challenge: string | null;
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
    resumeBullet: string | null;
    strengtheningNote: string | null;
  }>,
) {
  return {
    answerFramework: null as "CAR" | "STAR" | null,
    interviewAnswer: null as string | null,
    challenge: null as string | null,
    situation: null as string | null,
    task: null as string | null,
    action: null as string | null,
    result: null as string | null,
    resumeBullet: null as string | null,
    strengtheningNote: null as string | null,
    ...partial,
  };
}

describe("Harper Batch D3 — CAR/STAR polish parts", () => {
  beforeEach(() => {
    generateStructured.mockReset();
    isConsultationAiConfigured.mockReturnValue(true);
  });

  it("bumps prompt version and uses the PO polish parts instruction", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("30");
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(
      'When confirmedGap is false and whyThisCompany is false: turn the person\'s answers into interview answer parts and one resume bullet.',
    );
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(
      'choose answerFramework "CAR" (challenge, action, result) by default, or "STAR"',
    );
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).toContain(
      "a number is welcome when the facts include one but is never required",
    );
    expect(CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS).not.toContain(
      "Follow Situation, Task, Action, Result without naming that structure",
    );
    expect(consultationConfig.qualityRegenerationAttempts).toBe(2);
  });

  it("rejects a polish output missing a required part or with an empty result and regenerates", async () => {
    expect(
      consultationPolishSchema.safeParse(
        polishFields({
          answerFramework: "CAR",
          challenge: "I faced a reliability gap.",
          action: "I rewrote the path.",
          result: "",
          resumeBullet: "Rewrote the path.",
        }),
      ).success,
    ).toBe(true);

    expect(
      validatePolishPartsQuality({
        data: polishFields({
          answerFramework: "CAR",
          challenge: "I faced a reliability gap.",
          action: "I rewrote the path.",
          result: "",
          resumeBullet: "Rewrote the path.",
        }),
        whyThisCompany: false,
        confirmedGap: false,
        maxWords: consultationConfig.interviewAnswerMaxWords,
      }).some((issue) => /result/i.test(issue)),
    ).toBe(true);

    expect(
      validatePolishPartsQuality({
        data: polishFields({
          answerFramework: "STAR",
          situation: "At Northwind the billing path was fragile.",
          task: "",
          action: "I rewrote the path.",
          result: "Failed runs fell and billing held through releases.",
          resumeBullet: "Rewrote the path.",
        }),
        whyThisCompany: false,
        confirmedGap: false,
        maxWords: consultationConfig.interviewAnswerMaxWords,
      }).some((issue) => /task/i.test(issue)),
    ).toBe(true);

    generateStructured.mockResolvedValue({
      data: polishFields({
        answerFramework: "CAR",
        challenge: "I faced a reliability gap on payments.",
        action: "I rewrote the failing path with the team.",
        result: "",
        resumeBullet: "Rewrote the failing payments path.",
      }),
    });

    const polished = await polishAnswerWithQuality({
      answer: "I rewrote the failing payments path at Northwind.",
      story: {
        situation: null,
        task: null,
        action: null,
        result: null,
      },
      sources: [
        {
          id: "answer:1",
          text: "I rewrote the failing payments path at Northwind.",
        },
      ],
      profileItems: [],
      declinedFollowUp: false,
      strengtheningNeeds: [],
      seekerAnswers: ["I rewrote the failing payments path at Northwind."],
    });

    expect(polished.ok).toBe(false);
    expect(generateStructured.mock.calls.length).toBe(
      consultationConfig.qualityRegenerationAttempts + 1,
    );
    const feedbackPayload = generateStructured.mock.calls[1]?.[0]?.messages
      ?.map((message: { content: string }) => {
        try {
          return JSON.parse(message.content) as { qualityFeedback?: string[] };
        } catch {
          return {};
        }
      })
      .find((payload: { qualityFeedback?: string[] }) =>
        Boolean(payload.qualityFeedback?.length),
      );
    expect(
      feedbackPayload?.qualityFeedback?.some((item: string) =>
        /result/i.test(item),
      ),
    ).toBe(true);
  });

  it("accepts qualitative results with no number (nursing, hospitality, new-grad project)", () => {
    const nursing =
      "The patient stabilized and was able to rest through the night.";
    const hospitality =
      "Guests started coming back and the evening shift ran more smoothly.";
    const classProject =
      "The team finished the class project on time and the professor used it as an example.";

    for (const result of [nursing, hospitality, classProject]) {
      expect(resultStatesOutcome(result)).toBe(true);
      expect(
        validatePolishPartsQuality({
          data: polishFields({
            answerFramework: "CAR",
            challenge: "I faced a hard shift with little backup.",
            action: "I stepped in and adjusted how we handled the work.",
            result,
            resumeBullet: "Stepped in and adjusted how the shift ran.",
          }),
          whyThisCompany: false,
          confirmedGap: false,
          maxWords: consultationConfig.interviewAnswerMaxWords,
        }),
      ).toEqual([]);
      expect(/\d/.test(result)).toBe(false);
    }
  });

  it("rejects only label/heading and explicit method references; allows ordinary words", () => {
    for (const pass of [
      "we reached a four-star rating",
      "I won the Rising Star award",
      "I negotiated car rental partnerships",
      "I made the STAR Club two years running",
      "the challenge was a 30% staffing gap",
      "the result was a calmer unit",
      "I faced a reliability gap and rewrote the path.",
    ]) {
      expect(containsFrameworkOrPartLabel(pass)).toBe(false);
    }

    for (const fail of [
      "Challenge: the unit was short-staffed",
      "Result: patients were discharged sooner",
      "Situation: We were short-staffed.",
      "Using the STAR method, I stabilized the unit.",
      "Here is my answer in CAR format",
      "I used the STAR method here.",
      "This follows the CAR framework.",
    ]) {
      expect(containsFrameworkOrPartLabel(fail)).toBe(true);
    }

    expect(
      validatePolishPartsQuality({
        data: polishFields({
          answerFramework: "CAR",
          challenge: "Challenge: I faced a reliability gap.",
          action: "I rewrote the failing path.",
          result: "Failed runs fell and billing held through releases.",
          resumeBullet: "Rewrote the failing path.",
        }),
        whyThisCompany: false,
        confirmedGap: false,
        maxWords: consultationConfig.interviewAnswerMaxWords,
      }).some((issue) => /CAR|STAR|label/i.test(issue)),
    ).toBe(true);
  });

  it("parseAnswerPartsGrounding accepts parts shape and legacy empty array", () => {
    expect(parseAnswerPartsGrounding([])).toBeNull();
    expect(parseAnswerPartsGrounding({})).toBeNull();
    expect(parseAnswerPartsGrounding(null)).toBeNull();
    expect(
      parseAnswerPartsGrounding({
        answerFramework: "CAR",
        challenge: "I faced a staffing gap on the unit.",
        action: "I rebalanced assignments across the shift.",
        result: "The unit stayed calm through the night.",
      }),
    ).toEqual({
      answerFramework: "CAR",
      challenge: "I faced a staffing gap on the unit.",
      action: "I rebalanced assignments across the shift.",
      result: "The unit stayed calm through the night.",
    });
    expect(
      parseAnswerPartsGrounding({
        answerFramework: "STAR",
        situation: "The evening shift was short-staffed.",
        task: "I owned guest recovery for the floor.",
        action: "I reassigned hosts and checked every table.",
        result: "Guests stayed and the floor ran smoothly.",
      }),
    ).toMatchObject({ answerFramework: "STAR" });
  });

  it("approve path preserves groundingJson (does not wipe parts)", () => {
    const service = src("src/lib/consultation/service.ts");
    const approveStart = service.indexOf(
      "export async function approveConsultationStatement",
    );
    expect(approveStart).toBeGreaterThan(-1);
    const approveBody = service.slice(approveStart, approveStart + 2200);
    const updateStart = approveBody.indexOf(
      "prisma.consultationStatement.update",
    );
    const updateBlock = approveBody.slice(updateStart, updateStart + 500);
    expect(updateBlock).toContain('status: "APPROVED"');
    expect(updateBlock).not.toContain("groundingJson");
  });

  it("composes parts in order, respects max words, and stores grounding", () => {
    const composed = composeInterviewAnswerFromParts([
      "I faced failed invoice runs delaying billing",
      "I rewrote the failing path with the payments team",
      "Failed runs fell from eight percent to under one percent",
    ]);
    expect(composed).toBe(
      "I faced failed invoice runs delaying billing. I rewrote the failing path with the payments team. Failed runs fell from eight percent to under one percent.",
    );
    expect(composed).not.toMatch(/Challenge:|Action:|Result:|CAR|STAR/);

    const normalized = normalizePolishAnswer({
      data: polishFields({
        answerFramework: "CAR",
        challenge: "I faced failed invoice runs delaying billing",
        action: "I rewrote the failing path with the payments team",
        result: "Failed runs fell from eight percent to under one percent",
        resumeBullet: "Rewrote the failing payments path.",
      }),
      whyThisCompany: false,
      confirmedGap: false,
    });
    expect(normalized.interviewAnswer).toBe(composed);
    expect(normalized.answerPartsGrounding).toEqual({
      answerFramework: "CAR",
      challenge: "I faced failed invoice runs delaying billing",
      action: "I rewrote the failing path with the payments team",
      result: "Failed runs fell from eight percent to under one percent",
    });
    expect(
      normalized.interviewAnswer.split(/\s+/).filter(Boolean).length,
    ).toBeLessThanOrEqual(consultationConfig.interviewAnswerMaxWords);

    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain("interviewAnswerGroundingJson");
    expect(service).toContain("answerPartsGrounding");
    expect(service).toContain("validatePolishPartsQuality");
  });

  it("keeps whyThisCompany and confirmedGap as a single answer with no parts", () => {
    expect(
      validatePolishPartsQuality({
        data: polishFields({
          interviewAnswer:
            "I want to work here because the mission matches how I already work.",
        }),
        whyThisCompany: true,
        confirmedGap: false,
        maxWords: consultationConfig.interviewAnswerMaxWords,
      }),
    ).toEqual([]);

    expect(
      validatePolishPartsQuality({
        data: polishFields({
          answerFramework: "CAR",
          challenge: "I have not done that work yet.",
          action: "I would bridge from related reliability work.",
          result: "I would close the gap in the first weeks on the job.",
        }),
        whyThisCompany: true,
        confirmedGap: false,
        maxWords: consultationConfig.interviewAnswerMaxWords,
      }).length,
    ).toBeGreaterThan(0);

    const why = normalizePolishAnswer({
      data: polishFields({
        interviewAnswer:
          "I want to work here because the mission matches how I already work.",
      }),
      whyThisCompany: true,
      confirmedGap: false,
    });
    expect(why.answerPartsGrounding).toBeNull();
    expect(why.resumeBullet).toBeNull();

    const gap = normalizePolishAnswer({
      data: polishFields({
        interviewAnswer:
          "I have not done that work yet. The closest related experience I have is reliability work I already own, and I would close the gap in this role by ramping in the first weeks.",
      }),
      whyThisCompany: false,
      confirmedGap: true,
    });
    expect(gap.answerPartsGrounding).toBeNull();
    expect(gap.resumeBullet).toBeNull();
  });

  it("after the last failed attempt shows needs-more-detail and never deletes approved answers", async () => {
    generateStructured.mockResolvedValue({
      data: polishFields({
        answerFramework: "CAR",
        challenge: "Challenge: labeled challenge text here.",
        action: "I rewrote the failing path.",
        result: "Failed runs fell and billing held through releases.",
        resumeBullet: "Rewrote the failing path.",
      }),
    });
    const polished = await polishAnswerWithQuality({
      answer: "I rewrote the failing payments path.",
      story: {
        situation: null,
        task: null,
        action: null,
        result: null,
      },
      sources: [{ id: "a", text: "I rewrote the failing payments path." }],
      profileItems: [],
      declinedFollowUp: false,
      strengtheningNeeds: [],
    });
    expect(polished.ok).toBe(false);
    expect(generateStructured.mock.calls.length).toBe(
      consultationConfig.qualityRegenerationAttempts + 1,
    );
    expect(consultationConversationCopy.needsMoreDetailToShape).toBe(
      "Add a bit more detail so Harper can shape this answer.",
    );
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain("finishItemNeedsMoreDetail");
    const finishStart = service.indexOf("async function finishItemNeedsMoreDetail");
    const finishBody = service.slice(finishStart, finishStart + 1400);
    expect(finishBody).toContain('status: "DRAFT"');
    expect(finishBody).toContain("never APPROVED");
    expect(finishBody).toContain("turnId: input.resultTurnId");
    expect(finishBody).not.toContain("input.supersedeTurnIds");
  });

  it("renders no framework name or part label in Harper or Cheat Sheet, and rendering is free", () => {
    const paths = [
      "src/components/ConsultationSection.tsx",
      "src/components/ConsultationThread.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/lib/consultation/harper-layout.ts",
      "src/lib/consultation/harper-display-qa.ts",
      "src/lib/consultation/qa-view.ts",
    ];
    for (const path of paths) {
      const text = src(path);
      expect(text).not.toContain("answerFramework");
      expect(text).not.toContain("Challenge:");
      expect(text).not.toContain("Situation:");
      expect(text).not.toMatch(/\banswerPartsGrounding\b/);
    }
    const layout = src("src/lib/consultation/harper-layout.ts");
    const display = src("src/lib/consultation/harper-display-qa.ts");
    expect(layout).not.toMatch(/enqueue|generateStructured|paid/i);
    expect(display).not.toMatch(/enqueueApplicationJob|generateStructured/);
  });
});
