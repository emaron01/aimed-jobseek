"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppButton, type AppButtonVariant } from "@/components/AppButton";
import {
  InlineActionStatus,
  type InlineActionResult,
} from "@/components/InlineActionStatus";

type ActionResult = InlineActionResult;

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

const SM_BUTTON_CLASS = "!px-2.5 !py-1.5 !text-xs";

/**
 * Replies and approvals restore the viewport after router.refresh.
 * Draft Edit and Save also remove the focused control, which scrolls the
 * document to the top. Move focus onto the question card first, then restore
 * the same scroll position.
 */
export function keepHarperQuestionInPlace(
  source: Element | null,
  saved?: { x: number; y: number },
): { x: number; y: number } {
  if (typeof window === "undefined") return saved ?? { x: 0, y: 0 };
  const point = saved ?? { x: window.scrollX, y: window.scrollY };
  const card = source?.closest("[data-harper-question]");
  if (card instanceof HTMLElement) {
    if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
    card.focus({ preventScroll: true });
  }
  const restore = () => window.scrollTo(point.x, point.y);
  restore();
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 50);
  });
  return point;
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
  preserveScroll = true,
  onSuccess,
  compact = false,
  formClassName = "space-y-3",
  formId,
  children,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
  pendingLabel?: string;
  testId: string;
  onSubmitStart?: (formData: FormData) => void | false;
  variant?: AppButtonVariant;
  hideSubmit?: boolean;
  /** When true, disables all form fields (including textareas) while the action runs. */
  disableFieldsWhilePending?: boolean;
  /** Keep viewport position after a successful router.refresh (Harper Q&A). */
  preserveScroll?: boolean;
  /** Runs after a successful action, before the page refresh. */
  onSuccess?: () => void;
  /** Smaller seeker action buttons (Harper question row). */
  compact?: boolean;
  formClassName?: string;
  formId?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (onSubmitStart?.(formData) === false) return;
    setPending(true);
    const place = preserveScroll ? keepHarperQuestionInPlace(form) : null;
    try {
      const result = await runApplicationFormAction(action, state, formData);
      setState(result);
      if (result.ok) {
        if (place) keepHarperQuestionInPlace(form, place);
        onSuccess?.();
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  const buttonClass = [
    hideSubmit ? "sr-only" : undefined,
    compact ? SM_BUTTON_CLASS : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  const fields = (
    <>
      {children}
      <InlineActionStatus result={state} testId={`${testId}-status`} />
      <AppButton
        type="submit"
        variant={variant}
        pending={pending}
        pendingLabel={pendingLabel}
        className={buttonClass || undefined}
      >
        {submitLabel}
      </AppButton>
    </>
  );

  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      className={formClassName}
      data-testid={testId}
    >
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
