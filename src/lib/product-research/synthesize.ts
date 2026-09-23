import "server-only";

import { Prisma } from "@prisma/client";
import {
  getAiConfigPublicSummary,
  getProductAiConfig,
  getProductAiProvider,
  isProductAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { AiValidationError } from "@/lib/ai/errors";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  parseProductAiResponse,
  type ProductSynthesisResult,
} from "@/lib/product-research/contract";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import {
  classifyProductSynthesisError,
  logProductSynthesisFailure,
  USER_FACING_SYNTHESIS_FAILURE,
} from "@/lib/product-research/synthesis-errors";
import { transformProductAiResponse } from "@/lib/product-research/transform";
import { vocab } from "@/lib/product-config";

export async function synthesizeProductSetup(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  evidenceBundleId: string;
  correlationId: string;
  excerpts: EvidenceExcerpt[];
  productName: string;
  primaryUrl: string | null;
  /** Provider retries already attempted for this logical call (usually 0). */
  retryCount?: number;
}): Promise<{
  setupRunId: string;
  result: ProductSynthesisResult | null;
  status: "NEEDS_REVIEW" | "FAILED";
  errorSafe?: string;
  errorCategory?: string;
}> {
  const retryCount = input.retryCount ?? 0;

  if (input.excerpts.length === 0) {
    throw new TenantError(
      "No usable evidence to synthesize. Add a URL, notes, paste, or document.",
    );
  }

  const run = await prisma.productSetupRun.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      evidenceBundleId: input.evidenceBundleId,
      correlationId: input.correlationId,
      status: "SYNTHESIZING",
      synthesisPromptVersion: PRODUCT_SYNTHESIS_PROMPT_VERSION,
      createdByUserId: input.userId,
    },
  });

  await prisma.product.update({
    where: { id: input.productId },
    data: { setupStatus: "SYNTHESIZING" },
  });

  const started = Date.now();
  let providerSummary: ReturnType<typeof getAiConfigPublicSummary> | null =
    null;
  let stage = "config";

  const fail = async (error: unknown, failStage: string) => {
    const classified = classifyProductSynthesisError(error, failStage);
    const durationMs = Date.now() - started;

    logProductSynthesisFailure({
      event: "product_synthesis_error",
      organizationId: input.organizationId,
      productId: input.productId,
      setupRunId: run.id,
      evidenceBundleId: input.evidenceBundleId,
      correlationId: input.correlationId,
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      endpoint: providerSummary?.modelUrlIdentifier ?? null,
      stage: classified.stage,
      category: classified.category,
      httpStatus: classified.httpStatus,
      providerCode: classified.providerCode,
      providerType: classified.providerType,
      validationIssues: classified.validationIssues,
      durationMs,
      retryCount,
      messageSafe: classified.messageSafe,
    });

    const errorSafe = USER_FACING_SYNTHESIS_FAILURE;

    await prisma.productSetupRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorSafe: `[${classified.category}] ${errorSafe}`,
        completedAt: new Date(),
        aiProvider: providerSummary?.provider,
        aiModel: providerSummary?.model,
      },
    });

    await prisma.product.update({
      where: { id: input.productId },
      data: { setupStatus: "FAILED" },
    });

    const usageFromValidation =
      error instanceof AiValidationError ? error.usage : undefined;

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PRODUCT_RESEARCH",
      operation: "PRODUCT_SYNTHESIS",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "FAILED",
      durationMs,
      retryCount,
      inputTokens: usageFromValidation?.inputTokens ?? null,
      outputTokens: usageFromValidation?.outputTokens ?? null,
      operationId: input.correlationId,
      metadata: {
        correlationId: input.correlationId,
        productId: input.productId,
        evidenceBundleId: input.evidenceBundleId,
        setupRunId: run.id,
        errorCategory: classified.category,
        httpStatus: classified.httpStatus ?? null,
        providerCode: classified.providerCode ?? null,
        stage: classified.stage,
      },
    });

    return {
      setupRunId: run.id,
      result: null,
      status: "FAILED" as const,
      errorSafe,
      errorCategory: classified.category,
    };
  };

  if (!isProductAiConfigured()) {
    return fail(
      new TenantError(
        `${vocab.product.Singular} research AI is not configured. Set PRODUCT_AI_* environment variables.`,
      ),
      "config",
    );
  }

  try {
    stage = "getProductAiProvider";
    const ai = getProductAiProvider();
    const config = getProductAiConfig();
    providerSummary = getAiConfigPublicSummary(config);

    stage = "generateStructured";
    const response = await ai.generateStructured({
      ...structuredOutputRequest("productSynthesis"),
      messages: buildProductSynthesisMessages({
        productName: input.productName,
        primaryUrl: input.primaryUrl,
        excerpts: input.excerpts,
      }),
      parseOutput: parseProductAiResponse,
    });

    stage = "validation";
    const aiResult = response.data;
    const allowedSourceIds = new Set(input.excerpts.map((e) => e.sourceId));
    const result = transformProductAiResponse(aiResult, { allowedSourceIds });

    stage = "persist";
    await prisma.productSetupRun.update({
      where: { id: run.id },
      data: {
        status: "NEEDS_REVIEW",
        productDraftJson:
          result.candidateProfile as unknown as Prisma.InputJsonValue,
        messagingDraftJson: Prisma.DbNull,
        suggestedPersonasJson: [] as unknown as Prisma.InputJsonValue,
        personaDraftsJson: Prisma.DbNull,
        aiProvider: providerSummary.provider,
        aiModel: providerSummary.model,
        completedAt: new Date(),
        errorSafe: null,
      },
    });

    await prisma.productEvidenceBundle.update({
      where: { id: input.evidenceBundleId },
      data: { status: "NEEDS_REVIEW" },
    });

    await prisma.product.update({
      where: { id: input.productId },
      data: {
        setupStatus: "NEEDS_REVIEW",
        approvalStatus: "NEEDS_REVIEW",
      },
    });

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PRODUCT_RESEARCH",
      operation: "PRODUCT_SYNTHESIS",
      provider: providerSummary.provider,
      model: providerSummary.model,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      retryCount,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      operationId: input.correlationId,
      metadata: {
        correlationId: input.correlationId,
        productId: input.productId,
        evidenceBundleId: input.evidenceBundleId,
        setupRunId: run.id,
        promptVersion: PRODUCT_SYNTHESIS_PROMPT_VERSION,
        suggestedPersonaCount: 0,
        ...(response.coercedFields?.length
          ? { coercedFields: response.coercedFields }
          : {}),
      },
    });

    return { setupRunId: run.id, result, status: "NEEDS_REVIEW" };
  } catch (error) {
    return fail(error, stage);
  }
}

/** Retry synthesis using an existing evidence bundle (no URL reacquisition / web search). */
export async function resynthesizeFromBundle(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  evidenceBundleId: string;
}): Promise<ReturnType<typeof synthesizeProductSetup>> {
  const bundle = await prisma.productEvidenceBundle.findFirst({
    where: {
      id: input.evidenceBundleId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!bundle) {
    throw new TenantError(
      "Evidence bundle not found in the active organization.",
    );
  }
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }

  const raw = bundle.normalizedEvidenceJson;
  let excerpts: EvidenceExcerpt[] = [];
  if (Array.isArray(raw)) {
    excerpts = raw as EvidenceExcerpt[];
  } else if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { excerpts?: unknown }).excerpts)
  ) {
    excerpts = (raw as { excerpts: EvidenceExcerpt[] }).excerpts;
  }

  if (excerpts.length === 0) {
    throw new TenantError(
      "Evidence bundle has no usable excerpts. Re-run Research & Build with sources.",
    );
  }

  return synthesizeProductSetup({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    evidenceBundleId: bundle.id,
    correlationId: bundle.correlationId,
    excerpts,
    productName: product.name,
    primaryUrl: product.websiteUrl,
  });
}
