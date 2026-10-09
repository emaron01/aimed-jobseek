import "server-only";

import { ApplicationAssetsSection } from "@/components/ApplicationAssetsSection";
import { WorkspaceProgress } from "@/components/ApplicationWorkspaceLive";
import { ApplicationWorkspaceEmpty } from "@/components/ApplicationWorkspaceEmpty";
import { loadApplicationWorkspaceModel } from "@/components/application-workspace-model";
import { missingResumeContactLabels } from "@/lib/application-assets/header";
import { loadResumeStatementGroups } from "@/lib/application-assets/resume-statement-picker-data";
import { coverLetterThinEvidenceCopy } from "@/lib/application-assets/service";
import { WORKSPACE_CARD_WRAP_CLASS } from "@/lib/application/workspace-links";

/**
 * Resume and cover letter. The assets page and the dashboard card render this.
 * Statement groups load only here. Opening the card does not enqueue a job.
 */
export async function ApplicationAssetsBody({
  campaignId,
  organizationId,
  canEdit,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const loaded = await loadApplicationWorkspaceModel(
    organizationId,
    campaignId,
    canEdit,
    false,
    false,
  );
  if (!loaded.requirement) {
    return <ApplicationWorkspaceEmpty focus="assets" />;
  }
  const statementPicker = await loadResumeStatementGroups({ organizationId, campaignId });
  const requirement = loaded.requirement;
  return (
    <div className={`space-y-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
      <div id="assets">
        <WorkspaceProgress jobs={loaded.live.jobs} type="RESUME" profileHref={loaded.profileHref} />
        <WorkspaceProgress
          jobs={loaded.live.jobs}
          type="COVER_LETTER"
          profileHref={loaded.profileHref}
        />
        <ApplicationAssetsSection
          campaignId={requirement.campaignId}
          canEdit={canEdit}
          defaultOpen={loaded.assetsOpen}
          plans={loaded.presentationPlans}
          invalidPlanTypes={loaded.invalidPlanTypes}
          coverLetterThinNotice={
            loaded.coverLetterEvidenceThin ? coverLetterThinEvidenceCopy() : null
          }
          missingResumeContacts={
            loaded.profile.ok ? missingResumeContactLabels(loaded.profile.profile) : []
          }
          profileHref={loaded.profileHref}
          profileEditHref={loaded.profileEditHref}
          statementGroups={statementPicker.groups}
          statementRoleOptions={statementPicker.roleOptions}
          needsPrepare={statementPicker.needsPrepare}
          assets={requirement.campaign.applicationAssets
            .filter(
              (asset): asset is typeof asset & { type: "RESUME" | "COVER_LETTER" } =>
                asset.type === "RESUME" || asset.type === "COVER_LETTER",
            )
            .map((asset) => ({
              id: asset.id,
              type: asset.type,
              version: asset.version,
              status: asset.status,
              content: asset.contentJson,
              guidance: asset.guidance,
              promptVersion: asset.promptVersion,
              staleReason: asset.staleReason,
              createdAt: asset.createdAt.toISOString(),
            }))}
        />
      </div>
    </div>
  );
}
