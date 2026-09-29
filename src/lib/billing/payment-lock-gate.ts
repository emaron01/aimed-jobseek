/**
 * Layout gate (account lifecycle B3):
 * - No billing-only route redirect — every page stays viewable.
 * - Server Actions outside exempt paths refused while read-only.
 */
import "server-only";

import { headers } from "next/headers";
import {
  NEXT_ACTION_HEADER,
  getOrganizationPaymentLockState,
  isPaymentLockPathExempt,
  PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES,
} from "@/lib/billing/payment-lock";
import { OrganizationReadOnlyError } from "@/lib/billing/account-read-only";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

function isPaymentLockRouteExempt(pathname: string): boolean {
  return PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Read-only orgs: allow all GETs; refuse Server Actions outside billing /
 * support / account exemptions.
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
