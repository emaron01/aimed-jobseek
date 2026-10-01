"use client";

import { AppButton } from "@/components/AppButton";
import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { deleteMyAccountAction } from "@/app/actions/account";
import {
  DELETE_MY_ACCOUNT_BUTTON_LABEL,
  DELETE_MY_ACCOUNT_CONFIRM_BODY,
  DELETE_MY_ACCOUNT_CONFIRM_PHRASE,
  DELETE_MY_ACCOUNT_FAILURE_MESSAGE,
  DELETE_MY_ACCOUNT_MENU_LABEL,
} from "@/lib/account/delete-my-account";

/**
 * Self-serve account wipe (lifecycle B4). OWNER-only UI; server action re-checks.
 * Same confirmation copy/DELETE gate as originally shipped in the account menu.
 */
export function AccountSettingsDeleteSection({
  isOwner,
}: {
  isOwner: boolean;
}) {
  if (!isOwner) return null;
  return <DeleteMyAccountPanel />;
}

export function DeleteMyAccountPanel() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(
    deleteMyAccountAction,
    null,
  );
  const titleId = useId();
  const inputId = useId();
  const matches = confirmation === DELETE_MY_ACCOUNT_CONFIRM_PHRASE;

  if (!open && confirmation) {
    setConfirmation("");
  }

  return (
    <div
      className="space-y-3 rounded-md border border-danger bg-danger-tint/60 p-4"
      data-testid="delete-my-account-panel"
    >
      <div>
        <h2 className="text-lg font-medium text-ink">
          {DELETE_MY_ACCOUNT_MENU_LABEL}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Permanently delete your account and everything in it. This cannot be
          undone.
        </p>
      </div>

      {!open ? (
        <AppButton
          type="button"
          variant="danger"
          data-testid="delete-my-account-open"
          onClick={() => setOpen(true)}
        >
          {DELETE_MY_ACCOUNT_MENU_LABEL}
        </AppButton>
      ) : (
        <div
          className="space-y-3 rounded-md border border-danger bg-surface p-3"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="delete-my-account-confirm"
        >
          <p id={titleId} className="text-sm text-ink">
            {DELETE_MY_ACCOUNT_CONFIRM_BODY}
          </p>
          <form action={formAction} className="space-y-3">
            <label htmlFor={inputId} className="block text-sm text-ink">
              Type{" "}
              <span className="font-mono font-semibold">
                {DELETE_MY_ACCOUNT_CONFIRM_PHRASE}
              </span>{" "}
              to confirm
              <input
                id={inputId}
                name="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-sm"
                data-testid="delete-my-account-confirm-input"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <AppButton
                type="submit"
                variant="danger"
                disabled={!matches || pending}
                data-testid="delete-my-account-submit"
              >
                {pending ? "Deleting…" : DELETE_MY_ACCOUNT_BUTTON_LABEL}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                disabled={pending}
                data-testid="delete-my-account-cancel"
                onClick={() => {
                  setOpen(false);
                  setConfirmation("");
                }}
              >
                Cancel
              </AppButton>
            </div>
          </form>
          {state && !state.ok ? (
            <p
              className="text-sm text-danger"
              role="alert"
              data-testid="delete-my-account-error"
            >
              {state.message === DELETE_MY_ACCOUNT_FAILURE_MESSAGE ? (
                <>
                  We couldn&apos;t delete your account. Nothing was deleted.
                  Please{" "}
                  <Link href="/support" className="underline">
                    contact support
                  </Link>
                  .
                </>
              ) : (
                state.message
              )}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
