"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  setCampaignVisibilityAction,
  type CampaignSharingActionResult,
} from "@/app/actions/campaign-sharing";
import { SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { vocab } from "@/lib/product-config";

const initial: CampaignSharingActionResult | null = null;

/**
 * Header-level sharing control so sharing is discoverable regardless of the
 * campaign stage the user lands on.
 */
export function CampaignVisibilityButton({
  campaignId,
  visibility,
}: {
  campaignId: string;
  visibility: "PERSONAL" | "SHARED";
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    setCampaignVisibilityAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);

  const sharing = visibility === "PERSONAL";

  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input
        type="hidden"
        name="visibility"
        value={sharing ? "SHARED" : "PERSONAL"}
      />
      <AppButton
        type="submit"
        disabled={pending}
        className={SECONDARY_BUTTON_CLASS}
        title={
          sharing
            ? `Make this ${vocab.campaign.singular} setup available to the team`
            : `Remove this ${vocab.campaign.singular} from the team's shared templates`
        }
        data-testid="campaign-visibility-button"
      >
        {pending
          ? "Saving…"
          : sharing
            ? "Share with team"
            : "Make personal"}
      </AppButton>
      {state && !state.ok ? (
        <span role="alert" className="ml-2 self-center text-sm text-red-600">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
