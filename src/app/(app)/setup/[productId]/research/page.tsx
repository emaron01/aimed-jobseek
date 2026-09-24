import Link from "next/link";
import { notFound } from "next/navigation";
import { AssistedProductIntake } from "@/components/AssistedProductSetup";
import { AddProductMaterialPanel } from "@/components/AddProductMaterialPanel";
import { ProductDraftReview } from "@/components/ProductDraftReview";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { productUrlResearchIsStale } from "@/lib/product-research/acquire";
import { PRODUCT_URL_UNREADABLE_MESSAGE } from "@/lib/product-research/extraction-quality";
import {
  isNearEmptyProductDraft,
  storedProfileFromJson,
} from "@/lib/product-research/review";
import { PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG } from "@/lib/product-research/resynthesize-approved";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function ProductResearchPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`${vocab.product.Singular} research`} />
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

  const [
    latestRun,
    latestFailedRun,
    latestBundle,
    urlStale,
    sources,
    pendingResynthesisRun,
  ] = await Promise.all([
      prisma.productSetupRun.findFirst({
        where: {
          organizationId: organization.id,
          productId: product.id,
          status: { in: ["NEEDS_REVIEW", "PARTIAL", "APPROVED"] },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.productSetupRun.findFirst({
        where: {
          organizationId: organization.id,
          productId: product.id,
          status: "FAILED",
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.productEvidenceBundle.findFirst({
        where: { organizationId: organization.id, productId: product.id },
        orderBy: { version: "desc" },
      }),
      productUrlResearchIsStale({
        organizationId: organization.id,
        productId: product.id,
      }),
      prisma.productSource.findMany({
        where: {
          organizationId: organization.id,
          productId: product.id,
          status: { in: ["ACQUIRED", "EXTRACTED", "FAILED"] },
        },
        select: {
          id: true,
          sourceType: true,
          displayName: true,
          originalUrl: true,
          filename: true,
          status: true,
          errorSafe: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      product.approvalStatus === "APPROVED"
        ? prisma.productSetupRun.findFirst({
            where: {
              organizationId: organization.id,
              productId: product.id,
              status: "NEEDS_REVIEW",
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve(null),
    ]);

  const draft = storedProfileFromJson(latestRun?.productDraftJson ?? null);

  const sourcesForReview = sources.map((source) => {
    const charMatch = source.errorSafe?.match(/Extracted (\d+) characters/i);
    return {
      ...source,
      extractedCharCount: charMatch ? Number(charMatch[1]) : null,
    };
  });

  const failedRead =
    Boolean(latestFailedRun) &&
    (product.setupStatus === "FAILED" ||
      isNearEmptyProductDraft(latestFailedRun?.productDraftJson ?? null) ||
      sourcesForReview.some((s) => s.status === "FAILED" && s.sourceType === "URL"));

  const showSynthesisFailure =
    !draft &&
    Boolean(latestBundle) &&
    (product.setupStatus === "FAILED" || Boolean(latestFailedRun));

  const productApproved = product.approvalStatus === "APPROVED";
  const pendingResynthesisContext =
    (pendingResynthesisRun?.userContextJson as Record<string, unknown> | null) ??
    null;
  const showPendingResynthesisBanner =
    productApproved &&
    pendingResynthesisRun &&
    pendingResynthesisContext?.[PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG] ===
      true;
  const failedUrlErrors = sourcesForReview
    .filter((s) => s.status === "FAILED" && s.sourceType === "URL")
    .map((s) => s.errorSafe)
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div data-print-hide>
        <PageHeader
          title={`Review ${product.name}`}
          description={`Review the ${vocab.product.singular}. Approve it. Then define ${vocab.icp.plural}.`}
          actions={
            <Link
              href={`/setup/${product.id}`}
              className={SECONDARY_BUTTON_CLASS}
            >
              {vocab.product.Singular} setup
            </Link>
          }
        />
      </div>

      {showSynthesisFailure || failedRead ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
          data-testid="product-failed-read"
          data-print-hide
        >
          <p className="font-medium">
            {failedRead
              ? `We could not read your ${vocab.product.singular} website`
              : `${vocab.product.Singular} synthesis could not be completed`}
          </p>
          <p className="mt-2">
            {failedUrlErrors[0] ||
              latestFailedRun?.errorSafe ||
              PRODUCT_URL_UNREADABLE_MESSAGE}
          </p>
          <p className="mt-3 font-medium">What to do next</p>
          <p className="mt-1">
            Paste resume or LinkedIn profile text, or use{" "}
            <strong>Upload materials</strong> below with a resume or other
            documents. That path works reliably for JavaScript-heavy sites.
          </p>
          {!failedRead ? (
            <p className="mt-2 text-xs text-amber-800/80">
              Acquired evidence was preserved. Use Try building again if you
              only need to re-run the model — no URL re-fetch or web search.
            </p>
          ) : null}
        </div>
      ) : null}

      {latestRun && draft && !isNearEmptyProductDraft(draft) && !productApproved ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-8">
          <ProductDraftReview
            productId={product.id}
            setupRunId={latestRun.id}
            productName={product.name}
            websiteUrl={product.websiteUrl}
            sources={sourcesForReview.filter((s) => s.status !== "FAILED")}
            draft={draft}
          />
        </section>
      ) : null}

      {showPendingResynthesisBanner ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
          data-testid="product-pending-resynthesis"
          data-print-hide
        >
          <p className="font-medium">Re-synthesis draft ready for review</p>
          <p className="mt-1">
            New material was synthesized. Your approved profile is unchanged
            until you confirm the diff.
          </p>
          <Link
            href={`/setup/${product.id}/research/resynthesis/${pendingResynthesisRun!.id}`}
            className="mt-3 inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3.5 py-2 text-sm font-medium text-amber-950"
          >
            Review changes
          </Link>
        </div>
      ) : null}

      {productApproved ? (
        <section
          id="product-materials"
          className="rounded-lg border border-slate-200 bg-white p-5"
          data-print-hide
        >
          <AddProductMaterialPanel productId={product.id} />
        </section>
      ) : (
        <section
          id="product-materials"
          className="rounded-lg border border-slate-200 bg-white p-5"
          data-print-hide
        >
          <AssistedProductIntake
            productId={product.id}
            defaultName={product.name}
            defaultUrl={product.websiteUrl ?? undefined}
            urlResearchStale={urlStale}
            latestEvidenceBundleId={latestBundle?.id}
          />
        </section>
      )}

    </div>
  );
}
