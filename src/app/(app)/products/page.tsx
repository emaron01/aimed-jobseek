import Link from "next/link";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { EmptyState, PageHeader, PRIMARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ProductCatalogPanel } from "@/components/ProductCatalogPanel";
import { listProductsWithCounts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

export default async function ProductsPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={vocab.product.Plural}
          description={`Define ${vocab.product.aSingular}, then attach ${vocab.icp.plural} to it.`}
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
          description={`${vocab.product.ASingular} is the candidate record later ${vocab.campaign.plural} read from. After you approve it, define ${vocab.icp.plural}.`}
        actions={
          <Link
            href="/products/new"
            className={PRIMARY_BUTTON_CLASS}
          >
            New {vocab.product.singular}
          </Link>
        }
      />

      <DeleteSuccessNotice />

      {products.length === 0 ? (
        <EmptyState
          title={`No ${vocab.product.plural} yet`}
          description={`${vocab.product.ASingular} is built from your resume and other materials. Research it once, then define the ${vocab.icp.plural} that belong to it.`}
          actions={
            <Link
              href="/products/new"
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            >
              New {vocab.product.singular}
            </Link>
          }
        />
      ) : (
        <ProductCatalogPanel products={products} />
      )}
    </div>
  );
}
