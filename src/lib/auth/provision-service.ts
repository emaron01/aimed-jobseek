/**
 * Node-safe signup/workspace provisioning (no server-only).
 * Next.js entry: `@/lib/auth/provision` re-exports behind server-only.
 */
import type { MembershipRole, Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";
import { recordAdminAuditEvent } from "@/lib/auth/audit-service";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  DEFAULT_RESEARCH_POLICY_VALUES,
  SELF_SERVE_USAGE_POLICY_VALUES,
} from "@/lib/usage/defaults";
import { SELF_SERVE_BILLING_DEFAULTS } from "@/lib/billing/billing-state";
import { isPlatformSuperAdminProvisioningActive } from "@/lib/auth/platform-provision-flag";

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

async function uniqueSlug(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  base: string,
): Promise<string> {
  let candidate = base;
  let n = 0;
  while (
    await tx.organization.findUnique({ where: { slug: candidate } })
  ) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  // Extra entropy avoids concurrent signup races on the same base slug.
  if (n === 0) {
    const exists = await tx.organization.findUnique({ where: { slug: candidate } });
    if (exists) {
      candidate = `${base}-${Date.now().toString(36)}`;
    }
  }
  // Always uniquify with a short suffix under high concurrency.
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  candidate = `${candidate}-${stamp}`.slice(0, 60);
  return candidate;
}

async function createTenantWorkspaceForUser(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    userId: string;
    email: string;
    workspaceName: string;
    timezone?: string;
    planCode?: string;
    seatQuantity?: number;
    maxSeats?: number;
  },
): Promise<{ organization: Organization; membershipRole: MembershipRole }> {
  const slug = await uniqueSlug(tx, slugify(input.workspaceName));
  const organization = await tx.organization.create({
    data: {
      name: input.workspaceName,
      slug,
      status: "ACTIVE",
      accountType: "INDIVIDUAL",
      timezone: input.timezone?.trim() || DEFAULT_ORGANIZATION_TIMEZONE,
    },
  });

  await tx.organizationMembership.create({
    data: {
      organizationId: organization.id,
      userId: input.userId,
      role: "OWNER",
      isBillingContact: true,
    },
  });

  await tx.organizationUsagePolicy.create({
    data: {
      organizationId: organization.id,
      ...SELF_SERVE_USAGE_POLICY_VALUES,
    },
  });

  await tx.researchPolicy.create({
    data: {
      organizationId: organization.id,
      ...DEFAULT_RESEARCH_POLICY_VALUES,
    },
  });

  await tx.organizationBillingProfile.create({
    data: {
      organizationId: organization.id,
      billingEmail: input.email,
      ...SELF_SERVE_BILLING_DEFAULTS,
      ...(input.planCode ? { planCode: input.planCode } : {}),
      ...(input.seatQuantity != null
        ? { seatQuantity: input.seatQuantity }
        : {}),
      ...(input.maxSeats != null ? { maxSeats: input.maxSeats } : {}),
    },
  });

  await tx.user.update({
    where: { id: input.userId },
    data: { activeOrganizationId: organization.id },
  });

  return { organization, membershipRole: "OWNER" };
}

/**
 * Transactional/idempotent signup provisioning for an authenticated identity.
 * Creates User + Organization + OWNER membership + policies + billing profile.
 * OWNER = billing/account owner; ADMIN = can manage policy/invites (invite-as-OWNER forbidden).
 *
 * If an application User already exists without a membership (e.g. after an org
 * hard-delete left the identity behind), creates a fresh workspace — except
 * during platform SUPER_ADMIN CLI provisioning or for platform operators.
 */
export async function provisionIndividualWorkspace(input: {
  authUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  timezone?: string;
  /** Organization / company display name. Falls back to "{firstName}'s Workspace". */
  companyName?: string | null;
  planCode?: string | null;
  seatQuantity?: number | null;
  maxSeats?: number | null;
}): Promise<{
  user: User;
  organization: Organization | null;
  membershipRole: MembershipRole;
  created: boolean;
}> {
  const email = normalizeEmail(input.email);
  const firstName = input.firstName.trim() || "User";
  const lastName = input.lastName.trim() || "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const isVitest = Boolean(process.env.VITEST);
  const trimmedCompany = input.companyName?.trim() || "";
  const workspaceName = isVitest
    ? `[TEST] ${trimmedCompany || `${firstName}'s Workspace`}`
    : trimmedCompany || `${firstName}'s Workspace`;
  const userDisplayName = isVitest
    ? `[TEST] ${displayName || firstName}`
    : displayName;
  const workspaceBilling = {
    planCode: input.planCode?.trim() || undefined,
    seatQuantity:
      input.seatQuantity != null && Number.isFinite(input.seatQuantity)
        ? Math.floor(input.seatQuantity)
        : undefined,
    maxSeats:
      input.maxSeats != null && Number.isFinite(input.maxSeats)
        ? Math.floor(input.maxSeats)
        : undefined,
  };

  const existingByAuth = await prisma.user.findUnique({
    where: { authUserId: input.authUserId },
    include: {
      memberships: { include: { organization: true }, take: 1 },
    },
  });
  if (existingByAuth) {
    const org = existingByAuth.memberships[0]?.organization;
    if (org) {
      return {
        user: existingByAuth,
        organization: org,
        membershipRole:
          existingByAuth.memberships[0]?.role ?? ("ADMIN" as const),
        created: false,
      };
    }
    if (isPlatformSuperAdminProvisioningActive()) {
      return {
        user: existingByAuth,
        organization: null,
        membershipRole: "ADMIN" as const,
        created: false,
      };
    }
    // Platform operators may intentionally have no tenant workspace.
    if (existingByAuth.platformRole !== "NONE") {
      return {
        user: existingByAuth,
        organization: null,
        membershipRole: "ADMIN" as const,
        created: false,
      };
    }

    const repaired = await prisma.$transaction(async (tx) => {
      const created = await createTenantWorkspaceForUser(tx, {
        userId: existingByAuth.id,
        email,
        workspaceName,
        timezone: input.timezone,
        ...workspaceBilling,
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: existingByAuth.id },
      });
      return { user, ...created };
    });

    await recordAdminAuditEvent({
      action: "USER_SIGNUP",
      actorUserId: repaired.user.id,
      organizationId: repaired.organization.id,
      metadata: { via: "email_password", repairedMissingWorkspace: true },
    });

    return {
      user: repaired.user,
      organization: repaired.organization,
      membershipRole: repaired.membershipRole,
      created: true,
    };
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { emailNormalized: email },
  });
  if (existingByEmail && existingByEmail.authUserId !== input.authUserId) {
    // Link legacy pre-auth user to new identity when emails match and unlinked.
    if (!existingByEmail.authUserId) {
      const linked = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: existingByEmail.id },
          data: {
            authUserId: input.authUserId,
            firstName: existingByEmail.firstName ?? firstName,
            lastName: existingByEmail.lastName ?? lastName,
            name: existingByEmail.name ?? userDisplayName,
          },
        });
        let membership = await tx.organizationMembership.findFirst({
          where: { userId: user.id },
          include: { organization: true },
        });
        if (!membership) {
          // Platform SUPER_ADMIN CLI: link identity without inventing a tenant org.
          if (isPlatformSuperAdminProvisioningActive()) {
            return {
              user,
              organization: null,
              membershipRole: "ADMIN" as const,
            };
          }
          const created = await createTenantWorkspaceForUser(tx, {
            userId: user.id,
            email,
            workspaceName,
            timezone: input.timezone,
            ...workspaceBilling,
          });
          return {
            user,
            organization: created.organization,
            membershipRole: created.membershipRole,
          };
        }
        return {
          user,
          organization: membership.organization,
          membershipRole: membership.role,
        };
      });
      return { ...linked, created: false };
    }
    throw new ProvisionError("An account with this email already exists.");
  }

  // Brand-new AuthUser with no application User yet.
  if (isPlatformSuperAdminProvisioningActive()) {
    const user = await prisma.user.create({
      data: {
        authUserId: input.authUserId,
        email,
        emailNormalized: email,
        firstName,
        lastName,
        name: userDisplayName,
        platformRole: "NONE",
      },
    });
    return {
      user,
      organization: null,
      membershipRole: "ADMIN",
      created: true,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        authUserId: input.authUserId,
        email,
        emailNormalized: email,
        firstName,
        lastName,
        name: userDisplayName,
        platformRole: "NONE",
      },
    });

    const created = await createTenantWorkspaceForUser(tx, {
      userId: user.id,
      email,
      workspaceName,
      timezone: input.timezone,
      ...workspaceBilling,
    });

    const updatedUser = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    return {
      user: updatedUser,
      organization: created.organization,
      membershipRole: created.membershipRole,
    };
  });

  await recordAdminAuditEvent({
    action: "USER_SIGNUP",
    actorUserId: result.user.id,
    organizationId: result.organization.id,
    metadata: { via: "email_password" },
  });

  return { ...result, created: true };
}
