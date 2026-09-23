/**
 * Duplicate a SHARED campaign into a PERSONAL copy owned by the actor.
 * Copies configuration only — no contacts, lists, scoring, drafts, or sends.
 * Org-wide cadence policy is not campaign-scoped; emailLength + emailGuidance copy.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import { vocab } from "@/lib/product-config";

export async function duplicateSharedCampaign(input: {
  organizationId: string;
  sourceCampaignId: string;
  actorUserId: string;
  actorRole: string;
}): Promise<{ campaignId: string }> {
  const source = await prisma.campaign.findFirst({
    where: {
      id: input.sourceCampaignId,
      organizationId: input.organizationId,
    },
    include: {
      personasInPlay: { select: { personaId: true } },
    },
  });

  if (!source || source.archivedAt) {
    throw new TenantError(`${vocab.campaign.Singular} not found.`);
  }
  if (source.visibility !== "SHARED") {
    throw new TenantError(`Only shared ${vocab.campaign.plural} can be duplicated this way.`);
  }
  if (
    !canOpenCampaignDetail({
      role: input.actorRole,
      userId: input.actorUserId,
      campaign: source,
    })
  ) {
    throw new TenantError(`You cannot access this ${vocab.campaign.singular}.`);
  }

  const baseName = source.name.trim() || "Campaign";
  const copyName = `${baseName} (copy)`.slice(0, 200);

  const created = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        organizationId: input.organizationId,
        ownerUserId: input.actorUserId,
        visibility: "PERSONAL",
        name: copyName,
        productId: source.productId,
        icpId: source.icpId,
        personaId: source.personaId,
        offerId: null,
        offerName: source.offerName,
        offerDescription: source.offerDescription,
        offerCta: source.offerCta,
        offerNotes: source.offerNotes,
        offerValidationJson: source.offerValidationJson ?? undefined,
        offerValidationHash: source.offerValidationHash,
        emailLength: source.emailLength,
        emailGuidance: source.emailGuidance,
        status: "DRAFT",
      },
      select: { id: true },
    });

    const personaIds = source.personasInPlay.map((row) => row.personaId);
    if (personaIds.length > 0) {
      await tx.campaignPersona.createMany({
        data: personaIds.map((personaId) => ({
          organizationId: input.organizationId,
          campaignId: campaign.id,
          personaId,
        })),
      });
    }

    return campaign;
  });

  return { campaignId: created.id };
}
