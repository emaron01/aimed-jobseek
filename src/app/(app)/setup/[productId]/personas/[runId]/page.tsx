import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonaDraftReview } from "@/components/PersonaDraftReview";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import { getResearchPolicy } from "@/lib/usage/policy";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string; runId: string }>;
};

export default async function PersonaSetupRunPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, runId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`${vocab.persona.Singular} review`} />
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

  const run = await prisma.personaSetupRun.findFirst({
    where: {
      id: runId,
      organizationId: organization.id,
      productId: product.id,
    },
  });
  if (!run) notFound();

  const researchPolicy = await getResearchPolicy(organization.id);

  const draft = (run.personaDraftJson as PersonaAiDraft | null) ?? null;
  const failed = run.status === "FAILED";

  const sources = await prisma.personaSource.findMany({
    where: {
      organizationId: organization.id,
      personaSetupRunId: run.id,
    },
    select: {
      id: true,
      sourceType: true,
      displayName: true,
      originalUrl: true,
      filename: true,
      provenanceClass: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${vocab.persona.Singular} draft: ${product.name}`}
        description={`Review and save to make this ${vocab.persona.Singular} authoritative.`}
        actions={
          <Link
            href={`/setup/${product.id}/research`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Suggested roles
          </Link>
        }
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <PersonaDraftReview
          productId={product.id}
          personaSetupRunId={run.id}
          draft={draft}
          failed={failed}
          errorSafe={run.errorSafe}
          maxProjectedPersonaCriteria={researchPolicy.maxProjectedPersonaCriteria}
          sources={sources}
          includesProductEvidence={Boolean(run.productEvidenceBundleId)}
        />
      </section>
    </div>
  );
}
