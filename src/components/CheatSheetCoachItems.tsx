"use client";

import { useState } from "react";
import {
  answerCheatSheetCoachAction,
  approveCheatSheetSampleAction,
  regenerateCheatSheetSampleAction,
  saveCheatSheetSampleDraftAction,
} from "@/app/actions/application-summary";
import {
  ApplicationActionForm,
  keepHarperQuestionInPlace,
} from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
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
  polishCopy,
} from "@/lib/product-config";

const sampleFieldClass =
  "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

function SampleDraftActions({
  campaignId,
  itemId,
  content,
}: {
  campaignId: string;
  itemId: string;
  content: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content);
  return (
    <>
      {editing ? (
        <textarea
          rows={4}
          required
          value={value}
          aria-label={consultationConversationCopy.editAnswer}
          data-testid={`cheat-sheet-sample-editor-${itemId}`}
          className={sampleFieldClass}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : null}
      <div
        className="mt-3 flex flex-wrap items-center gap-2 sm:flex-nowrap"
        data-testid={`cheat-sheet-sample-actions-${itemId}`}
      >
        <ApplicationActionForm
          action={approveCheatSheetSampleAction}
          submitLabel={consultationConversationCopy.approve}
          testId={`cheat-sheet-sample-approve-${itemId}`}
          variant="primary"
          compact
          formClassName="inline-flex"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="itemId" value={itemId} />
        </ApplicationActionForm>
        <ApplicationActionForm
          action={regenerateCheatSheetSampleAction}
          submitLabel={polishCopy.regenerate}
          testId={`cheat-sheet-sample-regenerate-${itemId}`}
          variant="secondary"
          compact
          formClassName="inline-flex"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="content" value={value} />
        </ApplicationActionForm>
        {editing ? (
          <ApplicationActionForm
            action={saveCheatSheetSampleDraftAction}
            submitLabel={consultationConversationCopy.saveAnswer}
            testId={`cheat-sheet-sample-save-${itemId}`}
            variant="secondary"
            compact
            formClassName="inline-flex"
            onSuccess={() => setEditing(false)}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="content" value={value} />
          </ApplicationActionForm>
        ) : (
          <AppButton
            type="button"
            variant="secondary"
            className="!px-2.5 !py-1.5 !text-xs"
            data-testid={`cheat-sheet-sample-edit-${itemId}`}
            onClick={(event) => {
              keepHarperQuestionInPlace(event.currentTarget);
              setEditing(true);
            }}
          >
            {consultationConversationCopy.editAnswer}
          </AppButton>
        )}
      </div>
    </>
  );
}

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
            className="rounded-md border-2 border-edge-strong bg-surface p-4"
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
                  outerCard={false}
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
                    outerCard={false}
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
                      <SampleDraftActions
                        campaignId={campaignId}
                        itemId={item.id}
                        content={answer}
                      />
                    ) : null}
                  </div>
                ) : null}
                {harperQuestion && harperQuestion !== item.prompt ? (
                  <p className="mt-3 text-sm text-ink" data-testid="cheat-sheet-harper-question">
                    {harperQuestion}
                  </p>
                ) : null}
                {allowCoachForm && item.id && !sampleStatement ? (
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
