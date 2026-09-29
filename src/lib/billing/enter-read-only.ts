/**
 * Enter / clear organization read-only (account lifecycle B3).
 * Node-safe (no server-only). FREE/COMPED never enter read-only.
 */
import { prisma } from "@/lib/prisma-client";
import { BILLING_PLAN_COMPED } from "@/lib/billing/plans";

function isCompedOrFreePlan(planCode: string, billingStatus: string): boolean {
  return (
    planCode === BILLING_PLAN_COMPED ||
    planCode === "FREE" ||
    billingStatus === "FREE"
  );
}

/**
 * Mark the organization read-only after the paid period ends without payment.
 * Idempotent: preserves an existing readOnlyStartedAt. FREE/COMPED no-op.
 */
export async function enterOrganizationReadOnly(input: {
  organizationId: string;
  now?: Date;
  /** Defaults to CANCELED (period ended / subscription deleted). */
  billingStatus?: "CANCELED" | "PAST_DUE" | "UNPAID";
  canceledAt?: Date | null;
}): Promise<{ entered: boolean }> {
  const now = input.now ?? new Date();
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: {
      planCode: true,
      billingStatus: true,
      readOnlyStartedAt: true,
      canceledAt: true,
    },
  });
  if (!profile) return { entered: false };
  if (isCompedOrFreePlan(profile.planCode, profile.billingStatus)) {
    return { entered: false };
  }

  await prisma.organizationBillingProfile.update({
    where: { organizationId: input.organizationId },
    data: {
      billingStatus: input.billingStatus ?? "CANCELED",
      cancelAtPeriodEnd: false,
      readOnlyStartedAt: profile.readOnlyStartedAt ?? now,
      canceledAt: input.canceledAt ?? profile.canceledAt ?? now,
      lockReason: "CANCELED",
      gracePeriodEndsAt: null,
    },
  });
  return { entered: true };
}

/**
 * Restore full access after successful payment / resubscribe.
 * Clears readOnlyStartedAt and cancel-at-period-end flags as appropriate.
 */
export async function clearOrganizationReadOnly(input: {
  organizationId: string;
}): Promise<void> {
  await prisma.organizationBillingProfile.updateMany({
    where: { organizationId: input.organizationId },
    data: {
      readOnlyStartedAt: null,
      lockReason: null,
      gracePeriodEndsAt: null,
    },
  });
}
