import "server-only";

/**
 * Campaign soft-archive. History (contacts, drafts, sends) stays intact.
 * Archived campaigns are hidden from home and the campaign list by default
 * and are read-only until unarchived.
 */

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import {
  assertCanModifyOwnedWork,
  getWorkActor,
} from "@/lib/work/ownership";
import { vocab } from "@/lib/product-config";

export function campaignArchiveConfirmBody(): string {
  return [
    "This archives the campaign. It will be hidden from Home and the campaign list by default.",
    "No new emails can be generated or sent, and contacts cannot be changed, until it is unarchived.",
    "History stays intact. Archiving is reversible.",
  ].join("\n");
}

export async function archiveCampaign(id: string): Promise<{
  mode: "archived";
  message: string;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const existing = await prisma.campaign.findFirst({
    where: { id, organizationId },
    select: { id: true, ownerUserId: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(`${vocab.campaign.Singular} not found in the active organization.`);
  }
  assertCanModifyOwnedWork(actor, existing.ownerUserId, "Campaign");
  if (existing.archivedAt) {
    return { mode: "archived", message: `${vocab.campaign.Singular} is already archived.` };
  }
  await prisma.campaign.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
  });
  const { recomputeCampaignCadenceForCampaign } = await import(
    "@/lib/cadence/recompute"
  );
  await recomputeCampaignCadenceForCampaign(existing.id, organizationId);
  return {
    mode: "archived",
    message: `${vocab.campaign.Singular} archived. It is hidden from Home and the ${vocab.campaign.singular} list until you unarchive it.`,
  };
}

export async function unarchiveCampaign(id: string): Promise<{
  mode: "unarchived";
  message: string;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const existing = await prisma.campaign.findFirst({
    where: { id, organizationId },
    select: { id: true, ownerUserId: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(`${vocab.campaign.Singular} not found in the active organization.`);
  }
  assertCanModifyOwnedWork(actor, existing.ownerUserId, "Campaign");
  if (!existing.archivedAt) {
    return { mode: "unarchived", message: `${vocab.campaign.Singular} is not archived.` };
  }
  await prisma.campaign.update({
    where: { id: existing.id },
    data: { archivedAt: null },
  });
  const { recomputeCampaignCadenceForCampaign } = await import(
    "@/lib/cadence/recompute"
  );
  await recomputeCampaignCadenceForCampaign(existing.id, organizationId);
  return {
    mode: "unarchived",
    message: `${vocab.campaign.Singular} unarchived. It appears in Home and the ${vocab.campaign.singular} list again.`,
  };
}
