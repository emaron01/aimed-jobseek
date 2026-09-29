"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  requireCurrentUser,
  setActiveOrganization,
} from "@/lib/auth/session";
import { billingPlanLabel, formatBillingDate } from "@/lib/billing/billing-state";
import { createBillingPortalSession } from "@/lib/billing/create-portal-session";
import { scheduleSubscriptionCancelAtPeriodEnd } from "@/lib/billing/schedule-cancel-at-period-end";
import { listOwnedBilledOrganizationsAsideFrom } from "@/lib/org/workspaces";
import { prisma } from "@/lib/prisma";

export type WorkspaceActionResult = { ok: boolean; message: string };

const DISMISS_COOKIE = "personal_billing_notice_dismiss";
const DISMISS_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/**
 * Switch active workspace. Full navigation reload clears the RSC tree for the
 * previous org — this app does not keep a client org-scoped data cache.
 */
export async function switchActiveOrganizationAction(
  formData: FormData,
): Promise<never> {
  const organizationId = String(formData.get("organizationId") || "").trim();
  if (!organizationId) {
    throw new Error("Organization is required.");
  }
  const user = await requireCurrentUser();
  await setActiveOrganization({
    userId: user.id,
    organizationId,
  });
  revalidatePath("/", "layout");
  redirect("/");
}

export async function dismissPersonalBillingNoticeAction(
  formData: FormData,
): Promise<WorkspaceActionResult> {
  const organizationId = String(formData.get("organizationId") || "").trim();
  if (!organizationId) {
    return { ok: false, message: "Organization is required." };
  }
  const user = await requireCurrentUser();
  const owned = await listOwnedBilledOrganizationsAsideFrom({
    userId: user.id,
    excludeOrganizationId: user.activeOrganizationId,
  });
  if (!owned.some((o) => o.organizationId === organizationId)) {
    return { ok: false, message: "Nothing to dismiss." };
  }
  const jar = await cookies();
  const existing = jar.get(DISMISS_COOKIE)?.value ?? "";
  const ids = new Set(
    existing
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  ids.add(organizationId);
  jar.set(DISMISS_COOKIE, [...ids].join(","), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DISMISS_MAX_AGE_SEC,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Reminder dismissed for now." };
}

/**
 * Open Stripe Customer Portal for an org the user OWNs (may not be active).
 */
export async function openOwnedOrgBillingPortalAction(
  formData: FormData,
): Promise<never> {
  const organizationId = String(formData.get("organizationId") || "").trim();
  if (!organizationId) {
    throw new Error("Organization is required.");
  }
  const user = await requireCurrentUser();
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: user.id,
      },
    },
    select: { role: true },
  });
  if (membership?.role !== "OWNER") {
    throw new Error("Only the owner can manage that workspace billing.");
  }
  const result = await createBillingPortalSession({ organizationId });
  if (!result.ok) {
    throw new Error(result.error);
  }
  redirect(result.url);
}

/**
 * Schedule cancel-at-period-end on an owned personal org (B3).
 * Seeker keeps full access until currentPeriodEnd; immediate cancel is wipe/Comped only.
 */
export async function cancelOwnedOrgSubscriptionAction(
  _prev: WorkspaceActionResult | null,
  formData: FormData,
): Promise<WorkspaceActionResult> {
  const organizationId = String(formData.get("organizationId") || "").trim();
  const confirm = String(formData.get("confirm") || "").trim();
  if (confirm !== "CANCEL") {
    return {
      ok: false,
      message: "Type CANCEL to confirm canceling this subscription.",
    };
  }
  if (!organizationId) {
    return { ok: false, message: "Organization is required." };
  }

  const user = await requireCurrentUser();
  const owned = await listOwnedBilledOrganizationsAsideFrom({
    userId: user.id,
    excludeOrganizationId: null,
  });
  const target = owned.find((o) => o.organizationId === organizationId);
  if (!target) {
    return {
      ok: false,
      message: "No active subscription found on that workspace.",
    };
  }
  if (!target.stripeSubscriptionId) {
    return {
      ok: false,
      message: "No active subscription found on that workspace.",
    };
  }

  try {
    const scheduled = await scheduleSubscriptionCancelAtPeriodEnd({
      organizationId: target.organizationId,
      stripeSubscriptionId: target.stripeSubscriptionId,
    });
    const endLabel = scheduled.currentPeriodEnd
      ? formatBillingDate(scheduled.currentPeriodEnd)
      : "the end of your billing period";
    revalidatePath("/", "layout");
    revalidatePath("/settings/billing");
    return {
      ok: true,
      message: `${billingPlanLabel(target.planCode)} for "${target.name}" will end on ${endLabel}. You'll keep full access until then.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not schedule subscription cancellation.",
    };
  }
}

export async function readDismissedPersonalBillingOrgIds(): Promise<
  Set<string>
> {
  const jar = await cookies();
  const raw = jar.get(DISMISS_COOKIE)?.value ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
