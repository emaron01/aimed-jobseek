import { workspaceApplicationContactsHref } from "@/lib/application/workspace-links";
import { applicationSummaryConfig } from "@/lib/product-config";

export function CheatSheetEmptyState({ campaignId }: { campaignId: string }) {
  return (
    <p className="text-sm text-ink print:hidden" data-testid="cheat-sheet-empty-people">
      {applicationSummaryConfig.emptyPeopleLead}
      <a
        href={workspaceApplicationContactsHref(campaignId)}
        className="font-medium text-ink underline"
      >
        {applicationSummaryConfig.emptyPeopleLink}
      </a>
      {applicationSummaryConfig.emptyPeopleTail}
    </p>
  );
}
