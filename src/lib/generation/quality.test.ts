import { afterEach, describe, expect, it, vi } from "vitest";
import { validateRepetitionAndMetaLanguage } from "@/lib/consultation/output-quality";
import {
  logQualityRejection,
  qualityIssue,
  qualityMessages,
  replaceEmDashes,
  replaceEmDashesDeep,
} from "@/lib/generation/quality";

describe("generation quality helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the failed check, field, and trimmed offending text", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logQualityRejection({
      generator: "consultation.plan",
      attempt: 1,
      issues: [
        qualityIssue({
          check: "internal_state",
          field: "briefing.overall",
          text: "  research is pending  ",
          message: "Remove references to internal system state.",
        }),
      ],
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toEqual({
      event: "generation_quality_rejected",
      generator: "consultation.plan",
      attempt: 1,
      check: "internal_state",
      field: "briefing.overall",
      text: "research is pending",
    });
  });

  it("replaces em dashes silently and never treats posting language as a quality failure", () => {
    expect(
      replaceEmDashes("I led billing — then cut failed runs."),
    ).toBe("I led billing, then cut failed runs.");
    expect(
      replaceEmDashesDeep({
        subject: "Enterprise sales — Director",
        body: "A proven track record in a fast-paced, dynamic environment.",
      }),
    ).toEqual({
      subject: "Enterprise sales, Director",
      body: "A proven track record in a fast-paced, dynamic environment.",
    });
    expect(
      qualityMessages(
        validateRepetitionAndMetaLanguage({
          text: "This Director of Enterprise Sales role is fast-paced and results-driven, in a dynamic environment, with a proven track record.",
          field: "briefing.overall",
        }),
      ),
    ).toEqual([]);
  });
});
