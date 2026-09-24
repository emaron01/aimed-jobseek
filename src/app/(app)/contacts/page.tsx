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
import { listContactLists, listContacts } from "@/lib/tenant/data";
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
    listId?: string;
    q?: string;
    archived?: string;
    unlisted?: string;
  }>;
};

function contactsQuery(params: {
  listId?: string;
  search?: string;
  includeArchived?: boolean;
  includeUnlisted?: boolean;
}): string {
  const q = new URLSearchParams();
  if (params.listId) q.set("listId", params.listId);
  if (params.search) q.set("q", params.search);
  if (params.includeArchived) q.set("archived", "1");
  if (params.includeUnlisted) q.set("unlisted", "1");
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

  const listId = query.listId?.trim() || undefined;
  const search = query.q?.trim() || undefined;
  const includeArchived = query.archived === "1";
  const includeUnlisted = query.unlisted === "1" || !query.listId;
  const membership = await getMembershipForCurrentUser(organization.id);
  const showOwners = canViewAllRepWork(membership.membership.role);

  const [contacts, lists] = await Promise.all([
    listContacts({
      listId,
      search,
      includeUnlisted,
      // Same toggle that reveals archived lists also reveals cascade-archived contacts.
      includeArchivedContacts: includeArchived,
    }),
    listContactLists({ includeArchived }),
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
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/contacts${contactsQuery({
                listId,
                search,
                includeArchived,
                includeUnlisted: !includeUnlisted,
              })}`}
              className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
            >
              {includeUnlisted ? "Hide unlisted" : "Show unlisted"}
            </a>
            <ShowArchivedToggle
              href={
                includeArchived
                  ? `/contacts${contactsQuery({
                      listId,
                      search,
                      includeUnlisted,
                    })}`
                  : `/contacts${contactsQuery({
                      listId,
                      search,
                      includeArchived: true,
                      includeUnlisted,
                    })}`
              }
              includeArchived={includeArchived}
              label={`${vocab.list.plural} and ${vocab.contact.plural}`}
            />
          </div>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{vocab.list.Singular}</span>
          <select
            name="listId"
            defaultValue={listId ?? ""}
            className="mt-1 block min-w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All {vocab.list.plural}</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
                {list.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-64 flex-1 text-sm">
          <span className="font-medium text-slate-700">Search</span>
          <input
            name="q"
            defaultValue={search ?? ""}
            placeholder="Name, email, company, title"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <PrimaryButton type="submit">Apply</PrimaryButton>
        {includeArchived ? (
          <input type="hidden" name="archived" value="1" />
        ) : null}
        {includeUnlisted ? (
          <input type="hidden" name="unlisted" value="1" />
        ) : null}
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          title={`No ${vocab.contact.plural} found`}
          description={
            search || listId
              ? `Try clearing filters or importing another ${vocab.list.singular}.`
              : includeUnlisted
                ? `No ${vocab.contact.plural} in this organization yet.`
                : `${vocab.contact.Plural} will appear here after you import ${vocab.list.aSingular}. Use Show unlisted for people with no ${vocab.list.singular} membership.`
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
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
                <th className="px-4 py-3 font-medium">{vocab.list.Singular}</th>
                <th className="px-4 py-3 font-medium">{vocab.campaign.Plural}</th>
                <th className="px-4 py-3 font-medium">Suppression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => {
                const usable = isContactEmailUsable(contact);
                const listNames = contact.memberships
                  .map((membership) =>
                    membership.contactList.archivedAt
                      ? `${membership.contactList.name} (archived)`
                      : membership.contactList.name,
                  )
                  .filter(Boolean);
                const campaignLines =
                  campaignSummaries.get(contact.id) ?? [];
                const emailTitle =
                  usable && contact.email
                    ? contact.email
                    : CONTACT_UNUSABLE_REASON;
                return (
                  <tr key={contact.id}>
                    <td
                      className="px-4 py-3 font-medium text-slate-900"
                      title={emailTitle}
                    >
                      {contactDisplayName(
                        contact.firstName,
                        contact.lastName,
                      )}
                      {contact.archivedAt ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Archived
                        </span>
                      ) : null}
                    </td>
                    {showOwners ? (
                      <td className="px-4 py-3 text-slate-600">
                        {contact.owner.name?.trim() || contact.owner.email}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-slate-600">
                      {contact.title ?? "—"}
                      {contact.previousTitle ? (
                        <span
                          className="mt-1 block text-xs text-slate-400"
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
                    <td className="px-4 py-3 text-slate-600">
                      {contact.company ?? "—"}
                    </td>
                    {showIndustryColumn ? (
                      <td className="px-4 py-3 text-slate-600">
                        {contact.industry?.trim() ? contact.industry : "—"}
                      </td>
                    ) : null}
                    {showEmployeesColumn ? (
                      <td className="px-4 py-3 text-slate-600">
                        {formatNumber(contact.employeeCount)}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-slate-600">
                      {listNames.length > 0 ? listNames.join(", ") : "Unlisted"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {campaignLines.length > 0 ? (
                        <ul className="space-y-1">
                          {campaignLines.map((entry) => (
                            <li key={entry.campaignId}>
                              <a
                                href={`/campaigns/${entry.campaignId}`}
                                className="font-medium text-slate-800 underline-offset-2 hover:underline"
                              >
                                {entry.campaignName}
                              </a>
                              <span className="block text-xs text-slate-500">
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
                        <span className="text-xs text-slate-400">—</span>
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
