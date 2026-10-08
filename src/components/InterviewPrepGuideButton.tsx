"use client";

import { createInterviewPrepGuideAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { useCheatSheetSelectedKey } from "@/components/CheatSheetPeopleFilter";
import { applicationSummaryConfig, workspaceProgressText } from "@/lib/product-config";

export function InterviewPrepGuideForm({
  campaignId,
  contactId,
  hasGuide,
}: {
  campaignId: string;
  contactId: string;
  hasGuide: boolean;
}) {
  return (
    <ApplicationActionForm
      action={createInterviewPrepGuideAction}
      submitLabel={
        hasGuide
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
    </ApplicationActionForm>
  );
}

/** Cheat Sheet: the button appears after this person is looked up. */
export function CheatSheetInterviewPrepGuideButton({
  campaignId,
  contactId,
  sectionKey,
  hasGuide,
  canEdit,
}: {
  campaignId: string;
  contactId: string;
  sectionKey: string;
  hasGuide: boolean;
  canEdit: boolean;
}) {
  const selectedKey = useCheatSheetSelectedKey();
  if (!canEdit || selectedKey !== sectionKey) return null;
  return (
    <InterviewPrepGuideForm
      campaignId={campaignId}
      contactId={contactId}
      hasGuide={hasGuide}
    />
  );
}
