import Link from "next/link";
import { Suspense } from "react";
import { ArtifactProductFilter } from "@/components/ArtifactProductFilter";
import { EmptyState, PageHeader, PRIMARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { cn } from "@/lib/utils";
import { listIcps, listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

export default async function IcpsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const productId = query.product?.trim() || null;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={vocab.icp.plural}
          description={`${vocab.idealCustomer.Singular} profiles across your ${vocab.product.plural}.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const [products, icps] = await Promise.all([
    listProducts(),
    listIcps(productId ?? undefined),
  ]);
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const canCreate = products.length > 0;

  return (
    <div>
      <PageHeader
        title={vocab.icp.plural}
        description={`Org-wide ${vocab.icp.singular} list. Open ${vocab.icp.aSingular} to review criteria or attach it to ${vocab.campaign.aSingular}.`}
        actions={
          canCreate ? (
            <Link
              href={
                productId ? `/icps/new?product=${productId}` : "/icps/new"
              }
              className={PRIMARY_BUTTON_CLASS}
            >
              New {vocab.icp.singular}
            </Link>
          ) : (
            <span
              title={`Add ${vocab.product.aSingular} first`}
              className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-edge-strong px-3.5 py-2 text-sm font-medium text-subtle"
            >
              New {vocab.icp.singular}
            </span>
          )
        }
      />

      <div className="mb-6">
        <Suspense fallback={null}>
          <ArtifactProductFilter
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            selectedProductId={productId}
          />
        </Suspense>
      </div>

      {icps.length === 0 ? (
        <EmptyState
          title={`No ${vocab.icp.plural} yet`}
          description={`${vocab.icp.ASingular} describes the kind of company you want to work for — natural-language criteria interpreted for scoring and ${vocab.campaign.plural}.`}
          actions={
            canCreate ? (
              <Link
                href="/icps/new"
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                New {vocab.icp.singular}
              </Link>
            ) : (
              <Link
                href="/products/new"
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                New {vocab.product.singular}
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge bg-surface">
          <table className="min-w-full divide-y divide-edge text-sm">
            <thead className="bg-canvas text-left text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">{vocab.icp.singular}</th>
                <th className="px-4 py-3 font-medium">{vocab.product.Singular}</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {icps.map((icp) => (
                <tr key={icp.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={`/setup/${icp.productId}/icps/${icp.id}`}
                      className="hover:underline"
                    >
                      {icp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {productNameById.get(icp.productId) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/setup/${icp.productId}/icps/${icp.id}`}
                      className="text-ink underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
