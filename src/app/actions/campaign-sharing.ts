"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { assertOrganizationNotPaymentLocked } from "@/lib/billing/payment-lock";
import { duplicateSharedCampaign } from "@/lib/campaign/duplicate";
import {
  canEditCampaignTemplate,
  canSetCampaignShared,
} from "@/lib/campaign/visibility";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export type CampaignActionResult = { ok: boolean; message: string };
/** Result returned by campaign visibility controls. */
export type CampaignSharingActionResult = CampaignActionResult;

export async function useSharedCampaignAction(
  formData: FormData,
): Promise<CampaignActionResult> {
  const { organization, user, membership } =
    await getMembershipForCurrentUser();
  await assertOrganizationNotPaymentLocked(organization.id);
  const campaignId = String(formData.get("campaignId") || "").trim();
  if (!campaignId) throw new TenantError(`${vocab.campaign.Singular} is required.`);

  const { campaignId: newId } = await duplicateSharedCampaign({
    organizationId: organization.id,
    sourceCampaignId: campaignId,
    actorUserId: user.id,
    actorRole: membership.role,
  });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${newId}`);
}

export async function setCampaignVisibilityAction(
  _prev: CampaignActionResult | null,
  formData: FormData,
): Promise<CampaignActionResult> {
  try {
    const { organization, user, membership } =
      await getMembershipForCurrentUser();
    await assertOrganizationNotPaymentLocked(organization.id);
    if (!canSetCampaignShared(membership.role)) {
      return {
        ok: false,
        message: `Only organization admins can share ${vocab.campaign.plural}.`,
      };
    }
    const campaignId = String(formData.get("campaignId") || "").trim();
    const visibilityRaw = String(formData.get("visibility") || "").trim();
    const visibility =
      visibilityRaw === "SHARED" ? "SHARED" : ("PERSONAL" as const);

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: organization.id },
      select: { ownerUserId: true, visibility: true },
    });
    if (!campaign) return { ok: false, message: `${vocab.campaign.Singular} not found.` };
    if (
      !canEditCampaignTemplate({
        role: membership.role,
        userId: user.id,
        campaign,
      })
    ) {
      return { ok: false, message: `You cannot change this ${vocab.campaign.singular}.` };
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        visibility,
        ownerUserId: campaign.ownerUserId,
      },
    });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message:
        visibility === "SHARED"
          ? `${vocab.campaign.Singular} is shared. Teammates can use it to create a personal copy with no ${vocab.contact.plural}.`
          : `${vocab.campaign.Singular} is personal again.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to update visibility.",
    };
  }
}
