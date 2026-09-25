"use server";

import { revalidatePath } from "next/cache";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { workspaceProgressText } from "@/lib/product-config";
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
      message: "Application Summary could not be generated. Retry.",
    };
  }
}
