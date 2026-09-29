/**
 * Layout gate (account lifecycle B3 / B4):
 * - No billing-only route redirect — every page stays viewable.
 * - Product Server Action writes refused via requireOrganization →
 *   assertWritableOnServerAction (OrganizationReadOnlyError).
 * - Account-menu logout and self-serve delete must work from any page while
 *   read-only, so this gate does not blanket-refuse all Server Actions.
 */
import "server-only";

import { headers } from "next/headers";
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
 * Read-only orgs: allow all GETs.
 *
 * Server Action write refusal lives in requireOrganization →
 * assertWritableOnServerAction (throws OrganizationReadOnlyError). The layout
 * does not blanket-refuse every Server Action: account-menu logout and
 * self-serve delete (B4) must work from any page while read-only, and billing
 * portal actions from banners must too. Exempt path prefixes still short-circuit
 * for billing / support / account pages.
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

  // Intentionally no throw: product writes are gated in requireOrganization.
}
