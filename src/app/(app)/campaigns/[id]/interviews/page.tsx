import { ApplicationWorkspace } from "@/components/ApplicationWorkspace";
import { TenantMissing } from "@/components/ui";
import { requireApplicationWorkspace } from "@/lib/application/workspace-access";

export default async function ApplicationInterviewsPage({
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
      focus="interviews"
    />
  );
}
