"use client";

import { useActionState, useState } from "react";
import {
  acceptEulaAction,
  type AcceptEulaActionResult,
} from "@/app/actions/eula";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";

export function AcceptEulaForm({ versionNumber }: { versionNumber: number }) {
  const [agreed, setAgreed] = useState(false);
  const [state, formAction, pending] = useActionState(
    acceptEulaAction,
    null as AcceptEulaActionResult | null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="versionNumber" value={versionNumber} />
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
        <input
          type="checkbox"
          name="agreed"
          value="1"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300"
          data-testid="eula-agree-checkbox"
        />
        <span>
          I have read and agree to the Terms of Service and End User License
          Agreement
        </span>
      </label>
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}
      <AppButton
        type="submit"
        disabled={!agreed || pending}
        className={`${PRIMARY_BUTTON_CLASS} w-full`}
        data-testid="eula-continue"
      >
        {pending ? "Saving…" : "Continue"}
      </AppButton>
    </form>
  );
}
