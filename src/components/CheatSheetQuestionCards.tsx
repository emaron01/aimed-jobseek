"use client";

import { useState } from "react";
import { QuestionList } from "@/components/ConsultationThread";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";

/** Harper question cards for a Cheat Sheet section that is not a coach-item list. */
export function CheatSheetQuestionCards({
  campaignId,
  canEdit,
  questions,
  jobsActive = false,
  showReply = true,
  testId,
}: {
  campaignId: string;
  canEdit: boolean;
  questions: ConsultationQaItem[];
  jobsActive?: boolean;
  showReply?: boolean;
  testId?: string;
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  if (questions.length === 0) return null;
  return (
    <div className="space-y-4" data-testid={testId}>
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
  );
}
