/**
 * Account lifecycle B3 — read-only account messages and errors.
 * Node-safe (no server-only).
 */
import { TenantError } from "@/lib/tenant/errors";
import { formatBillingDate } from "@/lib/billing/billing-state";

/** Exact seeker message when a blocked write/spend is attempted. */
export const ACCOUNT_READ_ONLY_ACTION_MESSAGE =
  "Your account is read-only. Renew your subscription to make changes.";

/** Exact banner on every app page while read-only. */
export const ACCOUNT_READ_ONLY_BANNER_MESSAGE =
  "Your subscription has ended, so your account is read-only. Renew within 30 days to keep everything. After that, your account and data are permanently deleted.";

/** Exact billing-page copy when cancel-at-period-end is scheduled. */
export function accountCancelScheduledMessage(periodEnd: Date): string {
  return `Your subscription ends on ${formatBillingDate(periodEnd)}. You'll keep full access until then.`;
}

/**
 * Thrown for read-only write/spend refusals.
 * Extends TenantError so Server Actions that only catch TenantError still
 * surface the exact seeker message.
 */
export class OrganizationReadOnlyError extends TenantError {
  readonly code = "ORGANIZATION_READ_ONLY" as const;

  constructor(message = ACCOUNT_READ_ONLY_ACTION_MESSAGE) {
    super(message);
    this.name = "OrganizationReadOnlyError";
  }
}
