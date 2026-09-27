"use client";

import { useState } from "react";
import {
  approveConsultationQaResultAction,
  editConsultationAnswerAction,
  regenerateConsultationQaResultAction,
  replyConsultationAction,
  skipConsultationQuestionAction,
} from "@/app/actions/consultation";
import { AppButton } from "@/components/AppButton";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  consultationConfig,
  consultationConversationCopy,
  consultationStatementLabels,
  polishCopy,
} from "@/lib/product-config";
import { stripInternalIdsFromDisplayText } from "@/lib/consultation/evidence-display";
import {
  buildConsultationQaView,
  consultationQuestionAcceptsReply,
  consultationReplyTargetKey,
  type ConsultationQaItem,
  type QaStatement,
  type QaTurn,
} from "@/lib/consultation/qa-view";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
const wrapClass = "min-w-0 overflow-hidden break-words whitespace-pre-wrap";

export type ThreadTurn = QaTurn;
export type ThreadStatement = QaStatement;

export function ResultActions({
  campaignId,
  statements,
  testId,
}: {
  campaignId: string;
  statements: QaStatement[];
  testId: string;
}) {
  if (statements.length === 0) return null;
  const draft = statements.filter((statement) => statement.status !== "APPROVED");
  if (draft.length === 0) {
    return (
      <p className="mt-3 text-sm text-success" data-testid={`${testId}-approved`}>
        {consultationStatementLabels.APPROVED}
      </p>
    );
  }
  statements = draft;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid={testId}>
      <ApplicationActionForm
        action={approveConsultationQaResultAction}
        submitLabel={consultationConversationCopy.approve}
        testId={`${testId}-approve`}
        variant="primary"
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        {statements.map((statement) => (
          <input key={statement.id} type="hidden" name="statementId" value={statement.id} />
        ))}
      </ApplicationActionForm>
      <ApplicationActionForm
        action={regenerateConsultationQaResultAction}
        submitLabel={polishCopy.regenerate}
        testId={`${testId}-regenerate`}
        variant="secondary"
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        {statements.map((statement) => (
          <input
            key={`regen-${statement.id}`}
            type="hidden"
            name="statementId"
            value={statement.id}
          />
        ))}
      </ApplicationActionForm>
    </div>
  );
}

function ResultBody({ statement }: { statement: QaStatement }) {
  const statusLabel =
    statement.status === "APPROVED"
      ? consultationStatementLabels.APPROVED
      : statement.status === "DRAFT"
        ? consultationStatementLabels.DRAFT
        : null;
  return (
    <div
      className="mt-3 min-w-0 space-y-1 overflow-hidden border-t border-edge pt-3"
      data-testid={`consultation-statement-${statement.kind}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {consultationStatementLabels[statement.kind]}
        {statusLabel ? ` · ${statusLabel}` : ""}
      </p>
      {statement.strengtheningNote ? (
        <p className={`text-sm text-ink ${wrapClass}`} data-testid="consultation-strengthening-note">
          {stripInternalIdsFromDisplayText(statement.strengtheningNote)}
        </p>
      ) : null}
      <p className={`text-sm text-ink ${wrapClass}`}>
        {stripInternalIdsFromDisplayText(statement.content)}
      </p>
    </div>
  );
}

function SeekerAnswerEntry({
  campaignId,
  canEdit,
  answer,
}: {
  campaignId: string;
  canEdit: boolean;
  answer: { id: string; body: string };
}) {
  return (
    <article
      className="min-w-0 overflow-hidden rounded-md border border-edge bg-surface p-3"
      data-testid="consultation-seeker-turn"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {consultationConversationCopy.yourReply}
      </p>
      <p className={`mt-1 text-sm text-ink ${wrapClass}`}>{answer.body}</p>
      {canEdit ? (
        <details className="mt-2" data-testid={`consultation-edit-answer-${answer.id}`}>
          <summary className="cursor-pointer text-sm font-medium text-ink">
            {consultationConversationCopy.editAnswer}
          </summary>
          <ApplicationActionForm
            action={editConsultationAnswerAction}
            submitLabel={consultationConversationCopy.saveAnswer}
            pendingLabel={consultationConversationCopy.thinking}
            testId={`consultation-save-answer-${answer.id}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="turnId" value={answer.id} />
            <label className="mt-2 block text-sm">
              <span className="font-medium text-ink">
                {consultationConversationCopy.editAnswer}
              </span>
              <textarea
                name="answer"
                required
                rows={4}
                defaultValue={answer.body}
                className={fieldClass}
              />
            </label>
          </ApplicationActionForm>
        </details>
      ) : null}
    </article>
  );
}

function SeekerRepliesSection({
  campaignId,
  canEdit,
  answers,
}: {
  campaignId: string;
  canEdit: boolean;
  answers: Array<{ id: string; body: string }>;
}) {
  const [open, setOpen] = useState(false);
  if (answers.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="consultation-seeker-answers">
      <AppButton
        type="button"
        className="text-sm font-medium text-ink underline"
        data-testid="consultation-toggle-replies"
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? consultationConversationCopy.hideYourReplies
          : consultationConversationCopy.showYourReplies}
      </AppButton>
      {open
        ? answers.map((answer) => (
            <SeekerAnswerEntry
              key={answer.id}
              campaignId={campaignId}
              canEdit={canEdit}
              answer={answer}
            />
          ))
        : null}
    </div>
  );
}

function QuestionCard({
  campaignId,
  canEdit,
  item,
  showReply,
  pending,
  onSubmitStart,
}: {
  campaignId: string;
  canEdit: boolean;
  item: ConsultationQaItem;
  showReply: boolean;
  pending: boolean;
  onSubmitStart: (answer: string) => void;
}) {
  const hasResult = Boolean(item.resumeBullet || item.talkingPoint);
  const unanswered = !hasResult;
  const canAnswer =
    showReply &&
    (consultationQuestionAcceptsReply(item) || Boolean(item.seekerAnswers.length));
  const canSkip = showReply && unanswered;
  const replyKey = consultationReplyTargetKey(item.questionTurnId);
  return (
    <article
      className="min-w-0 overflow-hidden rounded-md border border-edge bg-canvas p-4"
      data-testid={hasResult ? "consultation-answered" : "consultation-question-item"}
    >
      <p
        className="text-sm font-medium text-ink"
        data-testid="consultation-question"
      >
        {stripInternalIdsFromDisplayText(item.question)}
      </p>
      <div className="mt-3 space-y-3">
        {item.followUp ? (
          <p className={`text-sm text-ink ${wrapClass}`} data-testid="consultation-follow-up">
            {stripInternalIdsFromDisplayText(item.followUp.text)}
          </p>
        ) : null}
        {hasResult ? (
          <>
            {item.resumeBullet ? <ResultBody statement={item.resumeBullet} /> : null}
            {item.talkingPoint ? <ResultBody statement={item.talkingPoint} /> : null}
            {canEdit ? (
              <ResultActions
                campaignId={campaignId}
                statements={item.statements}
                testId={`consultation-result-${item.questionTurnId}`}
              />
            ) : null}
          </>
        ) : null}
        <SeekerRepliesSection
          campaignId={campaignId}
          canEdit={canEdit && showReply}
          answers={item.seekerAnswers}
        />
        {canAnswer ? (
          <ApplicationActionForm
            action={replyConsultationAction}
            submitLabel={
              item.seekerAnswers.length > 0
                ? consultationConversationCopy.addAnotherReply
                : consultationConversationCopy.threadReply
            }
            pendingLabel={consultationConversationCopy.thinking}
            testId="consultation-reply"
            onSubmitStart={(formData) => {
              const answer = String(formData.get("answer") ?? "").trim();
              if (!answer) return;
              onSubmitStart(answer);
            }}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="targetKey" value={replyKey} />
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {item.seekerAnswers.length > 0
                  ? consultationConversationCopy.addAnotherReply
                  : consultationConversationCopy.threadReply}
              </span>
              <textarea name="answer" required rows={4} className={fieldClass} />
            </label>
          </ApplicationActionForm>
        ) : null}
        {canSkip ? (
          <ApplicationActionForm
            action={skipConsultationQuestionAction}
            submitLabel={consultationConversationCopy.skipQuestion}
            pendingLabel={consultationConversationCopy.thinking}
            testId="consultation-skip-question"
            variant="secondary"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="targetKey" value={replyKey} />
          </ApplicationActionForm>
        ) : null}
        {pending ? (
          <div
            className="flex items-center gap-2 text-sm text-muted"
            data-testid="harper-thinking"
            role="status"
          >
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge-strong border-t-ink"
              aria-hidden
            />
            {consultationConversationCopy.thinking}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ConsultationThread({
  campaignId,
  canEdit,
  sessionStatus,
  jobsActive,
  turns,
  statements,
}: {
  campaignId: string;
  canEdit: boolean;
  sessionStatus: string;
  jobsActive: boolean;
  turns: ThreadTurn[];
  statements: ThreadStatement[];
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const view = buildConsultationQaView({ turns, statements });
  const showReply =
    canEdit &&
    sessionStatus !== "SKIPPED" &&
    sessionStatus !== "PAUSED" &&
    !jobsActive;

  return (
    <div className="min-w-0 space-y-3 overflow-hidden" data-testid="consultation-thread">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {consultationConfig.displayName}
      </p>
      {view.questions.map((item) => (
        <QuestionCard
          key={item.questionTurnId}
          campaignId={campaignId}
          canEdit={canEdit}
          item={item}
          showReply={showReply}
          pending={
            pendingTarget === consultationReplyTargetKey(item.questionTurnId) &&
            jobsActive
          }
          onSubmitStart={(answer) => {
            setPendingTarget(consultationReplyTargetKey(item.questionTurnId));
            void answer;
          }}
        />
      ))}
    </div>
  );
}
