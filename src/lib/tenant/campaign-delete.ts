/**
 * Ordered hard-delete of a Campaign and its email workspace.
 *
 * FK inventory referencing Campaign (prisma/schema.prisma):
 * - CampaignContact.campaignId → Campaign ON DELETE CASCADE
 * - EmailDraft.campaignContactId → CampaignContact ON DELETE CASCADE
 * - EmailDraft.inReplyToDraftId → EmailDraft ON DELETE SET NULL (self-relation)
 * - EmailSendRecord.emailDraftId → EmailDraft ON DELETE CASCADE
 * - EmailSendRecord.campaignContactId → CampaignContact ON DELETE CASCADE
 * - EmailSendRecord.sentByUserId → User ON DELETE RESTRICT (do not delete users)
 * - Campaign.offerId → Offer (outbound optional; Offer is not a dependent)
 * - Campaign.productId / icpId / personaId → Restrict (this delete unblocks
 *   Product/ICP/Persona cleanup). Campaign.personaId is optional; CampaignPersona
 *   rows cascade from Campaign.
 *
 * Not a Campaign FK:
 * - ScoringRun has no campaignId. Scoring history is list/product scoped.
 * - UsageEvent.campaignId is an optional string with no relation. Metering is
 *   append-only — do not update or delete those rows from this path.
 *
 * Sent-email decision: hard-delete, including EmailSendRecord and SENT drafts.
 * Soft-archive would leave Campaign rows whose Restrict FKs to Product/ICP/
 * Persona still block workspace cleanup — the reason this delete exists.
 * EmailSendRecord is campaign-owned in the schema (cascade), not an independent
 * audit entity. UsageEvent remains as the immutable metering trail.
 */

import type { Prisma } from "@prisma/client";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

type Tx = Prisma.TransactionClient;

export type CampaignDeleteImpact = {
  contactCount: number;
  draftCount: number;
  sentCount: number;
};

export function campaignDeleteConfirmBody(impact: CampaignDeleteImpact): string {
  return [
    "This permanently deletes this campaign and its email workspace.",
    "",
    `${impact.contactCount} campaign contact(s)`,
    `${impact.draftCount} email draft(s)`,
    `${impact.sentCount} sent email(s) (the send audit trail for this campaign)`,
    "",
    "Contacts, lists, scoring runs, and usage/metering events are not deleted.",
    "This cannot be undone.",
  ].join("\n");
}

export async function deleteCampaignGraph(
  tx: Tx,
  organizationId: string,
  campaignId: string,
): Promise<CampaignDeleteImpact> {
  const campaign = await tx.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} not found in the active organization.`);
  }

  const contacts = await tx.campaignContact.findMany({
    where: { organizationId, campaignId },
    select: { id: true },
  });
  const campaignContactIds = contacts.map((row) => row.id);
  const impact: CampaignDeleteImpact = {
    contactCount: contacts.length,
    draftCount: 0,
    sentCount: 0,
  };

  if (campaignContactIds.length > 0) {
    const draftScope = {
      organizationId,
      campaignContactId: { in: campaignContactIds },
    };
    impact.draftCount = await tx.emailDraft.count({ where: draftScope });
    impact.sentCount = await tx.emailDraft.count({
      where: { ...draftScope, status: "SENT" },
    });

    await tx.emailSendRecord.deleteMany({
      where: { organizationId, campaignContactId: { in: campaignContactIds } },
    });
    await tx.emailDraft.updateMany({
      where: draftScope,
      data: { inReplyToDraftId: null },
    });
    await tx.emailDraft.deleteMany({ where: draftScope });
    await tx.campaignContact.deleteMany({
      where: { organizationId, campaignId },
    });
  }

  await tx.campaign.deleteMany({
    where: { id: campaignId, organizationId },
  });

  return impact;
}
