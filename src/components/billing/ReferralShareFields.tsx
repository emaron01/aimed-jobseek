"use client";

import { useEffect, useState, useTransition } from "react";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { referralShareMessage } from "@/lib/billing/referral-share-message";
import { cn } from "@/lib/utils";

export type ReferralCodePayload = {
  code: string;
  successfulReferralCount: number;
  rewardPercent: number;
};

/**
 * Lazy-load org referral code + copy actions.
 * Stripe promo is created only when `active` becomes true (first open).
 */
export function useReferralShare(active: boolean) {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [rewardPercent, setRewardPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKind, setCopiedKind] = useState<"code" | "message" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!active || code) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/referral-code", {
          method: "POST",
          headers: { Accept: "application/json" },
        });
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
          successfulReferralCount?: number;
          rewardPercent?: number;
          error?: string;
        };
        if (!res.ok || !body.code) {
          setError(body.error ?? "Could not load referral code");
          return;
        }
        setCode(body.code);
        setMessage(referralShareMessage(body.code));
        setCount(body.successfulReferralCount ?? 0);
        setRewardPercent(body.rewardPercent ?? 0);
      } catch {
        setError("Could not load referral code");
      }
    });
  }, [active, code]);

  async function copyText(kind: "code" | "message", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKind(kind);
      window.setTimeout(() => setCopiedKind(null), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return {
    code,
    message,
    setMessage,
    count,
    rewardPercent,
    error,
    setError,
    copiedKind,
    pending,
    copyText,
  };
}

/** Code + editable message + copy buttons (no fetch of its own). */
export function ReferralShareFields({
  code,
  message,
  onMessageChange,
  count,
  rewardPercent,
  error,
  copiedKind,
  pending,
  onCopy,
  testIdPrefix,
}: {
  code: string | null;
  message: string;
  onMessageChange: (value: string) => void;
  count: number | null;
  rewardPercent: number | null;
  error: string | null;
  copiedKind: "code" | "message" | null;
  pending: boolean;
  onCopy: (kind: "code" | "message", text: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-3">
      {pending && !code ? (
        <p className="text-sm text-slate-600">Creating your code…</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="status">
          {error}
        </p>
      ) : null}
      {code ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold tracking-wide text-slate-900"
              data-testid={`${testIdPrefix}-code`}
            >
              {code}
            </code>
            <AppButton
              type="button"
              className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
              data-testid={`${testIdPrefix}-copy-code`}
              onClick={() => onCopy("code", code)}
            >
              {copiedKind === "code" ? "Copied" : "Copy code"}
            </AppButton>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Suggested message
              <span className="ml-1 font-normal text-slate-500">
                — edit before copying if you want
              </span>
            </label>
            <AutosizeTextarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              minRows={4}
              data-testid={`${testIdPrefix}-message`}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
            />
            <AppButton
              type="button"
              className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
              data-testid={`${testIdPrefix}-copy-message`}
              onClick={() => onCopy("message", message)}
            >
              {copiedKind === "message" ? "Copied" : "Copy message"}
            </AppButton>
          </div>

          <p
            className="text-sm text-slate-700"
            data-testid={`${testIdPrefix}-stats`}
          >
            {count ?? 0} successful referral
            {(count ?? 0) === 1 ? "" : "s"} · your rate {rewardPercent ?? 0}%
            off
            {(rewardPercent ?? 0) >= 50 ? " (capped)" : ""}
          </p>
          <p className="text-xs text-slate-500">
            A referral counts when they reach an active paid subscription — not
            at trial start. Your discount stays if they cancel later. Paste into
            Slack, email, or text — there is no in-app send.
          </p>
        </>
      ) : null}
    </div>
  );
}
