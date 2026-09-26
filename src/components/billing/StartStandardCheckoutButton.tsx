"use client";
import { AppButton } from "@/components/ui";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import { vocab } from "@/lib/product-config";
import { cn } from "@/lib/utils";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Starts plan Checkout (allow_promotion_codes enabled server-side).
 */
export function StartStandardCheckoutButton({
  disabledReason,
  buttonLabel = "Start Standard trial",
  trialPeriodDays = 7,
  planCode = BILLING_PLAN_STANDARD,
  seatQuantity = 1,
}: {
  disabledReason?: string | null;
  buttonLabel?: string;
  /**
   * From BILLING_TRIAL_PERIOD_DAYS (server). `null` = trial off.
   * Display only — Checkout reads the env server-side.
   */
  trialPeriodDays?: number | null;
  planCode?: string;
  seatQuantity?: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabledReason) {
    return (
      <p className="text-sm text-muted" data-testid="billing-stripe-hook">
        {disabledReason}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="billing-stripe-hook">
      <AppButton
        type="button"
        disabled={pending}
        className={cn("!px-3")}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ planCode, seatQuantity }),
              });
              const body = (await res.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
                code?: string;
              };
              if (!res.ok || !body.url) {
                setError(body.error ?? "Could not start Checkout");
                // Stale RSC often shows Free while DB already has a sub — refresh.
                if (body.code === "ALREADY_SUBSCRIBED" || res.status === 409) {
                  router.refresh();
                }
                return;
              }
              window.location.assign(body.url);
            } catch {
              setError("Could not start Checkout");
            }
          });
        }}
      >
        {pending ? "Redirecting…" : buttonLabel}
      </AppButton>
      <p className="text-xs text-subtle">
        {trialPeriodDays == null
          ? "Card required. Billing starts when Checkout completes (no free trial). You can enter a promotion code on the Stripe Checkout page. Card details stay in Stripe."
          : `Card required for a ${trialPeriodDays}-day trial (full ${vocab.product.singular} access, 25 companies). You can enter a promotion code on the Stripe Checkout page. Card details stay in Stripe.`}
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
