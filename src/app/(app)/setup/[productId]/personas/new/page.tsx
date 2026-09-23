import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildPersonaForm } from "@/components/BuildPersonaForm";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ role?: string }>;
};

export default async function NewPersonaPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;
  const { role: roleKey } = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader title={`Build ${vocab.persona.Singular}`} />
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
        <PageHeader title={`Build ${vocab.persona.Singular}`} />
        <p className="text-sm text-slate-600">
          Approve the {vocab.product.Singular} before building {vocab.persona.Plural}.
        </p>
        <Link href={`/setup/${product.id}/research`} className="underline">
          Back to {vocab.product.Singular} research
        </Link>
      </div>
    );
  }

  let role: SuggestedBuyerRole | null = null;
  if (roleKey && product.approvedSetupRunId) {
    const run = await prisma.productSetupRun.findFirst({
      where: {
        id: product.approvedSetupRunId,
        organizationId: organization.id,
        productId: product.id,
      },
    });
    const roles =
      (run?.suggestedPersonasJson as SuggestedBuyerRole[] | null) ?? [];
    role = roles.find((r) => r.suggestionKey === roleKey) ?? null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={role ? `Build ${vocab.persona.Singular}: ${product.name}` : `New ${vocab.persona.singular}: ${product.name}`}
        description={
          role
            ? `Reuses ${vocab.product.Singular} evidence. Runs ${vocab.persona.Singular} research only when the role is ambiguous or thin.`
            : `Name the ${vocab.buyer.singular} and add any context you have. Synthesis builds the ${vocab.persona.singular} from ${vocab.product.singular} evidence and peer differentiation — then you review and edit.`
        }
        actions={
          <Link
            href={`/setup/${product.id}/research`}
            className={SECONDARY_BUTTON_CLASS}
          >
            Back
          </Link>
        }
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <BuildPersonaForm productId={product.id} role={role} />
      </section>
    </div>
  );
}
