import "server-only";

import type { Organization } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  requireCurrentUser,
  resolveActiveOrganization,
} from "@/lib/auth/session";
import { isDevTenantBypassEnabled, getAuthEnv } from "@/lib/auth/config";
import {
  NEXT_ACTION_HEADER,
  isPaymentLockPathExempt,
} from "@/lib/billing/payment-lock";
import { assertOrganizationWritable } from "@/lib/billing/organization-spend";
import { TenantError } from "@/lib/tenant/errors";

export { TenantError };

/**
 * Resolves the active Organization for the current request.
 *
 * Production: authenticated User → OrganizationMembership → active org.
 * Local dev only: optional DEV_ORGANIZATION_ID when ALLOW_DEV_TENANT_BYPASS=true.
 * DEV bypass is impossible in production (enforced in getAuthEnv).
 */
export async function getCurrentOrganization(): Promise<Organization | null> {
  if (isDevTenantBypassEnabled()) {
    const env = getAuthEnv();
    if (env.devOrganizationId) {
      return prisma.organization.findFirst({
        where: { id: env.devOrganizationId, status: "ACTIVE" },
      });
    }
  }

  const user = await getCurrentUser();
  if (!user) return null;
  const ctx = await resolveActiveOrganization(user);
  return ctx?.organization ?? null;
}

/**
 * Server Actions share the page URL as a POST with `next-action`. Page GETs do
 * not. Refuse product writes during payment grace/lock without redirecting views.
 */
async function assertWritableOnServerAction(
  organizationId: string,
): Promise<void> {
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch (error) {
    // Outside a Next request (unit/integration tests, workers) — no action gate.
    // Re-throw anything else so real header failures are not treated as unguarded.
    const message = error instanceof Error ? error.message : String(error);
    if (
      /outside a request scope/i.test(message) ||
      /next-dynamic-api-wrong-context/i.test(message)
    ) {
      return;
    }
    throw error;
  }
  if (!h.get(NEXT_ACTION_HEADER)) return;
  const pathname = h.get("x-pathname")?.trim() || "";
  if (pathname && isPaymentLockPathExempt(pathname)) return;
  await assertOrganizationWritable(organizationId);
}

export async function requireOrganization(): Promise<Organization> {
  const organization = await getCurrentOrganization();
  if (!organization) {
    throw new TenantError(
      "No active organization. Sign in and ensure you belong to a workspace.",
    );
  }
  if (organization.status === "SUSPENDED") {
    throw new TenantError(
      "This workspace is suspended. Contact support if you need help.",
    );
  }
  if (organization.status === "CANCELLED") {
    throw new TenantError("This workspace is no longer available.");
  }
  await assertWritableOnServerAction(organization.id);
  return organization;
}

export async function requireOrganizationId(): Promise<string> {
  const organization = await requireOrganization();
  return organization.id;
}

/**
 * Reject client-supplied organization IDs that the user does not belong to.
 */
export async function requireMembershipInOrganization(
  organizationId: string,
): Promise<Organization> {
  const user = await requireCurrentUser();
  const ctx = await resolveActiveOrganization(user, organizationId);
  if (!ctx) {
    throw new TenantError("Organization not found for this account.");
  }
  if (ctx.organization.status !== "ACTIVE") {
    throw new TenantError(
      "This workspace is not available for normal operations.",
    );
  }
  await assertWritableOnServerAction(ctx.organization.id);
  return ctx.organization;
}
