import "server-only";

import {
  acquireProductEvidence,
  type IngestSourceInput,
} from "@/lib/product-research/acquire";
import { synthesizeProductSetup } from "@/lib/product-research/synthesize";
import { isNearEmptyProductDraft } from "@/lib/product-research/review";
import { PRODUCT_URL_UNREADABLE_MESSAGE } from "@/lib/product-research/extraction-quality";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import type { ProductDraft } from "@/lib/product-research/contract";
import { vocab } from "@/lib/product-config";

/**
 * End-to-end: acquire/reuse evidence once → single synthesis → drafts for review.
 * Creating multiple personas from this run does NOT re-run URL research.
 */
export async function researchAndBuildProduct(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  sources: IngestSourceInput[];
  forceUrlRefresh?: boolean;
}): Promise<{
  evidenceBundleId: string;
  setupRunId: string;
  correlationId: string;
  status: string;
  message: string;
  sourceCount: number;
  suggestedPersonaCount: number;
}> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }

  const acquired = await acquireProductEvidence({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    sources: input.sources,
    forceUrlRefresh: input.forceUrlRefresh,
  });

  if (acquired.excerpts.length === 0) {
    await prisma.product.update({
      where: { id: product.id },
      data: { setupStatus: "FAILED" },
    });
    throw new TenantError(
      acquired.errors[0] ||
        PRODUCT_URL_UNREADABLE_MESSAGE,
    );
  }

  const synth = await synthesizeProductSetup({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    evidenceBundleId: acquired.evidenceBundleId,
    correlationId: acquired.correlationId,
    excerpts: acquired.excerpts,
    productName: product.name,
    primaryUrl: product.websiteUrl,
  });

  if (synth.status === "FAILED") {
    return {
      evidenceBundleId: acquired.evidenceBundleId,
      setupRunId: synth.setupRunId,
      correlationId: acquired.correlationId,
      status: "FAILED",
      message:
        synth.errorSafe ||
        "Evidence was saved, but AI synthesis failed. You can Retry Synthesis without re-fetching URLs or running web search.",
      sourceCount: acquired.excerpts.length,
      suggestedPersonaCount: 0,
    };
  }

  const draft = (synth.result?.productDraft ?? null) as ProductDraft | null;
  if (isNearEmptyProductDraft(draft)) {
    await prisma.product.update({
      where: { id: product.id },
      data: { setupStatus: "FAILED" },
    });
    if (synth.setupRunId) {
      await prisma.productSetupRun.update({
        where: { id: synth.setupRunId },
        data: {
          status: "FAILED",
          errorSafe:
            acquired.errors[0] || PRODUCT_URL_UNREADABLE_MESSAGE,
        },
      });
    }
    return {
      evidenceBundleId: acquired.evidenceBundleId,
      setupRunId: synth.setupRunId,
      correlationId: acquired.correlationId,
      status: "FAILED",
      message:
        acquired.errors[0] || PRODUCT_URL_UNREADABLE_MESSAGE,
      sourceCount: acquired.excerpts.length,
      suggestedPersonaCount: 0,
    };
  }

  return {
    evidenceBundleId: acquired.evidenceBundleId,
    setupRunId: synth.setupRunId,
    correlationId: acquired.correlationId,
    status: acquired.partial ? "PARTIAL" : "NEEDS_REVIEW",
    message: acquired.partial
      ? `${vocab.product.Singular} draft ready for review (some sources failed).`
      : `${vocab.product.Singular} draft ready for review.`,
    sourceCount: acquired.excerpts.length,
    suggestedPersonaCount: synth.result?.suggestedBuyerRoles.length ?? 0,
  };
}
