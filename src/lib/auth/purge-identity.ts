/**
 * Remove Better Auth rows for an identity so the email can be reused on signup.
 * Node-safe (no server-only).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Remove Better Auth rows for an identity. When `client` is a transaction
 * client, all deletes run on that client (no nested transaction).
 */
export async function purgeAuthIdentity(input: {
  authUserId: string;
  emails: string[];
  client?: DbClient;
}): Promise<void> {
  const db = input.client ?? prisma;
  const identifiers = [
    ...new Set(
      [input.authUserId, ...input.emails.map((e) => e.trim().toLowerCase())].filter(
        Boolean,
      ),
    ),
  ];

  await db.authSession.deleteMany({ where: { userId: input.authUserId } });
  await db.authAccount.deleteMany({ where: { userId: input.authUserId } });
  await db.authVerification.deleteMany({
    where: { identifier: { in: identifiers } },
  });
  await db.authUser.delete({ where: { id: input.authUserId } });
}

/**
 * After an organization hard-delete, remove tenant Users who no longer belong
 * to any workspace (and their auth identity). Platform operators are kept.
 * Pass the same transaction client used for organization.delete so purge is atomic.
 */
export async function purgeOrphanedTenantUsersAfterOrgDelete(
  userIds: string[],
  client: DbClient = prisma,
): Promise<{ purgedUserIds: string[] }> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const purgedUserIds: string[] = [];

  for (const userId of uniqueIds) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        authUserId: true,
        email: true,
        emailNormalized: true,
        platformRole: true,
        _count: { select: { memberships: true } },
      },
    });
    if (!user) continue;
    if (user.platformRole !== "NONE") continue;
    if (user._count.memberships > 0) continue;

    if (user.authUserId) {
      await purgeAuthIdentity({
        authUserId: user.authUserId,
        emails: [user.email, user.emailNormalized],
        client,
      });
    }

    await client.user.delete({ where: { id: user.id } });
    purgedUserIds.push(user.id);
  }

  return { purgedUserIds };
}
