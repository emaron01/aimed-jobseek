"use client";
import { AppButton } from "@/components/ui";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * POST /api/billing/end-trial — Stripe trial_end: 'now'.
 * Webhook sync updates local status; capacity only increases when paid floors
 * are higher than trial (pass capacityIncreasesOnConvert).
 */
export function ConvertTrialNowButton({
  className,
  planLabel = "Standard",
  paidCompanyCapacityLabel = null,
  capacityIncreasesOnConvert = false,
}: {
  className?: string;
  /** Display name of the plan billing starts on (e.g. Team, Standard). */
  planLabel?: string;
  /** e.g. "300 companies" or "100 companies" — only when capacity increases. */
  paidCompanyCapacityLabel?: string | null;
  /**
   * True when paid company floors are higher than trial (Standard).
   * False for Team (150/seat trial and paid) — do not imply an unlock.
   */
  capacityIncreasesOnConvert?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (success) {
    return (
      <div className="space-y-1" data-testid="convert-trial-success">
        <p className="text-sm font-medium text-ink">{success}</p>
        <p className="text-xs text-muted">
          Refresh if billing status does not update within a minute.
        </p>
      </div>
    );
  }

  if (confirming) {
    return (
      <div
        className="space-y-2 rounded-md border border-warning bg-warning-tint px-3 py-3"
        data-testid="convert-trial-confirm"
      >
        <p className="text-sm font-medium text-warning">
          Convert to {planLabel} now?
        </p>
        <p className="text-sm text-warning">
          {capacityIncreasesOnConvert ? (
            <>
              This ends your trial immediately, charges your card today, and
              starts your {planLabel} billing cycle now
              {paidCompanyCapacityLabel
                ? ` with FULL ACCESS (${paidCompanyCapacityLabel})`
                : " with FULL ACCESS"}{" "}
              once Stripe confirms — usually a few seconds.
            </>
          ) : (
            <>
              This ends your trial immediately, charges your card today, and
              starts your {planLabel} billing cycle once Stripe confirms —
              usually a few seconds. Company research capacity does not change.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <AppButton
            type="button"
            disabled={pending}
            variant="primary"
            className={className}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const res = await fetch("/api/billing/end-trial", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                  });
                  const body = (await res.json().catch(() => ({}))) as {
                    message?: string;
                    error?: string;
                  };
                  if (!res.ok) {
                    setError(body.error ?? "Could not convert trial");
                    return;
                  }
                  setSuccess(
                    body.message ??
                      `Trial ended. ${planLabel} billing starts today.`,
                  );
                  setConfirming(false);
                  window.setTimeout(() => router.refresh(), 2_500);
                  window.setTimeout(() => router.refresh(), 8_000);
                } catch {
                  setError("Could not convert trial");
                }
              });
            }}
          >
            {pending ? "Converting…" : "Charge card and convert"}
          </AppButton>
          <AppButton
            type="button"
            disabled={pending}
            variant="secondary"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </AppButton>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <AppButton
        type="button"
        disabled={pending}
        data-testid="convert-trial-now"
        variant="primary"
        className={className}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Convert to {planLabel} now
      </AppButton>
      <p className="text-xs text-muted">
        {capacityIncreasesOnConvert
          ? `Charges your card today and starts the ${planLabel} billing cycle immediately${
              paidCompanyCapacityLabel ? ` (${paidCompanyCapacityLabel})` : ""
            }.`
          : `Ends the trial and starts ${planLabel} billing today. Research capacity stays the same.`}
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
