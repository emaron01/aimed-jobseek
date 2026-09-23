import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetailsForm } from "@/components/ProductDetailsForm";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function EditProductPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`Edit ${vocab.product.singular}`} />
        <TenantMissing />
      </div>
    );
  }

  let product;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit: ${product.name}`}
        description={`Update ${vocab.product.singular} details.`}
        actions={
          <Link
            href={`/setup/${product.id}`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to overview
          </Link>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <ProductDetailsForm product={product} />
      </div>
    </div>
  );
}
