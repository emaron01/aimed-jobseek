import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductResynthesisReview } from "@/components/ProductResynthesisReview";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";
import { PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG } from "@/lib/product-research/resynthesize-approved";
import { productDraftFromApprovedProfile } from "@/lib/product-research/resynthesize-approved-plan";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string; runId: string }>;
};

export default async function ProductResynthesisReviewPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, runId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`Re-synthesize ${vocab.product.singular}`} />
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

  const run = await prisma.productSetupRun.findFirst({
    where: {
      id: runId,
      organizationId: organization.id,
      productId: product.id,
    },
  });
  if (!run) notFound();

  const userContext = run.userContextJson as Record<string, unknown> | null;
  if (!userContext?.[PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG]) {
    notFound();
  }

  const draft = (run.productDraftJson as CandidateProfile | null) ?? null;
  const failed = run.status === "FAILED";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={`Re-synthesize: ${product.name}`}
        description={`Review new material against your approved ${vocab.product.singular} profile. Nothing changes until you confirm.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products"
              className={SECONDARY_BUTTON_CLASS}
            >
              All {vocab.product.plural}
            </Link>
            <Link
              href={`/setup/${product.id}/research`}
              className={SECONDARY_BUTTON_CLASS}
            >
              Back to research
            </Link>
          </div>
        }
      />
      <section className="rounded-lg border border-edge bg-surface p-5">
        <ProductResynthesisReview
          productId={product.id}
          productName={product.name}
          setupRunId={run.id}
          evidenceBundleId={run.evidenceBundleId}
          draft={draft}
          failed={failed}
          errorSafe={run.errorSafe}
          beforeProfile={productDraftFromApprovedProfile(product.profileJson)}
          manuallyEditedFields={product.manuallyEditedFields}
        />
      </section>
    </div>
  );
}
