"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireCurrentUser } from "@/lib/auth/authz";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import { prisma } from "@/lib/prisma";
import {
  candidateProfileEditCopy,
  vocab,
} from "@/lib/product-config";
import { productFieldsFromCandidateProfile } from "@/lib/product-research/candidate-profile";
import {
  diffCandidateProfileFields,
  parseCandidateProfileFromFormData,
  storedProfileFromJson,
} from "@/lib/product-research/review";
import {
  confirmSeekerProfileEdits,
  mergeManuallyEditedFields,
} from "@/lib/product-research/seeker-edit";

export type CandidateProfileActionResult = {
  ok: boolean;
  message: string;
  productId?: string;
};

function revalidateProfile(productId: string): void {
  revalidatePath("/setup");
  revalidatePath("/products");
  revalidatePath(`/setup/${productId}`);
  revalidatePath(`/setup/${productId}/edit`);
  revalidatePath("/campaigns");
}

function safeError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return `Unable to save ${vocab.product.singular}. Please try again.`;
}

export async function saveCandidateProfileAction(
  _prev: CandidateProfileActionResult | null,
  formData: FormData,
): Promise<CandidateProfileActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    if (!productId) {
      return { ok: false, message: `${vocab.product.Singular} is required.` };
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: {
        id: true,
        profileJson: true,
        manuallyEditedFields: true,
      },
    });
    if (!product) {
      throw new TenantError(`${vocab.product.Singular} was not found.`);
    }

    const original = storedProfileFromJson(product.profileJson);
    let profile = parseCandidateProfileFromFormData(formData);
    const name = profile.identity.name?.text.trim() ?? "";
    if (!name) {
      return { ok: false, message: candidateProfileEditCopy.nameRequired };
    }

    profile = await confirmSeekerProfileEdits({
      organizationId,
      productId,
      userId: user.id,
      profile,
    });
    const newlyEdited = diffCandidateProfileFields(original, profile);
    const mirrored = productFieldsFromCandidateProfile(profile);

    await prisma.product.update({
      where: { id: product.id },
      data: {
        name,
        description: mirrored.description,
        valueProposition: mirrored.valueProposition,
        websiteUrl: profile.identity.personalSite?.text.trim() || null,
        profileJson: profile as unknown as Prisma.InputJsonValue,
        manuallyEditedFields: mergeManuallyEditedFields(
          product.manuallyEditedFields,
          newlyEdited,
        ) as unknown as Prisma.InputJsonValue,
      },
    });

    revalidateProfile(productId);
    return {
      ok: true,
      message: candidateProfileEditCopy.saved,
      productId,
    };
  } catch (error) {
    console.error("saveCandidateProfileAction failed", error);
    return { ok: false, message: safeError(error) };
  }
}
