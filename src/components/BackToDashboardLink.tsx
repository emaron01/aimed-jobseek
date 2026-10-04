import { AppActionLink } from "@/components/AppButton";
import { workspaceCampaignHref } from "@/lib/application/workspace-links";
import { polishCopy } from "@/lib/product-config";

export function BackToDashboardLink({
  campaignId,
  testId = "back-to-dashboard",
}: {
  campaignId: string;
  testId?: string;
}) {
  return (
    <AppActionLink href={workspaceCampaignHref(campaignId)} data-testid={testId}>
      {polishCopy.backToDashboard}
    </AppActionLink>
  );
}
