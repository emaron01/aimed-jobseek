import "server-only";

import { WorkspaceProgress } from "@/components/ApplicationWorkspaceLive";
import { ApplicationOutreachSection } from "@/components/ApplicationOutreachSections";
import { ApplicationWorkspaceEmpty } from "@/components/ApplicationWorkspaceEmpty";
import { loadApplicationWorkspaceModel } from "@/components/application-workspace-model";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import { applicationWorkspaceCopy, isOutreachAssetType } from "@/lib/product-config";
import { parseIndividualProfile, parseLinkedInExtracted } from "@/lib/contact-profile/service";
import { WORKSPACE_CARD_WRAP_CLASS } from "@/lib/application/workspace-links";
import { getActiveEmailSignatureBody } from "@/lib/signature/signature";
import { requireCurrentUser } from "@/lib/auth/session";

function toContactRow(row: {
  chosenPersonaId: string | null;
  roleConfirmed: boolean;
  linkedInProfileText: string | null;
  linkedInExtractedJson: unknown;
  individualProfileJson: unknown;
  individualProfileStatus: string | null;
  individualProfileError: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
  };
  chosenPersona: { name: string } | null;
}) {
  const extracted = parseLinkedInExtracted(row.linkedInExtractedJson);
  const individual = parseIndividualProfile(row.individualProfileJson);
  return {
    contactId: row.contact.id,
    firstName: row.contact.firstName,
    lastName: row.contact.lastName,
    title: row.contact.title,
    email: row.contact.email,
    linkedinUrl: row.contact.linkedinUrl,
    personaId: row.chosenPersonaId,
    personaName: row.chosenPersona?.name ?? null,
    roleConfirmed: row.roleConfirmed,
    linkedInProfileText: row.linkedInProfileText,
    extractedTitle: extracted?.currentTitle?.text ?? null,
    individualStatus: row.individualProfileStatus,
    individualError: row.individualProfileError,
    commonGround: individual?.commonGround ?? [],
    caresAbout: individual?.caresAbout ?? [],
  };
}

/**
 * Send Outreach. The outreach page and the dashboard card render this.
 * The signature is a read. Opening the card does not enqueue a job.
 */
export async function ApplicationOutreachBody({
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
    return <ApplicationWorkspaceEmpty focus="outreach" />;
  }
  const emailSignature = await getActiveEmailSignatureBody({
    organizationId,
    userId: (await requireCurrentUser()).id,
  });
  const requirement = loaded.requirement;
  return (
    <div className={`space-y-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
      <div id="outreach" data-testid="application-contacts-wrap">
        <p className="sr-only">{applicationWorkspaceCopy.contactsTitle}</p>
        <WorkspaceProgress jobs={loaded.live.jobs} type="OUTREACH" />
        <ApplicationOutreachSection
          campaignId={requirement.campaignId}
          canEdit={canEdit}
          approvedResumeId={
            requirement.campaign.applicationAssets.find(
              (asset) => asset.type === "RESUME" && asset.status === "APPROVED",
            )?.id ?? null
          }
          roles={requirement.campaign.hiringTeamRoles.map((role) => ({
            id: role.id,
            name: role.name,
            suggestionKey: role.suggestionKey,
            personaBuilt: isHiringTeamPersonaBuilt(role),
          }))}
          contacts={requirement.campaign.contacts.map(toContactRow)}
          interviewStages={requirement.campaign.interviewStages.map((stage) => {
            const interviewerContactId = stage.interviewers[0]?.contactId ?? null;
            const personaId =
              requirement.campaign.contacts.find(
                (row) => row.contact.id === interviewerContactId,
              )?.chosenPersonaId ?? null;
            return {
              id: stage.id,
              type: stage.type,
              format: stage.format,
              scheduledAt: stage.scheduledAt.toISOString(),
              notesAfter: stage.notesAfter,
              thankYouClarifyJson: stage.thankYouClarifyJson,
              interviewerContactId,
              personaId,
            };
          })}
          assets={requirement.campaign.applicationAssets
            .filter(
              (
                asset,
              ): asset is typeof asset & {
                type: "EMAIL" | "LINKEDIN_CONNECTION_NOTE" | "LINKEDIN_INMAIL";
              } => isOutreachAssetType(asset.type))
            .map((asset) => ({
              id: asset.id,
              type: asset.type,
              version: asset.version,
              status: asset.status,
              personaId: asset.personaId,
              contactId: asset.contactId,
              purpose: asset.purpose,
              sentAt: asset.sentAt?.toISOString() ?? null,
              createdAt: asset.createdAt.toISOString(),
              emailLength: asset.emailLength,
              content: asset.contentJson,
            }))}
          emailSignature={emailSignature}
        />
      </div>
    </div>
  );
}
