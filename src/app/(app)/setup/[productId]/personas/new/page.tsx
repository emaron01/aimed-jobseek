import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildPersonaForm } from "@/components/BuildPersonaForm";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function NewPersonaPage({ params }: PageProps) {
  requireGatedPage("productLevelHiringTeam");
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`Generate ${vocab.persona.singular}`} />
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

  if (product.approvalStatus !== "APPROVED") {
    return (
      <div className="space-y-4">
        <PageHeader title={`Generate ${vocab.persona.singular}`} />
        <p className="text-sm text-muted">
          Approve the {vocab.product.Singular} before building {vocab.persona.Plural}.
        </p>
        <Link href={`/setup/${product.id}/research`} className="underline">
          Back to {vocab.product.Singular} research
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`New ${vocab.persona.singular}: ${product.name}`}
        description={`Name the ${vocab.buyer.singular} and add any context you have. Synthesis builds the ${vocab.persona.singular} from job and company evidence and peer differentiation — then you review and edit.`}
        actions={
          <Link
            href={`/setup/${product.id}`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Back
          </Link>
        }
      />
      <section className="rounded-lg border border-edge bg-surface p-5">
        <BuildPersonaForm productId={product.id} role={null} />
      </section>
    </div>
  );
}
