"use server";

import { revalidatePath } from "next/cache";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import { upsertAiModelRate } from "@/lib/platform/model-rates";
import { recordSpendReconciliation } from "@/lib/platform/cost";

export type PlatformCostActionResult = { ok: boolean; message: string };

function toSafeError(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to complete platform action. Please try again.";
    }
    return error.message;
  }
  return "Unable to complete platform action. Please try again.";
}

function requirePositiveMoney(
  value: FormDataEntryValue | null,
  label: string,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return n;
}

export async function upsertAiModelRateAction(
  _prev: PlatformCostActionResult | null,
  formData: FormData,
): Promise<PlatformCostActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const provider = String(formData.get("provider") || "").trim();
    const model = String(formData.get("model") || "").trim();
    const effectiveFromRaw = String(formData.get("effectiveFrom") || "").trim();
    const effectiveFrom = effectiveFromRaw
      ? new Date(effectiveFromRaw)
      : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new Error("Effective from must be a valid date.");
    }
    const note = String(formData.get("note") || "").trim() || null;

    await upsertAiModelRate({
      actorUserId: user.id,
      provider,
      model,
      inputPer1MUsd: requirePositiveMoney(
        formData.get("inputPer1MUsd"),
        "Input rate",
      ),
      cachedInputPer1MUsd: requirePositiveMoney(
        formData.get("cachedInputPer1MUsd"),
        "Cached input rate",
      ),
      cacheWritePer1MUsd: requirePositiveMoney(
        formData.get("cacheWritePer1MUsd"),
        "Cache write rate",
      ),
      outputPer1MUsd: requirePositiveMoney(
        formData.get("outputPer1MUsd"),
        "Output rate",
      ),
      webSearchPerCallUsd: requirePositiveMoney(
        formData.get("webSearchPerCallUsd"),
        "Web search rate",
      ),
      effectiveFrom,
      note,
    });
    revalidatePath("/platform/costs");
    revalidatePath("/platform");
    return { ok: true, message: "Model rate version saved." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function recordSpendReconciliationAction(
  _prev: PlatformCostActionResult | null,
  formData: FormData,
): Promise<PlatformCostActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const provider = String(formData.get("provider") || "ALL").trim() || "ALL";
    const periodStart = new Date(
      String(formData.get("periodStart") || "").trim(),
    );
    const periodEnd = new Date(String(formData.get("periodEnd") || "").trim());
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new Error("Period start and end must be valid dates.");
    }
    const notes = String(formData.get("notes") || "").trim() || null;

    const result = await recordSpendReconciliation({
      actorUserId: user.id,
      provider,
      periodStart,
      periodEnd,
      providerReportedUsd: requirePositiveMoney(
        formData.get("providerReportedUsd"),
        "Provider reported USD",
      ),
      notes,
    });
    revalidatePath("/platform/costs");
    revalidatePath("/platform");
    const drift =
      result.driftPercent != null
        ? ` Drift ${result.driftPercent.toFixed(1)}%.`
        : "";
    return {
      ok: true,
      message: `Reconciliation recorded. Estimated $${result.estimatedUsd.toFixed(2)}.${drift}`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}
