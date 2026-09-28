"use client";

import { useState } from "react";
import {
  approveConsultationQaResultAction,
  editConsultationAnswerAction,
  regenerateConsultationQaResultAction,
  replyConsultationAction,
  skipConsultationQuestionAction,
  ignoreConsultationQuestionAction,
  reopenIgnoredConsultationTargetAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  consultationConversationCopy,
  consultationStatementLabels,
  polishCopy,
} from "@/lib/product-config";
import { stripInternalIdsFromDisplayText } from "@/lib/consultation/evidence-display";
import {
  harperContactAnchorId,
  harperQuestionAnchorId,
  type HarperInterviewerSection,
} from "@/lib/consultation/harper-layout";
import {
  consultationQuestionAcceptsReply,
  consultationReplyTargetKey,
  type ConsultationQaItem,
  type QaStatement,
  type QaTurn,
} from "@/lib/consultation/qa-view";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
const wrapClass = "min-w-0 overflow-hidden break-words whitespace-pre-wrap";
const textLinkClass =
  "cursor-pointer text-sm font-medium text-ink underline decoration-ink underline-offset-2";

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
      <a
        href="#harper-toggle-replies"
        className={textLinkClass}
        data-testid="consultation-toggle-replies"
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        {open
          ? consultationConversationCopy.hideYourReplies
          : consultationConversationCopy.showYourReplies}
      </a>
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

function QuestionReplyForm({
  campaignId,
  item,
  onSubmitStart,
}: {
  campaignId: string;
  item: ConsultationQaItem;
  onSubmitStart: (answer: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const hasPriorReply = item.seekerAnswers.length > 0;
  const replyKey = consultationReplyTargetKey(item.questionTurnId);

  if (hasPriorReply && !editing) {
    return (
      <a
        href={`#${harperQuestionAnchorId(item.questionTurnId)}`}
        className={textLinkClass}
        data-testid="consultation-edit-reply"
        onClick={(event) => {
          event.preventDefault();
          setEditing(true);
        }}
      >
        {consultationConversationCopy.editAnswer}
      </a>
    );
  }

  return (
    <ApplicationActionForm
      action={replyConsultationAction}
      submitLabel={
        hasPriorReply
          ? consultationConversationCopy.editAnswer
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
          {hasPriorReply
            ? consultationConversationCopy.editAnswer
            : consultationConversationCopy.threadReply}
        </span>
        <textarea
          name="answer"
          required
          rows={4}
          className={fieldClass}
          data-testid="consultation-reply-box"
        />
      </label>
    </ApplicationActionForm>
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
  const unanswered = !hasResult && !item.ignored;
  const canAnswer =
    showReply &&
    !item.ignored &&
    (consultationQuestionAcceptsReply(item) || Boolean(item.seekerAnswers.length));
  const canSkip = showReply && unanswered;
  const canIgnore = showReply && unanswered;
  const replyKey = consultationReplyTargetKey(item.questionTurnId);
  return (
    <article
      id={harperQuestionAnchorId(item.questionTurnId)}
      className="min-w-0 overflow-hidden rounded-md border border-edge bg-canvas p-4"
      data-testid={
        item.ignored
          ? "consultation-ignored-question"
          : hasResult
            ? "consultation-answered"
            : "consultation-question-item"
      }
      data-harper-question={item.questionTurnId}
    >
      <p
        className="text-sm font-medium text-ink"
        data-testid="consultation-question"
      >
        {stripInternalIdsFromDisplayText(item.question)}
      </p>
      <div className="mt-3 space-y-3">
        {item.followUp && !item.ignored ? (
          <p className={`text-sm text-ink ${wrapClass}`} data-testid="consultation-follow-up">
            {stripInternalIdsFromDisplayText(item.followUp.text)}
          </p>
        ) : null}
        {hasResult && !item.ignored ? (
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
        {item.needsMoreDetail && !item.ignored ? (
          <p
            className="text-sm text-muted"
            data-testid="consultation-needs-more-detail"
          >
            {consultationConversationCopy.needsMoreDetailToShape}
          </p>
        ) : null}
        {!item.ignored ? (
          <SeekerRepliesSection
            campaignId={campaignId}
            canEdit={canEdit && showReply}
            answers={item.seekerAnswers}
          />
        ) : null}
        {canAnswer ? (
          <QuestionReplyForm
            campaignId={campaignId}
            item={item}
            onSubmitStart={onSubmitStart}
          />
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
        {canIgnore ? (
          <ApplicationActionForm
            action={ignoreConsultationQuestionAction}
            submitLabel={consultationConversationCopy.ignoreQuestion}
            pendingLabel={consultationConversationCopy.thinking}
            testId="consultation-ignore-question"
            variant="secondary"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="targetKey" value={replyKey} />
          </ApplicationActionForm>
        ) : null}
        {item.ignored && canEdit && showReply ? (
          <ApplicationActionForm
            action={reopenIgnoredConsultationTargetAction}
            submitLabel={consultationConversationCopy.reopenIgnored}
            pendingLabel={consultationConversationCopy.thinking}
            testId={`reopen-ignored-question-${item.questionTurnId}`}
            hideSubmit
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="targetKey" value={replyKey} />
            <a
              href="#harper-reopen-ignored"
              className={textLinkClass}
              data-testid={`reopen-ignored-question-${item.questionTurnId}-link`}
              onClick={(event) => {
                event.preventDefault();
                event.currentTarget.closest("form")?.requestSubmit();
              }}
            >
              {consultationConversationCopy.reopenIgnored}
            </a>
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

/** Shared open/answered question cards for Harper thread and Where you stand inline topics. */
export function QuestionList({
  campaignId,
  canEdit,
  questions,
  showReply,
  pendingTarget,
  jobsActive,
  onSubmitStart,
}: {
  campaignId: string;
  canEdit: boolean;
  questions: ConsultationQaItem[];
  showReply: boolean;
  pendingTarget: string | null;
  jobsActive: boolean;
  onSubmitStart: (replyKey: string, answer: string) => void;
}) {
  return (
    <>
      {questions.map((item) => (
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
            onSubmitStart(consultationReplyTargetKey(item.questionTurnId), answer);
          }}
        />
      ))}
    </>
  );
}

export function ConsultationThread({
  campaignId,
  canEdit,
  sessionStatus,
  jobsActive,
  interviewerSections,
}: {
  campaignId: string;
  canEdit: boolean;
  sessionStatus: string;
  jobsActive: boolean;
  turns: ThreadTurn[];
  statements: ThreadStatement[];
  interviewerSections?: HarperInterviewerSection[];
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const interviewers = interviewerSections ?? [];
  const showReply =
    canEdit &&
    sessionStatus !== "SKIPPED" &&
    sessionStatus !== "PAUSED" &&
    !jobsActive;

  if (interviewers.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-6 overflow-hidden" data-testid="consultation-thread">
      {interviewers.map((section) => (
        <section
          key={section.contactId}
          id={harperContactAnchorId(section.contactId)}
          className="min-w-0 space-y-3"
          data-testid="harper-interviewer-section"
          data-harper-contact={section.contactId}
        >
          <h3 className="text-sm font-semibold text-ink">{section.heading}</h3>
          <QuestionList
            campaignId={campaignId}
            canEdit={canEdit}
            questions={section.questions}
            showReply={showReply}
            pendingTarget={pendingTarget}
            jobsActive={jobsActive}
            onSubmitStart={(replyKey, answer) => {
              setPendingTarget(replyKey);
              void answer;
            }}
          />
        </section>
      ))}
    </div>
  );
}
