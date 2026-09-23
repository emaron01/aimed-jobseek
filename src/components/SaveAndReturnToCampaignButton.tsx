"use client";

import { useFormStatus } from "react-dom";
import { saveScoringRunAndReturnToCampaignAction } from "@/app/actions/campaign-contacts";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { vocab } from "@/lib/product-config";

function SubmitButton({
  testId,
}: {
  testId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={testId}
      className={SECONDARY_BUTTON_CLASS}
    >
      {pending ? "Saving…" : `Save and return to ${vocab.campaign.singular}`}
    </button>
  );
}

/** Attaches Ready to include contacts, then navigates to the campaign. */
export function SaveAndReturnToCampaignButton({
  campaignId,
  scoringRunId,
  testId = "back-to-campaign",
}: {
  campaignId: string;
  scoringRunId: string;
  testId?: string;
}) {
  return (
    <form action={saveScoringRunAndReturnToCampaignAction}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="scoringRunId" value={scoringRunId} />
      <SubmitButton testId={testId} />
    </form>
  );
}
