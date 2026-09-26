"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useActionState, useEffect, useRef } from "react";
import {
  changePasswordAction,
  type AccountActionResult,
} from "@/app/actions/account";

const initial: AccountActionResult | null = null;

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3"
      data-testid="change-password-form"
    >
      {state ? (
        <p
          role="status"
          data-testid="change-password-status"
          className={
            state.ok ? "text-sm text-success" : "text-sm text-danger"
          }
        >
          {state.message}
        </p>
      ) : null}
      <label className="block text-sm">
        Current password
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        New password
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>
      <AppButton
        type="submit"
        disabled={pending}
        className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
      >
        {pending ? "Updating…" : "Update password"}
      </AppButton>
    </form>
  );
}
