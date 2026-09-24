"use server";

import { redirect } from "next/navigation";
import {
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import { buildPendingSignupIntent } from "@/lib/billing/pending-signup-intent";
import {
  mergePendingSignupIntent,
  writePendingSignupIntent,
} from "@/lib/billing/pending-signup-intent-cookie";
import {
  clampSeatQuantity,
  defaultMaxSeatsForPlan,
  defaultSeatQuantityForPlan,
} from "@/lib/org/seat-limits";

export type PendingSignupActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export async function setPendingSignupPlanAction(
  _prev: PendingSignupActionResult | null,
  formData: FormData,
): Promise<PendingSignupActionResult> {
  const planCode = String(formData.get("planCode") || "").trim();
  if (planCode !== BILLING_PLAN_STANDARD && planCode !== BILLING_PLAN_TEAM) {
    return { ok: false, message: "Choose Standard or Team to continue." };
  }

  const maxSeats = defaultMaxSeatsForPlan(planCode);
  const seatsRaw = String(formData.get("seatQuantity") || "").trim();
  const parsedSeats = Number.parseInt(seatsRaw, 10);
  const seatQuantity =
    planCode === BILLING_PLAN_TEAM
      ? clampSeatQuantity({
          planCode,
          quantity: Number.isFinite(parsedSeats)
            ? parsedSeats
            : defaultSeatQuantityForPlan(planCode),
          maxSeats,
        })
      : 1;

  const intent = buildPendingSignupIntent({ planCode, seatQuantity });
  if (!intent) {
    return { ok: false, message: "Could not save plan selection." };
  }
  await writePendingSignupIntent(intent);
  redirect("/signup");
}

export async function prepareSignupCompanyAction(
  input: { companyName?: string } = {},
): Promise<PendingSignupActionResult> {
  const companyName = input.companyName?.trim() ?? "";
  if (companyName && companyName.length < 2) {
    return {
      ok: false,
      message: "Workspace name must be at least 2 characters.",
    };
  }
  if (companyName.length > 120) {
    return { ok: false, message: "Workspace name is too long." };
  }

  const merged = await mergePendingSignupIntent(
    companyName ? { companyName } : {},
  );
  if (!merged) {
    await writePendingSignupIntent(
      buildPendingSignupIntent({
        planCode: BILLING_PLAN_STANDARD,
        seatQuantity: 1,
        ...(companyName ? { companyName } : {}),
      })!,
    );
  }
  return { ok: true };
}
