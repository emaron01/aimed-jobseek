import Link from "next/link";
import { notFound } from "next/navigation";
import { IcpDetailsForm } from "@/components/IcpDetailsForm";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { serializeIcpForClient } from "@/lib/icp/save";
import { listIcpCriteria } from "@/lib/interpretation/icp";
import { getIcp, getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string; icpId: string }>;
};

export default async function EditIcpPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, icpId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`Edit ${vocab.icp.singular}`} />
        <TenantMissing />
      </div>
    );
  }

  let product;
  let icp;
  try {
    product = await getProduct(productId);
    icp = await getIcp(icpId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  if (icp.productId !== product.id || icp.archivedAt) {
    notFound();
  }

  const criteria = await listIcpCriteria(organization.id, icp.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={icp.name}
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
        icp={serializeIcpForClient(icp)}
        criteria={criteria}
      />
    </div>
  );
}
