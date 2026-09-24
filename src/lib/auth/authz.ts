import "server-only";

import type { MembershipRole, PlatformRole, User } from "@prisma/client";
import {
  getCurrentUser,
  requireCurrentUser,
  resolveActiveOrganization,
} from "@/lib/auth/session";
import { assertAccountCapability } from "@/lib/auth/account-policy";
import { assertOrganizationNotPaymentLocked } from "@/lib/billing/payment-lock";
import {
  requireOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export { getCurrentUser, requireCurrentUser };

export function canManageOrganizationPolicy(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** View Billing settings (plan, amount). Not spend mutations. */
export function canViewBilling(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Seat adds/removes, portal, checkout, credits, early trial conversion. */
export function canManageBillingSpend(role: MembershipRole): boolean {
  return role === "OWNER";
}

/** Destructive Product / ICP / Persona delete or archive. */
export function canDeleteSetupEntities(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageInvitations(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canRenameWorkspace(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function isPlatformSuperAdmin(role: PlatformRole): boolean {
  return role === "SUPER_ADMIN";
}

/** Platform console access: SUPER_ADMIN (mutate) or SUPPORT (read-only). */
export function isPlatformOperator(role: PlatformRole): boolean {
  return role === "SUPER_ADMIN" || role === "SUPPORT";
}

/** Platform mutations (policy, suspend, credits): SUPER_ADMIN only. */
export function canMutatePlatform(role: PlatformRole): boolean {
  return role === "SUPER_ADMIN";
}

export function canEditTransactionalTemplates(role: PlatformRole): boolean {
  return role === "SUPER_ADMIN";
}

export async function getMembershipForCurrentUser(organizationId?: string) {
  const user = await requireCurrentUser();
  const ctx = await resolveActiveOrganization(user, organizationId);
  if (!ctx) {
    throw new TenantError("Organization not found.");
  }
  // For admin operations, prefer ACTIVE orgs; suspended still resolvable for messaging.
  return ctx;
}

export async function requireOrgAdmin(organizationId?: string) {
  const ctx = await getMembershipForCurrentUser(organizationId);
  if (!canManageOrganizationPolicy(ctx.membership.role)) {
    throw new AuthorizationError(
      "Organization administrator permission required.",
    );
  }
  assertAccountCapability(ctx.user, "CHANGE_ORG_POLICY");
  return ctx;
}

/** OWNER only — subscription spend / seats / Stripe portal. */
export async function requireOrgOwner(organizationId?: string) {
  const ctx = await getMembershipForCurrentUser(organizationId);
  if (!canManageBillingSpend(ctx.membership.role)) {
    throw new AuthorizationError(
      "Organization owner permission required for billing changes.",
    );
  }
  assertAccountCapability(ctx.user, "CHANGE_ORG_POLICY");
  return ctx;
}

/** OWNER/ADMIN required for Product/Persona/ICP destructive delete. */
export async function requireSetupDeletePermission(organizationId?: string) {
  const ctx = await getMembershipForCurrentUser(organizationId);
  if (!canDeleteSetupEntities(ctx.membership.role)) {
    throw new AuthorizationError(
      "Organization administrator permission is required to delete products or personas.",
    );
  }
  return ctx;
}

export async function requirePlatformOperator(): Promise<User> {
  const user = await requireCurrentUser();
  if (!isPlatformOperator(user.platformRole)) {
    throw new AuthorizationError("Platform operator access required.");
  }
  return user;
}

export async function requirePlatformSuperAdmin(): Promise<User> {
  const user = await requireCurrentUser();
  if (!canMutatePlatform(user.platformRole)) {
    throw new AuthorizationError("Platform super admin required.");
  }
  return user;
}

export async function requireVerifiedForAiSpend(): Promise<User> {
  const user = await requireCurrentUser();
  assertAccountCapability(user, "AI_SPEND");
  const organization = await requireOrganization();
  await assertOrganizationNotPaymentLocked(organization.id);
  return user;
}
