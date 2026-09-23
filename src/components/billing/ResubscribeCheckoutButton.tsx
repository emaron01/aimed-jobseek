"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import { vocab } from "@/lib/product-config";

/**
 * Locked / canceled org → Stripe Checkout to start a new subscription.
 */
export function ResubscribeCheckoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2" data-testid="billing-resubscribe-cta">
      <button
        type="button"
        disabled={pending}
        className={cn(PRIMARY_BUTTON_CLASS, "!px-4 !py-2.5")}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { Accept: "application/json" },
              });
              const body = (await res.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
              };
              if (!res.ok || !body.url) {
                setError(body.error ?? "Could not start Checkout");
                if (res.status === 409) router.refresh();
                return;
              }
              window.location.assign(body.url);
            } catch {
              setError("Could not start Checkout");
            }
          });
        }}
      >
        {pending ? "Redirecting…" : "Resubscribe"}
      </button>
      <p className="text-xs text-slate-500">
        Opens Stripe Checkout. Within 30 days of cancel you keep {vocab.contact.plural},
        {vocab.campaign.plural}, and your opt-out list; after that only your setup remains.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
