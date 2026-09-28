"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppButton, type AppButtonVariant } from "@/components/AppButton";

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
  pendingLabel = "Saving…",
  testId,
  onSubmitStart,
  variant = "primary",
  hideSubmit = false,
  disableFieldsWhilePending = false,
  children,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
  pendingLabel?: string;
  testId: string;
  onSubmitStart?: (formData: FormData) => void;
  variant?: AppButtonVariant;
  hideSubmit?: boolean;
  /** When true, disables all form fields (including textareas) while the action runs. */
  disableFieldsWhilePending?: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmitStart?.(formData);
    setPending(true);
    try {
      const result = await runApplicationFormAction(action, state, formData);
      setState(result);
      if (result.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  const fields = (
    <>
      {children}
      {state ? (
        <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"} role="status">
          {state.message}
        </p>
      ) : null}
      <AppButton
        type="submit"
        variant={variant}
        pending={pending}
        pendingLabel={pendingLabel}
        className={hideSubmit ? "sr-only" : undefined}
      >
        {submitLabel}
      </AppButton>
    </>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid={testId}>
      {disableFieldsWhilePending ? (
        <fieldset
          disabled={pending}
          className="min-w-0 space-y-3 border-0 p-0 m-0"
          data-testid={`${testId}-fields`}
        >
          {fields}
        </fieldset>
      ) : (
        fields
      )}
    </form>
  );
}
