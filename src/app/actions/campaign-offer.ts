"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import {
  validateCampaignOffer,
  type CampaignOfferFields,
} from "@/lib/campaign/offer-validation";
import {
  getCampaignOfferValidationTarget,
  updateCampaignOffer,
} from "@/lib/campaign/settings";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export type CampaignOfferActionResult = {
  ok: boolean;
  message: string;
  values?: CampaignOfferFields;
  semanticValidationCompleted?: boolean;
};

function readOffer(formData: FormData): CampaignOfferFields {
  const value = (key: string) => String(formData.get(key) ?? "").trim() || null;
  return {
    offerName: value("offerName"),
    offerDescription: value("offerDescription"),
    offerCta: value("offerCta"),
    offerNotes: value("offerNotes"),
  };
}

export async function updateCampaignOfferAction(
  _previous: CampaignOfferActionResult | null,
  formData: FormData,
): Promise<CampaignOfferActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const values = readOffer(formData);
  if (!campaignId) {
    return { ok: false, message: `${vocab.campaign.Singular} is required.`, values };
  }

  try {
    const [campaign, user] = await Promise.all([
      getCampaignOfferValidationTarget(campaignId),
      requireCurrentUser(),
    ]);
    const validation = await validateCampaignOffer({
      organizationId: campaign.organizationId,
      userId: user.id,
      productId: campaign.productId,
      personaId: campaign.personaId,
      offer: values,
    });

    await updateCampaignOffer({
      campaignId,
      ...values,
      offerValidationJson: {
        conflicts: validation.conflicts,
        semanticValidationCompleted: validation.semanticValidationCompleted,
      },
      offerValidationHash: validation.hash,
    });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message: "Offer saved.",
      values,
      semanticValidationCompleted: validation.semanticValidationCompleted,
    };
  } catch (error) {
    console.error("Failed to update campaign offer.", error);
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : `Unable to update the ${vocab.campaign.singular} offer. Please try again.`,
      values,
    };
  }
}
