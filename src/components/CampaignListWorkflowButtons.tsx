"use client";

import { AppButton, AppActionLink } from "@/components/ui";
import {
  campaignListScoreButtonLabel,
  listScoreHref,
} from "@/lib/lists/campaign-query";
import { features, vocab } from "@/lib/product-config";

/**
 * Header actions when a list was opened from a campaign ( ?campaign= ).
 * Guides Research → Score for that campaign. Not used on normal list visits.
 */
export function CampaignListWorkflowButtons({
  listId,
  campaignId,
  campaignName,
  researchComplete,
  allowResearch = features.listBulkValidation,
  allowScore = features.listBulkScoring,
}: {
  listId: string;
  campaignId: string;
  campaignName: string;
  researchComplete: boolean;
  allowResearch?: boolean;
  allowScore?: boolean;
}) {
  function scrollToResearch() {
    document.getElementById("company-research")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    if (!researchComplete) {
      document.getElementById("research-companies-start")?.click();
    }
  }

  const scoreLabel = campaignListScoreButtonLabel(
    campaignName,
    researchComplete,
  );

  return (
    <>
      {allowResearch ? (
      <AppButton
        type="button"
        onClick={scrollToResearch}
        data-testid="campaign-list-research-button"
        aria-label={
          researchComplete
            ? "Research Companies, complete"
            : "Research Companies"
        }
        variant="primary"
        className={
          researchComplete ? "gap-1.5 whitespace-nowrap" : undefined
        }
      >
        {researchComplete ? (
          <>
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-xs font-semibold text-success"
            >
              ✓
            </span>
            Research Companies
          </>
        ) : (
          "Research Companies"
        )}
      </AppButton>
      ) : null}
      {allowScore ? (
      researchComplete ? (
        <AppActionLink
          href={listScoreHref(listId, campaignId)}
          variant="primary"
          data-testid="campaign-list-score-button"
        >
          {scoreLabel}
        </AppActionLink>
      ) : (
        <AppActionLink
          href={listScoreHref(listId, campaignId)}
          variant="secondary"
          disabled
          disabledReason={`Research companies on this ${vocab.list.singular} first`}
          data-testid="campaign-list-score-button"
        >
          {scoreLabel}
        </AppActionLink>
      )
      ) : null}
    </>
  );
}
