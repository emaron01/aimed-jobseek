"use client";

import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { prepareSignupCompanyAction } from "@/app/actions/pending-signup";
import { signupCopy } from "@/lib/product-config";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SignupForm({
  next,
  planSummary,
  requirePlan,
  defaultEmail = "",
  defaultCompanyName = "",
  workspaceName = null,
  inviteMode = false,
}: {
  next: string;
  planSummary: string | null;
  requirePlan: boolean;
  /** Prefill when joining via invite link. */
  defaultEmail?: string;
  /** Prefill company / workspace name (invite: org name, read-only). */
  defaultCompanyName?: string;
  /** Invite: org display name for copy. */
  workspaceName?: string | null;
  /** Invite join — no plan cookie, locked email/company, verify back to invite. */
  inviteMode?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lockedEmail = inviteMode && defaultEmail.trim().length > 0;
  const lockedCompany = inviteMode && defaultCompanyName.trim().length > 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const firstName = String(fd.get("firstName") || "").trim();
    const lastName = String(fd.get("lastName") || "").trim();
    const email = lockedEmail
      ? defaultEmail.trim()
      : String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirmPassword") || "");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    setLoading(true);
    try {
      // Self-serve only — invitees must not write a plan / Checkout cookie.
      if (!inviteMode) {
        const prepared = await prepareSignupCompanyAction({});
        if (!prepared.ok) {
          setError(prepared.message);
          setLoading(false);
          return;
        }
      }

      // Invite: land on the invite link after verify (skip subscribe onboarding).
      const callbackURL =
        inviteMode && next.startsWith("/invite/accept")
          ? next
          : "/post-verify";

      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          callbackURL,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(
          data.error?.message ||
            data.message ||
            "Unable to create account. Please try again.",
        );
        setLoading(false);
        return;
      }
      router.push(
        next
          ? `/verify-email?sent=1&next=${encodeURIComponent(next)}`
          : "/verify-email?sent=1",
      );
      router.refresh();
    } catch {
      setError("Unable to create account. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      data-testid="signup-form"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {inviteMode ? "Join the workspace" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {inviteMode && workspaceName
          ? `Create a password and you will join ${workspaceName}.`
          : planSummary
            ? `Selected: ${planSummary}. Enter your details to continue.`
            : "Enter your details to continue."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            First name
            <input
              name="firstName"
              required
              autoComplete="given-name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Last name
            <input
              name="lastName"
              required
              autoComplete="family-name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        {inviteMode ? (
          <label className="block text-sm">
            Workspace
            <input
              name="companyName"
              required={!lockedCompany}
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              defaultValue={defaultCompanyName}
              readOnly={lockedCompany}
              className={cn(
                "mt-1 w-full rounded-md border border-slate-300 px-3 py-2",
                lockedCompany ? "bg-slate-50 text-slate-700" : "",
              )}
            />
          </label>
        ) : null}
        <label className="block text-sm">
          {signupCopy.emailLabel}
          <input
            name="email"
            type="email"
            required={!lockedEmail}
            defaultValue={defaultEmail}
            readOnly={lockedEmail}
            autoComplete="email"
            className={cn(
              "mt-1 w-full rounded-md border border-slate-300 px-3 py-2",
              lockedEmail ? "bg-slate-50 text-slate-700" : "",
            )}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Confirm password
          <input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <AppButton
          type="submit"
          disabled={loading || (requirePlan && !planSummary)}
          className={cn(PRIMARY_BUTTON_CLASS, "w-full", "!px-3")}
        >
          {loading
            ? "Creating account…"
            : inviteMode
              ? "Create password and join"
              : "Create account"}
        </AppButton>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{" "}
        <Link
          href={
            next
              ? `/login?next=${encodeURIComponent(next)}`
              : "/login"
          }
          className="font-medium underline"
        >
          Sign in
        </Link>
      </p>
      {!next && !inviteMode ? (
        <p className="mt-2 text-sm text-slate-600">
          Want a different plan?{" "}
          <Link href="/signup/plan" className="font-medium underline">
            Change plan
          </Link>
        </p>
      ) : null}
    </div>
  );
}
