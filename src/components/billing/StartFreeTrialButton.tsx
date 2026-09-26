"use client";

import { AppButton } from "@/components/AppButton";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

/**
 * Onboarding CTA → Stripe Checkout (same /api/billing/checkout as settings).
 * Copy follows BILLING_TRIAL_PERIOD_DAYS (passed from the server) so we never
 * promise a trial when the env has trials disabled.
 */
export function StartFreeTrialButton({
  disabledReason,
  trialPeriodDays = 7,
  planCode = BILLING_PLAN_STANDARD,
  seatQuantity = 1,
  buttonLabel,
}: {
  disabledReason?: string | null;
  /** Effective trial days (platform → env); null = trial off for NEW checkouts. */
  trialPeriodDays?: number | null;
  planCode?: string;
  seatQuantity?: number;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trialOff = trialPeriodDays == null;

  if (disabledReason) {
    return (
      <p className="text-sm text-muted" data-testid="onboarding-subscribe-cta">
        {disabledReason}
      </p>
    );
  }

  const label =
    buttonLabel ??
    (trialOff
      ? "Subscribe to Standard"
      : "Click Here To Start Your Free Trial");

  return (
    <div className="space-y-2" data-testid="onboarding-subscribe-cta">
      <AppButton
        type="button"
        disabled={pending}
        className="w-full rounded-md bg-success px-4 py-3 text-sm font-medium text-on-ink disabled:opacity-60"
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
        {pending ? "Redirecting…" : label}
      </AppButton>
      <p className="text-center text-base font-bold text-ink">
        {trialOff
          ? "You\u2019ll be charged when Checkout completes."
          : "You won\u2019t be charged until your trial period ends."}
      </p>
      {error ? (
        <p className="text-center text-sm text-danger">{error}</p>
      ) : null}
    </div>
  );
}
