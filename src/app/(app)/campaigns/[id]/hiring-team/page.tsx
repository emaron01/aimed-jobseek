import type { Metadata } from "next";
import { ApplicationWorkspace } from "@/components/ApplicationWorkspace";
import { TenantMissing } from "@/components/ui";
import { generateApplicationPageMetadata } from "@/lib/application/page-metadata";
import { requireApplicationWorkspace } from "@/lib/application/workspace-access";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return generateApplicationPageMetadata(id, "hiring-team");
}

export default async function ApplicationHiringTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireApplicationWorkspace(id);
  if (access.kind === "missing-tenant") return <TenantMissing />;
  return (
    <ApplicationWorkspace
      campaignId={access.campaignId}
      organizationId={access.organizationId}
      canEdit={access.canEdit}
      focus="hiring-team"
    />
  );
}
