import Link from "next/link";
import { notFound } from "next/navigation";
import { IcpDetailsForm } from "@/components/IcpDetailsForm";
import { PageHeader, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { serializeIcpForClient } from "@/lib/icp/save";
import { listIcpCriteria } from "@/lib/interpretation/icp";
import { getProduct, listIcps } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
};

/** Optional list when a product has multiple ICPs. */
export default async function ListIcpsPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={vocab.icp.plural} />
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

  const icps = await listIcps(product.id);
  const criteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listIcpCriteria>>
  >();
  await Promise.all(
    icps.map(async (icp) => {
      criteriaMap.set(icp.id, await listIcpCriteria(organization.id, icp.id));
    }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`${vocab.icp.plural}: ${product.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/setup/${product.id}/icps/new`}
              className={PRIMARY_BUTTON_CLASS}
            >
              Add {vocab.icp.singular}
            </Link>
            <Link
              href={`/setup/${product.id}`}
              className={SECONDARY_BUTTON_CLASS}
            >
              Back to overview
            </Link>
          </div>
        }
      />
      {icps.length === 0 ? (
        <p className="text-sm text-subtle">No {vocab.icp.plural} yet.</p>
      ) : (
        icps.map((icp) => (
          <IcpDetailsForm
            key={icp.id}
            productId={product.id}
            productName={product.name}
            icp={serializeIcpForClient(icp)}
            criteria={criteriaMap.get(icp.id) ?? []}
          />
        ))
      )}
    </div>
  );
}
