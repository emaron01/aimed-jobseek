import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/authz";
import { OrganizationReadOnlyError } from "@/lib/billing/account-read-only";
import {
  PaymentLockError,
  assertOrganizationNotPaymentLocked,
} from "@/lib/billing/payment-lock";
import { ensureOrganizationReferralCode } from "@/lib/billing/referrals";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

/**
 * POST /api/billing/referral-code — lazy-create org referral promo code.
 * Any signed-in member of the active workspace may open/share the code.
 * Does not run on page load — only when the client explicitly POSTs.
 */
export async function POST() {
  try {
    await requireCurrentUser();
    const organization = await getCurrentOrganization();
    if (!organization) {
      return NextResponse.json(
        { error: "No active workspace.", code: "NO_ORGANIZATION" },
        { status: 400 },
      );
    }
    await assertOrganizationNotPaymentLocked(organization.id);
    const result = await ensureOrganizationReferralCode({
      organizationId: organization.id,
    });
    if (!result.ok) {
      const status =
        result.code === "STRIPE_NOT_CONFIGURED"
          ? 503
          : result.code === "NOT_FOUND"
            ? 404
            : 400;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      code: result.code,
      successfulReferralCount: result.successfulReferralCount,
      rewardPercent: result.rewardPercent,
    });
  } catch (error) {
    if (
      error instanceof PaymentLockError ||
      error instanceof OrganizationReadOnlyError
    ) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Referral code unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
