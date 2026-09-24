"use client";

import { useActionState, useId, useState } from "react";
import { purgeContactOutboundDataAction } from "@/app/actions/platform-orgs";
import type { PlatformOrgActionResult } from "@/app/actions/platform-orgs";
import {
  CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE,
  contactOutboundPurgeConfirmSummary,
} from "@/lib/platform/purge-contact-outbound-shared";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import { vocab } from "@/lib/product-config";

/**
 * SUPER_ADMIN selective purge: contact + outbound data only.
 * Leaves products, personas, billing, and the account intact.
 */
export function PurgeContactOutboundPanel({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState<
    PlatformOrgActionResult | null,
    FormData
  >(purgeContactOutboundDataAction, null);
  const titleId = useId();
  const inputId = useId();
  const matches = confirmation === CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE;
  const summary = contactOutboundPurgeConfirmSummary();

  if (!open && confirmation) {
    setConfirmation("");
  }
  if (state?.ok && open) {
    setOpen(false);
  }

  return (
    <div
      className="max-w-md space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-4"
      data-testid="platform-purge-contact-outbound"
    >
      <div>
        <h3 className="text-sm font-medium text-slate-900">
          Delete {vocab.contact.singular} and {vocab.outreach.singular} data
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Honour the 30-day cancel retention for{" "}
          <span className="font-medium text-slate-800">{organizationName}</span>
          . Removes {vocab.contact.singular}, {vocab.campaign.singular}, and{" "}
          {vocab.outreach.singular} rows; keeps setup and billing.
        </p>
      </div>

      {state?.ok ? (
        <p
          className="text-sm text-emerald-800"
          role="status"
          data-testid="platform-purge-contact-outbound-success"
        >
          {state.message}
        </p>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-50"
          data-testid="platform-purge-contact-outbound-open"
        >
          Delete {vocab.contact.singular} and {vocab.outreach.singular} data
        </button>
      ) : (
        <div
          className="space-y-3 rounded-md border border-amber-400 bg-white p-3"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="platform-purge-contact-outbound-modal"
        >
          <p id={titleId} className="text-sm font-semibold text-slate-900">
            Confirm {vocab.contact.singular} / {vocab.outbound.singular} purge
          </p>
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Will be deleted</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {summary.deletes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="font-medium text-slate-900">Will be kept</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {summary.keeps.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-slate-600">This cannot be undone.</p>
          </div>
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <label htmlFor={inputId} className="block text-sm text-slate-700">
              Type{" "}
              <span className="font-mono font-semibold">
                {CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE}
              </span>{" "}
              to confirm
              <input
                id={inputId}
                name="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                data-testid="platform-purge-contact-outbound-confirm-input"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!matches || pending}
                className="rounded-md bg-amber-800 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="platform-purge-contact-outbound-submit"
              >
                {pending ? "Purging…" : `Purge ${vocab.contact.singular} data`}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
              >
                Cancel
              </button>
            </div>
          </form>
          {state && !state.ok ? (
            <p
              className="text-sm text-red-600"
              role="alert"
              data-testid="platform-purge-contact-outbound-error"
            >
              {state.message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
