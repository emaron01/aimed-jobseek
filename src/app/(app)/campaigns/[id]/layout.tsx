import { ApplicationWorkspaceChrome } from "@/components/ApplicationWorkspaceChrome";
import { TenantMissing } from "@/components/ui";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { getApplicationTracker } from "@/lib/application/tracker";
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
  const [live, tracker] = await Promise.all([
    getApplicationWorkspaceLive({
      organizationId: access.organizationId,
      campaignId: access.campaignId,
    }),
    getApplicationTracker({
      organizationId: access.organizationId,
      campaignId: access.campaignId,
    }),
  ]);
  return (
    <ApplicationWorkspaceChrome
      campaignId={access.campaignId}
      initialSignature={live.signature}
      initialJobs={live.jobs}
      initialWorkRunning={live.active}
      initialTracker={tracker}
    >
      {children}
    </ApplicationWorkspaceChrome>
  );
}
