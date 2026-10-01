import { AppActionLink } from "@/components/AppButton";
import { ApplicationContactsPageHeader } from "@/components/ApplicationOutreachSections";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { EmptyState, PrimaryButton } from "@/components/ui";
import { workspaceCampaignHref, workspaceContactEditHref } from "@/lib/application/workspace-links";
import { outreachConfig, vocab } from "@/lib/product-config";
import { contactDisplayName } from "@/lib/utils";

export type ContactsDirectoryApplication = {
  campaignId: string;
  campaignName: string;
  roleName: string | null;
};

export type ContactsDirectoryRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  archivedAt: Date | string | null;
  ownerUserId: string;
  applications: ContactsDirectoryApplication[];
};

export function contactsQuery(params: {
  campaignId?: string;
  search?: string;
  includeArchived?: boolean;
}): string {
  const q = new URLSearchParams();
  if (params.campaignId) q.set("campaignId", params.campaignId);
  if (params.search) q.set("q", params.search);
  if (params.includeArchived) q.set("archived", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}

const COLUMNS = [
  "Name",
  "Title",
  "Company",
  outreachConfig.labels.assignRole,
  outreachConfig.labels.fieldEmail,
  vocab.campaign.Singular,
  outreachConfig.labels.editContact,
] as const;

export function ContactsDirectory({
  contacts,
  campaigns,
  roles,
  campaignId,
  search,
  includeArchived,
  currentUserId,
  canEdit,
}: {
  contacts: ContactsDirectoryRow[];
  campaigns: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string; campaignId: string | null }>;
  campaignId?: string;
  search?: string;
  includeArchived: boolean;
  currentUserId: string;
  canEdit: boolean;
}) {
  const filteredCampaignId = campaignId?.trim() || undefined;
  const visibleRoles = filteredCampaignId
    ? roles.filter((role) => role.campaignId === filteredCampaignId)
    : roles;
  return (
    <div data-testid="contacts-directory">
      <ApplicationContactsPageHeader
        campaignId={filteredCampaignId ?? ""}
        roles={visibleRoles}
        applications={filteredCampaignId ? undefined : campaigns}
        canEdit={canEdit}
        title={vocab.contact.Plural}
        description={`${vocab.contact.Plural} across ${vocab.campaign.plural}. Each row links to its ${vocab.campaign.singular}.`}
        backHref={
          filteredCampaignId ? workspaceCampaignHref(filteredCampaignId) : null
        }
        trailingActions={
          <ShowArchivedToggle
            href={
              includeArchived
                ? `/contacts${contactsQuery({ campaignId: filteredCampaignId, search })}`
                : `/contacts${contactsQuery({
                    campaignId: filteredCampaignId,
                    search,
                    includeArchived: true,
                  })}`
            }
            includeArchived={includeArchived}
            label={vocab.contact.plural}
          />
        }
      />

      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-edge bg-surface p-4"
        data-testid="contacts-filters"
      >
        <label className="block text-sm">
          <span className="font-medium text-ink">{vocab.campaign.Singular}</span>
          <select
            name="campaignId"
            defaultValue={filteredCampaignId ?? ""}
            className="mt-1 block min-w-48 rounded-md border border-edge-strong px-3 py-2 text-sm"
          >
            <option value="">All {vocab.campaign.plural}</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-64 flex-1 text-sm">
          <span className="font-medium text-ink">Search</span>
          <input
            name="q"
            defaultValue={search ?? ""}
            placeholder="Name, email, company, title"
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </label>
        <PrimaryButton type="submit">Apply</PrimaryButton>
        {includeArchived ? (
          <input type="hidden" name="archived" value="1" />
        ) : null}
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          title={`No ${vocab.contact.plural} found`}
          description={
            search || filteredCampaignId
              ? `Try clearing filters or adding ${vocab.contact.aSingular} to ${vocab.campaign.aSingular}.`
              : `No ${vocab.contact.plural} in this organization yet.`
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge bg-surface">
          <table className="min-w-full divide-y divide-edge text-sm" data-testid="contacts-table">
            <thead className="bg-canvas text-left text-subtle">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} className="px-4 py-3 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => (
                <tr key={contact.id} data-testid={`contact-row-${contact.id}`}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {contactDisplayName(contact.firstName, contact.lastName)}
                    {contact.archivedAt ? (
                      <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                        Archived
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">{contact.title ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{contact.company ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {contact.applications.length > 0 ? (
                      <ul className="space-y-1">
                        {contact.applications.map((entry) => (
                          <li key={entry.campaignId}>{entry.roleName ?? "—"}</li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{contact.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {contact.applications.length > 0 ? (
                      <ul className="space-y-1">
                        {contact.applications.map((entry) => (
                          <li key={entry.campaignId}>
                            <a
                              href={`/campaigns/${entry.campaignId}`}
                              className="font-medium text-ink underline-offset-2 hover:underline"
                            >
                              {entry.campaignName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      `Not in ${vocab.campaign.aSingular}.`
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {contact.ownerUserId === currentUserId ? (
                      <AppActionLink
                        href={workspaceContactEditHref(
                          contact.id,
                          contact.applications[0]?.campaignId,
                        )}
                        data-testid={`edit-contact-${contact.id}`}
                      >
                        {outreachConfig.labels.editContact}
                      </AppActionLink>
                    ) : null}
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
