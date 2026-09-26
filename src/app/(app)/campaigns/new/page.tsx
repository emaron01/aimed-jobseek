import Link from "next/link";
import { NewCampaignForm } from "@/components/NewCampaignForm";
import {PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getHomeWorkflow } from "@/lib/workflow/home";
import { vocab } from "@/lib/product-config";

export default async function NewCampaignPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={`New ${vocab.campaign.singular}`}
          description={`Create ${vocab.campaign.aSingular} for the active organization.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const workflow = await getHomeWorkflow(organization.id);

  const campaignProducts = workflow.campaignProducts;
  const readyProducts = campaignProducts.filter((product) => product.ready);
  const unavailableProducts = campaignProducts.filter((product) => !product.ready);
  const canCreate = campaignProducts.length > 0;

  return (
    <div>
      <PageHeader
        title={`New ${vocab.campaign.singular}`}
        description={`Paste a job posting and choose ${vocab.product.aSingular}.`}
        actions={
          <AppActionLink
            href="/campaigns"
            variant="secondary"
          >
            Back to {vocab.campaign.plural}
          </AppActionLink>
        }
      />

      <section className="rounded-lg border border-edge bg-surface p-5">
        {canCreate ? (
          <NewCampaignForm
            products={campaignProducts.map((product) => ({
              id: product.id,
              name: product.name,
              ready: product.ready,
              omissionReason: product.omissionReason,
            }))}
          />
        ) : (
          <p className="text-sm text-muted">
            Add {vocab.product.aSingular} on the{" "}
            <Link href="/products/new" className="underline">
              {vocab.product.Plural} page
            </Link>{" "}
            before creating {vocab.campaign.aSingular}.
          </p>
        )}
        {canCreate && readyProducts.length === 0 ? (
          <p
            className="mt-3 rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning"
            data-testid="campaign-product-setup-required"
          >
            No {vocab.product.plural} are ready for {vocab.campaign.plural} yet. Each {vocab.product.singular} needs
            approval.
          </p>
        ) : null}
        {unavailableProducts.length > 0 && readyProducts.length > 0 ? (
          <div
            className="mt-3 space-y-2 rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink"
            data-testid="campaign-product-omissions"
          >
            <p className="font-medium text-ink">
              {vocab.product.Plural} not yet available
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {unavailableProducts.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/setup/${product.id}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {product.name}
                  </Link>
                  : {product.omissionReason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
