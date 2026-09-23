/**
 * Seat / invite policy for organizations.
 *
 * - STANDARD Individual: 1 seat — invites blocked
 * - Comped access keeps the seat policy of its product plan
 * - TEAM / legacy PREMIUM: invites until seatQuantity filled (max 10)
 * - ENTERPRISE (accountType or plan): invites until seatQuantity / maxSeats
 */
import {
  BILLING_PLAN_COMPED,
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
  canonicalPlanCode,
  planUsesSeatBilling,
} from "@/lib/billing/plans";
import {
  SEAT_LIMIT_REACHED_MESSAGE,
  buildSeatSnapshot,
} from "@/lib/org/seat-limits";
import { getBrandDeployment } from "@/lib/product-config/deployment";

/** @deprecated Prefer seat-limits; kept for tests/compat. */
export const FUTURE_PREMIUM_SEAT_MIN = 2;
/** @deprecated Prefer seat-limits; kept for tests/compat. */
export const FUTURE_PREMIUM_SEAT_MAX = 10;

export { SEAT_LIMIT_REACHED_MESSAGE };

export function isCompedPlanCode(planCode: string | null | undefined): boolean {
  return planCode === BILLING_PLAN_COMPED || planCode === "FREE";
}

export function individualOrgAdminInviteBlockMessage(): string {
  const support = getBrandDeployment().supportEmail;
  return (
    "Individual Standard accounts are limited to one user. " +
    "Choose Team on subscribe, or upgrade from organization settings. " +
    `Contact ${support} if you need a team workspace now.`
  );
}

/**
 * Whether org OWNER/ADMIN may create invitations when seat capacity remains.
 * Platform invites use a separate path and are not gated here.
 */
export function orgAdminInvitesAllowed(input: {
  accountType: "INDIVIDUAL" | "ENTERPRISE" | string;
  planCode: string | null | undefined;
  seatQuantity?: number;
  maxSeats?: number;
  usedSeats?: number;
}): boolean {
  return orgAdminInviteDenialReason(input) == null;
}

/** Null when invites are allowed; otherwise the user-facing denial message. */
export function orgAdminInviteDenialReason(input: {
  accountType: "INDIVIDUAL" | "ENTERPRISE" | string;
  planCode: string | null | undefined;
  seatQuantity?: number;
  maxSeats?: number;
  usedSeats?: number;
}): string | null {
  const code = isCompedPlanCode(input.planCode)
    ? input.accountType === "ENTERPRISE"
      ? BILLING_PLAN_ENTERPRISE
      : BILLING_PLAN_STANDARD
    : canonicalPlanCode(input.planCode ?? BILLING_PLAN_STANDARD);

  if (planUsesSeatBilling(code) || input.accountType === "ENTERPRISE") {
    const seatQuantity = input.seatQuantity ?? 1;
    const maxSeats = input.maxSeats ?? seatQuantity;
    const usedSeats = input.usedSeats ?? 0;
    const snap = buildSeatSnapshot({
      planCode: code,
      seatQuantity,
      maxSeats,
      usedSeats,
    });
    return snap.inviteDenialReason;
  }

  // INDIVIDUAL Standard (and other non-seat plans): one seat.
  if (code === BILLING_PLAN_STANDARD || code === BILLING_PLAN_TEAM) {
    // TEAM already handled above via planUsesSeatBilling.
  }
  return individualOrgAdminInviteBlockMessage();
}
