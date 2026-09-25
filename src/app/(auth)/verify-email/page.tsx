"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { FormEvent, useState, Suspense, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { resendVerificationEmailAction } from "@/app/actions/verify-email";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const sent = searchParams.get("sent") === "1";
  const errorCode = searchParams.get("error");

  const invalidOrExpired =
    errorCode === "INVALID_TOKEN" || errorCode === "TOKEN_EXPIRED";

  const [message, setMessage] = useState<string | null>(
    sent && !invalidOrExpired
      ? "Check your inbox for a verification link. If it did not arrive, you can resend below."
      : null,
  );
  const [error, setError] = useState<string | null>(
    invalidOrExpired
      ? "Verification link is invalid or expired."
      : errorCode
        ? "Email verification could not be completed."
        : null,
  );
  const [pending, startTransition] = useTransition();

  function onResend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await resendVerificationEmailAction(formData);
      if (result.ok) {
        setMessage(result.message);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div
      className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      data-testid="verify-email-page"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {invalidOrExpired ? "Verification link expired" : "Verify your email"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {invalidOrExpired
          ? "Verification link is invalid or expired. Request a new link below."
          : "Confirm your email to finish creating your account."}
      </p>
      {message ? (
        <p className="mt-4 text-sm text-emerald-700" data-testid="verify-email-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 text-sm text-red-600"
          role="alert"
          data-testid="verify-email-error"
        >
          {error}
        </p>
      ) : null}
      <form onSubmit={onResend} className="mt-6 space-y-4">
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <AppButton
          type="submit"
          disabled={pending}
          data-testid="resend-verification"
          className={cn(PRIMARY_BUTTON_CLASS, "w-full", "!px-3")}
        >
          {pending ? "Sending…" : "Send a new verification email"}
        </AppButton>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="underline">
          Back to Login
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
