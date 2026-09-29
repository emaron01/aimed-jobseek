/**
 * Shared organization spend guard (account lifecycle B2).
 *
 * Single place that answers: does this organization exist, and may it spend?
 * Today "may spend" uses existing payment-lock spend rules (FREE/COMPED always
 * allowed). Batch B3 will add read-only here without scattering new checks.
 *
 * Node-safe (no server-only) for workers.
 */
import { prisma } from "@/lib/prisma-client";
import {
  PaymentLockError,
  getOrganizationPaymentLockState,
  paymentLockUserMessage,
} from "@/lib/billing/payment-lock";

export const ORGANIZATION_MISSING_TERMINAL_REASON =
  "Organization account is gone.";

export type OrganizationSpendDenialReason =
  | "ORGANIZATION_MISSING"
  | "SPEND_BLOCKED";

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
 * Distinct from PaymentLockError so callers can branch if needed.
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
    reason: "SPEND_BLOCKED",
    message: paymentLockUserMessage(profile, now),
    lockReason: profile.lockReason ?? profile.billingStatus,
  };
}

/**
 * Throw when the organization is missing or may not spend.
 * Spend-blocked → PaymentLockError (same typed outcome as today's payment lock).
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
  throw new PaymentLockError(check.message, check.lockReason);
}
