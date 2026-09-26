"use client";
import { AppButton } from "@/components/ui";

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
        <AppButton
          type="button"
          variant={tone === "danger" ? "danger" : "secondary"}
          onClick={() => setOpen(true)}
        >
          {triggerLabel}
        </AppButton>
      ) : (
        <div
          className={
            tone === "warning"
              ? "rounded-md border border-warning bg-warning-tint p-3 text-sm text-ink"
              : "rounded-md border border-danger bg-danger-tint p-3 text-sm text-ink"
          }
          role="alertdialog"
          aria-labelledby="confirm-delete-title"
        >
          <p id="confirm-delete-title" className="font-semibold text-ink">
            {confirmTitle}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-ink">{confirmBody}</p>
          <form action={formAction} className="mt-3 flex flex-wrap gap-2">
            {Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="confirm" value="1" />
            <AppButton
              type="submit"
              disabled={pending}
              variant={tone === "warning" ? "secondary" : "danger"}
              data-testid="confirm-delete-submit"
            >
              {pending
                ? (pendingLabel ?? "Deleting…")
                : confirmButtonLabel}
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </AppButton>
          </form>
        </div>
      )}
      {state && !state.ok ? (
        <p className="mt-2 text-sm text-danger" role="alert" data-testid="delete-error">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
