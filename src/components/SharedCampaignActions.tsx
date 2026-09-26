import { useSharedCampaignAction } from "@/app/actions/campaign-sharing";
import { AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { vocab } from "@/lib/product-config";

/**
 * Use a SHARED template by creating a PERSONAL configuration-only copy.
 */
export function SharedCampaignActions({ campaignId }: { campaignId: string }) {
  return (
    <div
      className="flex max-w-xs flex-col gap-2 text-left"
      data-testid="shared-campaign-actions"
    >
      <form action={useSharedCampaignAction}>
        <input type="hidden" name="campaignId" value={campaignId} />
        <AppButton
          type="submit"
          className={cn("w-full !px-3 !py-1.5")}
          title={`Create a personal copy with the same ${vocab.product.singular}, ${vocab.icp.singular}, ${vocab.persona.plural}, offer, and email guidance. Empty of ${vocab.list.plural} and ${vocab.contact.plural}.`}
        >
          Use this {vocab.campaign.singular}
        </AppButton>
      </form>
      <p className="text-[11px] leading-snug text-subtle">
        Creates a personal copy you own and can edit. Setup is copied; {vocab.list.plural},
        {vocab.contact.plural}, drafts, and sends are not.
      </p>
    </div>
  );
}
