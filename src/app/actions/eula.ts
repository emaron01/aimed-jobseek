"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { requiresStripeCheckout } from "@/lib/billing/billing-state";
import { ONBOARDING_SUBSCRIBE_PATH } from "@/lib/billing/paths";
import {
  clientIpFromHeaders,
  clientUserAgentFromHeaders,
  getPublishedEulaVersion,
  recordEulaAcceptance,
  userHasAcceptedEulaVersion,
} from "@/lib/legal/eula";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export type AcceptEulaActionResult = {
  ok: boolean;
  message: string;
};

async function resolvePostEulaDestination(): Promise<string> {
  const organization = await getCurrentOrganization();
  if (organization) {
    const { getOrganizationPaymentLockState } = await import(
      "@/lib/billing/payment-lock"
    );
    const lock = await getOrganizationPaymentLockState(organization.id);
    if (lock.locked) {
      return "/settings/billing";
    }

    const billing = await prisma.organizationBillingProfile.findUnique({
      where: { organizationId: organization.id },
      select: {
        planCode: true,
        billingStatus: true,
        stripeSubscriptionId: true,
      },
    });
    if (billing && requiresStripeCheckout(billing)) {
      return ONBOARDING_SUBSCRIBE_PATH;
    }
    return "/";
  }

  const user = await requireCurrentUser();
  if (user.platformRole === "SUPER_ADMIN") {
    return "/settings/account";
  }
  return "/no-workspace";
}

export async function acceptEulaAction(
  _prev: AcceptEulaActionResult | null,
  formData: FormData,
): Promise<AcceptEulaActionResult> {
  const user = await requireCurrentUser();
  const agreed = String(formData.get("agreed") || "").trim();
  if (agreed !== "1" && agreed.toLowerCase() !== "on") {
    return {
      ok: false,
      message: "Please confirm you have read and agree to the terms.",
    };
  }

  const version = await getPublishedEulaVersion();
  if (!version) {
    return {
      ok: false,
      message: "No published terms are available. Please try again later.",
    };
  }

  const already = await userHasAcceptedEulaVersion(user.id, version.id);
  if (!already) {
    const h = await headers();
    await recordEulaAcceptance({
      userId: user.id,
      eulaVersionId: version.id,
      ipAddress: clientIpFromHeaders(h),
      userAgent: clientUserAgentFromHeaders(h),
    });
  }

  redirect(await resolvePostEulaDestination());
}
