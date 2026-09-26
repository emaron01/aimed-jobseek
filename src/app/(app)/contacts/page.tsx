import {
  EmptyState,
  PageHeader,
  PrimaryButton,
  TenantMissing,
} from "@/components/ui";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { SuppressContactForm } from "@/components/SuppressContactForm";
import {
  CONTACT_UNUSABLE_REASON,
  isContactEmailUsable,
} from "@/lib/contact/identity";
import { loadContactCampaignSummaries } from "@/lib/contact/contacts-campaign-data";
import { listCampaigns, listContacts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import { contactDisplayName, formatNumber } from "@/lib/utils";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canViewAllRepWork } from "@/lib/work/ownership";
import { vocab } from "@/lib/product-config";

type PageProps = {
  searchParams: Promise<{
    campaignId?: string;
    q?: string;
    archived?: string;
  }>;
};

function contactsQuery(params: {
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

export default async function ContactsPage({ searchParams }: PageProps) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title={vocab.contact.Plural}
          description={`${vocab.contact.Plural} belonging to the active organization.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const campaignId = query.campaignId?.trim() || undefined;
  const search = query.q?.trim() || undefined;
  const includeArchived = query.archived === "1";
  const membership = await getMembershipForCurrentUser(organization.id);
  const showOwners = canViewAllRepWork(membership.membership.role);

  const [contacts, campaigns] = await Promise.all([
    listContacts({
      search,
      campaignId,
      includeUnlisted: true,
      includeArchivedContacts: includeArchived,
    }),
    listCampaigns(),
  ]);
  const [suppressedEmails, campaignSummaries] = await Promise.all([
    listActiveNormalizedEmails(
      organization.id,
      contacts.map((contact) => contact.email),
    ),
    loadContactCampaignSummaries(contacts.map((contact) => contact.id)),
  ]);

  const showIndustryColumn = contacts.some((contact) =>
    Boolean(contact.industry?.trim()),
  );
  const showEmployeesColumn = contacts.some(
    (contact) => contact.employeeCount != null,
  );

  return (
    <div>
      <PageHeader
        title={vocab.contact.Plural}
        description={`${vocab.contact.Plural} across ${vocab.campaign.plural}. Each row links to its ${vocab.campaign.singular}.`}
        actions={
          <ShowArchivedToggle
            href={
              includeArchived
                ? `/contacts${contactsQuery({ campaignId, search })}`
                : `/contacts${contactsQuery({
                    campaignId,
                    search,
                    includeArchived: true,
                  })}`
            }
            includeArchived={includeArchived}
            label={vocab.contact.plural}
          />
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-edge bg-surface p-4">
        <label className="block text-sm">
          <span className="font-medium text-ink">
            {vocab.campaign.Singular}
          </span>
          <select
            name="campaignId"
            defaultValue={campaignId ?? ""}
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
            search || campaignId
              ? `Try clearing filters or adding ${vocab.contact.aSingular} to ${vocab.campaign.aSingular}.`
              : `No ${vocab.contact.plural} in this organization yet.`
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge bg-surface">
          <table className="min-w-full divide-y divide-edge text-sm">
            <thead className="bg-canvas text-left text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                {showOwners ? (
                  <th className="px-4 py-3 font-medium">Owner</th>
                ) : null}
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Company</th>
                {showIndustryColumn ? (
                  <th className="px-4 py-3 font-medium">Industry</th>
                ) : null}
                {showEmployeesColumn ? (
                  <th className="px-4 py-3 font-medium">Employees</th>
                ) : null}
                <th className="px-4 py-3 font-medium">{vocab.campaign.Plural}</th>
                <th className="px-4 py-3 font-medium">Suppression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => {
                const usable = isContactEmailUsable(contact);
                const campaignLines =
                  campaignSummaries.get(contact.id) ?? [];
                const emailTitle =
                  usable && contact.email
                    ? contact.email
                    : CONTACT_UNUSABLE_REASON;
                return (
                  <tr key={contact.id}>
                    <td
                      className="px-4 py-3 font-medium text-ink"
                      title={emailTitle}
                    >
                      {contactDisplayName(
                        contact.firstName,
                        contact.lastName,
                      )}
                      {contact.archivedAt ? (
                        <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                          Archived
                        </span>
                      ) : null}
                    </td>
                    {showOwners ? (
                      <td className="px-4 py-3 text-muted">
                        {contact.owner.name?.trim() || contact.owner.email}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-muted">
                      {contact.title ?? "—"}
                      {contact.previousTitle ? (
                        <span
                          className="mt-1 block text-xs text-subtle"
                          title={
                            contact.titleChangedAt
                              ? `Changed ${contact.titleChangedAt.toISOString()}`
                              : undefined
                          }
                        >
                          was {contact.previousTitle}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {contact.company ?? "—"}
                    </td>
                    {showIndustryColumn ? (
                      <td className="px-4 py-3 text-muted">
                        {contact.industry?.trim() ? contact.industry : "—"}
                      </td>
                    ) : null}
                    {showEmployeesColumn ? (
                      <td className="px-4 py-3 text-muted">
                        {formatNumber(contact.employeeCount)}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-muted">
                      {campaignLines.length > 0 ? (
                        <ul className="space-y-1">
                          {campaignLines.map((entry) => (
                            <li key={entry.campaignId}>
                              <a
                                href={`/campaigns/${entry.campaignId}`}
                                className="font-medium text-ink underline-offset-2 hover:underline"
                              >
                                {entry.campaignName}
                              </a>
                              <span className="block text-xs text-subtle">
                                {entry.line}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        `Not in ${vocab.campaign.aSingular}.`
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {usable &&
                      contact.ownerUserId === membership.user.id ? (
                        <SuppressContactForm
                          contactId={contact.id}
                          email={contact.email}
                          suppressed={contactMatchesSuppressionSet(
                            contact.email,
                            suppressedEmails,
                          )}
                        />
                      ) : (
                        <span className="text-xs text-subtle">—</span>
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
