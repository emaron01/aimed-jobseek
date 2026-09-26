import { ConsultationSection } from "@/components/ConsultationSection";
import { ApplicationWorkspaceChrome } from "@/components/ApplicationWorkspaceChrome";
import { TenantMissing } from "@/components/ui";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { requireApplicationWorkspace } from "@/lib/application/workspace-access";

export default async function ApplicationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireApplicationWorkspace(id);
  if (access.kind === "missing-tenant") return <TenantMissing />;
  const live = await getApplicationWorkspaceLive({
    organizationId: access.organizationId,
    campaignId: access.campaignId,
  });
  return (
    <ApplicationWorkspaceChrome
      campaignId={access.campaignId}
      harper={
        <ConsultationSection
          campaignId={access.campaignId}
          organizationId={access.organizationId}
          canEdit={access.canEdit}
          layout="dock"
          jobs={live.jobs}
        />
      }
    >
      {children}
    </ApplicationWorkspaceChrome>
  );
}
