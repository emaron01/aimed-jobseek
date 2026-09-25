"use client";

import { useState } from "react";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

type SeatPreview = {
  direction: "add" | "remove";
  currentSeats: number;
  nextSeats: number;
  summaryLines: string[];
};

export function SeatManagementPanel({
  canManage,
  canAdd,
  canRemove,
  seatLabel,
  addDisabledReason,
  removeDisabledReason,
}: {
  canManage: boolean;
  canAdd: boolean;
  canRemove: boolean;
  seatLabel: string;
  addDisabledReason?: string | null;
  removeDisabledReason?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SeatPreview | null>(null);

  async function loadPreview(direction: "add" | "remove") {
    setPending(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(
        `/api/billing/seats?direction=${encodeURIComponent(direction)}`,
      );
      const data = (await res.json()) as {
        error?: string;
        preview?: SeatPreview;
      };
      if (!res.ok || !data.preview) {
        setError(data.error ?? "Unable to preview seat change.");
        return;
      }
      setPreview(data.preview);
    } catch {
      setError("Unable to preview seat change.");
    } finally {
      setPending(false);
    }
  }

  async function confirmChange() {
    if (!preview || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: preview.direction,
          confirm: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unable to update seats.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Unable to update seats.");
    } finally {
      setPending(false);
    }
  }

  if (!canManage) {
    return (
      <p className="text-sm text-slate-600">
        Only the organization owner can add or remove seats.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="billing-seat-management">
      <p className="text-sm text-slate-700">{seatLabel}</p>
      <div className="flex flex-wrap gap-2">
        <AppButton
          type="button"
          disabled={!canAdd || pending}
          title={!canAdd ? (addDisabledReason ?? undefined) : undefined}
          onClick={() => void loadPreview("add")}
          className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
        >
          {pending && preview?.direction !== "remove"
            ? "Loading…"
            : "Add a seat"}
        </AppButton>
        <AppButton
          type="button"
          disabled={!canRemove || pending}
          title={!canRemove ? (removeDisabledReason ?? undefined) : undefined}
          onClick={() => void loadPreview("remove")}
          className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
        >
          Remove a seat
        </AppButton>
      </div>
      {!canAdd && addDisabledReason ? (
        <p className="text-xs text-slate-500">{addDisabledReason}</p>
      ) : null}
      {!canRemove && removeDisabledReason ? (
        <p className="text-xs text-slate-500">{removeDisabledReason}</p>
      ) : null}

      {preview ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-semibold">
            Confirm {preview.direction === "add" ? "adding" : "removing"} a seat
            ({preview.currentSeats} → {preview.nextSeats})
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {preview.summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <AppButton
              type="button"
              disabled={pending}
              onClick={() => void confirmChange()}
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            >
              {pending ? "Updating…" : "Confirm seat change"}
            </AppButton>
            <AppButton
              type="button"
              disabled={pending}
              onClick={() => setPreview(null)}
              className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
            >
              Cancel
            </AppButton>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
