"use client";

import { createInterviewPrepGuideAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { useCheatSheetSelectedKey } from "@/components/CheatSheetPeopleFilter";
import { HiringTeamRoleField } from "@/components/ContactEditForm";
import { CheatSheetGenerationError } from "@/components/CheatSheetGenerationError";
import { applicationSummaryConfig, workspaceProgressText } from "@/lib/product-config";

export function InterviewPrepGuideForm({
  campaignId,
  contactId,
  hasGuide,
  failed = false,
  failureMessage = null,
  needsPersonaChoice = false,
  roles = [],
}: {
  campaignId: string;
  contactId: string;
  hasGuide: boolean;
  failed?: boolean;
  failureMessage?: string | null;
  needsPersonaChoice?: boolean;
  roles?: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-2">
      <CheatSheetGenerationError message={failed ? failureMessage : null} />
      <ApplicationActionForm
        action={createInterviewPrepGuideAction}
        submitLabel={
          failed
            ? applicationSummaryConfig.actions.retry
            : hasGuide
              ? applicationSummaryConfig.actions.updateInterviewPrepGuide
              : applicationSummaryConfig.actions.createInterviewPrepGuide
        }
        pendingLabel={workspaceProgressText("APPLICATION_SUMMARY")}
        testId={`interview-prep-guide-${contactId}`}
        suppressJobFailure
        formClassName="print:hidden"
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="contactId" value={contactId} />
        {needsPersonaChoice ? <HiringTeamRoleField roles={roles} /> : null}
      </ApplicationActionForm>
    </div>
  );
}

/** Cheat Sheet: the button appears after this person is looked up. */
export function CheatSheetInterviewPrepGuideButton({
  campaignId,
  contactId,
  sectionKey,
  hasGuide,
  canEdit,
  failed = false,
  failureMessage = null,
  needsPersonaChoice = false,
  roles = [],
}: {
  campaignId: string;
  contactId: string;
  sectionKey: string;
  hasGuide: boolean;
  canEdit: boolean;
  failed?: boolean;
  failureMessage?: string | null;
  needsPersonaChoice?: boolean;
  roles?: Array<{ id: string; name: string }>;
}) {
  const selectedKey = useCheatSheetSelectedKey();
  const lookedUp = selectedKey === sectionKey;
  if (!canEdit || (selectedKey && !lookedUp)) return null;
  if (!failed && !lookedUp) return null;
  return (
    <InterviewPrepGuideForm
      campaignId={campaignId}
      contactId={contactId}
      hasGuide={hasGuide}
      failed={failed}
      failureMessage={failureMessage}
      needsPersonaChoice={needsPersonaChoice}
      roles={roles}
    />
  );
}
