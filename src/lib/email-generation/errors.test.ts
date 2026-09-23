import { describe, expect, it } from "vitest";
import { vocab } from "@/lib/product-config";
import {
  AiProviderError,
  AiValidationError,
} from "@/lib/ai/errors";
import {
  classifyEmailGenerationError,
  emailGenerationFailureUsageMetadata,
  toSafeEmailGenerationError,
} from "@/lib/email-generation/errors";

describe("email generation error observability", () => {
  it("names claim-guard conflicts with the product restriction description", () => {
    const error = new AiValidationError(
      "Generated email conflicts with product claims or offer evidence.",
      {
        issues: [
          {
            path: "body:Guaranteed revenue growth",
            code: "PROHIBITED_CLAIM",
            expected:
              "Generated copy repeats a prohibited claim: Guaranteed revenue growth",
            matchedGuard: "Guaranteed revenue growth",
            bodyExcerpt: "Guaranteed revenue growth",
          },
        ],
        usage: { inputTokens: 5871, outputTokens: 694 },
      },
    );
    expect(toSafeEmailGenerationError(error)).toBe(
      `[VALIDATION] Generated copy conflicts with ${vocab.product.singular} restrictions: Generated copy repeats a prohibited claim: Guaranteed revenue growth`,
    );
    const classified = classifyEmailGenerationError(error);
    expect(classified.stage).toBe("claimValidation");
    expect(classified.validationIssues?.[0]?.code).toBe("PROHIBITED_CLAIM");
  });

  it("keeps schema-validation wording for non-claim AiValidationError", () => {
    const error = new AiValidationError("structured output failed validation.", {
      issues: [{ path: "reasoning", code: "too_small", expected: ">=1" }],
    });
    expect(toSafeEmailGenerationError(error)).toBe(
      "[VALIDATION] Email draft failed schema validation (reasoning: too_small). Please try again.",
    );
  });

  it("records the same failure shape as product synthesis on UsageEvent metadata", () => {
    const error = new AiValidationError("structured output failed validation.", {
      issues: [{ path: "body", code: "invalid_type" }],
      usage: { inputTokens: 20, outputTokens: 3 },
      rawTextPreview: '{"subject":1}',
    });
    const classified = classifyEmailGenerationError(error);
    const meta = emailGenerationFailureUsageMetadata(error, classified);
    expect(meta).toMatchObject({
      errorType: "AiValidationError",
      errorCategory: "VALIDATION",
      stage: "validation",
      inputTokens: 20,
      outputTokens: 3,
      rawTextPreview: '{"subject":1}',
    });
    expect(meta.validationIssues).toEqual([
      { path: "body", code: "invalid_type" },
    ]);
  });

  it("classifies structured-output provider rejections distinctly", () => {
    const error = new AiProviderError(
      "Invalid text.format: Use response_format instead.",
      { status: 400, providerCode: "invalid_request_error" },
    );
    const classified = classifyEmailGenerationError(error);
    expect(classified.category).toBe("STRUCTURED_OUTPUT");
    expect(toSafeEmailGenerationError(error)).toMatch(/^\[STRUCTURED_OUTPUT\]/);
  });
});
