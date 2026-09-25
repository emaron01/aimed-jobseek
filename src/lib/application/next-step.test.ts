import { describe, expect, it } from "vitest";
import {
  applicationNextStepState,
  rejectedNextStep,
} from "@/lib/application/next-step";
import { consultationConfig } from "@/lib/product-config";

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

  it("the not-started consultation card starts the coach, not a schedule", () => {
    expect(
      rejectedNextStep(
        `Schedule your initial consultation with ${consultationConfig.displayName}.`,
        "consultation_not_started",
      ),
    ).toBe(true);
    expect(
      rejectedNextStep(
        `Start ${consultationConfig.displayName} in this workspace to review the posting.`,
        "consultation_not_started",
      ),
    ).toBe(false);
  });
});
