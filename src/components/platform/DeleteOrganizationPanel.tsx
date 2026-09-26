"use client";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useActionState, useId, useState } from "react";
import { deleteOrganizationAction } from "@/app/actions/platform-orgs";
import type { PlatformOrgActionResult } from "@/app/actions/platform-orgs";

const CONFIRM_PHRASE = "Delete";

/**
 * SUPER_ADMIN-only hard delete of the organization currently viewed in
 * /platform/orgs/[id]. Requires typing "Delete" exactly before submit.
 */
export function DeleteOrganizationPanel({
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
  >(deleteOrganizationAction, null);
  const titleId = useId();
  const inputId = useId();
  const matches = confirmation === CONFIRM_PHRASE;

  if (!open && confirmation) {
    setConfirmation("");
  }

  return (
    <div
      className="max-w-md space-y-3 rounded-md border border-danger bg-danger-tint/60 p-4"
      data-testid="platform-delete-organization"
    >
      <div>
        <h3 className="text-sm font-medium text-ink">
          Delete organization
        </h3>
        <p className="mt-1 text-sm text-muted">
          Permanently remove{" "}
          <span className="font-medium text-ink">{organizationName}</span>{" "}
          and all associated data. Any linked Stripe subscription is canceled
          first (already-canceled subscriptions are fine). This cannot be
          undone.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-danger bg-surface px-3 py-2 text-sm font-medium text-danger hover:bg-danger-tint"
          data-testid="platform-delete-organization-open"
        >
          Delete Organization
        </button>
      ) : (
        <div
          className="space-y-3 rounded-md border border-danger bg-surface p-3"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="platform-delete-organization-modal"
        >
          <p id={titleId} className="text-sm font-semibold text-ink">
            Confirm permanent deletion
          </p>
          <p className="text-sm text-ink">
            This will cancel any Stripe subscription for this organization,
            then permanently delete the organization and all associated data.
            Already-canceled Stripe subscriptions are skipped. If Stripe is not
            configured and a subscription is still linked, delete is refused.
            This cannot be undone.
          </p>
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <label htmlFor={inputId} className="block text-sm text-ink">
              Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span>{" "}
              to confirm
              <input
                id={inputId}
                name="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-sm"
                data-testid="platform-delete-organization-confirm-input"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!matches || pending}
                className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-on-ink disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="platform-delete-organization-submit"
              >
                {pending ? "Deleting…" : "Permanently Delete"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
                data-testid="platform-delete-organization-cancel"
              >
                Cancel
              </button>
            </div>
          </form>
          {state && !state.ok ? (
            <p
              className="text-sm text-danger"
              role="alert"
              data-testid="platform-delete-organization-error"
            >
              {state.message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
