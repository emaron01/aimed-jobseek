/**
 * In-place re-synthesis for an approved Product — same product id, reviewable draft.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import {
  appendProductSourcesToBundle,
  type IngestSourceInput,
} from "@/lib/product-research/acquire";
import { isNearEmptyProductDraft } from "@/lib/product-research/review";
import { resynthesizeFromBundle } from "@/lib/product-research/synthesize";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import type { ProductMessagingDraft } from "@/lib/product-research/contract";
import { approveProductFromDraft } from "@/lib/product-research/approve";
import {
  productFieldsFromCandidateProfile,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";
import {
  buildProductResynthesisApplyPlan,
  mergeProtectedProductDraftFields,
  productDraftFromApprovedProfile,
} from "@/lib/product-research/resynthesize-approved-plan";
import { vocab } from "@/lib/product-config";

export const PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG = "approvedProductResynthesis";

export type {
  ProductResynthesisApplyPlan,
  ProductResynthesisApplyPlanItem,
  ProductResynthesisFieldDiff,
} from "@/lib/product-research/resynthesize-approved-plan";
export {
  buildProductResynthesisApplyPlan,
  mergeProtectedProductDraftFields,
  productDraftFromApprovedProfile,
} from "@/lib/product-research/resynthesize-approved-plan";

type PriorApprovalSnapshot = {
  approvalStatus: string;
  setupStatus: string;
  approvedEvidenceBundleId: string | null;
  approvedSetupRunId: string | null;
};

function priorApprovalFromProduct(product: {
  approvalStatus: string;
  setupStatus: string;
  approvedEvidenceBundleId: string | null;
  approvedSetupRunId: string | null;
}): PriorApprovalSnapshot {
  return {
    approvalStatus: product.approvalStatus,
    setupStatus: product.setupStatus,
    approvedEvidenceBundleId: product.approvedEvidenceBundleId,
    approvedSetupRunId: product.approvedSetupRunId,
  };
}

async function restorePriorApproval(input: {
  productId: string;
  prior: PriorApprovalSnapshot;
}): Promise<void> {
  await prisma.product.update({
    where: { id: input.productId },
    data: {
      approvalStatus: input.prior.approvalStatus as Prisma.ProductUpdateInput["approvalStatus"],
      setupStatus: input.prior.setupStatus as Prisma.ProductUpdateInput["setupStatus"],
      approvedEvidenceBundleId: input.prior.approvedEvidenceBundleId,
      approvedSetupRunId: input.prior.approvedSetupRunId,
    },
  });
}

async function tagApprovedProductResynthesisRun(input: {
  setupRunId: string;
  prior: PriorApprovalSnapshot;
}): Promise<void> {
  await prisma.productSetupRun.update({
    where: { id: input.setupRunId },
    data: {
      userContextJson: {
        [PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG]: true,
        priorApproval: input.prior,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function addProductSourcesAndResynthesize(input: {
  organizationId: string;
  productId: string;
  userId: string;
  sources: IngestSourceInput[];
}): Promise<{
  setupRunId: string;
  evidenceBundleId: string;
  status: "NEEDS_REVIEW" | "FAILED";
  message: string;
  errorSafe?: string;
}> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }
  if (product.approvalStatus !== "APPROVED") {
    throw new TenantError(
      `Only approved ${vocab.product.plural} can receive new material for re-synthesis.`,
    );
  }

  const prior = priorApprovalFromProduct(product);
  const parentBundleId =
    product.approvedEvidenceBundleId ??
    (
      await prisma.productEvidenceBundle.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
        },
        orderBy: { version: "desc" },
        select: { id: true },
      })
    )?.id ??
    null;

  const acquired = await appendProductSourcesToBundle({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    sources: input.sources,
    parentBundleId,
  });

  if (acquired.excerpts.length === 0) {
    throw new TenantError(
      acquired.errors[0] ||
        "No usable evidence from the new material. Try a different paste or upload.",
    );
  }

  const synth = await resynthesizeFromBundle({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    evidenceBundleId: acquired.evidenceBundleId,
  });

  await restorePriorApproval({ productId: product.id, prior });

  if (synth.status === "FAILED") {
    return {
      setupRunId: synth.setupRunId,
      evidenceBundleId: acquired.evidenceBundleId,
      status: "FAILED",
      message:
        synth.errorSafe ||
        "Evidence was saved, but re-synthesis failed. You can retry without re-uploading.",
      errorSafe: synth.errorSafe,
    };
  }

  const draft = synth.result?.candidateProfile ?? null;
  if (isNearEmptyProductDraft(draft)) {
    return {
      setupRunId: synth.setupRunId,
      evidenceBundleId: acquired.evidenceBundleId,
      status: "FAILED",
      message:
        `Re-synthesis produced an unusable draft. Your approved ${vocab.product.singular} was not changed.`,
      errorSafe: "Near-empty synthesis result.",
    };
  }

  await tagApprovedProductResynthesisRun({
    setupRunId: synth.setupRunId,
    prior,
  });

  return {
    setupRunId: synth.setupRunId,
    evidenceBundleId: acquired.evidenceBundleId,
    status: "NEEDS_REVIEW",
    message: "Re-synthesis draft ready for review.",
  };
}

export async function applyApprovedProductResynthesis(input: {
  organizationId: string;
  productId: string;
  userId: string;
  setupRunId: string;
  fields: {
    name: string;
    websiteUrl: string | null;
    averageOrderValue: number | null;
  };
  profile: CandidateProfile;
  editedFields?: string[];
}): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }

  const run = await prisma.productSetupRun.findFirst({
    where: {
      id: input.setupRunId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!run?.productDraftJson) {
    throw new TenantError("Re-synthesis draft not found.");
  }
  if (run.status !== "NEEDS_REVIEW") {
    throw new TenantError("This re-synthesis draft is no longer available for approval.");
  }

  const userContext = run.userContextJson as Record<string, unknown> | null;
  if (!userContext?.[PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG]) {
    throw new TenantError(`This setup run is not an in-place ${vocab.product.singular} re-synthesis.`);
  }

  const currentProfile = productDraftFromApprovedProfile(product.profileJson);
  const mergedProfile = mergeProtectedProductDraftFields({
    current: currentProfile,
    proposed: input.profile,
    manuallyEditedFields: product.manuallyEditedFields,
  });

  await approveProductFromDraft({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    setupRunId: run.id,
    fields: {
      ...productFieldsFromCandidateProfile(mergedProfile),
      name: input.fields.name,
      websiteUrl: input.fields.websiteUrl,
      averageOrderValue: input.fields.averageOrderValue,
    },
    profile: mergedProfile,
    messaging: (run.messagingDraftJson as ProductMessagingDraft | null) ?? null,
    editedFields: input.editedFields,
  });

  await prisma.productSetupRun.update({
    where: { id: run.id },
    data: {
      status: "APPROVED",
      completedAt: new Date(),
    },
  });
}

export async function finalizeApprovedProductResynthesisRun(input: {
  setupRunId: string;
  productId: string;
  organizationId: string;
}): Promise<void> {
  const run = await prisma.productSetupRun.findFirst({
    where: {
      id: input.setupRunId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!run) return;

  const userContext = run.userContextJson as {
    priorApproval?: PriorApprovalSnapshot;
    approvedProductResynthesis?: boolean;
  } | null;
  if (!userContext?.approvedProductResynthesis || !userContext.priorApproval) {
    return;
  }

  await restorePriorApproval({
    productId: input.productId,
    prior: userContext.priorApproval,
  });
}
