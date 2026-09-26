import { notFound } from "next/navigation";
import { CandidateProfileEditForm } from "@/components/CandidateProfileEditForm";
import {PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { candidateProfileEditCopy } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function EditProductPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={candidateProfileEditCopy.pageTitle} />
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
        title={`${candidateProfileEditCopy.pageTitle}: ${product.name}`}
        description={candidateProfileEditCopy.pageHelp}
        actions={
          <AppActionLink
            href={`/setup/${product.id}`}
            variant="secondary"
          >
            Back to overview
          </AppActionLink>
        }
      />
      <div className="rounded-lg border border-edge bg-surface p-5">
        <CandidateProfileEditForm
          productId={product.id}
          profileJson={product.profileJson}
        />
      </div>
    </div>
  );
}
