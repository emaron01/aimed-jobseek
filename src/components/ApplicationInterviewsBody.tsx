import "server-only";

import { WorkspaceProgress } from "@/components/ApplicationWorkspaceLive";
import { ApplicationWorkspaceEmpty } from "@/components/ApplicationWorkspaceEmpty";
import { CheatSheetGenerationError } from "@/components/CheatSheetGenerationError";
import { InterviewStagesSection } from "@/components/InterviewStagesSection";
import { loadApplicationWorkspaceModel } from "@/components/application-workspace-model";
import { latestApplicationSummaryFailure } from "@/lib/application-summary/failure-message";
import { WORKSPACE_CARD_WRAP_CLASS } from "@/lib/application/workspace-links";
import { applicationSummaryConfig } from "@/lib/product-config";

/**
 * Interview Notes. The notes page and the dashboard card render this.
 * Opening the card reads the same stage list as the page. It does not enqueue a job.
 */
export async function ApplicationInterviewsBody({
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
    return <ApplicationWorkspaceEmpty focus="interviews" />;
  }
  const guideFailure = latestApplicationSummaryFailure({
    jobs: loaded.live.jobs,
    fallback: `${applicationSummaryConfig.title} could not be generated. Retry.`,
  });
  const pageFailure = guideFailure?.sectionKey ? null : guideFailure;
  const requirement = loaded.requirement;
  return (
    <div className={`space-y-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
      <div id="interviews">
        <WorkspaceProgress jobs={loaded.live.jobs} type="APPLICATION_SUMMARY" hideFailure />
        <CheatSheetGenerationError message={pageFailure?.message ?? null} />
        <InterviewStagesSection
          campaignId={requirement.campaignId}
          organizationId={organizationId}
          canEdit={canEdit}
          roles={requirement.campaign.hiringTeamRoles}
          contacts={requirement.campaign.contacts.map((row) => ({
            contactId: row.contact.id,
            personaId: row.chosenPersonaId,
          }))}
          guideFailure={guideFailure}
        />
      </div>
    </div>
  );
}
