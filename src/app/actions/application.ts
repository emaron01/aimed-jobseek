"use server";

import { revalidatePath } from "next/cache";
import {
  confirmApplicationEmployerIdentity,
  nameApplicationEmployer,
  overrideApplicationFit,
  rejectApplicationEmployerIdentity,
  rescoreApplicationFit,
  retryApplicationResearch,
} from "@/lib/application/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { employerIdentityCopy, vocab } from "@/lib/product-config";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type ApplicationActionResult = { ok: boolean; message: string };

function fail(error: unknown, fallback: string): ApplicationActionResult {
  if (error instanceof TenantError) return { ok: false, message: error.message };
  console.error(
    JSON.stringify({
      event: "application_action_failed",
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  return { ok: false, message: fallback };
}

export async function nameApplicationEmployerAction(
  _prev: ApplicationActionResult | null,
  formData: FormData,
): Promise<ApplicationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const employerName = String(formData.get("employerName") ?? "").trim();
    const website = String(formData.get("website") ?? "").trim();
    const companyId = String(formData.get("companyId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await nameApplicationEmployer({
      organizationId,
      campaignId,
      employerName,
      website: website || null,
      companyId: companyId || null,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Employer saved. Research and fit run when the employer is known." };
  } catch (error) {
    return fail(error, "The employer could not be saved.");
  }
}

export async function confirmApplicationEmployerIdentityAction(
  _prev: ApplicationActionResult | null,
  formData: FormData,
): Promise<ApplicationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await confirmApplicationEmployerIdentity({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: employerIdentityCopy.confirmed };
  } catch (error) {
    return fail(error, "The employer identity could not be confirmed.");
  }
}

export async function rejectApplicationEmployerIdentityAction(
  _prev: ApplicationActionResult | null,
  formData: FormData,
): Promise<ApplicationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await rejectApplicationEmployerIdentity({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: employerIdentityCopy.rejected };
  } catch (error) {
    return fail(error, "The employer identity could not be rejected.");
  }
}

export async function retryApplicationResearchAction(
  _prev: ApplicationActionResult | null,
  formData: FormData,
): Promise<ApplicationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await retryApplicationResearch({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Employer research was retried." };
  } catch (error) {
    return fail(error, "Employer research could not be retried.");
  }
}

export async function rescoreApplicationFitAction(
  _prev: ApplicationActionResult | null,
  formData: FormData,
): Promise<ApplicationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await rescoreApplicationFit({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Employer fit was rescored." };
  } catch (error) {
    return fail(error, "Employer fit could not be rescored.");
  }
}

export async function overrideApplicationFitAction(
  _prev: ApplicationActionResult | null,
  formData: FormData,
): Promise<ApplicationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const bucket = String(formData.get("bucket") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await overrideApplicationFit({
      organizationId,
      campaignId,
      userId: user.id,
      bucket,
      reason,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Employer-fit override saved." };
  } catch (error) {
    return fail(error, "The employer-fit override could not be saved.");
  }
}
