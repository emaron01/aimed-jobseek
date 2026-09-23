/**
 * Email-generation failure classification + user-facing messages.
 * Reuses product-synthesis categories so UsageEvent metadata matches.
 */
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai/errors";
import { redactSecrets } from "@/lib/ai/redact";
import {
  classifyProductSynthesisError,
  type ProductSynthesisErrorInfo,
} from "@/lib/product-research/synthesis-errors";
import { isClaimGuardViolationCode } from "@/lib/email-generation/claim-conflicts";
import { TenantError } from "@/lib/tenant/errors";
import { PaymentLockError } from "@/lib/billing/payment-lock";
import { UsageQuotaError } from "@/lib/usage/quota";
import { vocab } from "@/lib/product-config";

export type EmailGenerationErrorInfo = ProductSynthesisErrorInfo;

export function classifyEmailGenerationError(
  error: unknown,
  stage = "generateStructured",
): EmailGenerationErrorInfo {
  return classifyProductSynthesisError(error, stage);
}

export function toSafeEmailGenerationError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof PaymentLockError) return error.message;
  if (error instanceof UsageQuotaError) return error.message;
  if (
    error instanceof Error &&
    error.message === "Verify your email address to continue with this action."
  ) {
    return error.message;
  }

  const classified = classifyEmailGenerationError(error);
  const detail = userFacingDetail(error, classified);
  return `[${classified.category}] ${detail}`;
}

function userFacingDetail(
  error: unknown,
  classified: EmailGenerationErrorInfo,
): string {
  if (error instanceof AiConfigError) {
    return "Email generation AI is not configured.";
  }
  if (error instanceof AiTimeoutError) {
    return "Email generation timed out. Please try again.";
  }
  if (error instanceof AiValidationError) {
    const first = classified.validationIssues?.[0];
    if (first && isClaimGuardViolationCode(first.code)) {
      const detail = first.expected?.trim() || first.code;
      return `Generated copy conflicts with ${vocab.product.singular} restrictions: ${detail}`;
    }
    if (first) {
      return `Email draft failed schema validation (${first.path}: ${first.code}). Please try again.`;
    }
    return "Email generation returned an invalid draft. Please try again.";
  }
  if (error instanceof AiProviderError) {
    if (classified.category === "STRUCTURED_OUTPUT") {
      return "Email generation structured-output request was rejected. Please try again.";
    }
    return "Email generation is temporarily unavailable. Please try again.";
  }
  return "Unable to generate this email. Please try again.";
}

export function emailGenerationFailureUsageMetadata(
  error: unknown,
  classified: EmailGenerationErrorInfo,
): Record<string, unknown> {
  const usage =
    error instanceof AiValidationError ? error.usage : undefined;
  return {
    errorType:
      error instanceof Error
        ? error.name || error.constructor.name || "Error"
        : "UnknownError",
    errorCategory: classified.category,
    errorMessage: classified.messageSafe,
    httpStatus: classified.httpStatus ?? null,
    providerCode: classified.providerCode ?? null,
    providerType: classified.providerType ?? null,
    stage: classified.stage,
    validationIssues: classified.validationIssues ?? null,
    rawTextPreview:
      error instanceof AiValidationError
        ? error.rawTextPreview ?? null
        : null,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
  };
}

/**
 * Log a truncated, redacted model response when draft schema validation fails.
 * Never includes API keys or full prompts.
 */
export function logEmailGenerationValidationFailure(input: {
  organizationId: string;
  campaignId: string;
  campaignContactId: string;
  provider: string | null;
  model: string | null;
  classified: EmailGenerationErrorInfo;
  rawTextPreview?: string | null;
  durationMs: number;
  retryCount: number;
}): void {
  console.error(
    "[email-generation]",
    JSON.stringify({
      event: "email_generation_validation_failed",
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      campaignContactId: input.campaignContactId,
      provider: input.provider,
      model: input.model,
      stage: input.classified.stage,
      category: input.classified.category,
      httpStatus: input.classified.httpStatus ?? null,
      providerCode: input.classified.providerCode ?? null,
      validationIssues: input.classified.validationIssues ?? null,
      messageSafe: redactSecrets(input.classified.messageSafe).slice(0, 400),
      rawTextPreview: input.rawTextPreview
        ? redactSecrets(input.rawTextPreview).slice(0, 800)
        : null,
      durationMs: input.durationMs,
      retryCount: input.retryCount,
    }),
  );
}
