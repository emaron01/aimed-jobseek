"use client";
import { AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useState, useTransition } from "react";

/**
 * Opens Stripe Customer Portal (card update, cancel, invoices).
 * POST /api/billing/portal — return_url from APP_URL server-side.
 */
export function OpenCustomerPortalButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2" data-testid="billing-portal-hook">
      <AppButton
        type="button"
        disabled={pending}
        variant="secondary" className={cn("!px-3")}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/billing/portal", {
                method: "POST",
                headers: { Accept: "application/json" },
              });
              const body = (await res.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
              };
              if (!res.ok || !body.url) {
                setError(body.error ?? "Could not open billing portal");
                return;
              }
              window.location.assign(body.url);
            } catch {
              setError("Could not open billing portal");
            }
          });
        }}
      >
        {pending ? "Opening…" : "Manage billing"}
      </AppButton>
      <p className="text-xs text-subtle">
        Update your card, cancel, or view invoices in Stripe. You return here
        when finished.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
