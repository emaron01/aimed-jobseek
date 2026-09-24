"use client";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DELETE_SUCCESS_NOTICE_EVENT,
  DELETE_SUCCESS_NOTICE_KEY,
} from "@/lib/tenant/delete-success-notice";
import type { CrudDeleteResult } from "@/lib/tenant/crud-delete";

type DeleteAction = (
  prev: CrudDeleteResult | null,
  formData: FormData,
) => Promise<CrudDeleteResult>;

function pathOnly(href: string): string {
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
}

/**
 * Destructive delete with explicit confirmation copy (not browser confirm()).
 */
export function ConfirmDeleteForm({
  action,
  hiddenFields,
  confirmTitle,
  confirmBody,
  confirmButtonLabel,
  triggerLabel,
  onSuccessNavigate,
  tone = "danger",
  pendingLabel,
}: {
  action: DeleteAction;
  hiddenFields: Record<string, string>;
  confirmTitle: string;
  confirmBody: string;
  confirmButtonLabel: string;
  triggerLabel: string;
  onSuccessNavigate?: string;
  tone?: "danger" | "warning";
  pendingLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const pathname = usePathname();
  if (state?.ok && open) {
    setOpen(false);
  }

  useEffect(() => {
    if (!state?.ok) return;
    if (onSuccessNavigate) {
      const message = state.message || "Deleted.";
      // Never refresh the deleted record URL — that 404s before navigation.
      try {
        sessionStorage.setItem(DELETE_SUCCESS_NOTICE_KEY, message);
      } catch {
        // ignore
      }
      if (pathname === pathOnly(onSuccessNavigate)) {
        // Already on the destination (e.g. product delete from /products).
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(DELETE_SUCCESS_NOTICE_EVENT, { detail: message }),
          );
        }
        router.refresh();
      } else {
        // Hard navigate so an in-flight RSC refresh of the deleted URL cannot 404.
        window.location.assign(onSuccessNavigate);
      }
      return;
    }
    router.refresh();
  }, [state, router, pathname, onSuccessNavigate]);

  return (
    <div data-testid="confirm-delete">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={SECONDARY_BUTTON_CLASS}
        >
          {triggerLabel}
        </button>
      ) : (
        <div
          className={
            tone === "warning"
              ? "rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800"
              : "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-slate-800"
          }
          role="alertdialog"
          aria-labelledby="confirm-delete-title"
        >
          <p id="confirm-delete-title" className="font-semibold text-slate-900">
            {confirmTitle}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{confirmBody}</p>
          <form action={formAction} className="mt-3 flex flex-wrap gap-2">
            {Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="confirm" value="1" />
            <button
              type="submit"
              disabled={pending}
              className={
                tone === "warning"
                  ? "inline-flex items-center justify-center rounded-md bg-amber-700 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
                  : "inline-flex items-center justify-center rounded-md bg-red-700 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
              }
              data-testid="confirm-delete-submit"
            >
              {pending
                ? (pendingLabel ?? "Deleting…")
                : confirmButtonLabel}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
          </form>
        </div>
      )}
      {state && !state.ok ? (
        <p className="mt-2 text-sm text-red-600" role="alert" data-testid="delete-error">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
