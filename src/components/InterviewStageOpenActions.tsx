"use client";

import { AppButton } from "@/components/AppButton";
import { interviewConfig } from "@/lib/product-config";

function openPostInterviewNotes(stageId: string): void {
  const section = document.getElementById(`post-interview-notes-${stageId}`);
  if (!section) {
    throw new Error(`Post interview notes #post-interview-notes-${stageId} were not found.`);
  }
  if (section instanceof HTMLDetailsElement) {
    section.open = true;
  }
  const field = section.querySelector("textarea");
  if (field instanceof HTMLTextAreaElement) field.focus();
  section.scrollIntoView({ block: "start" });
}

export function InterviewStageOpenActions({
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
        data-testid={`post-interview-notes-${stageId}`}
        onClick={() => openPostInterviewNotes(stageId)}
      >
        {interviewConfig.labels.postInterviewNotes}
      </AppButton>
    </div>
  );
}
