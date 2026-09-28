import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import {EmptyState, PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ProductCatalogPanel } from "@/components/ProductCatalogPanel";
import { listProductsWithCounts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { features, vocab } from "@/lib/product-config";

export default async function ProductsPage() {
  const organization = await getCurrentOrganization();
  const icpNextStep = features.employerIcpFit
    ? ` After you approve it, define ${vocab.icp.plural}.`
    : "";
  const emptyIcpNextStep = features.employerIcpFit
    ? `, then define the ${vocab.icp.plural} that belong to it`
    : "";
  const missingDescription = features.employerIcpFit
    ? `Define ${vocab.product.aSingular}, then attach ${vocab.icp.plural} to it.`
    : `Define ${vocab.product.aSingular}.`;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={vocab.product.Plural}
          description={missingDescription}
        />
        <TenantMissing />
      </div>
    );
  }

  const products = await listProductsWithCounts();

  return (
    <div>
      <PageHeader
        title={vocab.product.Plural}
          description={`${vocab.product.ASingular} is the candidate record later ${vocab.campaign.plural} read from.${icpNextStep}`}
        actions={
          <AppActionLink
            href="/products/new"
            variant="primary"
          >
            New {vocab.product.singular}
          </AppActionLink>
        }
      />

      <DeleteSuccessNotice />

      {products.length === 0 ? (
        <EmptyState
          title={`No ${vocab.product.plural} yet`}
          description={`${vocab.product.ASingular} is built from your resume and other materials. Research it once${emptyIcpNextStep}.`}
          actions={
            <AppActionLink
              href="/products/new"
              variant="primary" className={cn("!px-3")}
            >
              New {vocab.product.singular}
            </AppActionLink>
          }
        />
      ) : (
        <ProductCatalogPanel products={products} />
      )}
    </div>
  );
}
