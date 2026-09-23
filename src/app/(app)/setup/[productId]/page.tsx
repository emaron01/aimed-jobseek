import Link from "next/link";
import { notFound } from "next/navigation";
import type { Product } from "@prisma/client";
import type { ReactNode } from "react";
import { deleteProductAction } from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { PageHeader, Panel, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { cn } from "@/lib/utils";
import { listIcpCriteria } from "@/lib/interpretation/icp";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
import { productDraftFromApprovedProfile } from "@/lib/product-research/resynthesize-approved-plan";
import { getProduct, listIcps, listPersonas } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { prisma } from "@/lib/prisma";
import {
  formatLikelyTitles,
  formatPersonaCriteriaSummary,
  normalizeSuggestedBuyerRoles,
  partitionSuggestedRoles,
  productCompletionLabel,
  productCompletionState,
  summarizePersonaCriteriaCounts,
  truncateText,
} from "@/lib/setup/product-overview";
import {
  findNearDuplicatePersonaPairs,
  formatNearDuplicateWarning,
  parsePersonaListField,
} from "@/lib/persona/persona-differentiation";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ productId: string }>;
};

function PrintList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
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
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <p className="whitespace-pre-wrap text-sm text-slate-800">{text}</p>
    </section>
  );
}

function statusBadgeClass(state: ReturnType<typeof productCompletionState>) {
  if (state === "approved") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }
  if (state === "needs_review") {
    return "bg-amber-50 text-amber-900 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
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
    <Link
      href={href}
      className={
        primary
          ? cn(PRIMARY_BUTTON_CLASS, "!px-3", "!py-1.5")
          : cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")
      }
    >
      {children}
    </Link>
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

  const [icps, personas, impact, latestRun] = await Promise.all([
    listIcps(product.id),
    listPersonas(product.id),
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
    prisma.productSetupRun.findFirst({
      where: {
        organizationId: organization.id,
        productId: product.id,
        status: { in: ["NEEDS_REVIEW", "PARTIAL", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
      select: { suggestedPersonasJson: true },
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

  const personaCriteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listPersonaCriteria>>
  >();
  const icpCriteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listIcpCriteria>>
  >();
  await Promise.all([
    ...personas.map(async (persona) => {
      personaCriteriaMap.set(
        persona.id,
        await listPersonaCriteria(organization.id, persona.id),
      );
    }),
    ...icps.map(async (icp) => {
      icpCriteriaMap.set(icp.id, await listIcpCriteria(organization.id, icp.id));
    }),
  ]);

  const nearDuplicatePersonaPairs = findNearDuplicatePersonaPairs(
    personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      painPoints: parsePersonaListField(persona.painPoints),
      messagingNotes: parsePersonaListField(persona.messagingNotes),
    })),
  );

  const suggestedRoles = normalizeSuggestedBuyerRoles(
    latestRun?.suggestedPersonasJson,
  );
  const { unbuiltSuggestions } = partitionSuggestedRoles({
    savedPersonas: personas,
    suggestedRoles,
  });

  const completion = productCompletionState(product);
  const productBlurb = truncateText(
    product.description || product.valueProposition,
    140,
  );
  const profile = productDraftFromApprovedProfile(product.profileJson);
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
              <Link
                href={`/setup/${product.id}/research`}
                className={PRIMARY_BUTTON_CLASS}
              >
                Research & Build
              </Link>
              <Link
                href="/setup"
                className={SECONDARY_BUTTON_CLASS}
              >
                All {vocab.product.plural}
              </Link>
            </div>
          }
        />
      </div>

      <DeleteSuccessNotice />

      <div className="space-y-5">
        {/* 1. Product */}
        <Panel
          title={`1. ${vocab.product.Singular}`}
          description={`Core ${vocab.product.singular} record used by research and scoring.`}
        >
          <div data-print-document>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-slate-900 print:text-2xl">
                    {product.name}
                  </p>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset print:hidden ${statusBadgeClass(completion)}`}
                  >
                    {productCompletionLabel(completion)}
                  </span>
                </div>
                {productBlurb ? (
                  <p className="mt-2 text-sm text-slate-600 print:hidden">
                    {productBlurb}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500 print:hidden">
                    No description yet.
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
                title="Description"
                text={profile.description || product.description}
              />
              <PrintProse
                title={vocab.valueProposition.Singular}
                text={profile.valueProposition || product.valueProposition}
              />
              <PrintProse title="Website" text={product.websiteUrl} />
              <PrintList title="Problems solved" items={profile.problemsSolved} />
              <PrintList title="Capabilities" items={profile.capabilities} />
              <PrintList
                title="Differentiators"
                items={profile.differentiators}
              />
              <PrintList
                title="Primary use cases"
                items={profile.primaryUseCases}
              />
              <PrintList
                title={`Relevant ${vocab.buyer.singular} functions`}
                items={profile.relevantBuyerFunctions}
              />
              <PrintList
                title="Relevant industries"
                items={profile.relevantIndustries}
              />
              <PrintList
                title="Business outcomes"
                items={profile.businessOutcomes}
              />
              <PrintProse
                title="Pricing / AOV context"
                text={profile.pricingAovContext}
              />
              <PrintProse
                title="Deployment context"
                text={profile.deploymentContext}
              />
              <PrintList title="Proof points" items={profile.proofPoints} />
              <PrintList
                title={`${vocab.customer.Singular} evidence`}
                items={profile.customerEvidence}
              />
              <PrintList title="Terminology" items={profile.terminology} />
            </div>

            <div
              className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
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

        {/* 2. Personas */}
        <div data-print-hide>
        <Panel
          title={`2. ${vocab.persona.Plural}`}
          description={`Saved ${vocab.buyer.plural} and suggested roles still available to build.`}
        >
          <div className="space-y-5">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Saved {vocab.persona.plural}
              </h4>
              {nearDuplicatePersonaPairs.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {nearDuplicatePersonaPairs.map((pair) => (
                    <p
                      key={`${pair.personaA.id}-${pair.personaB.id}`}
                      className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                    >
                      {formatNearDuplicateWarning(pair)}
                    </p>
                  ))}
                </div>
              ) : null}
              {personas.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  None saved yet. Build a suggested role or add a custom {vocab.persona.singular}.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {personas.map((persona) => {
                    const summary = summarizePersonaCriteriaCounts(
                      personaCriteriaMap.get(persona.id) ?? [],
                    );
                    const titles = formatLikelyTitles(persona.targetTitles);
                    return (
                      <li
                        key={persona.id}
                        className="flex flex-wrap items-start justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            {persona.name}
                          </p>
                          {titles ? (
                            <p className="mt-0.5 text-sm text-slate-500">
                              {titles}
                            </p>
                          ) : null}
                          <p
                            className={
                              summary.needsReview > 0
                                ? "mt-1 text-xs font-medium text-amber-800"
                                : "mt-1 text-xs text-slate-500"
                            }
                          >
                            {formatPersonaCriteriaSummary(summary)}
                          </p>
                          {summary.needsReview > 0 ? (
                            <p className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950">
                              {summary.needsReview} need
                              {summary.needsReview === 1 ? "s" : ""} review —
                              not scored until classified on Edit.
                            </p>
                          ) : null}
                        </div>
                        <ActionLink
                          href={`/setup/${product.id}/personas/manage/${persona.id}`}
                        >
                          Edit
                        </ActionLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Suggested roles not yet built
              </h4>
              {unbuiltSuggestions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  {suggestedRoles.length === 0
                    ? `No suggested roles from ${vocab.product.singular} research yet.`
                    : "All suggested roles have been built."}
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {unbuiltSuggestions.map((role) => (
                    <li
                      key={role.suggestionKey}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{role.name}</p>
                        {role.whyThisRoleMatters ? (
                          <p className="mt-0.5 text-sm text-slate-500">
                            {truncateText(role.whyThisRoleMatters, 120)}
                          </p>
                        ) : null}
                      </div>
                      <ActionLink
                        href={`/setup/${product.id}/personas/new?role=${encodeURIComponent(role.suggestionKey)}`}
                        primary
                      >
                        Build {vocab.persona.Singular}
                      </ActionLink>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <ActionLink href={`/setup/${product.id}/personas/new`}>
                  Add custom {vocab.persona.singular}
                </ActionLink>
              </div>
            </div>
          </div>
        </Panel>

        {/* 3. ICP */}
        <Panel
          title={`3. ${vocab.icp.singular}`}
          description={`${vocab.idealCustomer.Singular} profile for company-level fit.`}
        >
          {primaryIcp ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{primaryIcp.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {truncateText(
                    primaryIcp.definition || primaryIcp.description,
                    140,
                  ) || "No definition yet."}
                </p>
                <p className="mt-1 text-xs text-slate-500">
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
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-4">
              <p className="text-sm font-semibold text-amber-950">
                {vocab.icp.singular} not set up yet
              </p>
              <p className="mt-1 text-sm text-amber-900/80">
                Add {vocab.idealCustomer.aSingular} profile so company-level scoring has a
                target. You can do this before or after building {vocab.persona.plural}.
              </p>
              <div className="mt-3">
                <ActionLink href={`/setup/${product.id}/icps/new`} primary>
                  Add {vocab.icp.singular}
                </ActionLink>
              </div>
            </div>
          )}
        </Panel>
        </div>
      </div>
    </div>
  );
}
