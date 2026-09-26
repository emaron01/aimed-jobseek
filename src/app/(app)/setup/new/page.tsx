import Link from "next/link";
import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
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
          <Link
            href="/products"
            className={SECONDARY_BUTTON_CLASS}
          >
            All {vocab.product.plural}
          </Link>
        }
      />
      <div className="rounded-lg border border-edge bg-surface p-5">
        <AssistedProductIntake />
      </div>
    </div>
  );
}
