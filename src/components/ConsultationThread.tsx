"use client";

import { useState } from "react";
import {
  APPROVED_STATUS_BADGE_CLASS,
  collapsedApprovedQuestionLabel,
} from "@/lib/consultation/approved-collapse";
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
import { useHarperDraft } from "@/components/HarperDraftStore";
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
const actionRowClass =
  "flex flex-wrap items-center gap-2";
const actionFormClass = "inline-flex flex-wrap items-center gap-2";

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
      <p className="mt-3" data-testid={`${testId}-approved`}>
        <span
          className={APPROVED_STATUS_BADGE_CLASS}
          data-testid={`${testId}-approved-badge`}
        >
          {consultationStatementLabels.APPROVED}
        </span>
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
        compact
        formClassName={actionFormClass}
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
        compact
        formClassName={actionFormClass}
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
  const draft = statement.status === "DRAFT";
  return (
    <div
      className="mt-3 min-w-0 space-y-1 overflow-hidden border-t border-edge pt-3"
      data-testid={`consultation-statement-${statement.kind}`}
    >
      <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-subtle">
        <span>{consultationStatementLabels[statement.kind]}</span>
        {statement.status === "APPROVED" ? (
          <span
            className={APPROVED_STATUS_BADGE_CLASS}
            data-testid="consultation-approved-badge-expanded"
          >
            {consultationStatementLabels.APPROVED}
          </span>
        ) : draft ? (
          <span>{` · ${consultationStatementLabels.DRAFT}`}</span>
        ) : null}
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
            compact
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="turnId" value={answer.id} />
            <label className="mt-2 block text-sm">
              <span className="sr-only">{consultationConversationCopy.editAnswer}</span>
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
  actionsEnabled,
  showSkip,
  showIgnore,
  onSubmitStart,
}: {
  campaignId: string;
  item: ConsultationQaItem;
  actionsEnabled: boolean;
  showSkip: boolean;
  showIgnore: boolean;
  onSubmitStart: (answer: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const hasPriorReply = item.seekerAnswers.length > 0;
  const replyKey = consultationReplyTargetKey(item.questionTurnId);
  const draft = useHarperDraft(replyKey);

  if (hasPriorReply && !editing) {
    return (
      <div
        className={actionRowClass}
        data-testid="consultation-question-actions"
      >
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
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2" data-testid="consultation-reply-compose">
      <label className="block text-sm">
        <span className="sr-only">
          {hasPriorReply
            ? consultationConversationCopy.editAnswer
            : consultationConversationCopy.threadReply}
        </span>
        <textarea
          name="answer"
          required
          rows={4}
          value={draft.value}
          disabled={!actionsEnabled}
          onChange={(event) => draft.setValue(event.target.value)}
          className={fieldClass}
          data-testid="consultation-reply-box"
          form={`harper-reply-${item.questionTurnId}`}
        />
      </label>
      <div
        className={actionRowClass}
        data-testid="consultation-question-actions"
      >
        <ApplicationActionForm
          action={replyConsultationAction}
          submitLabel={
            hasPriorReply
              ? consultationConversationCopy.editAnswer
              : consultationConversationCopy.threadReply
          }
          pendingLabel={consultationConversationCopy.thinking}
          testId="consultation-reply"
          compact
          formClassName={actionFormClass}
          formId={`harper-reply-${item.questionTurnId}`}
          onSubmitStart={(formData) => {
            const answer = String(formData.get("answer") ?? "").trim();
            if (!answer) return false;
            onSubmitStart(answer);
            draft.clear();
          }}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="targetKey" value={replyKey} />
          {/* Visible textarea uses form=; keep a sync field for browsers that omit form= */}
          <input type="hidden" name="answer" value={draft.value} />
        </ApplicationActionForm>
        {showSkip ? (
          <ApplicationActionForm
            action={skipConsultationQuestionAction}
            submitLabel={consultationConversationCopy.skipQuestion}
            pendingLabel={consultationConversationCopy.thinking}
            testId="consultation-skip-question"
            variant="secondary"
            compact
            formClassName={actionFormClass}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="targetKey" value={replyKey} />
          </ApplicationActionForm>
        ) : null}
        {showIgnore ? (
          <ApplicationActionForm
            action={ignoreConsultationQuestionAction}
            submitLabel={consultationConversationCopy.ignoreQuestion}
            pendingLabel={consultationConversationCopy.thinking}
            testId="consultation-ignore-question"
            variant="secondary"
            compact
            formClassName={actionFormClass}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="targetKey" value={replyKey} />
          </ApplicationActionForm>
        ) : null}
      </div>
    </div>
  );
}

function QuestionCard({
  campaignId,
  canEdit,
  item,
  showQuestionText,
  actionsEnabled,
  pending,
  onSubmitStart,
  collapseWhenApproved = false,
  collapseWhenIgnored = false,
  approvedExpanded = false,
  onApprovedExpandedChange,
}: {
  campaignId: string;
  canEdit: boolean;
  item: ConsultationQaItem;
  showQuestionText: boolean;
  actionsEnabled: boolean;
  pending: boolean;
  onSubmitStart: (answer: string) => void;
  /** Section 1 / 3: approved answers start as one line with an Approved badge. */
  collapseWhenApproved?: boolean;
  /** Section 2: ignored items start collapsed with the Ignored reopen link. */
  collapseWhenIgnored?: boolean;
  /** Lifted with the page-level Collapse/Expand all approved control. */
  approvedExpanded?: boolean;
  onApprovedExpandedChange?: (questionTurnId: string, expanded: boolean) => void;
}) {
  const hasResult = Boolean(item.resumeBullet || item.talkingPoint);
  const approved =
    item.talkingPoint?.status === "APPROVED" ||
    item.resumeBullet?.status === "APPROVED";
  const approvedControlled =
    collapseWhenApproved &&
    approved &&
    !item.ignored &&
    Boolean(onApprovedExpandedChange);
  const [localExpanded, setLocalExpanded] = useState(
    !(
      (collapseWhenApproved && approved && !item.ignored && !approvedControlled) ||
      (collapseWhenIgnored && item.ignored)
    ),
  );
  const expanded = approvedControlled ? approvedExpanded : localExpanded;
  function setExpanded(next: boolean) {
    if (approvedControlled) {
      onApprovedExpandedChange?.(item.questionTurnId, next);
      return;
    }
    setLocalExpanded(next);
  }
  const unanswered = !hasResult && !item.ignored;
  const canAnswer =
    canEdit &&
    !item.ignored &&
    (consultationQuestionAcceptsReply(item) || Boolean(item.seekerAnswers.length));
  const canSkip = canEdit && actionsEnabled && unanswered;
  const canIgnore = canEdit && actionsEnabled && unanswered;
  const replyKey = consultationReplyTargetKey(item.questionTurnId);
  const oneLineLabel =
    item.talkingPoint?.content?.trim() ||
    item.resumeBullet?.content?.trim() ||
    item.question.trim();
  const oneLinePreview =
    oneLineLabel.length > 120 ? `${oneLineLabel.slice(0, 117)}…` : oneLineLabel;

  if (!expanded && collapseWhenIgnored && item.ignored) {
    return (
      <article
        id={harperQuestionAnchorId(item.questionTurnId)}
        className="min-w-0 overflow-hidden rounded-md border border-edge bg-canvas p-4"
        data-testid="consultation-ignored-question"
        data-harper-question={item.questionTurnId}
        data-harper-collapsed="ignored"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="min-w-0 flex-1 break-words">{oneLinePreview}</span>
          <span className="rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
            {consultationConversationCopy.questionIgnored}
          </span>
          <a
            href={`#${harperQuestionAnchorId(item.questionTurnId)}`}
            className={textLinkClass}
            data-testid={`expand-ignored-${item.questionTurnId}`}
            onClick={(event) => {
              event.preventDefault();
              setExpanded(true);
            }}
          >
            {consultationConversationCopy.showApprovedAnswer}
          </a>
          {canEdit ? (
            <ApplicationActionForm
              action={reopenIgnoredConsultationTargetAction}
              submitLabel={consultationConversationCopy.reopenIgnored}
              pendingLabel={consultationConversationCopy.thinking}
              testId={`reopen-ignored-question-${item.questionTurnId}`}
              hideSubmit
              compact
              formClassName={actionFormClass}
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
        </div>
      </article>
    );
  }

  if (!expanded && collapseWhenApproved && approved && !item.ignored) {
    return (
      <article
        id={harperQuestionAnchorId(item.questionTurnId)}
        className="min-w-0 overflow-hidden rounded-md border border-edge bg-canvas p-4"
        data-testid="consultation-answered"
        data-harper-question={item.questionTurnId}
        data-harper-collapsed="approved"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="min-w-0 flex-1 break-words">
            {collapsedApprovedQuestionLabel(stripInternalIdsFromDisplayText(item.question))}
          </span>
          <span
            className={APPROVED_STATUS_BADGE_CLASS}
            data-testid="consultation-approved-badge"
          >
            {consultationStatementLabels.APPROVED}
          </span>
          <a
            href={`#${harperQuestionAnchorId(item.questionTurnId)}`}
            className={textLinkClass}
            data-testid={`expand-approved-${item.questionTurnId}`}
            onClick={(event) => {
              event.preventDefault();
              setExpanded(true);
            }}
          >
            {consultationConversationCopy.showApprovedAnswer}
          </a>
        </div>
      </article>
    );
  }

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
      {(collapseWhenApproved && approved) || (collapseWhenIgnored && item.ignored) ? (
        <div className="mb-2">
          <a
            href={`#${harperQuestionAnchorId(item.questionTurnId)}`}
            className={textLinkClass}
            data-testid={`collapse-approved-${item.questionTurnId}`}
            onClick={(event) => {
              event.preventDefault();
              setExpanded(false);
            }}
          >
            {consultationConversationCopy.hideApprovedAnswer}
          </a>
        </div>
      ) : null}
      {showQuestionText ? (
        <p
          className="text-sm font-medium text-ink"
          data-testid="consultation-question"
        >
          {stripInternalIdsFromDisplayText(item.question)}
        </p>
      ) : (
        <span className="sr-only" data-testid="consultation-question">
          {stripInternalIdsFromDisplayText(item.question)}
        </span>
      )}
      <div className="mt-3 space-y-3">
        {item.followUp && !item.ignored ? (
          <div className="space-y-2" data-testid="consultation-follow-up-block">
            <p className={`text-sm text-ink ${wrapClass}`} data-testid="consultation-follow-up">
              {stripInternalIdsFromDisplayText(item.followUp.text)}
            </p>
            <p
              className="text-sm text-muted"
              data-testid="consultation-follow-up-hint"
            >
              {consultationConversationCopy.followUpReplyHint}
            </p>
          </div>
        ) : null}
        {!item.ignored ? (
          <SeekerRepliesSection
            campaignId={campaignId}
            canEdit={canEdit && actionsEnabled}
            answers={item.seekerAnswers}
          />
        ) : null}
        {hasResult && !item.ignored ? (
          <>
            {item.pendingDraftTalkingPoint || item.pendingDraftResumeBullet ? (
              <div
                className="mt-3 space-y-1"
                data-testid="consultation-pending-draft"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                  {consultationConversationCopy.newDraft}
                </p>
                {item.pendingDraftTalkingPoint ? (
                  <ResultBody statement={item.pendingDraftTalkingPoint} />
                ) : null}
                {item.pendingDraftResumeBullet ? (
                  <ResultBody statement={item.pendingDraftResumeBullet} />
                ) : null}
                {canEdit ? (
                  <ResultActions
                    campaignId={campaignId}
                    statements={
                      [
                        item.pendingDraftTalkingPoint,
                        item.pendingDraftResumeBullet,
                      ].filter(Boolean) as QaStatement[]
                    }
                    testId={`consultation-result-${item.questionTurnId}`}
                  />
                ) : null}
              </div>
            ) : null}
            {item.talkingPoint ? <ResultBody statement={item.talkingPoint} /> : null}
            {item.resumeBullet ? <ResultBody statement={item.resumeBullet} /> : null}
            {canEdit &&
            !item.pendingDraftTalkingPoint &&
            !item.pendingDraftResumeBullet ? (
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
        {canAnswer ? (
          <QuestionReplyForm
            campaignId={campaignId}
            item={item}
            actionsEnabled={actionsEnabled}
            showSkip={canSkip}
            showIgnore={canIgnore}
            onSubmitStart={onSubmitStart}
          />
        ) : canSkip || canIgnore ? (
          <div
            className={actionRowClass}
            data-testid="consultation-question-actions"
          >
            {canSkip ? (
              <ApplicationActionForm
                action={skipConsultationQuestionAction}
                submitLabel={consultationConversationCopy.skipQuestion}
                pendingLabel={consultationConversationCopy.thinking}
                testId="consultation-skip-question"
                variant="secondary"
                compact
                formClassName={actionFormClass}
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
                compact
                formClassName={actionFormClass}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="targetKey" value={replyKey} />
              </ApplicationActionForm>
            ) : null}
          </div>
        ) : null}
        {item.ignored && canEdit ? (
          <ApplicationActionForm
            action={reopenIgnoredConsultationTargetAction}
            submitLabel={consultationConversationCopy.reopenIgnored}
            pendingLabel={consultationConversationCopy.thinking}
            testId={`reopen-ignored-question-${item.questionTurnId}`}
            hideSubmit
            compact
            formClassName={actionFormClass}
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
            className="space-y-1 text-sm text-muted"
            data-testid="harper-thinking"
            role="status"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge-strong border-t-ink"
                aria-hidden
              />
              {consultationConversationCopy.thinking}
            </div>
            <p data-testid="harper-processing-minutes">
              {consultationConversationCopy.processingCanTakeMinutes}
            </p>
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
  suppressQuestionTextWhenMatchesLabel,
  collapseWhenApproved = false,
  collapseWhenIgnored = false,
  approvedExpandedIds,
  onApprovedExpandedChange,
  onSubmitStart,
}: {
  campaignId: string;
  canEdit: boolean;
  questions: ConsultationQaItem[];
  showReply: boolean;
  pendingTarget: string | null;
  jobsActive: boolean;
  /** When set, hide the question paragraph if it equals this label (topic heading already shows it). */
  suppressQuestionTextWhenMatchesLabel?: string | null;
  collapseWhenApproved?: boolean;
  collapseWhenIgnored?: boolean;
  approvedExpandedIds?: ReadonlySet<string>;
  onApprovedExpandedChange?: (questionTurnId: string, expanded: boolean) => void;
  onSubmitStart: (replyKey: string, answer: string) => void;
}) {
  const actionsEnabled = showReply && !jobsActive;
  const label = suppressQuestionTextWhenMatchesLabel?.trim() ?? "";
  return (
    <>
      {questions.map((item) => {
        const questionText = item.question.trim();
        const showQuestionText =
          !label || questionText !== label;
        return (
          <QuestionCard
            key={item.questionTurnId}
            campaignId={campaignId}
            canEdit={canEdit && showReply}
            item={item}
            showQuestionText={showQuestionText}
            actionsEnabled={actionsEnabled}
            pending={
              pendingTarget === consultationReplyTargetKey(item.questionTurnId) &&
              jobsActive
            }
            collapseWhenApproved={collapseWhenApproved}
            collapseWhenIgnored={collapseWhenIgnored}
            approvedExpanded={approvedExpandedIds?.has(item.questionTurnId) ?? false}
            onApprovedExpandedChange={onApprovedExpandedChange}
            onSubmitStart={(answer) => {
              onSubmitStart(consultationReplyTargetKey(item.questionTurnId), answer);
            }}
          />
        );
      })}
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
  // Keep reply surfaces mounted while jobs run so unsaved drafts survive.
  const showReply =
    canEdit &&
    sessionStatus !== "SKIPPED";

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
