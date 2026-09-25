"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ReferralShareFields,
  useReferralShare,
} from "@/components/billing/ReferralShareFields";
import { SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { features } from "@/lib/product-config";
import { cn } from "@/lib/utils";

/**
 * Top-bar "Refer a friend" — modal overlay so the rep keeps their page.
 * Stripe promo is created only when the modal opens (not on page load).
 */
export function ReferAFriendButton() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const share = useReferralShare(open);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!features.referralProgram) return null;

  return (
    <>
      <AppButton
        type="button"
        className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
        data-testid="refer-a-friend-open"
        onClick={() => setOpen(true)}
      >
        Refer a friend
      </AppButton>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="refer-a-friend-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id={titleId}
                  className="text-lg font-medium text-slate-900"
                >
                  Refer a friend
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Friends get 10% off Standard at Checkout. You earn 10% off per
                  successful referral, up to 50%.
                </p>
              </div>
              <AppButton
                ref={closeRef}
                type="button"
                className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                data-testid="refer-a-friend-close"
                onClick={() => setOpen(false)}
              >
                Close
              </AppButton>
            </div>
            <div className="mt-4">
              <ReferralShareFields
                code={share.code}
                message={share.message}
                onMessageChange={share.setMessage}
                count={share.count}
                rewardPercent={share.rewardPercent}
                error={share.error}
                copiedKind={share.copiedKind}
                pending={share.pending}
                onCopy={share.copyText}
                testIdPrefix="refer-a-friend"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
