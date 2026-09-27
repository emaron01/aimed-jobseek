"use client";

import { AppButton } from "@/components/AppButton";
import { AppActionLink } from "@/components/ui";
import { workspaceInterviewLikelyQuestionsHref } from "@/lib/application/workspace-links";
import { interviewConfig } from "@/lib/product-config";

function openGainedInformation(stageId: string): void {
  const section = document.getElementById(`gained-information-${stageId}`);
  if (!section) {
    throw new Error(`Interview notes #gained-information-${stageId} were not found.`);
  }
  const field = section.querySelector("textarea");
  if (field instanceof HTMLTextAreaElement) field.focus();
  section.scrollIntoView({ block: "start" });
}

export function InterviewStageOpenActions({
  campaignId,
  stageId,
  interviewerContactId,
}: {
  campaignId: string;
  stageId: string;
  interviewerContactId: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={`open-stage-actions-${stageId}`}>
      <AppButton
        type="button"
        variant="secondary"
        disabled={!interviewerContactId}
        data-testid={`add-gained-information-${stageId}`}
        onClick={() => openGainedInformation(stageId)}
      >
        {interviewConfig.labels.addNewlyGainedInformation}
      </AppButton>
      {interviewerContactId ? (
        <AppActionLink
          href={workspaceInterviewLikelyQuestionsHref(campaignId, interviewerContactId)}
          variant="secondary"
          data-testid={`review-open-questions-${stageId}`}
        >
          {interviewConfig.labels.reviewOpenQuestions}
        </AppActionLink>
      ) : (
        <AppButton
          type="button"
          variant="secondary"
          disabled
          data-testid={`review-open-questions-${stageId}`}
        >
          {interviewConfig.labels.reviewOpenQuestions}
        </AppButton>
      )}
    </div>
  );
}
