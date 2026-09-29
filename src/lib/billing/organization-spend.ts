/**
 * Shared organization spend / writable guard (account lifecycle B2 + B3).
 *
 * Single place: does this organization exist, and may it spend / write?
 * B3: "may spend" / "may write" is false while read-only (FREE/COMPED never).
 *
 * Node-safe (no server-only) for workers.
 */
import { prisma } from "@/lib/prisma-client";
import {
  ACCOUNT_READ_ONLY_ACTION_MESSAGE,
  OrganizationReadOnlyError,
} from "@/lib/billing/account-read-only";
import { getOrganizationPaymentLockState } from "@/lib/billing/payment-lock";

export const ORGANIZATION_MISSING_TERMINAL_REASON =
  "Organization account is gone.";

export type OrganizationSpendDenialReason =
  | "ORGANIZATION_MISSING"
  | "SPEND_BLOCKED"
  | "READ_ONLY";

export type OrganizationSpendCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: OrganizationSpendDenialReason;
      message: string;
      lockReason: string | null;
    };

/**
 * Thrown when the organization row is gone (wiped / never existed).
 */
export class OrganizationMissingError extends Error {
  readonly code = "ORGANIZATION_MISSING" as const;

  constructor(message = ORGANIZATION_MISSING_TERMINAL_REASON) {
    super(message);
    this.name = "OrganizationMissingError";
  }
}

/**
 * Non-throwing check for workers and enqueue preflight.
 */
export async function checkOrganizationMaySpend(
  organizationId: string,
  now: Date = new Date(),
): Promise<OrganizationSpendCheck> {
  const id = organizationId.trim();
  if (!id) {
    return {
      allowed: false,
      reason: "ORGANIZATION_MISSING",
      message: ORGANIZATION_MISSING_TERMINAL_REASON,
      lockReason: null,
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!org) {
    return {
      allowed: false,
      reason: "ORGANIZATION_MISSING",
      message: ORGANIZATION_MISSING_TERMINAL_REASON,
      lockReason: null,
    };
  }

  const { spendBlocked, profile } = await getOrganizationPaymentLockState(
    id,
    now,
  );
  if (!spendBlocked || !profile) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "READ_ONLY",
    message: ACCOUNT_READ_ONLY_ACTION_MESSAGE,
    lockReason: profile.lockReason ?? profile.billingStatus,
  };
}

/**
 * Throw when the organization is missing or may not spend (paid AI / jobs).
 * Read-only → OrganizationReadOnlyError (exact seeker message).
 * Missing → OrganizationMissingError.
 */
export async function assertOrganizationMaySpend(
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const check = await checkOrganizationMaySpend(organizationId, now);
  if (check.allowed) return;
  if (check.reason === "ORGANIZATION_MISSING") {
    throw new OrganizationMissingError(check.message);
  }
  throw new OrganizationReadOnlyError(check.message);
}

/**
 * Writable check for non-paid product writes (Server Actions via requireOrganization).
 * Same read-only rule as may-spend today; B3 keeps one decision place.
 */
export async function assertOrganizationWritable(
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  await assertOrganizationMaySpend(organizationId, now);
}

export {
  ACCOUNT_READ_ONLY_ACTION_MESSAGE,
  OrganizationReadOnlyError,
} from "@/lib/billing/account-read-only";
