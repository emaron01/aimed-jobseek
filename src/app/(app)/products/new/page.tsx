import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import {PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

export default async function NewProductPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={`New ${vocab.product.singular}`}
          description={`Create ${vocab.product.aSingular} for the active organization.`}
        />
        <TenantMissing />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`New ${vocab.product.singular}`}
        description={`Name the ${vocab.product.singular} and supply materials you already use. Research builds a draft profile for your review.`}
        actions={
          <AppActionLink
            href="/products"
            variant="secondary"
          >
            Back to {vocab.product.plural}
          </AppActionLink>
        }
      />
      <div className="rounded-lg border border-edge bg-surface p-5">
        <AssistedProductIntake />
      </div>
    </div>
  );
}
