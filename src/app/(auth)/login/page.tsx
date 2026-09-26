"use client";
import { AppButton } from "@/components/ui";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, Suspense } from "react";
import { authClient } from "@/lib/auth/client";
import { vocab } from "@/lib/product-config";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-edge bg-surface p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Sign in
      </h1>
      <p className="mt-1 text-sm text-muted">
        Access your {vocab.campaign.singular} workspace.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
          />
        </label>
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
          {loading ? "Signing in…" : "Sign in"}
        </AppButton>
      </form>
      <p className="mt-4 text-sm text-muted">
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted">
        No account?{" "}
        <Link href="/signup/plan" className="font-medium underline">
          Sign up
        </Link>
      </p>
      {/* keep authClient imported for tree future OAuth */}
      <span className="hidden">{String(Boolean(authClient))}</span>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
