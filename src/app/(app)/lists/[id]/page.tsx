import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveContactListAction,
  deleteContactListAction,
  unarchiveContactListAction,
} from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { CampaignListWorkflowButtons } from "@/components/CampaignListWorkflowButtons";
import { ListCompanyResearchView } from "@/components/ListCompanyResearchView";
import { ResearchRunPanel } from "@/components/ResearchRunPanel";
import { UnarchiveForm } from "@/components/UnarchiveForm";
import { EmptyState, PageHeader, Panel, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { isResearchAiConfigured } from "@/lib/ai/config";
import { loadResearchBillingContext } from "@/lib/billing/research-billing-context";
import { getMembershipForCurrentUser } from "@/lib/org/authz";
import {
  isContactListResearchComplete,
  listDetailHref,
  listIndexHref,
  listScoreHref,
  parseCampaignId,
} from "@/lib/lists/campaign-query";
import {
  getCampaignForListWorkflow,
  getContactList,
  listIcps,
  listPersonas,
  listProducts,
  listScoringRunsForList,
} from "@/lib/tenant/data";
import {
  getCompaniesNeedingResearchForContactList,
  getContactListCompanyGroups,
} from "@/lib/tenant/companies";
import {
  getActiveResearchRunForContactList,
  getLatestResearchRunForContactList,
} from "@/lib/research/runs";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import {
  decideListDelete,
  getListLifecycleImpact,
  listArchiveConfirmBody,
  listDeleteConfirmBody,
} from "@/lib/tenant/list-delete";
import { listActiveNormalizedEmails } from "@/lib/suppression/service";
import { getActiveResearchedCompanyUsage } from "@/lib/usage/quota";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { features, vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; campaign?: string }>;
};

export default async function ListDetailPage({
  params,
  searchParams,
}: PageProps) {
  requireGatedPage("lists");
  const organization = await getCurrentOrganization();
  const { id } = await params;
  const query = await searchParams;
  const page = Number.parseInt(query.page ?? "1", 10) || 1;
  const campaignId = parseCampaignId(query.campaign);

  if (!organization) {
    return (
      <div>
        <PageHeader title={vocab.list.Singular} description={`${vocab.list.Singular} detail`} />
        <TenantMissing />
      </div>
    );
  }

  let list;
  try {
    list = await getContactList(id);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const membership = await getMembershipForCurrentUser(organization.id);
  const readOnly = list.ownerUserId !== membership.user.id;
  const [
    companyGroups,
    researchPlan,
    scoringRuns,
    products,
    icps,
    personas,
    researchAllowance,
    researchBilling,
    activeResearchRun,
    latestResearchRun,
    campaign,
  ] = await Promise.all([
    getContactListCompanyGroups(id, {
      page,
      pageSize: 25,
      associateMissing: !readOnly,
    }),
    getCompaniesNeedingResearchForContactList(id, {
      associateMissing: !readOnly,
    }),
    listScoringRunsForList(id),
    listProducts(),
    listIcps(),
    listPersonas(),
    getActiveResearchedCompanyUsage({
      organizationId: organization.id,
      userId: membership.user.id,
    }),
    loadResearchBillingContext(organization.id),
    getActiveResearchRunForContactList(id, organization.id),
    getLatestResearchRunForContactList(id, organization.id),
    campaignId ? getCampaignForListWorkflow(campaignId) : Promise.resolve(null),
  ]);

  const allEmails = companyGroups.groups.flatMap((group) =>
    group.contacts.map((contact) => contact.email),
  );
  const [impact, suppressedEmails] = await Promise.all([
    getListLifecycleImpact(organization.id, id),
    listActiveNormalizedEmails(organization.id, allEmails),
  ]);
  const deleteDecision = decideListDelete(impact);
  const listArchived = list.archivedAt != null;
  const researchComplete =
    isContactListResearchComplete(researchPlan) && !activeResearchRun;
  const scoreHref = listScoreHref(id, campaign?.id);
  const listsHref = listIndexHref({ campaignId: campaign?.id });

  const totalPages = Math.max(
    1,
    Math.ceil(companyGroups.totalCompanies / companyGroups.pageSize),
  );

  const readyProducts = products.filter((product) => {
    const hasIcp = icps.some((icp) => icp.productId === product.id);
    const hasPersona = personas.some((persona) => persona.productId === product.id);
    return hasIcp && hasPersona;
  });

  return (
    <div>
      <PageHeader
        title={list.name}
        description={`${list.sourceType}${
          list.originalFilename ? ` · ${list.originalFilename}` : ""
        } · ${formatNumber(list.totalContacts)} ${vocab.contact.plural} · imported ${formatDate(list.createdAt)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {readOnly ? (
              <span className="self-center text-sm font-medium text-slate-600">
                Read-only · owned by{" "}
                {list.owner.name?.trim() || list.owner.email}
              </span>
            ) : listArchived ? (
              <UnarchiveForm
                action={unarchiveContactListAction}
                id={list.id}
                label={`Unarchive ${vocab.list.singular}`}
              />
            ) : (
              <>
                {campaign ? (
                  <CampaignListWorkflowButtons
                    listId={id}
                    campaignId={campaign.id}
                    campaignName={campaign.name}
                    researchComplete={researchComplete}
                    allowResearch={features.listBulkValidation}
                    allowScore={features.listBulkScoring}
                  />
                ) : features.listBulkScoring ? (
                  <Link
                    href={scoreHref}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Score {vocab.list.Singular}
                  </Link>
                ) : null}
                <ConfirmDeleteForm
                  action={archiveContactListAction}
                  hiddenFields={{ id: list.id }}
                  triggerLabel={`Archive ${vocab.list.singular}`}
                  confirmTitle={`Archive ${vocab.list.singular} "${list.name}"?`}
                  confirmBody={listArchiveConfirmBody()}
                  confirmButtonLabel={`Archive ${vocab.list.singular}`}
                  tone="warning"
                  pendingLabel="Archiving…"
                />
              </>
            )}
            {!readOnly ? (
              <ConfirmDeleteForm
                action={deleteContactListAction}
                hiddenFields={{ id: list.id, redirectTo: listsHref }}
                triggerLabel={`Delete ${vocab.list.singular}`}
                confirmTitle={`Delete ${vocab.list.singular} "${list.name}"?`}
                confirmBody={listDeleteConfirmBody(deleteDecision)}
                confirmButtonLabel={
                  deleteDecision.mode === "delete"
                    ? `Delete ${vocab.list.singular}`
                    : deleteDecision.mode === "archive"
                      ? `Archive ${vocab.list.singular}`
                      : "Cannot delete"
                }
                onSuccessNavigate={listsHref}
              />
            ) : null}
            <Link
              href={listsHref}
              className={SECONDARY_BUTTON_CLASS}
            >
              Back to {vocab.list.plural}
            </Link>
          </div>
        }
      />

      {listArchived ? (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This {vocab.list.singular} is archived and read-only. Unarchive it to score, research, or
          attach it to {vocab.campaign.aSingular}.
        </div>
      ) : null}

      <div id="company-research" className="mb-6">
        <Panel
          title="Company Research"
          description={`Research runs once per unique company on this ${vocab.list.singular}. Results appear below grouped by company — qualification scoring stays on the score report.`}
        >
          {readOnly ? (
            <p className="text-sm text-slate-600">
              Manager access is read-only. Research can only be started by the
              {vocab.list.singular} owner.
            </p>
          ) : features.listBulkValidation ? (
            <ResearchRunPanel
            contactListId={id}
            researchAiConfigured={isResearchAiConfigured()}
            allowance={researchAllowance}
            billing={researchBilling}
            initialActiveRun={activeResearchRun}
            initialLastRun={
              activeResearchRun ? null : latestResearchRun
            }
            plan={{
              totalContacts: researchPlan.totalContacts,
              uniqueCompanies: researchPlan.uniqueCompanies,
              alreadyResearched: researchPlan.alreadyResearched,
              needingResearch: researchPlan.needingResearch,
              noUsableResearch: researchPlan.noUsableResearch,
              statusCounts: researchPlan.statusCounts,
            }}
            />
          ) : (
            <p className="text-sm text-slate-600">
              Company research for this {vocab.list.singular} is not available.
            </p>
          )}
        </Panel>
      </div>

      <div className="mb-6">
        <Panel
          title="Scoring History"
          description={`The same ${vocab.list.singular} can be scored multiple times against different ${vocab.product.Singular} / ${vocab.icp.singular} / ${vocab.persona.Singular} combinations.`}
        >
          {scoringRuns.length === 0 ? (
            <p className="text-sm text-slate-600">
              No scoring runs yet.{" "}
              {readOnly
                ? `Only the ${vocab.list.singular} owner can create a scoring run.`
                : listArchived
                ? `Unarchive this ${vocab.list.singular} to score it.`
                : features.listBulkScoring && readyProducts.length > 0 ? (
                <Link href={scoreHref} className="underline">
                  Score this {vocab.list.singular}
                </Link>
              ) : (
                `Add a ${vocab.product.Singular} with ${vocab.icp.aSingular} and ${vocab.persona.Singular} in Setup first.`
              )}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {scoringRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">
                      {run.label?.trim()
                        ? run.label
                        : `${formatDate(run.createdAt)} · ${run.product.name}`}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {run.label?.trim()
                        ? `${formatDate(run.createdAt)} · ${run.product.name} · `
                        : null}
                      {vocab.icp.singular}: {run.icp.name} · {vocab.persona.Singular}:{" "}
                      {run.persona?.name ?? `All ${vocab.persona.plural}`} ·{" "}
                      {formatNumber(run.totalContacts)} {vocab.contact.plural} · {run.status}
                    </p>
                  </div>
                  <Link
                    href={`/scoring/${run.id}${campaign?.id ? `?campaign=${campaign.id}` : ""}`}
                    className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                  >
                    View Report
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {companyGroups.totalContacts === 0 ? (
        <EmptyState
          title={`No ${vocab.contact.plural} in this ${vocab.list.singular}`}
          description={`This ${vocab.list.singular} exists but has no ${vocab.contact.singular} records.`}
        />
      ) : (
        <>
          <ListCompanyResearchView
            groups={companyGroups.groups}
            contactListId={id}
            showIndustry={companyGroups.showIndustry}
            listArchived={listArchived}
            readOnly={readOnly}
            suppressedEmails={suppressedEmails}
          />

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>
                Companies {companyGroups.page} of {totalPages} ·{" "}
                {formatNumber(companyGroups.totalContacts)} {vocab.contact.plural} total
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={listDetailHref(id, {
                      campaignId: campaign?.id,
                      page: page - 1,
                    })}
                    className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={listDetailHref(id, {
                      campaignId: campaign?.id,
                      page: page + 1,
                    })}
                    className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
