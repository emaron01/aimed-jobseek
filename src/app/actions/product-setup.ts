"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import { PaymentLockError } from "@/lib/billing/payment-lock";
import { createProduct, updateProduct } from "@/lib/tenant/data";
import { toOptionalFloat } from "@/lib/utils";
import { researchAndBuildProduct } from "@/lib/product-research/workflow";
import {
  approvePersonaFromDraft,
  approveProductFromDraft,
} from "@/lib/product-research/approve";
import { resynthesizeFromBundle } from "@/lib/product-research/synthesize";
import {
  addProductSourcesAndResynthesize,
  applyApprovedProductResynthesis,
  finalizeApprovedProductResynthesisRun,
} from "@/lib/product-research/resynthesize-approved";
import { productUrlResearchIsStale } from "@/lib/product-research/acquire";
import type { IngestSourceInput } from "@/lib/product-research/acquire";
import type {
  PersonaDraft,
  ProductMessagingDraft,
  SuggestedPersona,
} from "@/lib/product-research/contract";
import { productFieldsFromCandidateProfile } from "@/lib/product-research/candidate-profile";
import { confirmProfileContactDetails } from "@/lib/product-research/contact-details";
import {
  diffCandidateProfileFields,
  parseCandidateProfileFromFormData,
  storedProfileFromJson,
} from "@/lib/product-research/review";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";
import { assertGatedAction } from "@/lib/product-config/feature-access";

export type ProductSetupActionResult = {
  ok: boolean;
  message: string;
  productId?: string;
  setupRunId?: string;
  evidenceBundleId?: string;
  status?: string;
};

function revalidateProduct(productId?: string) {
  revalidatePath("/setup");
  revalidatePath("/products");
  if (productId) revalidatePath(`/setup/${productId}`);
  if (productId) revalidatePath(`/setup/${productId}/research`);
  if (productId) revalidatePath(`/setup/${productId}/research/resynthesis`);
}

function safeError(error: unknown): string {
  if (error instanceof PaymentLockError) return error.message;
  if (error instanceof TenantError) return error.message;
  return `Unable to complete ${vocab.product.singular} setup. Please try again.`;
}

/**
 * Create product with name only (or minimal fields) — no AI required.
 */
export async function createProductMinimalAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    await requireCurrentUser();
    await requireOrganizationId();
    const name = String(formData.get("name") || "").trim();
    if (!name) {
      return { ok: false, message: `${vocab.product.Singular} name is required.` };
    }
    const websiteUrl = String(formData.get("primaryUrl") || "").trim() || null;
    const product = await createProduct({
      name,
      websiteUrl,
      description: null,
      valueProposition: null,
      averageOrderValue: null,
    });
    revalidateProduct(product.id);
    return {
      ok: true,
      message: `${vocab.product.Singular} saved.`,
      productId: product.id,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/**
 * Research & Build Product — acquire evidence once, synthesize drafts.
 */
export async function researchAndBuildProductAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();

    let productId = String(formData.get("productId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const primaryUrl = String(formData.get("primaryUrl") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const pasted = String(formData.get("pastedContent") || "").trim();
    const additionalUrls = String(formData.get("additionalUrls") || "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const forceUrlRefresh = formData.get("forceUrlRefresh") === "1";

    if (!productId) {
      if (!name) {
        return { ok: false, message: `${vocab.product.Singular} name is required.` };
      }
      const created = await createProduct({
        name,
        websiteUrl: primaryUrl || null,
        description: null,
        valueProposition: null,
        averageOrderValue: null,
      });
      productId = created.id;
    } else if (name) {
      await updateProduct(productId, {
        name,
        websiteUrl: primaryUrl || null,
      });
    }

    const sources: IngestSourceInput[] = [];
    if (primaryUrl) {
      sources.push({ type: "URL", url: primaryUrl, displayName: `Primary ${vocab.product.singular} URL` });
    }
    for (const u of additionalUrls) {
      sources.push({ type: "URL", url: u });
    }
    if (notes) {
      sources.push({ type: "USER_NOTE", text: notes, displayName: `${vocab.product.Singular} notes` });
    }
    if (pasted) {
      sources.push({
        type: "PASTED_TEXT",
        text: pasted,
        displayName: `Pasted ${vocab.product.singular} content`,
      });
    }

    const files = formData.getAll("files");
    for (const file of files) {
      if (!(file instanceof File) || file.size === 0) continue;
      const buf = new Uint8Array(await file.arrayBuffer());
      sources.push({
        type: "UPLOADED_DOCUMENT",
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: buf,
      });
    }

    if (sources.length === 0) {
      return {
        ok: false,
        message:
          "Add at least one source (URL, notes, paste, or upload) to research & build.",
        productId,
      };
    }

    const result = await researchAndBuildProduct({
      organizationId,
      productId,
      userId: user.id,
      sources,
      forceUrlRefresh,
    });

    revalidateProduct(productId);
    return {
      ok: result.status !== "FAILED",
      message: result.message,
      productId,
      setupRunId: result.setupRunId,
      evidenceBundleId: result.evidenceBundleId,
      status: result.status,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function retryProductSynthesisAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const evidenceBundleId = String(formData.get("evidenceBundleId") || "").trim();
    if (!productId || !evidenceBundleId) {
      return { ok: false, message: `${vocab.product.Singular} and evidence bundle are required.` };
    }
    const result = await resynthesizeFromBundle({
      organizationId,
      productId,
      userId: user.id,
      evidenceBundleId,
    });
    revalidateProduct(productId);
    return {
      ok: result.status !== "FAILED",
      message:
        result.status === "FAILED"
          ? result.errorSafe ||
            `${vocab.product.Singular} synthesis could not be completed. Acquired evidence was preserved.`
          : `Synthesis complete — review the ${vocab.product.Singular} draft.`,
      productId,
      setupRunId: result.setupRunId,
      evidenceBundleId,
      status: result.status,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/** Retry synthesis for an in-place approved-product resynthesis draft. */
export async function retryApprovedProductResynthesisAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const setupRunId = String(formData.get("setupRunId") || "").trim();
    const evidenceBundleId = String(formData.get("evidenceBundleId") || "").trim();
    if (!productId || !setupRunId || !evidenceBundleId) {
      return {
        ok: false,
        message: `${vocab.product.Singular}, setup run, and evidence bundle are required.`,
      };
    }

    const priorRun = await prisma.productSetupRun.findFirst({
      where: { id: setupRunId, organizationId, productId },
    });
    if (!priorRun?.userContextJson) {
      return { ok: false, message: "Re-synthesis run not found." };
    }

    const result = await resynthesizeFromBundle({
      organizationId,
      productId,
      userId: user.id,
      evidenceBundleId,
    });

    await prisma.productSetupRun.update({
      where: { id: result.setupRunId },
      data: { userContextJson: priorRun.userContextJson },
    });
    await finalizeApprovedProductResynthesisRun({
      organizationId,
      productId,
      setupRunId: result.setupRunId,
    });

    revalidateProduct(productId);
    return {
      ok: result.status !== "FAILED",
      message:
        result.status === "FAILED"
          ? result.errorSafe ||
            `Re-synthesis could not be completed. Your approved ${vocab.product.singular} was not changed.`
          : "Re-synthesis draft ready for review.",
      productId,
      setupRunId: result.setupRunId,
      evidenceBundleId,
      status: result.status,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/**
 * Append new paste/notes/uploads to an approved product, re-synthesize in place.
 */
export async function addProductSourcesAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    if (!productId) {
      return { ok: false, message: `${vocab.product.Singular} is required.` };
    }

    const notes = String(formData.get("notes") || "").trim();
    const pasted = String(formData.get("pastedContent") || "").trim();
    const sources: IngestSourceInput[] = [];
    if (notes) {
      sources.push({ type: "USER_NOTE", text: notes, displayName: `${vocab.product.Singular} notes` });
    }
    if (pasted) {
      sources.push({
        type: "PASTED_TEXT",
        text: pasted,
        displayName: `Pasted ${vocab.product.singular} content`,
      });
    }

    const files = formData.getAll("files");
    for (const file of files) {
      if (!(file instanceof File) || file.size === 0) continue;
      const buf = new Uint8Array(await file.arrayBuffer());
      sources.push({
        type: "UPLOADED_DOCUMENT",
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: buf,
      });
    }

    if (sources.length === 0) {
      return {
        ok: false,
        message: "Add at least one note, paste, or upload.",
        productId,
      };
    }

    const result = await addProductSourcesAndResynthesize({
      organizationId,
      productId,
      userId: user.id,
      sources,
    });

    revalidateProduct(productId);
    return {
      ok: result.status !== "FAILED",
      message: result.message,
      productId,
      setupRunId: result.setupRunId,
      evidenceBundleId: result.evidenceBundleId,
      status: result.status,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function applyProductResynthesisAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const setupRunId = String(formData.get("setupRunId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    if (!productId || !setupRunId || !name) {
      return {
        ok: false,
        message: `${vocab.product.Singular}, setup run, and name are required.`,
      };
    }

    const run = await prisma.productSetupRun.findFirst({
      where: { id: setupRunId, organizationId, productId },
    });
    if (!run) {
      return { ok: false, message: "Setup run not found." };
    }

    const existingProduct = await prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { name: true, websiteUrl: true },
    });
    const originalDraft = storedProfileFromJson(run.productDraftJson);
    const profile = parseCandidateProfileFromFormData(formData);
    const websiteUrl = String(formData.get("websiteUrl") || "").trim() || null;
    const editedFields = diffCandidateProfileFields(originalDraft, profile);
    if (existingProduct && name !== existingProduct.name) {
      editedFields.push("name");
    }
    if (existingProduct && websiteUrl !== (existingProduct.websiteUrl ?? null)) {
      editedFields.push("websiteUrl");
    }

    await applyApprovedProductResynthesis({
      organizationId,
      productId,
      userId: user.id,
      setupRunId,
      fields: {
        name,
        websiteUrl,
        averageOrderValue: toOptionalFloat(formData.get("averageOrderValue")),
      },
      profile,
      editedFields,
    });

    revalidateProduct(productId);
    return {
      ok: true,
      message:
        `${vocab.product.Singular} updated. ${vocab.icp.Plural} and ${vocab.campaign.plural} still use this ${vocab.product.singular}.`,
      productId,
      setupRunId,
      status: "APPROVED",
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/**
 * SUPER_ADMIN or development-only Product AI config diagnostic.
 * Never returns API keys.
 */
export async function getProductAiConfigDiagnosticAction(): Promise<{
  ok: boolean;
  message: string;
  diagnostic?: ReturnType<
    typeof import("@/lib/ai/config").getProductAiConfigDiagnostic
  >;
}> {
  try {
    const user = await requireCurrentUser();
    const isDev = process.env.NODE_ENV === "development";
    if (user.platformRole !== "SUPER_ADMIN" && !isDev) {
      return { ok: false, message: "Not authorized." };
    }
    const { getProductAiConfigDiagnostic } = await import("@/lib/ai/config");
    return {
      ok: true,
      message: `${vocab.product.Singular} AI configuration diagnostic.`,
      diagnostic: getProductAiConfigDiagnostic(),
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function saveApprovedProductAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const setupRunId = String(formData.get("setupRunId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    if (!productId || !setupRunId || !name) {
      return {
        ok: false,
        message: `${vocab.product.Singular}, setup run, and name are required.`,
      };
    }

    const run = await prisma.productSetupRun.findFirst({
      where: { id: setupRunId, organizationId, productId },
    });
    if (!run) {
      return { ok: false, message: "Setup run not found." };
    }

    const existingProduct = await prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { name: true, websiteUrl: true },
    });
    const originalDraft = storedProfileFromJson(run.productDraftJson);
    let profile = parseCandidateProfileFromFormData(formData);
    const websiteUrl = String(formData.get("websiteUrl") || "").trim() || null;
    const editedFields = diffCandidateProfileFields(originalDraft, profile);
    if (existingProduct && name !== existingProduct.name) {
      editedFields.push("name");
    }
    if (existingProduct && websiteUrl !== (existingProduct.websiteUrl ?? null)) {
      editedFields.push("websiteUrl");
    }
    profile = await confirmProfileContactDetails({
      organizationId,
      productId,
      userId: user.id,
      profile,
    });

    await approveProductFromDraft({
      organizationId,
      productId,
      userId: user.id,
      setupRunId,
      fields: {
        ...productFieldsFromCandidateProfile(profile),
        name,
        websiteUrl,
        averageOrderValue: toOptionalFloat(formData.get("averageOrderValue")),
      },
      profile,
      messaging: (run.messagingDraftJson as ProductMessagingDraft | null) ?? null,
      editedFields,
    });

    revalidateProduct(productId);
    return {
      ok: true,
      message:
        `${vocab.product.Singular} approved. ${vocab.campaign.Plural} and generated documents will use this record.`,
      productId,
      setupRunId,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function saveApprovedPersonaFromSuggestionAction(
  _prev: ProductSetupActionResult | null,
  formData: FormData,
): Promise<ProductSetupActionResult> {
  try {
    assertGatedAction("productLevelHiringTeam");
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const setupRunId = String(formData.get("setupRunId") || "").trim();
    const suggestionKey = String(formData.get("suggestionKey") || "").trim();
    if (!productId || !setupRunId || !suggestionKey) {
      return { ok: false, message: `Missing ${vocab.product.singular}, setup run, or suggestion.` };
    }

    const run = await prisma.productSetupRun.findFirst({
      where: { id: setupRunId, organizationId, productId },
    });
    if (!run) return { ok: false, message: "Setup run not found." };

    const suggestions =
      (run.suggestedPersonasJson as SuggestedPersona[] | null) ?? [];
    const drafts = (run.personaDraftsJson as PersonaDraft[] | null) ?? [];
    const suggestion = suggestions.find((s) => s.suggestionKey === suggestionKey);
    const draft =
      drafts.find((d) => d.suggestionKey === suggestionKey) ||
      (suggestion
        ? ({
            suggestionKey,
            name: String(formData.get("name") || suggestion.name),
            definition: String(formData.get("definition") || "") || null,
            likelyTitles: String(formData.get("targetTitles") || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            department: String(formData.get("department") || "") || null,
            seniority: String(formData.get("seniority") || "") || null,
            responsibilities: String(formData.get("responsibilities") || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            ownershipAreas: [],
            painPoints: String(formData.get("painPoints") || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            desiredOutcomesFromYourSolution: String(
              formData.get("desiredOutcomes") || "",
            )
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            positiveRoleSignals: [],
            negativeRoleSignals: [],
            messagingNotes: String(formData.get("messagingNotes") || "") || null,
            personaPositioning: null,
            relevantProofPoints: [],
            likelyObjections: [],
            researchGuidance: null,
            criteria: [],
          } satisfies PersonaDraft)
        : null);

    if (!suggestion || !draft) {
      return { ok: false, message: `Suggested ${vocab.persona.singular} not found in this run.` };
    }

    // Apply form overrides
    draft.name = String(formData.get("name") || draft.name).trim() || draft.name;
    draft.definition =
      String(formData.get("definition") || draft.definition || "").trim() ||
      draft.definition;
    draft.department =
      String(formData.get("department") || draft.department || "").trim() ||
      draft.department;
    draft.seniority =
      String(formData.get("seniority") || draft.seniority || "").trim() ||
      draft.seniority;
    draft.messagingNotes =
      String(formData.get("messagingNotes") || draft.messagingNotes || "").trim() ||
      draft.messagingNotes;

    const personaId = await approvePersonaFromDraft({
      organizationId,
      productId,
      userId: user.id,
      setupRunId,
      suggestion,
      draft,
    });

    revalidateProduct(productId);
    return {
      ok: true,
      message: `${vocab.persona.Singular} saved and approved.`,
      productId,
      setupRunId,
      status: personaId,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function getProductUrlStaleFlagAction(
  productId: string,
): Promise<boolean> {
  const organizationId = await requireOrganizationId();
  return productUrlResearchIsStale({ organizationId, productId });
}
