"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useState, useTransition } from "react";

/**
 * Opens one-time Stripe Checkout for company research credit blocks.
 * POST /api/billing/credits-checkout — quantity adjustable on the Stripe page.
 */
export function BuyCompanyCreditsButton({
  disabledReason,
}: {
  disabledReason?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabledReason) {
    return (
      <p className="text-sm text-muted" data-testid="buy-company-credits">
        {disabledReason}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="buy-company-credits">
      <AppButton
        type="button"
        disabled={pending}
        className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/billing/credits-checkout", {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ blocks: 1 }),
              });
              const body = (await res.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
              };
              if (!res.ok || !body.url) {
                setError(body.error ?? "Could not start credits Checkout");
                return;
              }
              window.location.assign(body.url);
            } catch {
              setError("Could not start credits Checkout");
            }
          });
        }}
      >
        {pending ? "Redirecting…" : "Buy company credits"}
      </AppButton>
      <p className="text-xs text-subtle">
        Each block adds 100 companies for 12 months. On Checkout you can raise
        the quantity (e.g. 3 blocks = 300 companies) before paying.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
