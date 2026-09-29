/**
 * Shared full account wipe (lifecycle B1).
 * Deletes one organization and all personal leftovers; Stripe Customer stays.
 * Node-safe (no server-only) for workers and Server Actions.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";
import { purgeOrphanedTenantUsersAfterOrgDelete } from "@/lib/auth/purge-identity";
import { cancelStripeSubscriptionForOrgDelete } from "@/lib/billing/cancel-stripe-for-org-delete";

export type AccountWipeReason = "self_serve" | "admin" | "automatic";

export const ACCOUNT_WIPE_IN_FLIGHT_TERMINAL_REASON =
  "Organization account wiped.";

/** PlatformSetting key: anonymous wipe log (date + reason only). */
export const ACCOUNT_WIPE_LOG_SETTING_KEY = "account.wipe.log";

export type AnonymousWipeLogEntry = {
  at: string;
  reason: AccountWipeReason;
};

export type WipeOrganizationAccountResult = {
  organizationId: string;
  organizationName: string | null;
  alreadyWiped: boolean;
  purgedUserIds: string[];
};

type WipeLogValue = {
  entries: AnonymousWipeLogEntry[];
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isWipeLogValue(value: unknown): value is WipeLogValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return false;
  return entries.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as AnonymousWipeLogEntry).at === "string" &&
      ((entry as AnonymousWipeLogEntry).reason === "self_serve" ||
        (entry as AnonymousWipeLogEntry).reason === "admin" ||
        (entry as AnonymousWipeLogEntry).reason === "automatic"),
  );
}

/**
 * Append an anonymous wipe record (date + reason only). No org/user/Stripe ids.
 * Writes PlatformSetting directly so no identifying AdminAuditEvent is created.
 */
export async function recordAnonymousAccountWipe(input: {
  reason: AccountWipeReason;
  at?: Date;
  client?: Prisma.TransactionClient | typeof prisma;
}): Promise<AnonymousWipeLogEntry> {
  const db = input.client ?? prisma;
  const entry: AnonymousWipeLogEntry = {
    at: (input.at ?? new Date()).toISOString(),
    reason: input.reason,
  };
  const existing = await db.platformSetting.findUnique({
    where: { key: ACCOUNT_WIPE_LOG_SETTING_KEY },
    select: { value: true },
  });
  const prior = isWipeLogValue(existing?.value) ? existing.value.entries : [];
  const next: WipeLogValue = { entries: [...prior, entry] };
  await db.platformSetting.upsert({
    where: { key: ACCOUNT_WIPE_LOG_SETTING_KEY },
    create: {
      key: ACCOUNT_WIPE_LOG_SETTING_KEY,
      value: next as Prisma.InputJsonValue,
      updatedByUserId: null,
    },
    update: {
      value: next as Prisma.InputJsonValue,
      updatedByUserId: null,
    },
  });
  return entry;
}

export async function readAnonymousAccountWipeLog(): Promise<
  AnonymousWipeLogEntry[]
> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: ACCOUNT_WIPE_LOG_SETTING_KEY },
    select: { value: true },
  });
  if (!isWipeLogValue(row?.value)) return [];
  return row.value.entries;
}

/** Mark in-flight jobs/runs FAILED while the organization still exists. */
export async function markInFlightWorkFailedForWipe(
  organizationId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ applicationJobs: number; researchRuns: number }> {
  const now = new Date();
  const jobs = await client.applicationJob.updateMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    data: {
      status: "FAILED",
      error: ACCOUNT_WIPE_IN_FLIGHT_TERMINAL_REASON,
      completedAt: now,
      workerHeartbeatAt: now,
    },
  });
  const runs = await client.researchRun.updateMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    data: {
      status: "FAILED",
      lastError: ACCOUNT_WIPE_IN_FLIGHT_TERMINAL_REASON,
      completedAt: now,
      workerHeartbeatAt: now,
      currentCompanyId: null,
      currentCompanyName: null,
      pausedAt: null,
    },
  });
  return { applicationJobs: jobs.count, researchRuns: runs.count };
}

async function deletePersonalLeftoversForWipe(
  input: {
    organizationId: string;
    memberUserIds: string[];
    memberEmails: string[];
  },
  client: Prisma.TransactionClient,
): Promise<void> {
  const emails = [...new Set(input.memberEmails.map(normalizeEmail).filter(Boolean))];
  const userIds = [...new Set(input.memberUserIds.filter(Boolean))];

  const tickets = await client.supportTicket.findMany({
    where: {
      OR: [
        { organizationId: input.organizationId },
        ...(userIds.length > 0 ? [{ submittedByUserId: { in: userIds } }] : []),
        ...(emails.length > 0
          ? [{ submittedByEmail: { in: emails } }]
          : []),
      ],
    },
    select: { id: true },
  });
  const ticketIds = tickets.map((t) => t.id);
  if (ticketIds.length > 0) {
    await client.supportTicketNote.deleteMany({
      where: { supportTicketId: { in: ticketIds } },
    });
    await client.supportTicket.deleteMany({
      where: { id: { in: ticketIds } },
    });
  }

  await client.transactionalEmailEvent.deleteMany({
    where: {
      OR: [
        { organizationId: input.organizationId },
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        ...(emails.length > 0
          ? [{ recipientEmailNormalized: { in: emails } }]
          : []),
      ],
    },
  });

  await client.adminAuditEvent.deleteMany({
    where: {
      OR: [
        { organizationId: input.organizationId },
        ...(userIds.length > 0
          ? [
              { actorUserId: { in: userIds } },
              { targetUserId: { in: userIds } },
            ]
          : []),
      ],
    },
  });
}

/**
 * Full wipe for one organization. Idempotent when the org is already gone.
 * Does not write identifying AdminAuditEvent rows.
 */
export async function wipeOrganizationAccount(input: {
  organizationId: string;
  reason: AccountWipeReason;
}): Promise<WipeOrganizationAccountResult> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("Organization id is required.");
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      billingProfile: {
        select: { stripeSubscriptionId: true },
      },
      memberships: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              emailNormalized: true,
            },
          },
        },
      },
    },
  });

  if (!org) {
    return {
      organizationId,
      organizationName: null,
      alreadyWiped: true,
      purgedUserIds: [],
    };
  }

  // Stripe cancel before any local mutation. Refuse (no DB change) if configured gate fails.
  await cancelStripeSubscriptionForOrgDelete(
    org.billingProfile?.stripeSubscriptionId,
  );

  const memberUserIds = org.memberships.map((m) => m.userId);
  const memberEmails = org.memberships.flatMap((m) => [
    m.user.email,
    m.user.emailNormalized,
  ]);

  await prisma.$transaction(
    async (tx) => {
      await markInFlightWorkFailedForWipe(org.id, tx);
      await deletePersonalLeftoversForWipe(
        {
          organizationId: org.id,
          memberUserIds,
          memberEmails,
        },
        tx,
      );
      await tx.organization.delete({ where: { id: org.id } });
      await recordAnonymousAccountWipe({
        reason: input.reason,
        client: tx,
      });
    },
    { timeout: 120_000 },
  );

  const purged = await purgeOrphanedTenantUsersAfterOrgDelete(memberUserIds);

  return {
    organizationId: org.id,
    organizationName: org.name,
    alreadyWiped: false,
    purgedUserIds: purged.purgedUserIds,
  };
}
