"use server";

import { requireCurrentUser } from "@/lib/auth/session";
import {
  getApplicationWorkspaceLive,
  type WorkspaceLiveView,
} from "@/lib/application-jobs/workspace-status";
import { retryApplicationJob } from "@/lib/application-jobs/service";
import { workspaceJobCopy } from "@/lib/product-config";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import { revalidatePath } from "next/cache";

export async function getApplicationWorkspaceLiveAction(
  campaignId: string,
): Promise<WorkspaceLiveView | null> {
  const id = campaignId.trim();
  if (!id) return null;
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    return getApplicationWorkspaceLive({ organizationId, campaignId: id });
  } catch (error) {
    if (error instanceof TenantError) return null;
    console.error(
      JSON.stringify({
        event: "workspace_live_status_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return null;
  }
}

export async function retryApplicationJobAction(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!campaignId || !jobId) {
      return { ok: false, message: workspaceJobCopy.failed };
    }
    await retryApplicationJob({ organizationId, campaignId, jobId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: workspaceJobCopy.retry };
  } catch (error) {
    if (error instanceof TenantError) return { ok: false, message: error.message };
    console.error(
      JSON.stringify({
        event: "application_job_retry_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return { ok: false, message: workspaceJobCopy.failed };
  }
}
