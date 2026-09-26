import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processApplicationJob } from "@/lib/application-jobs/process";
import { formatApplicationJobLog } from "@/lib/application-jobs/types";
import { consultationConversationCopy } from "@/lib/product-config";
import { planQuestionRound } from "@/lib/consultation/questions";

const generators = [
  "src/lib/consultation/service.ts",
  "src/lib/application/next-step.ts",
  "src/lib/hiring-team/ai.ts",
];

describe("generated content is not rejected", () => {
  it("retries only unparseable model output", () => {
    for (const path of generators) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("logQualityRejection");
      expect(source).not.toContain("generation_quality_rejected");
      expect(source).not.toContain('check: "internal_state"');
      expect(source).not.toContain('check: "question_item"');
      expect(source).not.toContain('check: "assessment_verification"');
    }
    const plan = readFileSync("src/lib/consultation/service.ts", "utf8");
    expect(plan).toContain("if (!plan.ok)");
    expect(plan).toContain("failGeneration");
    expect(plan).not.toContain("mentionsInternalSystemState");
    expect(readFileSync("src/lib/interview/guide.ts", "utf8")).not.toContain(
      "logQualityRejection",
    );
    expect(readFileSync("src/lib/application-assets/service.ts", "utf8")).not.toContain(
      "logQualityRejection",
    );
    expect(readFileSync("src/lib/application-summary/service.ts", "utf8")).not.toContain(
      "logQualityRejection",
    );
    const questions = readFileSync("src/lib/consultation/questions.ts", "utf8");
    expect(questions).not.toContain("questionRestatesTarget");
    expect(questions).not.toContain("INTERNAL_STATE");
    expect(questions).not.toContain("A usable question was not written");
  });

  it("accepts a question that would have failed the old content checks", () => {
    const planned = planQuestionRound({
      assessments: [
        {
          key: "required:0",
          kind: "REQUIRED",
          text: "Lead enterprise sales",
          strength: "NONE",
          supportingFactIds: [],
          strategy: "PROVE_WITH_STORY",
          explanation: "Gap.",
          strategyText: "Prove it.",
          verification: {
            originalStrength: "NONE",
            invalidSupportingFactIds: [],
            invalidRoleIds: [],
            downgradeReasons: [],
          },
          experienceCalculation: null,
        },
      ],
      modelQuestions: [
        {
          targetKey: "required:0",
          text: "Lead with the OpenText revenue build and explain research status.",
          requirementInterpretation: "Lead enterprise sales",
          hiringTeamRoleId: "hm",
          whoCaresNote: "Needs a story.",
        },
      ],
      hiringTeam: [{ id: "hm", name: "Hiring Manager" }],
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: false,
      chronologyAsked: false,
    });
    expect(planned.questions).toHaveLength(1);
    expect(planned.questions[0]?.text).toContain("OpenText");
    expect(planned.dropped).toEqual([]);
  });

  it("records a failed job as failed and keeps Retry copy", () => {
    const failed = formatApplicationJobLog({
      ok: false,
      jobId: "job_consult",
      type: "CONSULTATION",
      campaignId: "camp_1",
      durationMs: 129562,
      error: consultationConversationCopy.planUnusable,
    });
    expect(failed).toContain("outcome=failed");
    expect(failed).not.toContain("outcome=succeeded");
    expect(consultationConversationCopy.retry).toMatch(/Retry/);
    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(process).toContain("failApplicationJob");
    expect(process).toContain("completeApplicationJob");
    expect(readFileSync("src/components/ConsultationSection.tsx", "utf8")).toContain(
      "retry-consultation",
    );
    expect(processApplicationJob).toEqual(expect.any(Function));
  });
});
