/**
 * Lazy referral promo codes + ACTIVE reward advancement.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type Stripe from "stripe";
import {
  asReferralRewardPercent,
  referralRefereeCouponId,
  referralRewardCouponId,
  rewardPercentForCount,
  type ReferralRewardPercent,
} from "@/lib/billing/referral-coupons";
import {
  loadOrgReferralIdentity,
  selfReferralBlockReason,
} from "@/lib/billing/referral-identity";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { planAllowsReferrals } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

function readableReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(4);
  let suffix = "";
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }
  return `JOIN-${suffix}`;
}

export async function ensureOrganizationReferralCode(input: {
  organizationId: string;
}): Promise<
  | {
      ok: true;
      code: string;
      successfulReferralCount: number;
      rewardPercent: number;
    }
  | { ok: false; error: string; code: string }
> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      billingProfile: { select: { planCode: true } },
    },
  });
  if (!org) {
    return { ok: false, error: "Organization not found.", code: "NOT_FOUND" };
  }

  if (!planAllowsReferrals(org.billingProfile?.planCode)) {
    return {
      ok: false,
      error: "Referrals are available to Standard and comped workspaces.",
      code: "PLAN_NOT_ELIGIBLE",
    };
  }

  const existing = await prisma.organizationReferralCode.findUnique({
    where: { organizationId: input.organizationId },
  });
  const reward = await prisma.organizationReferralReward.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId },
    update: {},
  });

  if (existing) {
    return {
      ok: true,
      code: existing.code,
      successfulReferralCount: reward.successfulReferralCount,
      rewardPercent: reward.rewardPercent,
    };
  }

  const stripe = getStripe();
  const couponId = referralRefereeCouponId();
  let code = readableReferralCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const collision = await prisma.organizationReferralCode.findUnique({
      where: { code },
    });
    if (!collision) break;
    code = readableReferralCode();
  }

  let promo: Stripe.PromotionCode;
  try {
    promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: couponId },
      code,
      active: true,
      metadata: {
        organizationId: input.organizationId,
        purpose: "referral",
      },
    });
  } catch (error) {
    console.error("Failed to create referral promotion code.", error);
    return {
      ok: false,
      error:
        "Could not create a referral promotion code. Confirm referral coupons exist in Stripe.",
      code: "PROMO_CREATE_FAILED",
    };
  }

  try {
    const created = await prisma.organizationReferralCode.create({
      data: {
        organizationId: input.organizationId,
        code,
        stripePromotionCodeId: promo.id,
      },
    });
    return {
      ok: true,
      code: created.code,
      successfulReferralCount: reward.successfulReferralCount,
      rewardPercent: reward.rewardPercent,
    };
  } catch (error) {
    const codeName =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    if (codeName === "P2002") {
      const raced = await prisma.organizationReferralCode.findUniqueOrThrow({
        where: { organizationId: input.organizationId },
      });
      return {
        ok: true,
        code: raced.code,
        successfulReferralCount: reward.successfulReferralCount,
        rewardPercent: reward.rewardPercent,
      };
    }
    throw error;
  }
}

function promotionCodeIdsFromCheckoutSession(
  session: Stripe.Checkout.Session,
): string[] {
  const ids: string[] = [];
  for (const entry of session.discounts ?? []) {
    const raw = entry.promotion_code;
    if (typeof raw === "string" && raw.startsWith("promo_")) {
      ids.push(raw);
    } else if (raw && typeof raw === "object" && "id" in raw) {
      ids.push(raw.id);
    }
  }
  return ids;
}

async function resolveCheckoutPromotionCodeIds(
  session: Stripe.Checkout.Session,
): Promise<string[]> {
  const immediate = promotionCodeIdsFromCheckoutSession(session);
  if (immediate.length > 0 || !session.id) return immediate;
  if (!stripeConfigured()) return [];
  const stripe = getStripe();
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["discounts.promotion_code"],
  });
  return promotionCodeIdsFromCheckoutSession(full);
}

function checkoutEmailNormalized(
  session: Stripe.Checkout.Session,
): string | null {
  const raw =
    session.customer_details?.email?.trim() ||
    session.customer_email?.trim() ||
    null;
  return raw ? raw.toLowerCase() : null;
}

/**
 * Attribute a referral when Checkout completes with a referral promo code.
 * Does not advance the referrer rate (ACTIVE only).
 */
export async function attributeReferralFromCheckoutSession(input: {
  session: Stripe.Checkout.Session;
  refereeOrganizationId: string;
  subscriptionId: string;
}): Promise<{ attributed: boolean; reason?: string }> {
  const promoIds = await resolveCheckoutPromotionCodeIds(input.session);
  if (promoIds.length === 0) {
    return { attributed: false, reason: "no_promotion_code" };
  }

  const referralCode = await prisma.organizationReferralCode.findFirst({
    where: { stripePromotionCodeId: { in: promoIds } },
  });
  if (!referralCode) {
    return { attributed: false, reason: "not_a_referral_code" };
  }

  const existingSub = await prisma.referralRedemption.findUnique({
    where: { stripeSubscriptionId: input.subscriptionId },
  });
  if (existingSub) {
    return { attributed: false, reason: "subscription_already_attributed" };
  }

  const existingOrg = await prisma.referralRedemption.findUnique({
    where: { refereeOrganizationId: input.refereeOrganizationId },
  });
  if (existingOrg) {
    return { attributed: false, reason: "referee_org_already_attributed" };
  }

  const [referrer, referee] = await Promise.all([
    loadOrgReferralIdentity(referralCode.organizationId),
    loadOrgReferralIdentity(input.refereeOrganizationId),
  ]);
  const block = selfReferralBlockReason({
    referrer,
    referee,
    checkoutEmailNormalized: checkoutEmailNormalized(input.session),
  });
  if (block) {
    console.warn(`[referral] ${block}`, {
      referrerOrganizationId: referralCode.organizationId,
      refereeOrganizationId: input.refereeOrganizationId,
    });
    return { attributed: false, reason: "self_referral" };
  }

  const refereeEmail =
    referee.ownerEmailNormalized ||
    referee.billingEmailNormalized ||
    checkoutEmailNormalized(input.session);
  const referrerEmail =
    referrer.ownerEmailNormalized || referrer.billingEmailNormalized;
  if (!refereeEmail || !referrerEmail) {
    return { attributed: false, reason: "missing_email_identity" };
  }

  try {
    await prisma.referralRedemption.create({
      data: {
        referrerOrganizationId: referralCode.organizationId,
        refereeOrganizationId: input.refereeOrganizationId,
        stripePromotionCodeId: referralCode.stripePromotionCodeId,
        stripeSubscriptionId: input.subscriptionId,
        refereeEmailNormalized: refereeEmail,
        referrerEmailNormalized: referrerEmail,
        status: "ATTRIBUTED",
      },
    });
    return { attributed: true };
  } catch (error) {
    const codeName =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    if (codeName === "P2002") {
      return { attributed: false, reason: "unique_conflict" };
    }
    throw error;
  }
}

async function applyReferrerRewardCoupon(input: {
  organizationId: string;
  percent: ReferralRewardPercent;
}): Promise<void> {
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: { stripeSubscriptionId: true },
  });
  if (!profile?.stripeSubscriptionId) return;

  const stripe = getStripe();
  const coupon = referralRewardCouponId(input.percent);
  await stripe.subscriptions.update(profile.stripeSubscriptionId, {
    discounts: [{ coupon }],
  });
}

/**
 * When a referee subscription becomes ACTIVE, count once and advance referrer.
 * Idempotent on stripeSubscriptionId (and refereeOrganizationId uniqueness).
 */
export async function countReferralIfActive(input: {
  refereeOrganizationId: string;
  subscriptionId: string;
  billingStatus: string;
}): Promise<{ counted: boolean; reason?: string }> {
  if (input.billingStatus !== "ACTIVE") {
    return { counted: false, reason: "not_active" };
  }

  const redemption = await prisma.referralRedemption.findUnique({
    where: { stripeSubscriptionId: input.subscriptionId },
  });
  if (!redemption) {
    return { counted: false, reason: "no_attribution" };
  }
  if (redemption.refereeOrganizationId !== input.refereeOrganizationId) {
    return { counted: false, reason: "org_mismatch" };
  }
  if (redemption.status === "COUNTED" || redemption.countedAt != null) {
    return { counted: false, reason: "already_counted" };
  }

  // Email re-signup farm: if this email already credited this referrer, skip.
  const priorEmailCredit = await prisma.referralRedemption.findFirst({
    where: {
      referrerOrganizationId: redemption.referrerOrganizationId,
      refereeEmailNormalized: redemption.refereeEmailNormalized,
      status: "COUNTED",
      id: { not: redemption.id },
    },
    select: { id: true },
  });
  if (priorEmailCredit) {
    await prisma.referralRedemption.update({
      where: { id: redemption.id },
      data: {
        status: "COUNTED",
        countedAt: new Date(),
      },
    });
    return { counted: false, reason: "email_already_counted" };
  }

  const advanced = await prisma.$transaction(async (tx) => {
    const claimed = await tx.referralRedemption.updateMany({
      where: {
        id: redemption.id,
        status: "ATTRIBUTED",
        countedAt: null,
      },
      data: {
        status: "COUNTED",
        countedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return null;
    }

    const existingReward = await tx.organizationReferralReward.findUnique({
      where: { organizationId: redemption.referrerOrganizationId },
    });
    const previousPercent = existingReward?.rewardPercent ?? 0;

    const fresh = await tx.organizationReferralReward.upsert({
      where: { organizationId: redemption.referrerOrganizationId },
      create: {
        organizationId: redemption.referrerOrganizationId,
        successfulReferralCount: 1,
        rewardPercent: 10,
      },
      update: {
        successfulReferralCount: { increment: 1 },
      },
    });
    const nextPercent = rewardPercentForCount(fresh.successfulReferralCount);
    await tx.organizationReferralReward.update({
      where: { organizationId: redemption.referrerOrganizationId },
      data: { rewardPercent: nextPercent },
    });

    return {
      referrerOrganizationId: redemption.referrerOrganizationId,
      previousPercent,
      nextPercent,
      count: fresh.successfulReferralCount,
    };
  });

  if (!advanced) {
    return { counted: false, reason: "claim_lost_race" };
  }

  const next = asReferralRewardPercent(advanced.nextPercent);
  if (next && advanced.nextPercent !== advanced.previousPercent) {
    try {
      await applyReferrerRewardCoupon({
        organizationId: advanced.referrerOrganizationId,
        percent: next,
      });
    } catch (error) {
      console.error("Failed to apply referrer reward coupon.", error);
    }
  }

  return { counted: true };
}

/** Deterministic fingerprint for tests (no Stripe). */
export function referralCodeFingerprint(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 12);
}
