import Link from "next/link";
import { Suspense } from "react";
import { ArtifactProductFilter } from "@/components/ArtifactProductFilter";
import { EmptyState, PageHeader, PRIMARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { cn } from "@/lib/utils";
import { listPersonas, listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";

export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  requireGatedPage("productLevelHiringTeam");
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const productId = query.product?.trim() || null;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={vocab.persona.Plural}
          description={`${vocab.persona.Plural} across your ${vocab.product.plural}.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const [products, personas] = await Promise.all([
    listProducts(),
    listPersonas(productId ?? undefined),
  ]);
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const canCreate = products.length > 0;

  return (
    <div>
      <PageHeader
        title={vocab.persona.Plural}
        description={`Org-wide ${vocab.persona.singular} list. Open ${vocab.persona.aSingular} to manage titles, criteria, and rebuilds.`}
        actions={
          canCreate ? (
            <Link
              href={
                productId
                  ? `/personas/new?product=${productId}`
                  : "/personas/new"
              }
              className={PRIMARY_BUTTON_CLASS}
            >
              New {vocab.persona.singular}
            </Link>
          ) : (
            <span
              title={`Add ${vocab.product.aSingular} first`}
              className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-edge-strong px-3.5 py-2 text-sm font-medium text-subtle"
            >
              New {vocab.persona.singular}
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

      {personas.length === 0 ? (
        <EmptyState
          title={`No ${vocab.persona.plural} yet`}
          description={`${vocab.persona.ASingular} is someone you score and email against — titles, responsibilities, and discriminators that separate good fits from bad ones.`}
          actions={
            canCreate ? (
              <Link
                href="/personas/new"
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                New {vocab.persona.singular}
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
                <th className="px-4 py-3 font-medium">{vocab.persona.Singular}</th>
                <th className="px-4 py-3 font-medium">{vocab.product.Singular}</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {personas.map((persona) => (
                <tr key={persona.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={`/setup/${persona.productId}/personas/manage/${persona.id}`}
                      className="hover:underline"
                    >
                      {persona.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {productNameById.get(persona.productId) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/setup/${persona.productId}/personas/manage/${persona.id}`}
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
