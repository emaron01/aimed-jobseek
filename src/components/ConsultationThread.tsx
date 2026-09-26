"use client";

import { useState } from "react";
import {
  approveConsultationQaResultAction,
  regenerateConsultationQaResultAction,
  replyConsultationAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  consultationConfig,
  consultationConversationCopy,
  consultationStatementLabels,
  polishCopy,
} from "@/lib/product-config";
import {
  buildConsultationQaView,
  type QaStatement,
  type QaTurn,
} from "@/lib/consultation/qa-view";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
const wrapClass = "min-w-0 overflow-hidden break-words whitespace-pre-wrap";

export type ThreadTurn = QaTurn;
export type ThreadStatement = QaStatement;

function ResultActions({
  campaignId,
  statements,
  testId,
}: {
  campaignId: string;
  statements: QaStatement[];
  testId: string;
}) {
  if (statements.length === 0) return null;
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
  return (
    <div
      className="mt-3 min-w-0 space-y-1 overflow-hidden border-t border-edge pt-3"
      data-testid={`consultation-statement-${statement.kind}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {consultationStatementLabels[statement.kind]}
      </p>
      {statement.strengtheningNote ? (
        <p className={`text-sm text-ink ${wrapClass}`} data-testid="consultation-strengthening-note">
          {statement.strengtheningNote}
        </p>
      ) : null}
      <p className={`text-sm text-ink ${wrapClass}`}>{statement.content}</p>
    </div>
  );
}

export function ConsultationThread({
  campaignId,
  canEdit,
  sessionStatus,
  jobsActive,
  generating,
  turns,
  statements,
}: {
  campaignId: string;
  canEdit: boolean;
  sessionStatus: string;
  jobsActive: boolean;
  generating: boolean;
  turns: ThreadTurn[];
  statements: ThreadStatement[];
}) {
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const view = buildConsultationQaView({ turns, statements });
  const persistedPending = Boolean(
    pendingReply &&
      turns.some((turn) => turn.speaker === "SEEKER" && turn.body === pendingReply),
  );
  const showThinking =
    Boolean(pendingReply) && (jobsActive || generating || !persistedPending);
  const showReply =
    canEdit &&
    sessionStatus === "IN_PROGRESS" &&
    !jobsActive &&
    !generating &&
    Boolean(view.currentQuestion);

  return (
    <div className="min-w-0 space-y-4 overflow-hidden" data-testid="consultation-thread">
      {view.answered.map((item) => (
        <article
          key={item.questionTurnId}
          className="min-w-0 overflow-hidden rounded-md border border-edge bg-canvas p-4"
          data-testid="consultation-answered"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">
            {consultationConfig.displayName}
          </p>
          <p
            className={`mt-1 text-sm text-ink ${wrapClass}`}
            data-testid="consultation-question"
          >
            {item.question}
          </p>
          {item.seekerAnswers.length > 0 ? (
            <details className="mt-3" data-testid="consultation-seeker-answer">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                {consultationConversationCopy.yourAnswer}
              </summary>
              <div className="mt-2 space-y-2">
                {item.seekerAnswers.map((answer) => (
                  <p
                    key={answer.id}
                    className={`text-sm text-ink ${wrapClass}`}
                    data-testid="consultation-seeker-turn"
                  >
                    {answer.body}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
          {item.resumeBullet ? <ResultBody statement={item.resumeBullet} /> : null}
          {item.talkingPoint ? <ResultBody statement={item.talkingPoint} /> : null}
          {canEdit ? (
            <ResultActions
              campaignId={campaignId}
              statements={item.statements}
              testId={`consultation-result-${item.questionTurnId}`}
            />
          ) : null}
        </article>
      ))}

      {view.currentQuestion ? (
        <div
          className="min-w-0 overflow-hidden rounded-md border border-edge bg-canvas p-4"
          data-testid="consultation-current-question"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">
            {consultationConfig.displayName}
          </p>
          <p className={`mt-1 text-sm text-ink ${wrapClass}`} data-testid="consultation-question">
            {view.currentQuestion.text}
          </p>
          {showReply ? (
            <div className="mt-3">
              <ApplicationActionForm
                action={replyConsultationAction}
                submitLabel={consultationConversationCopy.threadReply}
                pendingLabel={consultationConversationCopy.thinking}
                testId="consultation-reply"
                onSubmitStart={(formData) => {
                  const answer = String(formData.get("answer") ?? "").trim();
                  if (!answer) return;
                  setPendingReply(answer);
                }}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <label className="block text-sm">
                  <span className="font-medium text-ink">
                    {consultationConversationCopy.threadReply}
                  </span>
                  <textarea name="answer" required rows={4} className={fieldClass} />
                </label>
              </ApplicationActionForm>
            </div>
          ) : null}
        </div>
      ) : null}

      {showThinking ? (
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
  );
}
