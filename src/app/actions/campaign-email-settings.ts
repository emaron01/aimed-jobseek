"use server";

import { revalidatePath } from "next/cache";
import {
  parseCampaignEmailSettingsFormData,
  type CampaignEmailSettingsActionResult,
} from "@/lib/campaign/save";
import { updateCampaignEmailSettings } from "@/lib/campaign/settings";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export async function updateCampaignEmailSettingsAction(
  _prev: CampaignEmailSettingsActionResult | null,
  formData: FormData,
): Promise<CampaignEmailSettingsActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const parsed = parseCampaignEmailSettingsFormData(formData);

  if (!campaignId) {
    return { ok: false, message: `${vocab.campaign.Singular} is required.`, values: parsed.values };
  }

  if (Object.keys(parsed.fieldErrors).length > 0) {
    return {
      ok: false,
      message:
        parsed.fieldErrors.emailLength ??
        parsed.fieldErrors.emailGuidance ??
        "Please fix the highlighted fields.",
      values: parsed.values,
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    await updateCampaignEmailSettings({
      campaignId,
      ...parsed.fields,
    });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message: "Email settings updated.",
      values: parsed.values,
    };
  } catch (error) {
    console.error("Failed to update campaign email settings.", error);
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to update application guidance. Please try again.",
      values: parsed.values,
    };
  }
}
