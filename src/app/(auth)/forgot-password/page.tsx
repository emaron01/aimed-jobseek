"use client";
import { AppButton } from "@/components/ui";

import Link from "next/link";
import { FormEvent, useState } from "react";

/**
 * Password reset request. Must hit Better Auth's `/request-password-reset`
 * (not the legacy/misnamed `/forget-password`, which is not registered).
 */
export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") || "").trim();
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        console.error("[auth] password-reset request failed", {
          status: res.status,
          body: bodyText.slice(0, 300),
        });
        setError(
          "We could not send a reset email right now. Please try again in a few minutes.",
        );
        setLoading(false);
        return;
      }

      setMessage(
        "If an account exists for that email, we've sent password reset instructions.",
      );
    } catch (err) {
      console.error("[auth] password-reset request network error", err);
      setError(
        "We could not reach the server to send a reset email. Please try again.",
      );
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-edge bg-surface p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Forgot password
      </h1>
      <p className="mt-1 text-sm text-muted">
        We&apos;ll email reset instructions if an account exists.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
          />
        </label>
        {message ? (
          <p className="text-sm text-success" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <AppButton
          type="submit"
          disabled={loading}
          className="w-full"
        >
          {loading ? "Sending…" : "Send reset link"}
        </AppButton>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
