import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppActionLink } from "@/components/AppButton";
import { ContactEditForm } from "@/components/ContactEditForm";
import { PageHeader, TenantMissing } from "@/components/ui";
import { workspaceApplicationContactsHref } from "@/lib/application/workspace-links";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { applicationPageTitle, outreachConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { contactDisplayName } from "@/lib/utils";

type PageProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ campaignId?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { contactId } = await params;
  return {
    title: {
      absolute: applicationPageTitle(outreachConfig.labels.editContactTitle, contactId),
    },
  };
}

export default async function ContactEditPage({ params, searchParams }: PageProps) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return <TenantMissing />;
  const { contactId } = await params;
  const query = await searchParams;
  let contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
    campaignContacts: Array<{
      campaignId: string;
      chosenPersonaId: string | null;
      linkedInProfileText: string | null;
      campaign: { id: string; name: string; ownerUserId: string };
    }>;
  } | null;
  try {
    contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId: organization.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        email: true,
        linkedinUrl: true,
        campaignContacts: {
          select: {
            campaignId: true,
            chosenPersonaId: true,
            linkedInProfileText: true,
            campaign: { select: { id: true, name: true, ownerUserId: true } },
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }
  if (!contact) notFound();

  const requestedCampaignId = query.campaignId?.trim() || null;
  const memberships = contact.campaignContacts;
  const selected =
    memberships.find((row) => row.campaignId === requestedCampaignId) ??
    (memberships.length === 1 ? memberships[0] : null);
  if (requestedCampaignId && !selected) notFound();
  if (selected && selected.campaign.ownerUserId !== user.id) {
    notFound();
  }

  const roles = selected
    ? await prisma.persona.findMany({
        where: {
          organizationId: organization.id,
          campaignId: selected.campaignId,
          OR: [
            { archivedAt: null },
            ...(selected.chosenPersonaId
              ? [{ id: selected.chosenPersonaId }]
              : []),
          ],
        },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const returnTo = selected
    ? workspaceApplicationContactsHref(selected.campaignId)
    : "/contacts";
  const name = contactDisplayName(contact.firstName, contact.lastName);

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={outreachConfig.labels.editContactTitle}
        description={name}
        actions={
          <AppActionLink href={returnTo}>
            Back
          </AppActionLink>
        }
      />
      <ContactEditForm
        values={{
          contactId: contact.id,
          campaignId: selected?.campaignId ?? null,
          returnTo,
          firstName: contact.firstName ?? "",
          lastName: contact.lastName ?? "",
          title: contact.title ?? "",
          email: contact.email ?? "",
          linkedinUrl: contact.linkedinUrl ?? "",
          personaId: selected?.chosenPersonaId ?? null,
          pastedText: selected?.linkedInProfileText ?? "",
          roles,
        }}
      />
    </main>
  );
}
