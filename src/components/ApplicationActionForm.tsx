"use client";

import { useActionState, type ReactNode } from "react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";

type ActionResult = { ok: boolean; message: string };

const initial: ActionResult | null = null;

export function ApplicationActionForm({
  action,
  submitLabel,
  testId,
  children,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
  testId: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-3" data-testid={testId}>
      {children}
      {state ? (
        <p className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={PRIMARY_BUTTON_CLASS}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
