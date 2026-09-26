import { ApplicationWorkspaceChrome } from "@/components/ApplicationWorkspaceChrome";
import { TenantMissing } from "@/components/ui";
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
  return (
    <ApplicationWorkspaceChrome campaignId={access.campaignId}>
      {children}
    </ApplicationWorkspaceChrome>
  );
}
