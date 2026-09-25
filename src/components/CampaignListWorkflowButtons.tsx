"use client";

import Link from "next/link";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
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
        className={
          researchComplete
            ? cn(
                PRIMARY_BUTTON_CLASS,
                "gap-1.5 whitespace-nowrap !bg-emerald-600 hover:!bg-emerald-500",
              )
            : PRIMARY_BUTTON_CLASS
        }
      >
        {researchComplete ? (
          <>
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-semibold text-emerald-600"
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
        <Link
          href={listScoreHref(listId, campaignId)}
          data-testid="campaign-list-score-button"
          className={PRIMARY_BUTTON_CLASS}
        >
          {scoreLabel}
        </Link>
      ) : (
        <span
          data-testid="campaign-list-score-button"
          title={`Research companies on this ${vocab.list.singular} first`}
          className={cn(
            SECONDARY_BUTTON_CLASS,
            "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-500",
          )}
        >
          {scoreLabel}
        </span>
      )
      ) : null}
    </>
  );
}
