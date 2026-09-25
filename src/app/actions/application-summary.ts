"use server";

import { revalidatePath } from "next/cache";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { resolveApplicationSummaryFlag } from "@/lib/application-summary/service";
import { applicationAssetConfig, workspaceProgressText } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export type ApplicationSummaryActionResult = {
  ok: boolean;
  message: string;
};

export async function generateApplicationSummaryAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Application was not found." };
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "APPLICATION_SUMMARY",
      initiatedByUserId: user.id,
      payload: { userId: user.id },
    });
    revalidatePath(`/campaigns/${campaignId}/summary`);
    return { ok: true, message: workspaceProgressText("APPLICATION_SUMMARY") };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "application_summary_action_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: "Interview Cheat Sheet could not be generated. Retry.",
    };
  }
}

export async function resolveApplicationSummaryFlagAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const claimId = String(formData.get("claimId") ?? "").trim();
  const action = String(formData.get("flagAction") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Application was not found." };
  if (action !== "KEPT" && action !== "REMOVED") {
    return { ok: false, message: "That flag action is not available." };
  }
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    await resolveApplicationSummaryFlag({
      organizationId,
      campaignId,
      claimId,
      action,
    });
    revalidatePath(`/campaigns/${campaignId}/summary`);
    return {
      ok: true,
      message:
        action === "KEPT"
          ? applicationAssetConfig.labels.claimFlag.keep
          : applicationAssetConfig.labels.claimFlag.remove,
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "The claim flag could not be updated." };
  }
}
