"use client";

import { useState } from "react";
import {
  ReferralShareFields,
  useReferralShare,
} from "@/components/billing/ReferralShareFields";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { features } from "@/lib/product-config";
import { cn } from "@/lib/utils";

/**
 * Billing-page referral section — same lazy code + copy actions as the nav modal.
 */
export function ReferralProgramPanel() {
  const [open, setOpen] = useState(false);
  const share = useReferralShare(open);

  if (!features.referralProgram) return null;

  return (
    <section
      className="space-y-3 rounded-lg border border-edge bg-surface p-5"
      data-testid="billing-referral-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">Referrals</h2>
          <p className="mt-1 text-sm text-muted">
            Share your code. Friends get 10% off Standard at Checkout. You earn
            10% off per successful referral, up to 50%.
          </p>
        </div>
        {!open ? (
          <AppButton
            type="button"
            onClick={() => setOpen(true)}
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            data-testid="billing-referral-open"
          >
            Show my referral code
          </AppButton>
        ) : null}
      </div>

      {open ? (
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
          testIdPrefix="billing-referral"
        />
      ) : null}
    </section>
  );
}
