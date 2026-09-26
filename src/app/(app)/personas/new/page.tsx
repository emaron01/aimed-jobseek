import Link from "next/link";
import { ProductContinuePicker } from "@/components/ProductContinuePicker";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";

export default async function NewPersonaPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  requireGatedPage("productLevelHiringTeam");
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const requestedProductId = query.product?.trim() || null;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={`New ${vocab.persona.singular}`}
          description={`Generate ${vocab.persona.aSingular}.`}
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
        title={`New ${vocab.persona.singular}`}
        description={`Choose which ${vocab.product.singular} this ${vocab.persona.singular} belongs to, then continue to build it from suggested roles or from scratch.`}
        actions={
          <Link
            href="/personas"
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to {vocab.persona.plural}
          </Link>
        }
      />

      <section className="rounded-lg border border-edge bg-surface p-5">
        {products.length === 0 ? (
          <p className="text-sm text-muted">
            Add {vocab.product.aSingular} on the{" "}
            <Link href="/products/new" className="underline">
              {vocab.product.Plural} page
            </Link>{" "}
            before building {vocab.persona.aSingular}.
          </p>
        ) : (
          <ProductContinuePicker
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            initialProductId={initialProductId}
            continuePathTemplate="/setup/{productId}#personas"
            continueLabel={`Continue to ${vocab.persona.singular} setup`}
          />
        )}
      </section>
    </div>
  );
}
