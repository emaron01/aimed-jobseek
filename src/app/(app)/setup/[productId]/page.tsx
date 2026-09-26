import { notFound } from "next/navigation";
import type { Product } from "@prisma/client";
import type { ReactNode } from "react";
import { deleteProductAction } from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { PageHeader, Panel, TenantMissing, AppActionLink } from "@/components/ui";
import { listIcpCriteria } from "@/lib/interpretation/icp";
import { factTexts } from "@/lib/product-research/candidate-profile";
import { productDraftFromApprovedProfile } from "@/lib/product-research/resynthesize-approved-plan";
import { getProduct, listIcps } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { prisma } from "@/lib/prisma";
import {
  productCompletionLabel,
  productCompletionState,
  truncateText,
} from "@/lib/setup/product-overview";
import { candidateProfileEditCopy, polishCopy, vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
};

function PrintList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">
        {title}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function PrintProse({ title, text }: { title: string; text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">
        {title}
      </h3>
      <p className="whitespace-pre-wrap text-sm text-ink">{text}</p>
    </section>
  );
}

function statusBadgeClass(state: ReturnType<typeof productCompletionState>) {
  if (state === "approved") {
    return "bg-success-tint text-success ring-success";
  }
  if (state === "needs_review") {
    return "bg-warning-tint text-warning ring-warning";
  }
  return "bg-canvas text-ink ring-edge";
}

function ActionLink({
  href,
  children,
  primary,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <AppActionLink
      href={href}
      variant={primary ? "primary" : "secondary"}
      className="!px-3 !py-1.5"
    >
      {children}
    </AppActionLink>
  );
}

export default async function SetupProductPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title={vocab.product.Singular} description={`Manage ${vocab.product.singular} setup.`} />
        <TenantMissing />
      </div>
    );
  }

  let product: Product;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const [icps, impact] = await Promise.all([
    listIcps(product.id),
    prisma.product.findFirst({
      where: { id: product.id, organizationId: organization.id },
      include: {
        _count: {
          select: {
            icps: true,
            personas: true,
            campaigns: true,
            scoringRuns: true,
            sources: true,
            evidenceBundles: true,
            setupRuns: true,
          },
        },
      },
    }),
  ]);

  const productDeleteBody = (() => {
    const c = impact?._count;
    if (!c) return `This will permanently delete this ${vocab.product.Singular}.`;
    const lines = [
      `Delete ${vocab.product.Singular} "${product.name}"?`,
      "",
      "This will also remove:",
      `• ${c.icps} ${vocab.icp.singular}(s)`,
      `• ${c.personas} ${vocab.persona.Singular}(s) and their current criteria`,
      `• ${c.sources} ${vocab.product.singular} source(s)`,
      `• ${c.evidenceBundles} evidence bundle(s)`,
      `• ${c.setupRuns} research draft run(s)`,
      "",
      c.scoringRuns > 0
        ? `Note: ${c.scoringRuns} scoring run(s) reference this ${vocab.product.Singular} — it will be archived instead of permanently deleted so historical snapshots remain.`
        : "Historical scoring snapshots (if any later) would be preserved via archive rather than hard delete.",
      c.campaigns > 0
        ? `Blocked until ${c.campaigns} ${vocab.campaign.singular}(s) are removed or reassigned.`
        : `${vocab.campaign.Plural}: none currently reference this ${vocab.product.Singular}.`,
    ];
    return lines.join("\n");
  })();

  const icpCriteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listIcpCriteria>>
  >();
  await Promise.all(
    icps.map(async (icp) => {
      icpCriteriaMap.set(icp.id, await listIcpCriteria(organization.id, icp.id));
    }),
  );

  const completion = productCompletionState(product);
  const profile = productDraftFromApprovedProfile(product.profileJson);
  const productBlurb = truncateText(
    profile.identity.headline?.text || profile.positioning?.text,
    140,
  );
  const primaryIcp = icps[0] ?? null;
  const primaryIcpCriteria = primaryIcp
    ? (icpCriteriaMap.get(primaryIcp.id) ?? [])
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div data-print-hide>
        <PageHeader
          title={product.name}
          description="Track setup progress. Edit details only when you choose to."
          actions={
            <div className="flex flex-wrap gap-2">
              <AppActionLink
                href={`/setup/${product.id}/research`}
                variant="primary"
              >
                {polishCopy.researchAndGenerate}
              </AppActionLink>
              <AppActionLink
                href="/setup"
                variant="secondary"
              >
                All {vocab.product.plural}
              </AppActionLink>
            </div>
          }
        />
      </div>

      <DeleteSuccessNotice />

      <div className="space-y-5">
        {/* 1. Product */}
        <Panel
          title={`1. ${vocab.product.Singular}`}
          description={`Core ${vocab.product.singular} record used by applications and generated documents.`}
        >
          <div data-print-document>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-ink print:text-2xl">
                    {product.name}
                  </p>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset print:hidden ${statusBadgeClass(completion)}`}
                  >
                    {productCompletionLabel(completion)}
                  </span>
                </div>
                {productBlurb ? (
                  <p className="mt-2 text-sm text-muted print:hidden">
                    {productBlurb}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-subtle print:hidden">
                    {candidateProfileEditCopy.emptyBlurb}
                  </p>
                )}
              </div>
              <div data-print-hide>
                <ActionLink href={`/setup/${product.id}/edit`}>
                  Edit {vocab.product.singular}
                </ActionLink>
              </div>
            </div>

            <div className="mt-6 hidden space-y-5 print:block">
              <PrintProse
                title={candidateProfileEditCopy.headline}
                text={profile.identity.headline?.text}
              />
              <PrintProse
                title={candidateProfileEditCopy.positioning}
                text={profile.positioning?.text}
              />
              <PrintProse
                title={candidateProfileEditCopy.personalWebsite}
                text={profile.identity.personalSite?.text}
              />
              <PrintList
                title={candidateProfileEditCopy.targetTitles}
                items={factTexts(profile.direction.targetTitles)}
              />
              <PrintProse
                title={candidateProfileEditCopy.seniority}
                text={profile.direction.seniority?.text}
              />
              <PrintList
                title={candidateProfileEditCopy.functions}
                items={factTexts(profile.direction.functions)}
              />
              <PrintList
                title={candidateProfileEditCopy.skills}
                items={factTexts(profile.skills)}
              />
              <PrintList
                title={candidateProfileEditCopy.problemsSolved}
                items={factTexts(profile.problemsSolved)}
              />
              <PrintList
                title={candidateProfileEditCopy.differentiators}
                items={factTexts(profile.differentiators)}
              />
              <PrintList
                title={candidateProfileEditCopy.education}
                items={factTexts(profile.education)}
              />
              <PrintList
                title={candidateProfileEditCopy.domainVocabulary}
                items={factTexts(profile.domainVocabulary)}
              />
            </div>

            <div
              className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3"
              data-print-hide
            >
              <ExportPdfButton />
              <ConfirmDeleteForm
                action={deleteProductAction}
                hiddenFields={{ id: product.id }}
                triggerLabel={`Delete ${vocab.product.singular}`}
                confirmTitle={`Delete ${vocab.product.Singular} "${product.name}"?`}
                confirmBody={productDeleteBody}
                confirmButtonLabel={`Delete ${vocab.product.Singular}`}
                onSuccessNavigate="/products"
              />
            </div>
          </div>
        </Panel>

        <div data-print-hide>
        <Panel
          title={`2. ${vocab.icp.singular}`}
          description={`${vocab.idealCustomer.Singular} profile for company-level fit.`}
        >
          {primaryIcp ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{primaryIcp.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {truncateText(
                    primaryIcp.definition || primaryIcp.description,
                    140,
                  ) || "No definition yet."}
                </p>
                <p className="mt-1 text-xs text-subtle">
                  {primaryIcpCriteria.length} criteria
                  {icps.length > 1 ? ` · ${icps.length} ${vocab.icp.plural} total` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionLink href={`/setup/${product.id}/icps/${primaryIcp.id}`}>
                  Edit
                </ActionLink>
                {icps.length > 1 ? (
                  <ActionLink href={`/setup/${product.id}/icps`}>
                    View all
                  </ActionLink>
                ) : (
                  <ActionLink href={`/setup/${product.id}/icps/new`}>
                    Add {vocab.icp.singular}
                  </ActionLink>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-warning bg-warning-tint px-4 py-4">
              <p className="text-sm font-semibold text-warning">
                {vocab.icp.singular} not set up yet
              </p>
              <p className="mt-1 text-sm text-warning/80">
                {completion === "approved"
                  ? `Draft ${vocab.idealCustomer.aSingular} profile from your approved ${vocab.product.singular}, or write one from scratch.`
                  : `Add ${vocab.idealCustomer.aSingular} profile so later ${vocab.campaign.plural} can be scored against the kind of company you want.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {completion === "approved" ? (
                  <>
                    <ActionLink
                      href={`/setup/${product.id}/icps/new?fromProfile=1`}
                      primary
                    >
                      Draft from my {vocab.product.Singular}
                    </ActionLink>
                    <ActionLink href={`/setup/${product.id}/icps/new`}>
                      Write from scratch
                    </ActionLink>
                  </>
                ) : (
                  <ActionLink href={`/setup/${product.id}/icps/new`} primary>
                    Add {vocab.icp.singular}
                  </ActionLink>
                )}
              </div>
            </div>
          )}
        </Panel>
        </div>
      </div>
    </div>
  );
}
