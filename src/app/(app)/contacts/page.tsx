import { ContactsDirectory } from "@/components/ContactsDirectory";
import { PageHeader, TenantMissing } from "@/components/ui";
import { loadContactCampaignSummaries } from "@/lib/contact/contacts-campaign-data";
import { listCampaigns, listContacts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";

type PageProps = {
  searchParams: Promise<{
    campaignId?: string;
    application?: string;
    q?: string;
    archived?: string;
  }>;
};

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

  const campaignId =
    query.campaignId?.trim() || query.application?.trim() || undefined;
  const search = query.q?.trim() || undefined;
  const includeArchived = query.archived === "1";
  const membership = await getMembershipForCurrentUser(organization.id);

  const [contacts, campaigns] = await Promise.all([
    listContacts({
      search,
      campaignId,
      includeUnlisted: true,
      includeArchivedContacts: includeArchived,
    }),
    listCampaigns(),
  ]);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [campaignSummaries, roles] = await Promise.all([
    loadContactCampaignSummaries(contacts.map((contact) => contact.id)),
    prisma.persona.findMany({
      where: {
        organizationId: organization.id,
        archivedAt: null,
        campaignId: campaignId ? campaignId : { in: campaignIds },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, campaignId: true },
    }),
  ]);

  return (
    <ContactsDirectory
      contacts={contacts.map((contact) => ({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
        company: contact.company,
        email: contact.email,
        archivedAt: contact.archivedAt,
        ownerUserId: contact.ownerUserId,
        applications: (campaignSummaries.get(contact.id) ?? []).map((entry) => ({
          campaignId: entry.campaignId,
          campaignName: entry.campaignName,
          roleName: entry.roleName,
        })),
      }))}
      campaigns={campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
      }))}
      roles={roles}
      campaignId={campaignId}
      search={search}
      includeArchived={includeArchived}
      currentUserId={membership.user.id}
      canEdit
    />
  );
}
