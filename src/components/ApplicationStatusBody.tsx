import "server-only";

import { ApplicationAppliedSection } from "@/components/ApplicationOutreachSections";
import { loadApplicationWorkspaceModel } from "@/components/application-workspace-model";

/** The Application Status section. The dashboard card and only that card render it. */
export async function ApplicationStatusBody({
  campaignId,
  organizationId,
  canEdit,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const model = await loadApplicationWorkspaceModel(
    organizationId,
    campaignId,
    canEdit,
    false,
    false,
  );
  if (!model.requirement) return null;
  return (
    <ApplicationAppliedSection
      campaignId={model.requirement.campaignId}
      canEdit={canEdit}
      appliedAt={model.requirement.campaign.appliedAt?.toISOString() ?? null}
      applicationProgress={model.requirement.campaign.applicationProgress}
    />
  );
}
