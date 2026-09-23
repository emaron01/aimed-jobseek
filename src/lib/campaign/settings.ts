import "server-only";

import type { EmailLength, Prisma } from "@prisma/client";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { EMAIL_GUIDANCE_MAX_CHARS } from "@/lib/campaign/save";
import { canEditCampaignTemplate } from "@/lib/campaign/visibility";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

async function assertCanEditCampaignTemplate(campaignId: string): Promise<void> {
  const organizationId = await requireOrganizationId();
  const [campaign, ctx] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: {
        id: true,
        ownerUserId: true,
        visibility: true,
      },
    }),
    getMembershipForCurrentUser(organizationId),
  ]);
  if (!campaign) {
    throw new TenantError(
      `${vocab.campaign.Singular} does not belong to the active organization.`,
    );
  }
  if (
    !canEditCampaignTemplate({
      userId: ctx.user.id,
      role: ctx.membership.role,
      campaign,
    })
  ) {
    throw new TenantError(
      `You cannot edit the shared ${vocab.campaign.singular} template. Use this ${vocab.campaign.singular} to create your own personal copy.`,
    );
  }
}

export async function updateCampaignEmailSettings(input: {
  campaignId: string;
  emailLength: EmailLength;
  emailGuidance: string | null;
}): Promise<void> {
  const organizationId = await requireOrganizationId();
  const emailGuidance = input.emailGuidance?.trim() || null;

  if (emailGuidance && emailGuidance.length > EMAIL_GUIDANCE_MAX_CHARS) {
    throw new TenantError(
      `Email guidance must be ${EMAIL_GUIDANCE_MAX_CHARS} characters or fewer.`,
    );
  }

  await assertCanEditCampaignTemplate(input.campaignId);

  const { assertCampaignNotArchived } = await import(
    "@/lib/suppression/service"
  );
  await assertCampaignNotArchived(organizationId, input.campaignId);

  const result = await prisma.campaign.updateMany({
    where: {
      id: input.campaignId,
      organizationId,
      archivedAt: null,
    },
    data: {
      emailLength: input.emailLength,
      emailGuidance,
    },
  });

  if (result.count !== 1) {
    throw new TenantError(
      `${vocab.campaign.Singular} does not belong to the active organization.`,
    );
  }
}

export async function getCampaignOfferValidationTarget(campaignId: string) {
  const organizationId = await requireOrganizationId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: {
      id: true,
      organizationId: true,
      productId: true,
      personaId: true,
      ownerUserId: true,
      visibility: true,
    },
  });
  if (!campaign) {
    throw new TenantError(
      `${vocab.campaign.Singular} does not belong to the active organization.`,
    );
  }
  return campaign;
}

export async function updateCampaignOffer(input: {
  campaignId: string;
  offerName: string | null;
  offerDescription: string | null;
  offerCta: string | null;
  offerNotes: string | null;
  offerValidationJson: Prisma.InputJsonValue;
  offerValidationHash: string;
}): Promise<void> {
  const organizationId = await requireOrganizationId();
  await assertCanEditCampaignTemplate(input.campaignId);
  const { assertCampaignNotArchived } = await import(
    "@/lib/suppression/service"
  );
  await assertCampaignNotArchived(organizationId, input.campaignId);
  const result = await prisma.campaign.updateMany({
    where: { id: input.campaignId, organizationId, archivedAt: null },
    data: {
      offerName: input.offerName?.trim() || null,
      offerDescription: input.offerDescription?.trim() || null,
      offerCta: input.offerCta?.trim() || null,
      offerNotes: input.offerNotes?.trim() || null,
      offerValidationJson: input.offerValidationJson,
      offerValidationHash: input.offerValidationHash,
    },
  });
  if (result.count !== 1) {
    throw new TenantError(
      `${vocab.campaign.Singular} does not belong to the active organization.`,
    );
  }
}
