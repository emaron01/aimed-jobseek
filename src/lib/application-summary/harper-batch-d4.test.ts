import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  cheatSheetCoachItemGenerateSchema,
  cheatSheetPersonSectionGenerateSchema,
} from "@/lib/application-summary/contract";
import {
  composeSampleAnswerFromParts,
  harperAlreadyAskedCareerWalkThrough,
  normalizePersonSectionLikelyQuestions,
  sortLikelyQuestionsByWhoTag,
  validateLikelyQuestionItem,
  validatePersonSectionLikelyQuestions,
} from "@/lib/application-summary/likely-questions";
import { containsFrameworkOrPartLabel } from "@/lib/consultation/polish-parts";
import { APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/application-summary";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

function carItem(
  partial: Partial<{
    prompt: string;
    interviewTypeTag:
      | "screening"
      | "chronological_walk_through"
      | "focused_competency"
      | "reference_check_prep";
    challenge: string;
    action: string;
    result: string;
    sampleAnswer: string | null;
    harperQuestion: string | null;
  }>,
) {
  return {
    prompt: partial.prompt ?? "Tell me how you handled a hard shift.",
    interviewTypeTag: partial.interviewTypeTag ?? ("focused_competency" as const),
    sampleAnswer: partial.sampleAnswer ?? null,
    harperQuestion: partial.harperQuestion ?? null,
    answerFramework: "CAR" as const,
    challenge: partial.challenge ?? "I faced a staffing gap on the unit.",
    situation: null,
    task: null,
    action: partial.action ?? "I rebalanced assignments across the shift.",
    result: partial.result ?? "The unit stayed calm through the night.",
    supports: [],
  };
}

describe("Harper Batch D4 — Cheat Sheet WHO tags + CAR/STAR parts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("STEP 1: interview guide generation and rendering are removed after Batches B1–B5", () => {
    expect(() => src("src/lib/interview/guide.ts")).toThrow();
    const process = src("src/lib/application-jobs/process.ts");
    const action = src("src/app/actions/interview.ts");
    expect(process).toContain('case "INTERVIEW_GUIDE"');
    expect(process).not.toContain("requestInterviewGuide");
    expect(process).toContain("Guide generation was removed");
    expect(action).not.toContain("generateInterviewGuideAction");
    expect(action).not.toContain('type: "INTERVIEW_GUIDE"');

    for (const path of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/ConsultationSection.tsx",
      "src/components/HarperPersonView.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("getInterviewGuideView");
      expect(text).not.toContain("parseGuideContent");
      expect(text).not.toContain("generateInterviewGuideAction");
    }
  });

  it("bumps application-summary prompt version and adds the PO likely-questions line", () => {
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("15");
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(
      "Every likelyQuestions item includes interviewTypeTag, one of: screening, chronological_walk_through, focused_competency, reference_check_prep.",
    );
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(
      "Every sampleAnswer is returned as answerFramework plus its parts",
    );
    const service = src("src/lib/application-summary/service.ts");
    expect(service).toMatch(/for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
    expect(service).toContain("validatePersonSectionLikelyQuestions");
    expect(service).toContain("qualityFeedback");
  });

  it("rejects missing interviewTypeTag or missing sampleAnswer parts via schema/quality", () => {
    expect(
      cheatSheetCoachItemGenerateSchema.safeParse({
        prompt: "Tell me how you ran forecast.",
        sampleAnswer: null,
        harperQuestion: null,
        answerFramework: "CAR",
        challenge: "I faced slip.",
        situation: null,
        task: null,
        action: "I installed a Monday commit.",
        result: "Slip fell and the week held.",
        supports: [],
      }).success,
    ).toBe(false);

    expect(
      validateLikelyQuestionItem(
        carItem({
          result: "",
        }),
      ).some((issue) => /result/i.test(issue)),
    ).toBe(true);

    expect(
      validatePersonSectionLikelyQuestions({
        likelyQuestions: [
          {
            prompt: "Tell me about a time you closed a gap.",
            interviewTypeTag: "focused_competency",
            sampleAnswer: null,
            harperQuestion: null,
            answerFramework: null,
            challenge: null,
            situation: null,
            task: null,
            action: null,
            result: null,
            supports: [],
          },
        ],
      }).some((issue) => /answerFramework|parts/i.test(issue)),
    ).toBe(true);
  });

  it("accepts qualitative results and bare star/car; rejects labels and method refs", () => {
    for (const result of [
      "The patient stabilized and was able to rest through the night.",
      "Guests started coming back and the evening shift ran more smoothly.",
      "The team finished the class project on time and the professor used it as an example.",
    ]) {
      expect(validateLikelyQuestionItem(carItem({ result }))).toEqual([]);
    }
    for (const pass of [
      "we reached a four-star rating",
      "I won the Rising Star award",
      "I negotiated car rental partnerships",
      "I made the STAR Club two years running",
      "the challenge was a 30% staffing gap",
      "the result was a calmer unit",
    ]) {
      expect(containsFrameworkOrPartLabel(pass)).toBe(false);
    }
    for (const fail of [
      "Challenge: the unit was short-staffed",
      "Result: patients were discharged sooner",
      "Using the STAR method, I stabilized the unit.",
      "Here is my answer in CAR format",
    ]) {
      expect(containsFrameworkOrPartLabel(fail)).toBe(true);
    }
  });

  it("composes sampleAnswer and keeps parts alongside; harperQuestion needs no parts", () => {
    const composed = composeSampleAnswerFromParts(
      carItem({
        challenge: "I faced failed invoice runs delaying billing",
        action: "I rewrote the failing path with the payments team",
        result: "Failed runs fell from eight percent to under one percent",
      }),
    );
    expect(composed).toBe(
      "I faced failed invoice runs delaying billing. I rewrote the failing path with the payments team. Failed runs fell from eight percent to under one percent.",
    );
    expect(composed).not.toMatch(/Challenge:|Action:|Result:|CAR|STAR/);

    const normalized = normalizePersonSectionLikelyQuestions({
      likelyQuestions: [
        carItem({
          challenge: "I faced failed invoice runs delaying billing",
          action: "I rewrote the failing path with the payments team",
          result: "Failed runs fell from eight percent to under one percent",
        }),
      ],
      harperAskedCareerWalkThrough: false,
    });
    expect(normalized[0]?.sampleAnswer).toBe(composed);
    expect(normalized[0]?.answerFramework).toBe("CAR");
    expect(normalized[0]?.challenge).toContain("failed invoice");

    const harperOnly = normalizePersonSectionLikelyQuestions({
      likelyQuestions: [
        {
          prompt: "Tell me how you ran enterprise forecast.",
          interviewTypeTag: "focused_competency",
          sampleAnswer: null,
          harperQuestion: "Which roles did that forecast work come from?",
          answerFramework: null,
          challenge: null,
          situation: null,
          task: null,
          action: null,
          result: null,
          supports: [],
        },
      ],
      harperAskedCareerWalkThrough: false,
    });
    expect(harperOnly[0]?.harperQuestion).toMatch(/roles/);
    expect(harperOnly[0]?.sampleAnswer).toBeNull();
    expect(harperOnly[0]?.answerFramework).toBeNull();
    expect(validateLikelyQuestionItem(harperOnly[0]!)).toEqual([]);
  });

  it("orders likely questions by WHO sequence and drops duplicate career walk-through", () => {
    const ordered = sortLikelyQuestionsByWhoTag([
      carItem({
        prompt: "What would a former manager confirm?",
        interviewTypeTag: "reference_check_prep",
      }),
      carItem({
        prompt: "Why do you want this company?",
        interviewTypeTag: "screening",
      }),
      carItem({
        prompt: "Walk me through your career for the last ten years.",
        interviewTypeTag: "chronological_walk_through",
      }),
      carItem({
        prompt: "Tell me how you closed a competency gap.",
        interviewTypeTag: "focused_competency",
      }),
    ]);
    expect(ordered.map((item) => item.interviewTypeTag)).toEqual([
      "screening",
      "chronological_walk_through",
      "focused_competency",
      "reference_check_prep",
    ]);

    expect(
      harperAlreadyAskedCareerWalkThrough([
        {
          speaker: "CONSULTANT",
          targetKey: "chronology",
          body: "Walk me through your last ten years.",
        },
      ]),
    ).toBe(true);

    const deduped = normalizePersonSectionLikelyQuestions({
      likelyQuestions: [
        carItem({
          prompt: "Why do you want this company?",
          interviewTypeTag: "screening",
        }),
        carItem({
          prompt: "Walk me through your career for the last ten years.",
          interviewTypeTag: "chronological_walk_through",
        }),
      ],
      harperAskedCareerWalkThrough: true,
    });
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.interviewTypeTag).toBe("screening");
  });

  it("existing guidance without parts still displays", () => {
    const legacy = {
      prompt: "Tell me how you ran a weekly forecast?",
      sampleAnswer: "I rebuilt the forecast cadence.",
      harperQuestion: null,
      supports: [],
    };
    const body = src("src/components/CheatSheetCoachItems.tsx");
    expect(body).toContain("item.sampleAnswer");
    expect(body).not.toContain("interviewTypeTag");
    expect(body).not.toContain("answerFramework");
    expect(legacy.sampleAnswer).toBe("I rebuilt the forecast cadence.");
  });

  it("renders no tag, framework name, or part label; rendering is free", () => {
    for (const path of [
      "src/components/CheatSheetPersonBody.tsx",
      "src/components/CheatSheetCoachItems.tsx",
      "src/components/HarperPersonView.tsx",
      "src/components/ConsultationSection.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("interviewTypeTag");
      expect(text).not.toContain("answerFramework");
      expect(text).not.toContain("Challenge:");
      expect(text).not.toContain("chronological_walk_through");
    }
    const body = src("src/components/CheatSheetPersonBody.tsx");
    expect(body).not.toMatch(/enqueueApplicationJob|generateStructured/);
  });

  it("person generate schema requires interviewTypeTag on likely questions", () => {
    const parsed = cheatSheetPersonSectionGenerateSchema.safeParse({
      sectionKey: "contact:1",
      roleId: "role-1",
      contactId: "c1",
      heading: "Alex",
      sectionKind: "HIRING_MANAGER",
      caresAbout: [{ text: "Forecast", seekerConnection: "I own it", supports: [] }],
      positioningStatements: [{ text: "I own forecast", supports: [] }],
      keyStatements: [{ text: "I run Monday commit", supports: [] }],
      likelyQuestions: [
        {
          prompt: "Tell me how you ran forecast.",
          sampleAnswer: null,
          harperQuestion: null,
          answerFramework: "CAR",
          challenge: "I faced slip.",
          situation: null,
          task: null,
          action: "I installed a Monday commit.",
          result: "Slip fell and the week held.",
          supports: [],
        },
      ],
      questionsToAsk: [{ text: "What does success look like?", followUps: [], supports: [] }],
    });
    expect(parsed.success).toBe(false);
  });
});
