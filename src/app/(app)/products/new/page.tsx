import Link from "next/link";
import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
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
          <Link
            href="/products"
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to {vocab.product.plural}
          </Link>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <AssistedProductIntake />
      </div>
    </div>
  );
}
