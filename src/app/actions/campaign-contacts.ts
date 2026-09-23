"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addContactsToCampaign,
  addScoringRunContactsToCampaign,
} from "@/lib/campaign/contacts";
import {
  campaignAfterScoringAttachHref,
  campaignReturnFromScoringHref,
} from "@/lib/lists/campaign-query";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { countedNoun, nounForCount, vocab } from "@/lib/product-config";

export type CampaignContactsActionResult = {
  ok: boolean;
  message: string;
  addedCount?: number;
};

function campaignIdFrom(formData: FormData): string {
  return String(formData.get("campaignId") ?? "").trim();
}

function revalidateCampaign(campaignId: string): void {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

function toSafeCampaignContactsError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return `Unable to add ${vocab.contact.plural} to this ${vocab.campaign.singular}. Please try again.`;
}

export async function addContactsToCampaignAction(
  _prev: CampaignContactsActionResult | null,
  formData: FormData,
): Promise<CampaignContactsActionResult> {
  const campaignId = campaignIdFrom(formData);
  if (!campaignId) return { ok: false, message: `${vocab.campaign.Singular} is required.` };

  try {
    const addedCount = await addContactsToCampaign({
      campaignId,
      contactIds: formData
        .getAll("contactIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    });
    revalidateCampaign(campaignId);
    return {
      ok: true,
      message:
        addedCount === 0
          ? `All selected ${vocab.contact.plural} are already attached.`
          : `${countedNoun(addedCount, vocab.contact)} added.`,
      addedCount,
    };
  } catch (error) {
    console.error("Failed to add campaign contacts.", error);
    return { ok: false, message: toSafeCampaignContactsError(error) };
  }
}

export async function addScoringRunContactsToCampaignAction(
  _prev: CampaignContactsActionResult | null,
  formData: FormData,
): Promise<CampaignContactsActionResult> {
  const campaignId = campaignIdFrom(formData);
  const scoringRunId = String(formData.get("scoringRunId") ?? "").trim();
  if (!campaignId) return { ok: false, message: `${vocab.campaign.Singular} is required.` };
  if (!scoringRunId) {
    return { ok: false, message: "Select a scoring run." };
  }

  try {
    const addedCount = await addScoringRunContactsToCampaign({
      campaignId,
      scoringRunId,
    });
    revalidateCampaign(campaignId);
    return {
      ok: true,
      message:
        addedCount === 0
          ? `All scored ${vocab.contact.plural} are already attached.`
          : `${addedCount} scored ${nounForCount(addedCount, vocab.contact)} added.`,
      addedCount,
    };
  } catch (error) {
    console.error("Failed to add scored campaign contacts.", error);
    return { ok: false, message: toSafeCampaignContactsError(error) };
  }
}

/**
 * Score-report return: attach Ready to include (GOOD) contacts from this run,
 * then land on Companies (or List if the campaign still has no contacts).
 * Scoring engine behavior is unchanged — attach + navigation only.
 */
export async function saveScoringRunAndReturnToCampaignAction(
  formData: FormData,
) {
  const campaignId = campaignIdFrom(formData);
  const scoringRunId = String(formData.get("scoringRunId") ?? "").trim();
  if (!campaignId || !scoringRunId) {
    throw new TenantError(`${vocab.campaign.Singular} and scoring run are required.`);
  }

  let attachedCount = 0;
  let attachFailed = false;
  try {
    attachedCount = await addScoringRunContactsToCampaign({
      campaignId,
      scoringRunId,
      qualificationBuckets: ["GOOD"],
    });
  } catch (error) {
    console.error("Failed to save scoring run back to campaign.", error);
    attachFailed = true;
  }

  revalidateCampaign(campaignId);

  // redirect() throws — keep outside the attach try/catch.
  if (attachFailed) {
    redirect(campaignReturnFromScoringHref(campaignId, scoringRunId));
  }

  const { requireOrganizationId } = await import(
    "@/lib/tenant/getCurrentOrganization"
  );
  const organizationId = await requireOrganizationId();
  const contactCount = await prisma.campaignContact.count({
    where: {
      campaignId,
      organizationId,
    },
  });
  redirect(
    campaignAfterScoringAttachHref(campaignId, {
      hasContacts: contactCount > 0,
      attachedCount,
    }),
  );
}
