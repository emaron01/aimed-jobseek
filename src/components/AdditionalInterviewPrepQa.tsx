"use client";

import { useState } from "react";
import { QuestionList } from "@/components/ConsultationThread";
import { ADDITIONAL_INTERVIEW_PREP_QA_HEADING } from "@/lib/consultation/additional-prep-qa";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";

/**
 * Answered Harper questions that are not this person's primary cards.
 * Same QuestionList as Harper, so approve, edit, skip, and ignore stay one workflow.
 */
export function AdditionalInterviewPrepQa({
  campaignId,
  questions,
  canEdit,
  showReply = true,
  jobsActive = false,
  showHeading = true,
}: {
  campaignId: string;
  questions: ConsultationQaItem[];
  canEdit: boolean;
  showReply?: boolean;
  jobsActive?: boolean;
  /** Cheat Sheet supplies the collapsible heading. Harper keeps this heading. */
  showHeading?: boolean;
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  if (questions.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="additional-interview-prep-qa">
      {showHeading ? (
        <h3 className="font-medium text-ink">
          {ADDITIONAL_INTERVIEW_PREP_QA_HEADING}
        </h3>
      ) : null}
      <div className="space-y-4">
        <QuestionList
          campaignId={campaignId}
          canEdit={canEdit}
          questions={questions}
          showReply={showReply}
          pendingTarget={pendingTarget}
          jobsActive={jobsActive}
          onSubmitStart={(replyKey) => {
            setPendingTarget(replyKey);
          }}
        />
      </div>
    </div>
  );
}
