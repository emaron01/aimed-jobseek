"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type ActionFeedbackResult = { ok: boolean; message: string };

type FeedbackAction = (
  prev: ActionFeedbackResult | null,
  formData: FormData,
) => Promise<ActionFeedbackResult>;

/**
 * Thin form wrapper: useActionState + status banner + refresh on success.
 * `className` applies to the fields wrapper so flex/grid layouts stay intact.
 */
export function ActionFeedbackForm({
  action,
  className,
  children,
  testId,
}: {
  action: FeedbackAction;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} data-testid={testId}>
      {state ? (
        <p
          role="status"
          data-testid="action-feedback-status"
          className={
            state.ok
              ? "mb-3 text-sm text-success"
              : "mb-3 text-sm text-danger"
          }
        >
          {state.message}
        </p>
      ) : null}
      <div className={className}>{children}</div>
    </form>
  );
}
