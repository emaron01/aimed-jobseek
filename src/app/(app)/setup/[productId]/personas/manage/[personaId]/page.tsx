import { notFound } from "next/navigation";
import { PersonaForm } from "@/components/PersonaForm";
import {PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
import { prisma } from "@/lib/prisma";
import { getPersona, getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";

type PageProps = {
  params: Promise<{ productId: string; personaId: string }>;
};

export default async function ManagePersonaPage({ params }: PageProps) {
  requireGatedPage("productLevelHiringTeam");
  const organization = await getCurrentOrganization();
  const { productId, personaId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={vocab.persona.Singular} />
        <TenantMissing />
      </div>
    );
  }

  let product;
  let persona;
  try {
    product = await getProduct(productId);
    persona = await getPersona(personaId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  if (persona.productId !== product.id) {
    notFound();
  }

  const criteria = await listPersonaCriteria(organization.id, persona.id);

  const sources = await prisma.personaSource.findMany({
    where: {
      organizationId: organization.id,
      OR: [
        { personaId: persona.id },
        ...(persona.approvedPersonaSetupRunId
          ? [{ personaSetupRunId: persona.approvedPersonaSetupRunId }]
          : []),
      ],
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

  let includesProductEvidence = false;
  if (persona.approvedPersonaSetupRunId) {
    const run = await prisma.personaSetupRun.findFirst({
      where: {
        id: persona.approvedPersonaSetupRunId,
        organizationId: organization.id,
      },
      select: { productEvidenceBundleId: true },
    });
    includesProductEvidence = Boolean(run?.productEvidenceBundleId);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={persona.name}
        description={`${vocab.persona.Singular} for ${product.name}.`}
        actions={
          <AppActionLink
            href={`/setup/${product.id}`}
            variant="secondary"
          >
            Back to overview
          </AppActionLink>
        }
      />
      <PersonaForm
        productId={product.id}
        persona={persona}
        criteria={criteria}
        sources={sources}
        includesProductEvidence={includesProductEvidence}
      />
    </div>
  );
}
