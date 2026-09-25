import { describe, expect, it } from "vitest";
import { applicationNextStepState } from "@/lib/application/next-step";

const idle = {
  consultationGenerationStatus: null,
  resumePlanStatus: null,
  coverPlanStatus: null,
  hasResume: false,
  hasCoverLetter: false,
  appliedAt: null,
};

describe("application next-step state", () => {
  it("changes with consultation, plan, and applied state", () => {
    expect(
      applicationNextStepState({ ...idle, consultationStatus: null }).key,
    ).toBe("consultation_not_started");
    expect(
      applicationNextStepState({
        ...idle,
        consultationStatus: "IN_PROGRESS",
        consultationGenerationStatus: "READY",
      }).key,
    ).toBe("consultation_in_progress");
    expect(
      applicationNextStepState({
        ...idle,
        consultationStatus: "DONE",
        resumePlanStatus: "DRAFT",
      }).key,
    ).toBe("resume_plan_ready");
    expect(
      applicationNextStepState({
        ...idle,
        consultationStatus: "DONE",
        resumePlanStatus: "ACCEPTED",
        hasResume: true,
      }).key,
    ).toBe("mark_applied");
    expect(
      applicationNextStepState({
        ...idle,
        consultationStatus: "DONE",
        hasResume: true,
        appliedAt: "2026-09-25T00:00:00.000Z",
      }).key,
    ).toBe("applied");
  });
});
