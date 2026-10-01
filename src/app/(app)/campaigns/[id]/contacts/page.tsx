import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TenantMissing } from "@/components/ui";
import { requireApplicationWorkspace } from "@/lib/application/workspace-access";
import { workspaceApplicationContactsHref } from "@/lib/application/workspace-links";
import { applicationPageTitle, brand, vocab } from "@/lib/product-config";

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
  redirect(workspaceApplicationContactsHref(access.campaignId));
}
