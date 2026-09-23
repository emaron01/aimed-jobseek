import "server-only";

/**
 * Ordered archive / hard-delete of a ContactList (Phase A membership model).
 *
 * FK inventory referencing ContactList (prisma/schema.prisma):
 * - ContactListMembership.contactListId → ContactList ON DELETE CASCADE
 * - ScoringRun.contactListId → ContactList ON DELETE CASCADE
 *
 * Contacts are org-scoped and shared across lists via membership.
 * Hard-deleting a list removes memberships + list-scoped scoring history only.
 * It does NOT delete Contact rows, CampaignContact, EmailDraft, or EmailSendRecord.
 * Archiving a list may soft-archive contacts that only belong to archived lists and
 * have no active campaign (archiveReason=LIST_CASCADE, archivedByListId set).
 * Unarchiving restores only that cascade, and only when an active list membership remains.
 *
 * Via ScoringRun (list-scoped):
 * - ContactScore.scoringRunId → ScoringRun ON DELETE CASCADE
 * - TitleSuggestion.scoringRunId → ScoringRun ON DELETE CASCADE
 * - QualificationBucketOverride.scoringRunId → ScoringRun ON DELETE CASCADE
 *
 * Not a ContactList FK:
 * - Contact (no longer owned by a list)
 * - Campaign / CampaignContact / EmailDraft / EmailSendRecord
 * - EmailSuppression is org+email keyed, not list-owned
 * - UsageEvent is append-only metering — do not touch
 *
 * Block vs archive:
 * - Scoring runs exist for this list → archive rather than hard delete.
 * - Campaign attachment no longer blocks delete (list delete does not cascade
 *   into the campaign email graph).
 * - No scoring history → ordered hard delete of memberships + scoring cleanup + list.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import {
  assertCanModifyOwnedWork,
  getWorkActor,
} from "@/lib/work/ownership";
import { countedNoun, vocab } from "@/lib/product-config";

type Tx = Prisma.TransactionClient;

export type ListLifecycleImpact = {
  /** Members of this list (not org-wide contacts). */
  contactCount: number;
  scoringRunCount: number;
  /** Campaigns that include any member of this list (informational). */
  campaignCount: number;
  activeCampaignCount: number;
  draftCount: number;
  sentCount: number;
};

export type ListDeleteDecision = {
  mode: "blocked" | "archive" | "delete";
  impact: ListLifecycleImpact;
  message: string;
};

export function listDeleteConfirmBody(decision: ListDeleteDecision): string {
  const { impact } = decision;
  if (decision.mode === "blocked") {
    return [
      `This list cannot be deleted.`,
      "",
      `${impact.contactCount} contact membership(s)`,
      `${impact.scoringRunCount} scoring run(s)`,
      "",
      "Archive instead. Archiving is reversible and keeps history intact.",
    ].join("\n");
  }
  if (decision.mode === "archive") {
    return [
      "This list has scoring history, so it will be archived rather than permanently deleted.",
      "",
      `${impact.contactCount} contact membership(s)`,
      `${impact.scoringRunCount} scoring run(s)`,
      "",
      "Archiving is reversible. Contacts with another active list or an active campaign stay active;",
      "contacts that only belong to archived lists and have no active campaign are archived with this list.",
    ].join("\n");
  }
  return [
    "This permanently deletes this list and its memberships.",
    "Contacts themselves are kept (they may appear under other lists or as unlisted).",
    "",
    `${impact.contactCount} membership(s) removed`,
    `${impact.scoringRunCount} scoring run(s)`,
    "",
    "This cannot be undone.",
  ].join("\n");
}

export function listArchiveConfirmBody(): string {
  return [
    "This archives the list. It will be hidden from campaign setup, scoring, and list selectors by default.",
    "The list is read-only until unarchived. Scoring history stays intact.",
    "Contacts that only belong to archived lists and are not on an active campaign are archived with the list (and restored if you unarchive it).",
    "Contacts on another active list or an active campaign stay active.",
    "Archiving is reversible.",
  ].join("\n");
}

export async function getListLifecycleImpact(
  organizationId: string,
  contactListId: string,
  db: Tx | typeof prisma = prisma,
): Promise<ListLifecycleImpact> {
  const memberships = await db.contactListMembership.findMany({
    where: { organizationId, contactListId },
    select: { contactId: true },
  });
  const contactIds = memberships.map((row) => row.contactId);
  const scoringRunCount = await db.scoringRun.count({
    where: { organizationId, contactListId },
  });

  if (contactIds.length === 0) {
    return {
      contactCount: 0,
      scoringRunCount,
      campaignCount: 0,
      activeCampaignCount: 0,
      draftCount: 0,
      sentCount: 0,
    };
  }

  const campaignContacts = await db.campaignContact.findMany({
    where: { organizationId, contactId: { in: contactIds } },
    select: {
      id: true,
      campaignId: true,
      campaign: { select: { id: true, archivedAt: true } },
    },
  });
  const campaignIds = new Set(campaignContacts.map((row) => row.campaignId));
  const activeCampaignIds = new Set(
    campaignContacts
      .filter((row) => row.campaign.archivedAt == null)
      .map((row) => row.campaignId),
  );
  const campaignContactIds = campaignContacts.map((row) => row.id);
  let draftCount = 0;
  let sentCount = 0;
  if (campaignContactIds.length > 0) {
    const draftScope = {
      organizationId,
      campaignContactId: { in: campaignContactIds },
    };
    draftCount = await db.emailDraft.count({ where: draftScope });
    sentCount = await db.emailDraft.count({
      where: { ...draftScope, status: "SENT" },
    });
  }

  return {
    contactCount: memberships.length,
    scoringRunCount,
    campaignCount: campaignIds.size,
    activeCampaignCount: activeCampaignIds.size,
    draftCount,
    sentCount,
  };
}

export function decideListDelete(impact: ListLifecycleImpact): ListDeleteDecision {
  // Campaign attachment is informational only — list delete never cascades
  // into CampaignContact / drafts / sends.
  if (impact.scoringRunCount > 0) {
    return {
      mode: "archive",
      impact,
      message: `${vocab.list.Singular} archived because ${impact.scoringRunCount} scoring run(s) reference it. ${vocab.contact.Plural} and ${vocab.campaign.singular} history were preserved.`,
    };
  }
  return {
    mode: "delete",
    impact,
    message: `${vocab.list.Singular} deleted. Removed ${impact.contactCount} membership(s). ${vocab.contact.Plural} were kept.`,
  };
}

export async function archiveContactList(id: string): Promise<{
  mode: "archived";
  message: string;
  cascadedContactCount: number;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const existing = await prisma.contactList.findFirst({
    where: { id, organizationId },
    select: { id: true, ownerUserId: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(
      `${vocab.contact.Singular} ${vocab.list.singular} not found in the active organization.`,
    );
  }
  assertCanModifyOwnedWork(actor, existing.ownerUserId, "Contact list");
  if (existing.archivedAt) {
    return {
      mode: "archived",
      message: `${vocab.list.Singular} is already archived.`,
      cascadedContactCount: 0,
    };
  }

  const cascadedContactCount = await prisma.$transaction(async (tx) => {
    await tx.contactList.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
    return cascadeArchiveContactsForList(tx, organizationId, existing.id);
  });

  return {
    mode: "archived",
    message:
      cascadedContactCount > 0
        ? `${vocab.list.Singular} archived. ${countedNoun(cascadedContactCount, vocab.contact)} archived with it (only those with no other active ${vocab.list.singular} or active ${vocab.campaign.singular}).`
        : `${vocab.list.Singular} archived. It is hidden from ${vocab.campaign.singular} and scoring selectors until you unarchive it.`,
    cascadedContactCount,
  };
}

export async function unarchiveContactList(id: string): Promise<{
  mode: "unarchived";
  message: string;
  restoredContactCount: number;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const existing = await prisma.contactList.findFirst({
    where: { id, organizationId },
    select: { id: true, ownerUserId: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(
      `${vocab.contact.Singular} ${vocab.list.singular} not found in the active organization.`,
    );
  }
  assertCanModifyOwnedWork(actor, existing.ownerUserId, "Contact list");
  if (!existing.archivedAt) {
    return {
      mode: "unarchived",
      message: `${vocab.list.Singular} is not archived.`,
      restoredContactCount: 0,
    };
  }

  const restoredContactCount = await prisma.$transaction(async (tx) => {
    await tx.contactList.update({
      where: { id: existing.id },
      data: { archivedAt: null },
    });
    return restoreCascadeArchivedContactsForList(
      tx,
      organizationId,
      existing.id,
    );
  });

  return {
    mode: "unarchived",
    message:
      restoredContactCount > 0
        ? `${vocab.list.Singular} unarchived. ${countedNoun(restoredContactCount, vocab.contact)} restored from this ${vocab.list.singular}’s archive cascade.`
        : `${vocab.list.Singular} unarchived. It appears in ${vocab.campaign.singular} and scoring selectors again.`,
    restoredContactCount,
  };
}

/**
 * After the list is archived: soft-archive members that now have only archived-list
 * memberships and no non-archived campaign membership. Records LIST_CASCADE + list id.
 */
export async function cascadeArchiveContactsForList(
  db: Tx,
  organizationId: string,
  contactListId: string,
): Promise<number> {
  const memberships = await db.contactListMembership.findMany({
    where: { organizationId, contactListId },
    select: { contactId: true },
  });
  const contactIds = [...new Set(memberships.map((row) => row.contactId))];
  if (contactIds.length === 0) return 0;

  const candidates = await db.contact.findMany({
    where: {
      organizationId,
      id: { in: contactIds },
      archivedAt: null,
    },
    select: {
      id: true,
      memberships: {
        select: {
          contactList: { select: { id: true, archivedAt: true } },
        },
      },
      campaignContacts: {
        where: { campaign: { archivedAt: null } },
        select: { id: true },
        take: 1,
      },
    },
  });

  const now = new Date();
  let archived = 0;
  for (const contact of candidates) {
    if (contact.campaignContacts.length > 0) continue;
    if (contact.memberships.length === 0) continue;
    const allListsArchived = contact.memberships.every(
      (membership) => membership.contactList.archivedAt != null,
    );
    if (!allListsArchived) continue;

    await db.contact.update({
      where: { id: contact.id },
      data: {
        archivedAt: now,
        archiveReason: "LIST_CASCADE",
        archivedByListId: contactListId,
      },
    });
    archived += 1;
  }
  return archived;
}

/**
 * After the list is unarchived: restore contacts archived by THIS list's cascade,
 * only when they now have at least one non-archived list membership (they will,
 * via this list, unless membership was removed). Never restores DIRECT archives.
 */
export async function restoreCascadeArchivedContactsForList(
  db: Tx,
  organizationId: string,
  contactListId: string,
): Promise<number> {
  const cascaded = await db.contact.findMany({
    where: {
      organizationId,
      archiveReason: "LIST_CASCADE",
      archivedByListId: contactListId,
      archivedAt: { not: null },
    },
    select: {
      id: true,
      memberships: {
        select: {
          contactList: { select: { id: true, archivedAt: true } },
        },
      },
    },
  });

  let restored = 0;
  for (const contact of cascaded) {
    const hasActiveList = contact.memberships.some(
      (membership) => membership.contactList.archivedAt == null,
    );
    // Still only on archived lists (e.g. removed from this list) — leave archived.
    if (!hasActiveList) continue;

    await db.contact.update({
      where: { id: contact.id },
      data: {
        archivedAt: null,
        archiveReason: null,
        archivedByListId: null,
      },
    });
    restored += 1;
  }
  return restored;
}

export async function deleteContactListGraph(
  tx: Tx,
  organizationId: string,
  contactListId: string,
): Promise<ListLifecycleImpact> {
  const list = await tx.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new TenantError(
      `${vocab.contact.Singular} ${vocab.list.singular} not found in the active organization.`,
    );
  }

  const impact = await getListLifecycleImpact(
    organizationId,
    contactListId,
    tx,
  );
  const decision = decideListDelete(impact);
  if (decision.mode !== "delete") {
    throw new TenantError(decision.message);
  }

  // Memberships only — do not delete Contact / CampaignContact / drafts / sends.
  await tx.contactListMembership.deleteMany({
    where: { organizationId, contactListId },
  });

  const scoringRuns = await tx.scoringRun.findMany({
    where: { organizationId, contactListId },
    select: { id: true },
  });
  const scoringRunIds = scoringRuns.map((row) => row.id);
  if (scoringRunIds.length > 0) {
    await tx.qualificationBucketOverride.deleteMany({
      where: { organizationId, scoringRunId: { in: scoringRunIds } },
    });
    await tx.titleSuggestion.deleteMany({
      where: { organizationId, scoringRunId: { in: scoringRunIds } },
    });
    await tx.contactScore.deleteMany({
      where: { organizationId, scoringRunId: { in: scoringRunIds } },
    });
    await tx.scoringRun.deleteMany({
      where: { organizationId, id: { in: scoringRunIds } },
    });
  }

  await tx.contactList.deleteMany({
    where: { id: contactListId, organizationId },
  });

  return impact;
}

export async function deleteOrArchiveContactList(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
  impact: ListLifecycleImpact;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const existing = await prisma.contactList.findFirst({
    where: { id, organizationId },
    select: { id: true, ownerUserId: true, archivedAt: true },
  });
  if (!existing) {
    throw new TenantError(
      `${vocab.contact.Singular} ${vocab.list.singular} not found in the active organization.`,
    );
  }
  assertCanModifyOwnedWork(actor, existing.ownerUserId, "Contact list");

  const impact = await getListLifecycleImpact(organizationId, existing.id);
  const decision = decideListDelete(impact);

  if (decision.mode === "blocked") {
    throw new TenantError(decision.message);
  }

  if (decision.mode === "archive") {
    if (!existing.archivedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.contactList.update({
          where: { id: existing.id },
          data: { archivedAt: new Date() },
        });
        await cascadeArchiveContactsForList(tx, organizationId, existing.id);
      });
    }
    return {
      mode: "archived",
      message: decision.message,
      impact,
    };
  }

  await prisma.$transaction((tx) =>
    deleteContactListGraph(tx, organizationId, existing.id),
  );
  return {
    mode: "deleted",
    message: decision.message,
    impact,
  };
}
