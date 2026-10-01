/**
 * Layout gate (account lifecycle B3 / B4):
 * - No billing-only route redirect — every page stays viewable.
 * - Server Actions on non-exempt pages throw OrganizationReadOnlyError while
 *   read-only. requireOrganization → assertOrganizationWritable stays as the
 *   second layer.
 * - Exempt paths: billing, payment, credits, support, Account settings
 *   (password change and Delete my account), and the terms page.
 * - Log Out from the account menu posts to /api/account/logout. That route is
 *   outside this layout, so this gate never runs for it. Log Out on Account
 *   settings is logoutAction on /settings/account, which is path-exempt.
 *   logoutAction does not call requireOrganization.
 */
import "server-only";

import { headers } from "next/headers";
import { OrganizationReadOnlyError } from "@/lib/billing/account-read-only";
import {
  NEXT_ACTION_HEADER,
  getOrganizationPaymentLockState,
  isPaymentLockPathExempt,
  PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES,
} from "@/lib/billing/payment-lock";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

function isPaymentLockRouteExempt(pathname: string): boolean {
  return PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Read-only orgs: allow all GETs. Refuse Server Actions outside the exempt
 * paths. Account-menu Log Out is /api/account/logout and never reaches here.
 */
export async function enforcePaymentLockGate(): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;

  const h = await headers();
  const pathname = h.get("x-pathname")?.trim() || "";
  if (pathname && isPaymentLockRouteExempt(pathname)) return;

  const { spendBlocked } = await getOrganizationPaymentLockState(
    organization.id,
  );
  if (!spendBlocked) return;
  if (!h.get(NEXT_ACTION_HEADER)) return;
  if (pathname && isPaymentLockPathExempt(pathname)) return;

  throw new OrganizationReadOnlyError();
}
