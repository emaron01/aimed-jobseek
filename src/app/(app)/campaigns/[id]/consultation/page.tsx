import type { Metadata } from "next";
import { ConsultationSection } from "@/components/ConsultationSection";
import { TenantMissing } from "@/components/ui";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { generateApplicationPageMetadata } from "@/lib/application/page-metadata";
import { requireApplicationWorkspace } from "@/lib/application/workspace-access";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return generateApplicationPageMetadata(id, "consultation");
}

export default async function ApplicationConsultationPage({
  params,
}: {
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
    <ConsultationSection
      campaignId={access.campaignId}
      organizationId={access.organizationId}
      canEdit={access.canEdit}
      layout="page"
      jobs={live.jobs}
    />
  );
}
