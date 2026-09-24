"use client";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useActionState, useId, useState } from "react";
import { convertOrganizationToCompedAction } from "@/app/actions/platform-orgs";
import type { PlatformOrgActionResult } from "@/app/actions/platform-orgs";

const CONFIRM_PHRASE = "COMPED";

/**
 * SUPER_ADMIN: cancel Stripe subscription (if any), set COMPED + FREE, apply
 * limits. Refuses to leave a live subscription behind.
 */
export function ConvertOrganizationToCompedPanel({
  organizationId,
  organizationName,
  defaultCompanyLimit,
  defaultDailySendWarning,
  defaultMonthlyEmailLimit,
}: {
  organizationId: string;
  organizationName: string;
  defaultCompanyLimit: number;
  defaultDailySendWarning: number;
  defaultMonthlyEmailLimit: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState<
    PlatformOrgActionResult | null,
    FormData
  >(convertOrganizationToCompedAction, null);
  const titleId = useId();
  const inputId = useId();
  const matches = confirmation === CONFIRM_PHRASE;

  if (!open && confirmation) {
    setConfirmation("");
  }

  return (
    <div
      className="max-w-md space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-4"
      data-testid="platform-convert-to-comped"
    >
      <div>
        <h3 className="text-sm font-medium text-slate-900">
          Convert to Comped
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Cancel any live Stripe subscription for{" "}
          <span className="font-medium text-slate-800">{organizationName}</span>,
          then set plan to COMPED with durable FREE status and the limits below.
          Conversion is refused if a live subscription would remain.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
          data-testid="platform-convert-to-comped-open"
        >
          Convert to Comped
        </button>
      ) : (
        <form
          action={formAction}
          className="space-y-3 rounded-md border border-amber-300 bg-white p-3"
          data-testid="platform-convert-to-comped-form"
        >
          <input type="hidden" name="organizationId" value={organizationId} />
          <p id={titleId} className="text-sm font-semibold text-slate-900">
            Confirm conversion to Comped
          </p>
          <label className="block text-sm">
            Active researched company limit
            <input
              name="activeResearchedCompanyLimit"
              type="number"
              min={0}
              required
              defaultValue={defaultCompanyLimit}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Daily send advisory
            <input
              name="dailyEmailSendWarningLimit"
              type="number"
              min={0}
              required
              defaultValue={defaultDailySendWarning}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Monthly email send limit (blank = none)
            <input
              name="monthlyEmailSendLimit"
              type="number"
              min={0}
              defaultValue={
                defaultMonthlyEmailLimit != null
                  ? String(defaultMonthlyEmailLimit)
                  : ""
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm" htmlFor={inputId}>
            Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span>{" "}
            to confirm
            <input
              id={inputId}
              name="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              data-testid="platform-convert-to-comped-confirm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!matches || pending}
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              data-testid="platform-convert-to-comped-submit"
            >
              {pending ? "Converting…" : "Cancel Stripe and convert"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
            >
              Cancel
            </button>
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-red-700">{state.message}</p>
          ) : null}
          {state?.ok ? (
            <p className="text-sm text-emerald-800">{state.message}</p>
          ) : null}
        </form>
      )}
    </div>
  );
}
