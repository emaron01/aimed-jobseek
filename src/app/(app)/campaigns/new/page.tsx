import Link from "next/link";
import { NewCampaignForm } from "@/components/NewCampaignForm";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { listIcps, listPersonas } from "@/lib/tenant/data";
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

  const [icps, personas, workflow] = await Promise.all([
    listIcps(),
    listPersonas(),
    getHomeWorkflow(organization.id),
  ]);

  const campaignProducts = workflow.campaignProducts;
  const readyProducts = campaignProducts.filter((product) => product.ready);
  const unavailableProducts = campaignProducts.filter((product) => !product.ready);
  const canCreate = campaignProducts.length > 0;

  return (
    <div>
      <PageHeader
        title={`New ${vocab.campaign.singular}`}
        description={`Select the ${vocab.product.singular}, ${vocab.icp.singular}, and ${vocab.persona.plural} in play. ${vocab.icp.singular} and ${vocab.persona.singular} options are filtered by ${vocab.product.singular} and validated server-side.`}
        actions={
          <Link
            href="/campaigns"
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to {vocab.campaign.plural}
          </Link>
        }
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        {canCreate ? (
          <NewCampaignForm
            products={campaignProducts.map((product) => ({
              id: product.id,
              name: product.name,
              ready: product.ready,
              omissionReason: product.omissionReason,
            }))}
            icps={icps.map((icp) => ({
              id: icp.id,
              name: icp.name,
              productId: icp.productId,
            }))}
            personas={personas.map((persona) => ({
              id: persona.id,
              name: persona.name,
              productId: persona.productId,
            }))}
          />
        ) : (
          <p className="text-sm text-slate-600">
            Add {vocab.product.aSingular} on the{" "}
            <Link href="/products/new" className="underline">
              {vocab.product.Plural} page
            </Link>{" "}
            before creating {vocab.campaign.aSingular}.
          </p>
        )}
        {canCreate && readyProducts.length === 0 ? (
          <p
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            data-testid="campaign-product-setup-required"
          >
            No {vocab.product.plural} are ready for {vocab.campaign.plural} yet. Each {vocab.product.singular} needs
            approval, {vocab.icp.aSingular} with criteria, and at least one saved {vocab.persona.singular}.
          </p>
        ) : null}
        {unavailableProducts.length > 0 && readyProducts.length > 0 ? (
          <div
            className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            data-testid="campaign-product-omissions"
          >
            <p className="font-medium text-slate-900">
              {vocab.product.Plural} not yet available
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {unavailableProducts.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/setup/${product.id}`}
                    className="font-medium text-slate-900 underline-offset-2 hover:underline"
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
