import Link from "next/link";
import { ProductContinuePicker } from "@/components/ProductContinuePicker";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

export default async function NewIcpPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const requestedProductId = query.product?.trim() || null;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={`New ${vocab.icp.singular}`}
          description={`Create ${vocab.idealCustomer.aSingular} profile.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const products = await listProducts();
  const initialProductId =
    requestedProductId &&
    products.some((product) => product.id === requestedProductId)
      ? requestedProductId
      : products.length === 1
        ? products[0]!.id
        : null;

  return (
    <div>
      <PageHeader
        title={`New ${vocab.icp.singular}`}
        description={`Choose which ${vocab.product.singular} this ${vocab.icp.singular} belongs to, then continue to define and interpret it.`}
        actions={
          <Link
            href="/icps"
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to {vocab.icp.plural}
          </Link>
        }
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        {products.length === 0 ? (
          <p className="text-sm text-slate-600">
            Add {vocab.product.aSingular} on the{" "}
            <Link href="/products/new" className="underline">
              {vocab.product.Plural} page
            </Link>{" "}
            before creating {vocab.icp.aSingular}.
          </p>
        ) : (
          <ProductContinuePicker
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            initialProductId={initialProductId}
            continuePathTemplate="/setup/{productId}/icps/new"
            continueLabel={`Continue to ${vocab.icp.singular} setup`}
          />
        )}
      </section>
    </div>
  );
}
