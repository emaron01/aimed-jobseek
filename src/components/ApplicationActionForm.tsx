"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";

type ActionResult = { ok: boolean; message: string };

const FALLBACK_ERROR = "The action could not be completed.";

export async function runApplicationFormAction(
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>,
  prev: ActionResult | null,
  form: Pick<HTMLFormElement, "elements"> | FormData,
): Promise<ActionResult> {
  const formData = form instanceof FormData ? form : new FormData(form as HTMLFormElement);
  try {
    return await action(prev, formData);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message.trim()
          ? error.message
          : FALLBACK_ERROR,
    };
  }
}

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
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await runApplicationFormAction(
        action,
        state,
        event.currentTarget,
      );
      setState(result);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid={testId}>
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
