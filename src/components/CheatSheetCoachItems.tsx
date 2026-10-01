"use client";

import { useState } from "react";
import {
  answerCheatSheetCoachAction,
  approveCheatSheetSampleAction,
  saveCheatSheetSampleDraftAction,
} from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { QuestionList, ResultBody } from "@/components/ConsultationThread";
import type { CheatSheetCoachItem } from "@/lib/application-summary/contract";
import { sharedGeneralForCoachItem } from "@/lib/consultation/general-question-match";
import {
  coachItemIdFromCheatSheetTarget,
  harperCoachItemAnchorId,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem, QaStatement } from "@/lib/consultation/qa-view";
import {
  consultationConversationCopy,
} from "@/lib/product-config";

export function CheatSheetCoachItems({
  campaignId,
  canEdit,
  items,
  qaItems = [],
  generalQuestions = [],
  jobsActive = false,
  showReply = true,
}: {
  campaignId: string;
  canEdit: boolean;
  items: CheatSheetCoachItem[];
  /** When set, answered/open Harper turns for these coach items render once here (Batch A card). */
  qaItems?: ConsultationQaItem[];
  /** General questions that can replace a matching person item that has no answer yet. */
  generalQuestions?: ConsultationQaItem[];
  /** When true, hide coach answer forms (Harper analyzing). */
  jobsActive?: boolean;
  showReply?: boolean;
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  if (items.length === 0) {
    return <p className="text-sm text-subtle">Not stated.</p>;
  }
  const qaByCoachId = new Map<string, ConsultationQaItem>();
  for (const item of qaItems) {
    const coachId = coachItemIdFromCheatSheetTarget(item.targetKey);
    if (coachId) qaByCoachId.set(coachId, item);
  }
  const allowCoachForm = canEdit && !jobsActive;

  return (
    <ul className="space-y-4" data-testid="cheat-sheet-coach-items">
      {items.map((item) => {
        const answer = item.sampleAnswer?.trim() ?? "";
        const harperQuestion = item.harperQuestion?.trim() ?? "";
        const coachId = item.id?.trim() ?? "";
        const qaItem = coachId ? qaByCoachId.get(coachId) : undefined;
        const anchorId = coachId ? harperCoachItemAnchorId(coachId) : undefined;
        const referenceId = item.generalQuestionId?.trim() ?? "";
        const referenced = referenceId
          ? generalQuestions.find(
              (question) =>
                question.questionTurnId === referenceId ||
                question.targetKey === referenceId,
            )
          : undefined;
        const shared = referenced
          ? referenced
          : referenceId
            ? null
            : sharedGeneralForCoachItem(item, qaItem, generalQuestions);
        const sampleStatement: QaStatement | null = answer
          ? {
              id: `sample:${coachId || item.prompt}`,
              turnId: `sample:${coachId || item.prompt}`,
              kind: "INTERVIEW_ANSWER",
              status: "DRAFT",
              content: answer,
              strengtheningNote: null,
            }
          : null;

        return (
          <li
            key={item.id ?? item.prompt}
            id={anchorId}
            className="rounded-md border border-edge bg-canvas p-4"
            data-testid={`cheat-sheet-coach-${item.id ?? "item"}`}
          >
            {shared ? (
              <div
                className="mt-3"
                data-testid={
                  referenced
                    ? "cheat-sheet-referenced-general-question"
                    : "cheat-sheet-shared-general-question"
                }
              >
                <QuestionList
                  campaignId={campaignId}
                  canEdit={canEdit}
                  questions={[shared]}
                  showReply={showReply}
                  pendingTarget={pendingTarget}
                  jobsActive={jobsActive}
                  onSubmitStart={(replyKey, answerText) => {
                    setPendingTarget(replyKey);
                    void answerText;
                  }}
                />
              </div>
            ) : qaItem ? (
              <div data-testid="cheat-sheet-coach-harper-qa">
                <p className="consultation-question-screen text-sm font-medium text-ink">
                  {item.prompt}
                </p>
                <div className="mt-3">
                  <QuestionList
                    campaignId={campaignId}
                    canEdit={canEdit}
                    questions={[qaItem]}
                    showReply={showReply}
                    pendingTarget={pendingTarget}
                    jobsActive={jobsActive}
                    suppressQuestionTextWhenMatchesLabel={item.prompt}
                    onSubmitStart={(replyKey, answerText) => {
                      setPendingTarget(replyKey);
                      void answerText;
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-ink">{item.prompt}</p>
                {sampleStatement ? (
                  <div data-testid="cheat-sheet-sample-draft">
                    <ResultBody statement={sampleStatement} />
                    {allowCoachForm && item.id ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <ApplicationActionForm
                          action={approveCheatSheetSampleAction}
                          submitLabel={consultationConversationCopy.approve}
                          testId={`cheat-sheet-sample-approve-${item.id}`}
                          variant="primary"
                          compact
                        >
                          <input type="hidden" name="campaignId" value={campaignId} />
                          <input type="hidden" name="itemId" value={item.id} />
                        </ApplicationActionForm>
                        <details data-testid={`cheat-sheet-sample-edit-${item.id}`}>
                          <summary className="cursor-pointer text-sm font-medium text-ink">
                            {consultationConversationCopy.editAnswer}
                          </summary>
                          <ApplicationActionForm
                            action={saveCheatSheetSampleDraftAction}
                            submitLabel={consultationConversationCopy.saveAnswer}
                            testId={`cheat-sheet-sample-save-${item.id}`}
                            compact
                          >
                            <input type="hidden" name="campaignId" value={campaignId} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <label className="mt-2 block text-sm">
                              <span className="sr-only">
                                {consultationConversationCopy.editAnswer}
                              </span>
                              <textarea
                                name="content"
                                required
                                rows={4}
                                defaultValue={answer}
                                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                              />
                            </label>
                          </ApplicationActionForm>
                        </details>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {harperQuestion && harperQuestion !== item.prompt ? (
                  <p className="mt-3 text-sm text-ink" data-testid="cheat-sheet-harper-question">
                    {harperQuestion}
                  </p>
                ) : null}
                {allowCoachForm && item.id ? (
                  <ApplicationActionForm
                    action={answerCheatSheetCoachAction}
                    submitLabel={consultationConversationCopy.threadReply}
                    pendingLabel={consultationConversationCopy.thinking}
                    testId={`cheat-sheet-coach-reply-${item.id}`}
                    disableFieldsWhilePending
                  >
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <label className="mt-3 block text-sm">
                      <span className="sr-only">
                        {consultationConversationCopy.threadReply}
                      </span>
                      <textarea
                        name="answer"
                        required
                        rows={3}
                        className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                      />
                    </label>
                  </ApplicationActionForm>
                ) : null}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
