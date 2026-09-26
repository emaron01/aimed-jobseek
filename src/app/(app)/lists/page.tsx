import Link from "next/link";
import { AddContactsWizard } from "@/components/AddContactsWizard";
import { CompanyResearchAllowanceBanner } from "@/components/CompanyResearchAllowanceBanner";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import {EmptyState, PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { loadResearchBillingContext } from "@/lib/billing/research-billing-context";
import { getMembershipForCurrentUser } from "@/lib/org/authz";
import {
  campaignListStageHref,
  listDetailHref,
  listIndexHref,
  parseCampaignId,
} from "@/lib/lists/campaign-query";
import {
  getCampaignForListWorkflow,
  listContactLists,
} from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getActiveResearchedCompanyUsage } from "@/lib/usage/quota";
import { formatDate, formatNumber } from "@/lib/utils";
import { canViewAllRepWork } from "@/lib/work/ownership";
import { features, vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; campaign?: string }>;
}) {
  requireGatedPage("lists");
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const includeArchived = query.archived === "1";
  const campaignId = parseCampaignId(query.campaign);

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={vocab.list.Plural}
          description={`${vocab.contact.Singular} ${vocab.list.plural} for this organization.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const membership = await getMembershipForCurrentUser(organization.id);
  const [lists, researchAllowance, researchBilling, campaign] =
    await Promise.all([
      listContactLists({ includeArchived }),
      getActiveResearchedCompanyUsage({
        organizationId: organization.id,
        userId: membership.user.id,
      }),
      loadResearchBillingContext(organization.id),
      campaignId ? getCampaignForListWorkflow(campaignId) : Promise.resolve(null),
    ]);
  const workflowCampaignId = campaign?.id ?? null;
  const showOwners = canViewAllRepWork(membership.membership.role);

  return (
    <div>
      <PageHeader
        title={vocab.list.Plural}
        description={`Create ${vocab.list.plural} by pasting ${vocab.contact.plural} or uploading CSV/XLSX files. All data stays in this organization.`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {campaign ? (
              <AppActionLink
                href={campaignListStageHref(campaign.id)}
                variant="secondary"
              >
                Back to {campaign.name}
              </AppActionLink>
            ) : null}
            <ShowArchivedToggle
              href={listIndexHref({
                campaignId: workflowCampaignId,
                archived: !includeArchived,
              })}
              includeArchived={includeArchived}
              label={vocab.list.plural}
            />
            {features.listImport ? <AddContactsWizard /> : null}
          </div>
        }
      />

      <DeleteSuccessNotice />

      <div className="mb-6 space-y-3">
        <CompanyResearchAllowanceBanner
          usage={researchAllowance}
          billing={researchBilling}
        />
        <p className="rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm font-semibold text-ink">
          {campaign
            ? `Select ${vocab.list.aSingular} to research and score for ${campaign.name}. After scoring, save and return to the ${vocab.campaign.singular} to attach Ready to include ${vocab.contact.plural}.`
            : `Select ${vocab.list.aSingular} below to research and score your ${vocab.contact.plural} before adding them to ${vocab.campaign.aSingular}.`}
        </p>
      </div>
      {lists.length === 0 ? (
        <EmptyState
          title={`No ${vocab.list.plural} yet`}
          description={`Click Add ${vocab.contact.Plural} to paste spreadsheet data or upload a CSV/XLSX file.`}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge bg-surface">
          <table className="min-w-full divide-y divide-edge text-sm">
            <thead className="bg-canvas text-left text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">{vocab.list.Singular} Name</th>
                {showOwners ? (
                  <th className="px-4 py-3 font-medium">Owner</th>
                ) : null}
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Filename</th>
                <th className="px-4 py-3 font-medium">Total {vocab.contact.Plural}</th>
                <th className="px-4 py-3 font-medium">Imported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lists.map((list) => (
                <tr key={list.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={listDetailHref(list.id, {
                        campaignId: workflowCampaignId,
                      })}
                      className="hover:underline"
                    >
                      {list.name}
                    </Link>
                    {list.archivedAt ? (
                      <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                        Archived
                      </span>
                    ) : null}
                  </td>
                  {showOwners ? (
                    <td className="px-4 py-3 text-muted">
                      {list.owner.name?.trim() || list.owner.email}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-muted">{list.sourceType}</td>
                  <td className="px-4 py-3 text-muted">
                    {list.originalFilename ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatNumber(list.totalContacts)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(list.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
