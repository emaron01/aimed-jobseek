"use server";

import { revalidatePath } from "next/cache";
import { askHarper } from "@/lib/consultation/ask-harper";
import { requireCurrentUser } from "@/lib/auth/session";
import { consultationConversationCopy, vocab } from "@/lib/product-config";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type AskHarperActionResult = {
  ok: boolean;
  message: string;
};

export async function askHarperAction(
  _prev: AskHarperActionResult | null,
  formData: FormData,
): Promise<AskHarperActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    const result = await askHarper({
      organizationId,
      campaignId,
      question: String(formData.get("question") ?? ""),
    });
    if (!result.ok) return result;
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/consultation`);
    revalidatePath(`/campaigns/${campaignId}/interviews`);
    revalidatePath(`/campaigns/${campaignId}/summary`);
    return { ok: true, message: consultationConversationCopy.askHarperDrafted };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "ask_harper_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return { ok: false, message: consultationConversationCopy.askHarperFailed };
  }
}
