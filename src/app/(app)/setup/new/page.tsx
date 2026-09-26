import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import {PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

export default async function NewProductAssistedPage() {
  const organization = await getCurrentOrganization();
  if (!organization) {
    return (
      <div>
        <PageHeader title={`New ${vocab.product.Singular}`} />
        <TenantMissing />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`New ${vocab.product.Singular}`}
        description={`Provide a name and optional sources. Research builds ${vocab.product.Singular} and ${vocab.persona.Singular} drafts for your review.`}
        actions={
          <AppActionLink
            href="/products"
            variant="secondary"
          >
            All {vocab.product.plural}
          </AppActionLink>
        }
      />
      <div className="rounded-lg border border-edge bg-surface p-5">
        <AssistedProductIntake />
      </div>
    </div>
  );
}
