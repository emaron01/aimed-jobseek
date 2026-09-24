import "server-only";

import { createHash, randomBytes } from "crypto";
import type { MembershipRole, Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canManageInvitations,
  canRenameWorkspace,
  AuthorizationError,
} from "@/lib/org/authz";
import { assertOrganizationNotPaymentLocked } from "@/lib/billing/payment-lock";
import { orgAdminInviteDenialReason } from "@/lib/org/seats";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";

export class SignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignupError";
  }
}

export class InvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationError";
  }
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Read-only preview of an invite for the accept page UI (no status mutation). */
export async function getInvitationPreviewByRawToken(rawToken: string): Promise<{
  email: string;
  status: string;
  organizationName: string;
  expiresAt: Date;
} | null> {
  const token = rawToken.trim();
  if (!token) return null;
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      email: true,
      status: true,
      expiresAt: true,
      organization: { select: { name: true } },
    },
  });
  if (!invitation) return null;
  return {
    email: invitation.email,
    status: invitation.status,
    organizationName: invitation.organization.name,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Individual signup provisioning (shared by auth hooks and tests).
 * Creates User + Organization + OWNER membership + policies + billing profile.
 * OWNER = billing/account owner; ADMIN = can manage policy/invites.
 * Invite-as-OWNER is forbidden (see createOrganizationInvitation).
 */
export async function createIndividualWorkspace(input: {
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  timezone?: string;
  authUserId?: string | null;
}): Promise<{
  user: User;
  organization: Organization;
  membershipRole: MembershipRole;
}> {
  const { provisionIndividualWorkspace } = await import(
    "@/lib/auth/provision"
  );
  const email = input.email.trim().toLowerCase();
  const firstName =
    input.firstName?.trim() ||
    input.name?.trim()?.split(/\s+/)[0] ||
    email.split("@")[0] ||
    "User";
  const lastName =
    input.lastName?.trim() ||
    input.name?.trim()?.split(/\s+/).slice(1).join(" ") ||
    "";

  // Test helper path without Better Auth identity: synthesize a stable auth id.
  const authUserId =
    input.authUserId?.trim() ||
    `test_auth_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;

  const result = await provisionIndividualWorkspace({
    authUserId,
    email,
    firstName,
    lastName,
    timezone: input.timezone,
  });

  if (!result.organization) {
    throw new SignupError(
      "Workspace provisioning did not create an organization.",
    );
  }

  return {
    user: result.user,
    organization: result.organization,
    membershipRole: result.membershipRole,
  };
}

export async function renameOrganizationWorkspace(input: {
  organizationId: string;
  actorUserId: string;
  name: string;
}): Promise<Organization> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.actorUserId,
      },
    },
  });
  if (!membership || !canRenameWorkspace(membership.role)) {
    throw new AuthorizationError(
      "Only OWNER or ADMIN can rename the workspace.",
    );
  }
  const name = input.name.trim();
  if (!name) throw new SignupError("Workspace name is required.");

  return prisma.organization.update({
    where: { id: input.organizationId },
    data: { name },
  });
}

/**
 * Create an invitation. Stores token hash only; returns raw token once.
 * Org admins cannot invite as OWNER (transfer ownership separately).
 */
export async function createOrganizationInvitation(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role?: MembershipRole;
  expiresInDays?: number;
}): Promise<{ invitationId: string; rawToken: string; expiresAt: Date }> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.invitedByUserId,
      },
    },
  });
  if (!membership || !canManageInvitations(membership.role)) {
    throw new AuthorizationError(
      "Only OWNER or ADMIN can invite users.",
    );
  }

  await assertOrganizationNotPaymentLocked(input.organizationId);

  const [organization, billing, usedSeats] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { accountType: true },
    }),
    prisma.organizationBillingProfile.findUnique({
      where: { organizationId: input.organizationId },
      select: { planCode: true, seatQuantity: true, maxSeats: true },
    }),
    prisma.organizationMembership.count({
      where: { organizationId: input.organizationId },
    }),
  ]);
  const denial = orgAdminInviteDenialReason({
    accountType: organization.accountType,
    planCode: billing?.planCode ?? null,
    seatQuantity: billing?.seatQuantity ?? 1,
    maxSeats: billing?.maxSeats ?? billing?.seatQuantity ?? 1,
    usedSeats,
  });
  if (denial) {
    throw new InvitationError(denial);
  }

  const role = input.role ?? "MEMBER";
  if (role === "OWNER") {
    throw new InvitationError(
      "Cannot invite as OWNER. Transfer ownership explicitly.",
    );
  }

  return issueOrganizationInvitation({
    organizationId: input.organizationId,
    invitedByUserId: input.invitedByUserId,
    email: input.email,
    role,
    expiresInDays: input.expiresInDays,
    via: "org_admin",
  });
}

/**
 * Platform SUPER_ADMIN invite into any org (no membership required).
 * Not gated by Individual seat policy — comps and enterprise seats are
 * managed deliberately from the platform console.
 * Allows OWNER only when the org currently has zero OWNER members (bootstrap).
 */
export async function createOrganizationInvitationAsPlatform(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role?: MembershipRole;
  expiresInDays?: number;
}): Promise<{ invitationId: string; rawToken: string; expiresAt: Date }> {
  const role = input.role ?? "MEMBER";
  if (role === "OWNER") {
    const owners = await prisma.organizationMembership.count({
      where: { organizationId: input.organizationId, role: "OWNER" },
    });
    if (owners > 0) {
      throw new InvitationError(
        "Cannot invite as OWNER while the organization already has an OWNER.",
      );
    }
  }

  return issueOrganizationInvitation({
    organizationId: input.organizationId,
    invitedByUserId: input.invitedByUserId,
    email: input.email,
    role,
    expiresInDays: input.expiresInDays,
    via: "platform",
  });
}

async function issueOrganizationInvitation(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role: MembershipRole;
  expiresInDays?: number;
  via: "org_admin" | "platform";
}): Promise<{ invitationId: string; rawToken: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new InvitationError("A valid email address is required.");
  }

  const existingMember = await prisma.user.findUnique({ where: { email } });
  if (existingMember) {
    const already = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: existingMember.id,
        },
      },
    });
    if (already) {
      throw new InvitationError("User is already a member of this organization.");
    }
  }

  const pending = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId: input.organizationId,
      email,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    throw new InvitationError(
      "A pending invitation already exists for this email.",
    );
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + (input.expiresInDays ?? 7),
  );

  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash,
      status: "PENDING",
      expiresAt,
      invitedByUserId: input.invitedByUserId,
    },
  });

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_INVITATION_CREATED",
    actorUserId: input.invitedByUserId,
    organizationId: input.organizationId,
    metadata: {
      invitationId: invitation.id,
      role: input.role,
      email,
      via: input.via,
    },
  });

  try {
    const { sendTransactionalEmail } = await import(
      "@/lib/transactional-email/send"
    );
    const { getAuthEnv } = await import("@/lib/auth/config");
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
    });
    const inviter = await prisma.user.findUnique({
      where: { id: input.invitedByUserId },
    });
    const appUrl = getAuthEnv().appUrl;
    await sendTransactionalEmail({
      templateKey: "ORGANIZATION_INVITATION",
      to: email,
      userId: input.invitedByUserId,
      organizationId: input.organizationId,
      variables: {
        firstName: inviter?.firstName || "there",
        workspaceName: org.name,
        inviterName: inviter?.name || inviter?.email || "A teammate",
        invitedEmail: email,
        invitationUrl: `${appUrl}/invite/accept?token=${rawToken}`,
        expirationTime: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[invitation-email] failed to send", {
      invitationId: invitation.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return {
    invitationId: invitation.id,
    rawToken,
    expiresAt,
  };
}

/**
 * After joining an invited org, delete empty personal workspaces the user
 * still solely owns (signup auto-provision leftovers). Never deletes keepOrganizationId.
 */
export async function retireEmptyPersonalWorkspace(
  userId: string,
  keepOrganizationId: string,
  now: Date = new Date(),
): Promise<{ retiredOrganizationIds: string[] }> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      organizationId: { not: keepOrganizationId },
    },
    include: {
      organization: {
        select: {
          id: true,
          createdAt: true,
          _count: {
            select: {
              memberships: true,
              products: true,
              campaigns: true,
              contactLists: true,
              contacts: true,
            },
          },
        },
      },
    },
  });

  const retiredOrganizationIds: string[] = [];
  for (const membership of memberships) {
    const org = membership.organization;
    if (org.id === keepOrganizationId) continue;
    if (org.createdAt.getTime() < sevenDaysAgo.getTime()) continue;
    if (org._count.memberships !== 1) continue;
    if (org._count.products !== 0) continue;
    if (org._count.campaigns !== 0) continue;
    if (org._count.contacts !== 0) continue;

    if (org._count.contactLists > 0) {
      const listsWithContacts = await prisma.contactList.count({
        where: { organizationId: org.id, totalContacts: { gt: 0 } },
      });
      if (listsWithContacts > 0) continue;
    }

    await prisma.organization.delete({ where: { id: org.id } });
    retiredOrganizationIds.push(org.id);
  }

  return { retiredOrganizationIds };
}

export async function acceptOrganizationInvitation(input: {
  rawToken: string;
  acceptingUserId: string;
}): Promise<{ organizationId: string; role: MembershipRole }> {
  const tokenHash = hashToken(input.rawToken);
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash },
  });

  if (!invitation) {
    throw new InvitationError("Invitation not found.");
  }
  if (invitation.status === "REVOKED") {
    // Lookup is by token only. A newer PENDING invite for the same email is a
    // different token — the old link cannot be redirected by email match.
    const newerPending = await prisma.organizationInvitation.findFirst({
      where: {
        organizationId: invitation.organizationId,
        email: invitation.email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
        id: { not: invitation.id },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    throw new InvitationError(
      newerPending
        ? "Invitation has been revoked. A newer invite was sent to this email — open the latest invitation link."
        : "Invitation has been revoked.",
    );
  }
  if (invitation.status === "ACCEPTED") {
    throw new InvitationError("Invitation has already been used.");
  }
  if (
    invitation.status === "EXPIRED" ||
    invitation.expiresAt.getTime() <= Date.now()
  ) {
    if (invitation.status === "PENDING") {
      await prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
    }
    throw new InvitationError("Invitation has expired.");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.acceptingUserId },
  });
  if (user.email.trim().toLowerCase() !== invitation.email.toLowerCase()) {
    throw new InvitationError(
      "Invitation email does not match the accepting user.",
    );
  }

  const org = await prisma.organization.findFirst({
    where: { id: invitation.organizationId, status: "ACTIVE" },
  });
  if (!org) {
    throw new InvitationError("Organization no longer exists.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
    });
    if (existing) {
      throw new InvitationError("User is already a member of this organization.");
    }

    await tx.organizationMembership.create({
      data: {
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
        isBillingContact: invitation.role === "OWNER",
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { activeOrganizationId: invitation.organizationId },
    });

    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
  });

  await ensureOrganizationPolicies(invitation.organizationId);

  await retireEmptyPersonalWorkspace(user.id, invitation.organizationId);

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_INVITATION_ACCEPTED",
    actorUserId: user.id,
    organizationId: invitation.organizationId,
    metadata: { invitationId: invitation.id },
  });

  return {
    organizationId: invitation.organizationId,
    role: invitation.role,
  };
}

export async function revokeOrganizationInvitation(input: {
  organizationId: string;
  invitationId: string;
  actorUserId: string;
}): Promise<void> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.actorUserId,
      },
    },
  });
  if (!membership || !canManageInvitations(membership.role)) {
    throw new AuthorizationError(
      "Only OWNER or ADMIN can revoke invitations.",
    );
  }

  const invitation = await prisma.organizationInvitation.findFirst({
    where: {
      id: input.invitationId,
      organizationId: input.organizationId,
    },
  });
  if (!invitation) {
    throw new InvitationError("Invitation not found.");
  }
  if (invitation.status !== "PENDING") {
    throw new InvitationError("Only pending invitations can be revoked.");
  }

  await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
  });

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_INVITATION_REVOKED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: { invitationId: invitation.id, email: invitation.email },
  });
}

/**
 * Count OWNER memberships — used to prevent ownerless Organizations.
 */
export async function assertOrganizationHasOwner(
  organizationId: string,
): Promise<void> {
  const owners = await prisma.organizationMembership.count({
    where: { organizationId, role: "OWNER" },
  });
  if (owners < 1) {
    throw new AuthorizationError(
      "Organization must retain at least one OWNER.",
    );
  }
}

async function assertActorCanManageMembers(input: {
  organizationId: string;
  actorUserId: string;
  /** When true, skip org membership and require platform SUPER_ADMIN. */
  asPlatform?: boolean;
}): Promise<void> {
  if (input.asPlatform) {
    const actor = await prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { platformRole: true },
    });
    if (actor?.platformRole !== "SUPER_ADMIN") {
      throw new AuthorizationError(
        "Only platform SUPER_ADMIN can manage members for another organization.",
      );
    }
    return;
  }
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.actorUserId,
      },
    },
  });
  if (!membership || !canManageInvitations(membership.role)) {
    throw new AuthorizationError(
      "Only OWNER or ADMIN can manage organization members.",
    );
  }
}

export async function changeOrganizationMemberRole(input: {
  organizationId: string;
  actorUserId: string;
  targetUserId: string;
  role: MembershipRole;
  asPlatform?: boolean;
}): Promise<void> {
  await assertActorCanManageMembers(input);

  if (input.role === "OWNER") {
    throw new InvitationError(
      "Cannot assign OWNER via role change. Transfer ownership explicitly.",
    );
  }

  const target = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.targetUserId,
      },
    },
  });
  if (!target) {
    throw new InvitationError("Member not found.");
  }
  if (target.role === "OWNER") {
    throw new InvitationError(
      "Cannot change the OWNER role here. Transfer ownership explicitly.",
    );
  }
  if (target.userId === input.actorUserId && !input.asPlatform) {
    throw new InvitationError("You cannot change your own role.");
  }

  await prisma.organizationMembership.update({
    where: { id: target.id },
    data: { role: input.role },
  });

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_MEMBER_ROLE_CHANGED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      targetUserId: input.targetUserId,
      fromRole: target.role,
      toRole: input.role,
      via: input.asPlatform ? "platform" : "org_admin",
    },
  });
}

export async function removeOrganizationMember(input: {
  organizationId: string;
  actorUserId: string;
  targetUserId: string;
  asPlatform?: boolean;
}): Promise<void> {
  await assertActorCanManageMembers(input);

  const target = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.targetUserId,
      },
    },
  });
  if (!target) {
    throw new InvitationError("Member not found.");
  }
  if (target.role === "OWNER") {
    throw new InvitationError(
      "Cannot remove the OWNER. Transfer ownership first.",
    );
  }
  if (target.userId === input.actorUserId && !input.asPlatform) {
    throw new InvitationError("You cannot remove yourself.");
  }

  await prisma.organizationMembership.delete({ where: { id: target.id } });

  const user = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { activeOrganizationId: true },
  });
  if (user?.activeOrganizationId === input.organizationId) {
    const other = await prisma.organizationMembership.findFirst({
      where: { userId: input.targetUserId },
      orderBy: { createdAt: "asc" },
    });
    await prisma.user.update({
      where: { id: input.targetUserId },
      data: { activeOrganizationId: other?.organizationId ?? null },
    });
  }

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_MEMBER_REMOVED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      targetUserId: input.targetUserId,
      role: target.role,
      via: input.asPlatform ? "platform" : "org_admin",
    },
  });
}

export async function revokeOrganizationInvitationAsPlatform(input: {
  organizationId: string;
  invitationId: string;
  actorUserId: string;
}): Promise<void> {
  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { platformRole: true },
  });
  if (actor?.platformRole !== "SUPER_ADMIN") {
    throw new AuthorizationError(
      "Only platform SUPER_ADMIN can revoke invitations for another organization.",
    );
  }

  const invitation = await prisma.organizationInvitation.findFirst({
    where: {
      id: input.invitationId,
      organizationId: input.organizationId,
    },
  });
  if (!invitation) {
    throw new InvitationError("Invitation not found.");
  }
  if (invitation.status !== "PENDING") {
    throw new InvitationError("Only pending invitations can be revoked.");
  }

  await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
  });

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_INVITATION_REVOKED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      invitationId: invitation.id,
      email: invitation.email,
      via: "platform",
    },
  });
}
