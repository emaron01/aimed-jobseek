import Link from "next/link";
import { notFound } from "next/navigation";
import { IcpDetailsForm } from "@/components/IcpDetailsForm";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ fromProfile?: string }>;
};

export default async function NewIcpPage({ params, searchParams }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;
  const { fromProfile } = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`Add ${vocab.icp.singular}`} />
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
        title={`Add ${vocab.icp.singular}`}
        description={`${vocab.idealCustomer.Singular} profile for ${product.name}.`}
        actions={
          <Link
            href={`/setup/${product.id}`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to overview
          </Link>
        }
      />
      <IcpDetailsForm
        productId={product.id}
        productName={product.name}
        criteria={[]}
        profileApproved={product.approvalStatus === "APPROVED"}
        autoDraftFromProfile={fromProfile === "1"}
      />
    </div>
  );
}
