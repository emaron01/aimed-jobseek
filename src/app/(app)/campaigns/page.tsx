import Link from "next/link";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { SharedCampaignActions } from "@/components/SharedCampaignActions";
import { EmptyState, PageHeader, PRIMARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  CAMPAIGN_LIST_VIEW_MY,
  CAMPAIGN_LIST_VIEW_SHARED_ALL,
  canViewAllCampaigns,
  parseCampaignListViewMode,
  shouldUseSharedCampaign,
} from "@/lib/campaign/visibility";
import { listCampaigns } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { cn, formatDate } from "@/lib/utils";
import { getHomeWorkflow } from "@/lib/workflow/home";
import { polishCopy, vocab } from "@/lib/product-config";

export const metadata = { title: vocab.campaign.Plural };

function viewHref(
  view: string,
  includeArchived: boolean,
): string {
  const params = new URLSearchParams();
  if (view !== CAMPAIGN_LIST_VIEW_MY) params.set("view", view);
  if (includeArchived) params.set("archived", "1");
  const qs = params.toString();
  return qs ? `/campaigns?${qs}` : "/campaigns";
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; view?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const includeArchived = query.archived === "1";
  const view = parseCampaignListViewMode(query.view);

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={vocab.campaign.Plural}
          description={`${vocab.campaign.Plural} belonging to the active organization.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const [user, membershipCtx] = await Promise.all([
    requireCurrentUser(),
    getMembershipForCurrentUser(organization.id),
  ]);
  const canManageCampaigns = canViewAllCampaigns(
    membershipCtx.membership.role,
  );
  const effectiveView = view;

  const [campaigns, workflow] = await Promise.all([
    listCampaigns({
      includeArchived,
      view: effectiveView,
      userId: user.id,
    }),
    getHomeWorkflow(organization.id, {
      userId: user.id,
      canViewAllRepWork: canManageCampaigns,
    }),
  ]);

  const canCreate = workflow.campaignProducts.length > 0;

  return (
    <div>
      <PageHeader
        title={vocab.campaign.Plural}
        description={polishCopy.applicationsHelp}
        actions={
          <>
            <ShowArchivedToggle
              href={viewHref(effectiveView, !includeArchived)}
              includeArchived={includeArchived}
              label={vocab.campaign.plural}
            />
            {canCreate ? (
              <Link
                href="/campaigns/new"
                className={PRIMARY_BUTTON_CLASS}
              >
                New {vocab.campaign.singular}
              </Link>
            ) : (
              <span
                title={`Add ${vocab.product.aSingular} first`}
                className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-edge-strong px-3.5 py-2 text-sm font-medium text-subtle"
              >
                New {vocab.campaign.singular}
              </span>
            )}
          </>
        }
      />

      <div
        className="mb-4 flex flex-wrap gap-2"
        data-testid="campaign-view-toggle"
      >
        {(
          [
            { id: CAMPAIGN_LIST_VIEW_MY, label: `My ${vocab.campaign.Plural}` },
            {
              id: CAMPAIGN_LIST_VIEW_SHARED_ALL,
              label: canManageCampaigns
                ? `All org ${vocab.campaign.plural}`
                : `All ${vocab.campaign.Plural}`,
            },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.id}
            href={viewHref(tab.id, includeArchived)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              effectiveView === tab.id
                ? "bg-ink text-on-ink"
                : "bg-canvas text-ink hover:bg-canvas",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <DeleteSuccessNotice />

      {campaigns.length === 0 ? (
        <EmptyState
          title={
            effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL
              ? canManageCampaigns
                ? `No ${vocab.campaign.plural} in this organization`
                : `No shared ${vocab.campaign.plural}`
              : `No ${vocab.campaign.plural} yet`
          }
          description={
            effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL
              ? canManageCampaigns
                ? `Every ${vocab.campaign.singular} owned by a member of this organization appears here.`
                : `Shared ${vocab.campaign.plural} appear here for the whole organization. Ask an admin to share ${vocab.campaign.aSingular}, or create your own.`
              : `${vocab.campaign.ASingular} is a job you are pursuing. Paste a posting, identify the ${vocab.persona.plural}, and write ${vocab.outreach.singular}.`
          }
          actions={
            canCreate && effectiveView === CAMPAIGN_LIST_VIEW_MY ? (
              <Link
                href="/campaigns/new"
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                New {vocab.campaign.singular}
              </Link>
            ) : !canCreate && effectiveView === CAMPAIGN_LIST_VIEW_MY ? (
              <Link
                href="/products/new"
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                New {vocab.product.singular}
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge bg-surface">
          <table className="min-w-full divide-y divide-edge text-sm">
            <thead className="bg-canvas text-left text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">{vocab.campaign.Singular}</th>
                {effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL &&
                canManageCampaigns ? (
                  <th className="px-4 py-3 font-medium">Owner</th>
                ) : null}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">{vocab.product.Singular}</th>
                <th className="px-4 py-3 font-medium">{vocab.icp.singular}</th>
                <th className="px-4 py-3 font-medium">{vocab.contact.Plural}</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => {
                const useShared =
                  !canManageCampaigns &&
                  shouldUseSharedCampaign({
                    userId: user.id,
                    campaign,
                  });
                return (
                  <tr key={campaign.id}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {useShared &&
                      effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL ? (
                        <span>{campaign.name}</span>
                      ) : (
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {campaign.name}
                        </Link>
                      )}
                      {campaign.visibility === "SHARED" ? (
                        <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-primary">
                          Shared
                        </span>
                      ) : null}
                      {campaign.archivedAt ? (
                        <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                          Archived
                        </span>
                      ) : null}
                    </td>
                    {effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL &&
                    canManageCampaigns ? (
                      <td className="px-4 py-3 text-muted">
                        {campaign.owner?.name ||
                          campaign.owner?.email ||
                          `Legacy ${vocab.campaign.singular}`}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-muted">
                      {campaign.status}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {campaign.product.name}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {campaign.icp.name}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {campaign._count.contacts}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(campaign.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {useShared &&
                      effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL &&
                      !campaign.archivedAt ? (
                        <SharedCampaignActions campaignId={campaign.id} />
                      ) : useShared ? null : (
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="text-sm font-medium text-ink underline-offset-2 hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
