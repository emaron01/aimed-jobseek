import type { Metadata } from "next";
import { AppActionLink } from "@/components/AppButton";
import { ApplicationContactsPageHeader } from "@/components/ApplicationOutreachSections";
import { EmptyState, TenantMissing } from "@/components/ui";
import { listApplicationContacts } from "@/lib/application/contacts";
import { requireApplicationWorkspace } from "@/lib/application/workspace-access";
import {
  workspaceCampaignHref,
  workspaceContactEditHref,
} from "@/lib/application/workspace-links";
import { applicationPageTitle, brand, outreachConfig, vocab } from "@/lib/product-config";
import { prisma } from "@/lib/prisma";
import { contactDisplayName } from "@/lib/utils";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const access = await requireApplicationWorkspace(id);
  if (access.kind === "missing-tenant") {
    return { title: brand.defaultPageTitle };
  }
  return {
    title: {
      absolute: applicationPageTitle(vocab.contact.Plural, access.campaignName),
    },
  };
}

export default async function ApplicationContactsPage({ params }: PageProps) {
  const { id } = await params;
  const access = await requireApplicationWorkspace(id);
  if (access.kind === "missing-tenant") return <TenantMissing />;
  const contacts = await listApplicationContacts({
    organizationId: access.organizationId,
    campaignId: access.campaignId,
  });
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: access.organizationId,
      campaignId: access.campaignId,
      archivedAt: null,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6" data-testid="application-contacts-page">
      <ApplicationContactsPageHeader
        campaignId={access.campaignId}
        roles={roles}
        canEdit={access.canEdit}
        title={vocab.contact.Plural}
        description={`${access.campaignName} · ${vocab.contact.Plural} on this ${vocab.campaign.singular}.`}
        backHref={workspaceCampaignHref(access.campaignId)}
      />
      {contacts.length === 0 ? (
        <EmptyState
          title={`No ${vocab.contact.plural} yet`}
          description={outreachConfig.labels.contactsHelp}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge bg-surface">
          <table className="min-w-full divide-y divide-edge text-sm">
            <thead className="bg-canvas text-left text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">{outreachConfig.labels.fieldEmail}</th>
                <th className="px-4 py-3 font-medium">{outreachConfig.labels.assignRole}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((row) => (
                <tr key={row.contactId} data-testid={`application-contact-${row.contactId}`}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {contactDisplayName(row.contact.firstName, row.contact.lastName)}
                  </td>
                  <td className="px-4 py-3 text-muted">{row.contact.title ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{row.contact.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {row.chosenPersona?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {access.canEdit ? (
                      <AppActionLink
                        href={workspaceContactEditHref(row.contactId, access.campaignId)}
                        data-testid={`edit-contact-${row.contactId}`}
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
    </main>
  );
}
