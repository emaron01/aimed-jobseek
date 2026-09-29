"use client";

import { useState } from "react";
import { answerCheatSheetCoachAction } from "@/app/actions/application-summary";
import {
  workspaceHarperCoachItemHref,
  workspaceHarperQuestionHref,
} from "@/lib/application/workspace-links";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { QuestionList } from "@/components/ConsultationThread";
import type { CheatSheetCoachItem } from "@/lib/application-summary/contract";
import {
  coachItemIdFromCheatSheetTarget,
  harperCoachItemAnchorId,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import {
  applicationSummaryConfig,
  consultationConversationCopy,
} from "@/lib/product-config";

export function CheatSheetCoachItems({
  campaignId,
  canEdit,
  items,
  qaItems = [],
  jobsActive = false,
  showReply = true,
  /** When set, Cheat Sheet is read-only: no forms; Edit/Answer link to Harper. */
  harperLinkContactId = null,
}: {
  campaignId: string;
  canEdit: boolean;
  items: CheatSheetCoachItem[];
  /** When set, answered/open Harper turns for these coach items render once here (Batch A card). */
  qaItems?: ConsultationQaItem[];
  /** When true, hide coach answer forms (Harper analyzing). */
  jobsActive?: boolean;
  showReply?: boolean;
  harperLinkContactId?: string | null;
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
  const readOnlyLinks = Boolean(harperLinkContactId?.trim());
  const allowCoachForm = canEdit && !jobsActive && !readOnlyLinks;

  return (
    <ul className="space-y-4" data-testid="cheat-sheet-coach-items">
      {items.map((item) => {
        const answer = item.sampleAnswer?.trim() ?? "";
        const harperQuestion = item.harperQuestion?.trim() ?? "";
        const coachId = item.id?.trim() ?? "";
        const qaItem = coachId ? qaByCoachId.get(coachId) : undefined;
        const anchorId = coachId ? harperCoachItemAnchorId(coachId) : undefined;
        const contactId = harperLinkContactId?.trim() ?? "";

        if (readOnlyLinks) {
          const answered =
            Boolean(answer) ||
            Boolean(qaItem?.seekerAnswers.length) ||
            Boolean(qaItem?.resumeBullet || qaItem?.talkingPoint);
          const needsInput = Boolean(harperQuestion) && !answered;
          const displayAnswer =
            answer ||
            qaItem?.seekerAnswers.map((row) => row.body).filter(Boolean).join("\n\n") ||
            "";
          let linkHref: string | null = null;
          let linkLabel: string | null = null;
          if (qaItem?.questionTurnId) {
            linkHref = workspaceHarperQuestionHref(
              campaignId,
              contactId,
              qaItem.questionTurnId,
            );
            linkLabel = answered
              ? consultationConversationCopy.editAnswer
              : consultationConversationCopy.answerGap;
          } else if (answered && coachId) {
            linkHref = workspaceHarperCoachItemHref(campaignId, contactId, coachId);
            linkLabel = consultationConversationCopy.editAnswer;
          } else if (needsInput && coachId) {
            linkHref = workspaceHarperCoachItemHref(campaignId, contactId, coachId);
            linkLabel = consultationConversationCopy.answerGap;
          }
          return (
            <li
              key={item.id ?? item.prompt}
              id={anchorId}
              className="rounded-md border border-edge bg-canvas p-4"
              data-testid={`cheat-sheet-coach-${item.id ?? "item"}`}
            >
              <p className="text-sm font-medium text-ink">{item.prompt}</p>
              {displayAnswer ? (
                <div className="mt-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                    {applicationSummaryConfig.sections.sampleAnswer}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                    {displayAnswer}
                  </p>
                </div>
              ) : null}
              {needsInput ? (
                <p className="mt-3 text-sm text-ink" data-testid="cheat-sheet-harper-question">
                  {harperQuestion}
                </p>
              ) : null}
              {linkHref && linkLabel ? (
                <p className="mt-3 print:hidden">
                  <a
                    href={linkHref}
                    className="text-sm font-medium text-ink underline decoration-ink underline-offset-2"
                    data-testid={
                      linkLabel === consultationConversationCopy.editAnswer
                        ? `cheat-sheet-coach-edit-${item.id ?? "item"}`
                        : `cheat-sheet-coach-answer-${item.id ?? "item"}`
                    }
                  >
                    {linkLabel}
                  </a>
                </p>
              ) : null}
            </li>
          );
        }

        return (
          <li
            key={item.id ?? item.prompt}
            id={anchorId}
            className="rounded-md border border-edge bg-canvas p-4"
            data-testid={`cheat-sheet-coach-${item.id ?? "item"}`}
          >
            <p className="text-sm font-medium text-ink">{item.prompt}</p>
            {qaItem ? (
              <div className="mt-3" data-testid="cheat-sheet-coach-harper-qa">
                <QuestionList
                  campaignId={campaignId}
                  canEdit={canEdit}
                  questions={[qaItem]}
                  showReply={showReply}
                  pendingTarget={pendingTarget}
                  jobsActive={jobsActive}
                  onSubmitStart={(replyKey, answerText) => {
                    setPendingTarget(replyKey);
                    void answerText;
                  }}
                />
              </div>
            ) : (
              <>
                {answer ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                      {applicationSummaryConfig.sections.sampleAnswer}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{answer}</p>
                  </div>
                ) : null}
                {harperQuestion ? (
                  <div className="mt-3 space-y-2" data-testid="cheat-sheet-harper-question">
                    <p className="text-sm text-ink">{harperQuestion}</p>
                    {allowCoachForm ? (
                      <ApplicationActionForm
                        action={answerCheatSheetCoachAction}
                        submitLabel={consultationConversationCopy.threadReply}
                        pendingLabel={consultationConversationCopy.thinking}
                        testId={`cheat-sheet-coach-reply-${item.id}`}
                        disableFieldsWhilePending
                      >
                        <input type="hidden" name="campaignId" value={campaignId} />
                        <input type="hidden" name="itemId" value={item.id ?? ""} />
                        <label className="block text-sm">
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
                  </div>
                ) : null}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
