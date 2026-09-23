import "server-only";

import type {
  EmailSuppression,
  EmailSuppressionReason,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { normalizeSuppressionEmail } from "@/lib/suppression/normalize";
import { suppressionOptOutConfirmBody } from "@/lib/suppression/confirm-copy";
import { vocab } from "@/lib/product-config";

export { normalizeSuppressionEmail, suppressionOptOutConfirmBody };

const SUPPRESSED_EMAIL_MESSAGE =
  "This email address is on the organization do-not-contact list and cannot be emailed.";

const ARCHIVED_CAMPAIGN_MESSAGE =
  `This ${vocab.campaign.singular} is archived. Unarchive it before generating emails or changing ${vocab.contact.plural}.`;

const ARCHIVED_LIST_MESSAGE =
  `This ${vocab.list.singular} is archived and is read-only. Unarchive it before scoring or attaching ${vocab.contact.plural}.`;

export async function findActiveSuppression(
  organizationId: string,
  email: string | null | undefined,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<EmailSuppression | null> {
  const normalized = normalizeSuppressionEmail(email);
  if (!normalized) return null;
  return db.emailSuppression.findFirst({
    where: {
      organizationId,
      normalizedEmail: normalized,
      status: "ACTIVE",
    },
  });
}

export async function isEmailSuppressed(
  organizationId: string,
  email: string | null | undefined,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<boolean> {
  const row = await findActiveSuppression(organizationId, email, db);
  return row != null;
}

export async function assertEmailNotSuppressed(
  organizationId: string,
  email: string | null | undefined,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  if (await isEmailSuppressed(organizationId, email, db)) {
    throw new TenantError(SUPPRESSED_EMAIL_MESSAGE);
  }
}

export async function assertCampaignNotArchived(
  organizationId: string,
  campaignId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found in the active organization.`);
  }
  if (campaign.archivedAt) {
    throw new TenantError(ARCHIVED_CAMPAIGN_MESSAGE);
  }
}

export async function assertListNotArchived(
  organizationId: string,
  contactListId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const list = await db.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!list) {
    throw new TenantError(
      `${vocab.contact.Singular} ${vocab.list.singular} does not belong to the active organization.`,
    );
  }
  if (list.archivedAt) {
    throw new TenantError(ARCHIVED_LIST_MESSAGE);
  }
}

export async function listActiveNormalizedEmails(
  organizationId: string,
  emails: Array<string | null | undefined>,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Set<string>> {
  const normalized = Array.from(
    new Set(
      emails
        .map((email) => normalizeSuppressionEmail(email))
        .filter((email): email is string => Boolean(email)),
    ),
  );
  if (normalized.length === 0) return new Set();
  const rows = await db.emailSuppression.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      normalizedEmail: { in: normalized },
    },
    select: { normalizedEmail: true },
  });
  return new Set(rows.map((row) => row.normalizedEmail));
}

export function contactMatchesSuppressionSet(
  email: string | null | undefined,
  suppressed: Set<string>,
): boolean {
  const normalized = normalizeSuppressionEmail(email);
  return normalized != null && suppressed.has(normalized);
}

export async function suppressEmail(input: {
  organizationId: string;
  email: string;
  actorUserId: string;
  reason?: EmailSuppressionReason;
  note?: string | null;
}): Promise<EmailSuppression> {
  const normalized = normalizeSuppressionEmail(input.email);
  if (!normalized) {
    throw new TenantError("A valid email address is required to opt out.");
  }
  const note = input.note?.trim() || null;
  const reason = input.reason ?? "OPTED_OUT";
  const now = new Date();

  const row = await prisma.emailSuppression.upsert({
    where: {
      organizationId_normalizedEmail: {
        organizationId: input.organizationId,
        normalizedEmail: normalized,
      },
    },
    create: {
      organizationId: input.organizationId,
      normalizedEmail: normalized,
      reason,
      status: "ACTIVE",
      note,
      suppressedById: input.actorUserId,
      suppressedAt: now,
      releasedById: null,
      releasedAt: null,
    },
    update: {
      reason,
      status: "ACTIVE",
      note,
      suppressedById: input.actorUserId,
      suppressedAt: now,
      releasedById: null,
      releasedAt: null,
    },
  });
  const { recomputeCadenceForSuppressedEmail } = await import(
    "@/lib/cadence/recompute"
  );
  await recomputeCadenceForSuppressedEmail(input.organizationId, normalized);
  return row;
}

export async function releaseSuppression(input: {
  organizationId: string;
  email: string;
  actorUserId: string;
}): Promise<EmailSuppression> {
  const normalized = normalizeSuppressionEmail(input.email);
  if (!normalized) {
    throw new TenantError("A valid email address is required to restore.");
  }
  const existing = await prisma.emailSuppression.findFirst({
    where: {
      organizationId: input.organizationId,
      normalizedEmail: normalized,
    },
  });
  if (!existing || existing.status !== "ACTIVE") {
    throw new TenantError("This address is not currently suppressed.");
  }
  const updated = await prisma.emailSuppression.update({
    where: { id: existing.id },
    data: {
      status: "RELEASED",
      releasedById: input.actorUserId,
      releasedAt: new Date(),
    },
  });
  const { recomputeCadenceForSuppressedEmail } = await import(
    "@/lib/cadence/recompute"
  );
  await recomputeCadenceForSuppressedEmail(input.organizationId, normalized);
  return updated;
}

export async function suppressContactById(input: {
  organizationId: string;
  contactId: string;
  actorUserId: string;
  reason?: EmailSuppressionReason;
  note?: string | null;
}): Promise<EmailSuppression> {
  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, organizationId: input.organizationId },
    select: { id: true, email: true, ownerUserId: true },
  });
  if (!contact) {
    throw new TenantError(`${vocab.contact.Singular} does not belong to the active organization.`);
  }
  if (contact.ownerUserId !== input.actorUserId) {
    throw new TenantError(
      `This ${vocab.contact.singular} is read-only because it belongs to another user.`,
    );
  }
  if (!contact.email) {
    throw new TenantError(`Add an email address before opting this ${vocab.contact.singular} out.`);
  }
  return suppressEmail({
    organizationId: input.organizationId,
    email: contact.email,
    actorUserId: input.actorUserId,
    reason: input.reason,
    note: input.note,
  });
}

export async function releaseContactById(input: {
  organizationId: string;
  contactId: string;
  actorUserId: string;
}): Promise<EmailSuppression> {
  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, organizationId: input.organizationId },
    select: { id: true, email: true, ownerUserId: true },
  });
  if (!contact) {
    throw new TenantError(`${vocab.contact.Singular} does not belong to the active organization.`);
  }
  if (contact.ownerUserId !== input.actorUserId) {
    throw new TenantError(
      `This ${vocab.contact.singular} is read-only because it belongs to another user.`,
    );
  }
  if (!contact.email) {
    throw new TenantError(`This ${vocab.contact.singular} has no email address to restore.`);
  }
  return releaseSuppression({
    organizationId: input.organizationId,
    email: contact.email,
    actorUserId: input.actorUserId,
  });
}
