import "server-only";

/**
 * Soft-archive or hard-delete a Contact.
 *
 * - CampaignContact or EmailSendRecord history → soft-archive (archivedAt)
 * - Otherwise hard delete (memberships, research, scores cascade / explicit)
 * - EmailSuppression is org+email keyed and is NEVER cleared here
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import {
  assertCanModifyOwnedWork,
  getWorkActor,
} from "@/lib/work/ownership";
import { vocab } from "@/lib/product-config";

type Tx = Prisma.TransactionClient;

export type ContactDeleteDecision = {
  mode: "archive" | "delete";
  message: string;
};

export async function decideContactDelete(
  organizationId: string,
  contactId: string,
  db: Tx | typeof prisma = prisma,
): Promise<ContactDeleteDecision> {
  const campaignCount = await db.campaignContact.count({
    where: { organizationId, contactId },
  });
  const sendCount = await db.emailSendRecord.count({
    where: {
      organizationId,
      campaignContact: { contactId },
    },
  });
  if (campaignCount > 0 || sendCount > 0) {
    return {
      mode: "archive",
      message:
        `${vocab.contact.Singular} archived because it has ${vocab.campaign.singular} or send history. Suppression for this address is unchanged.`,
    };
  }
  return {
    mode: "delete",
    message:
      `${vocab.contact.Singular} deleted. Suppression for this address (if any) is unchanged.`,
  };
}

export async function deleteOrArchiveContact(contactId: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: {
      id: true,
      ownerUserId: true,
      archivedAt: true,
      email: true,
      normalizedEmail: true,
    },
  });
  if (!existing) {
    throw new TenantError(`${vocab.contact.Singular} not found in the active organization.`);
  }
  assertCanModifyOwnedWork(actor, existing.ownerUserId, "Contact");

  const decision = await decideContactDelete(organizationId, existing.id);

  if (decision.mode === "archive") {
    if (!existing.archivedAt) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: {
          archivedAt: new Date(),
          archiveReason: "DIRECT",
          archivedByListId: null,
        },
      });
    }
    return { mode: "archived", message: decision.message };
  }

  await prisma.$transaction(async (tx) => {
    await tx.contactListMembership.deleteMany({
      where: { organizationId, contactId: existing.id },
    });
    await tx.contactScore.deleteMany({
      where: { organizationId, contactId: existing.id },
    });
    await tx.contactResearch.deleteMany({
      where: { organizationId, contactId: existing.id },
    });
    await tx.contact.delete({
      where: { id: existing.id },
    });
  });

  return { mode: "deleted", message: decision.message };
}
