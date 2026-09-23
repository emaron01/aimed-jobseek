/**
 * Whether a user may stop/restore cadence on a campaign contact.
 * Only the campaign owner may change cadence. OWNER/ADMIN access to another
 * rep's campaign is explicitly read-only.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export async function assertCanManageContactCadence(input: {
  campaignContactId: string;
  organizationId: string;
  userId: string;
}): Promise<void> {
  const row = await prisma.campaignContact.findFirst({
    where: {
      id: input.campaignContactId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      campaign: {
        select: {
          ownerUserId: true,
          visibility: true,
        },
      },
    },
  });

  if (!row) {
    throw new TenantError(
      `${vocab.campaign.Singular} ${vocab.contact.singular} does not belong to the active organization.`,
    );
  }

  if (row.campaign.ownerUserId === input.userId) return;

  throw new TenantError(
    `You can only change cadence on ${vocab.contact.plural} in ${vocab.campaign.plural} you own.`,
  );
}
