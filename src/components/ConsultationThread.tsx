"use client";

import { useState } from "react";
import {
  flagConsultationInaccuracyAction,
  replyConsultationAction,
  reviseConsultationResultAction,
  useConsultationResultAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  consultationConfig,
  consultationConversationCopy,
  consultationStatementLabels,
} from "@/lib/product-config";

const fieldClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const wrapClass = "min-w-0 overflow-hidden break-words whitespace-pre-wrap";

export type ThreadTurn = {
  id: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
};

export type ThreadStatement = {
  id: string;
  turnId: string;
  kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
  status: string;
  content: string;
  strengtheningNote: string | null;
};

export function ConsultationThread({
  campaignId,
  canEdit,
  sessionStatus,
  jobsActive,
  generating,
  turns,
  statements,
  latestDraftTurnId,
}: {
  campaignId: string;
  canEdit: boolean;
  sessionStatus: string;
  jobsActive: boolean;
  generating: boolean;
  turns: ThreadTurn[];
  statements: ThreadStatement[];
  latestDraftTurnId: string | null;
}) {
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const statementsByTurn = new Map<string, ThreadStatement[]>();
  for (const statement of statements) {
    const existing = statementsByTurn.get(statement.turnId) ?? [];
    existing.push(statement);
    statementsByTurn.set(statement.turnId, existing);
  }
  const persistedPending = Boolean(
    pendingReply &&
      turns.some((turn) => turn.speaker === "SEEKER" && turn.body === pendingReply),
  );
  const visibleTurns = [...turns];
  if (pendingReply && !persistedPending) {
    visibleTurns.push({
      id: "optimistic-seeker",
      speaker: "SEEKER",
      body: pendingReply,
    });
  }
  const showThinking = Boolean(pendingReply) && (jobsActive || generating || !persistedPending);

  return (
    <div className="min-w-0 space-y-3 overflow-hidden" data-testid="consultation-thread">
      {visibleTurns.map((turn) => {
        const turnStatements = statementsByTurn.get(turn.id) ?? [];
        const showConfirm =
          canEdit &&
          sessionStatus === "IN_PROGRESS" &&
          turn.id === latestDraftTurnId &&
          turnStatements.some((statement) => statement.status === "DRAFT");
        return (
          <div
            key={turn.id}
            className={
              turn.speaker === "CONSULTANT"
                ? "min-w-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-3"
                : "min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white p-3"
            }
            data-testid={
              turn.speaker === "CONSULTANT"
                ? "consultation-question"
                : "consultation-reply"
            }
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {turn.speaker === "CONSULTANT"
                ? consultationConfig.displayName
                : "You"}
            </p>
            <p className={`mt-1 text-sm text-slate-900 ${wrapClass}`}>{turn.body}</p>
            {turnStatements.map((statement) => (
              <div
                key={statement.id}
                className="mt-3 min-w-0 space-y-1 overflow-hidden border-t border-slate-200 pt-3"
                data-testid={`consultation-statement-${statement.kind}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {consultationStatementLabels[statement.kind]}
                </p>
                {statement.strengtheningNote ? (
                  <p
                    className={`text-sm text-slate-700 ${wrapClass}`}
                    data-testid="consultation-strengthening-note"
                  >
                    {statement.strengtheningNote}
                  </p>
                ) : null}
                <p className={`text-sm text-slate-800 ${wrapClass}`}>{statement.content}</p>
              </div>
            ))}
            {showConfirm ? (
              <div className="mt-3 space-y-3" data-testid="consultation-confirm">
                <ApplicationActionForm
                  action={useConsultationResultAction}
                  submitLabel={consultationConversationCopy.useThis}
                  pendingLabel="Saving…"
                  testId="use-consultation-result"
                >
                  <input type="hidden" name="campaignId" value={campaignId} />
                </ApplicationActionForm>
                <ApplicationActionForm
                  action={reviseConsultationResultAction}
                  submitLabel={consultationConversationCopy.changeSomething}
                  testId="change-consultation-result"
                >
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">
                      {consultationConversationCopy.changePrompt}
                    </span>
                    <textarea name="instruction" required rows={3} className={fieldClass} />
                  </label>
                </ApplicationActionForm>
                <ApplicationActionForm
                  action={flagConsultationInaccuracyAction}
                  submitLabel={consultationConversationCopy.notAccurate}
                  testId="flag-consultation-result"
                >
                  <input type="hidden" name="campaignId" value={campaignId} />
                </ApplicationActionForm>
              </div>
            ) : null}
          </div>
        );
      })}
      {showThinking ? (
        <div
          className="flex items-center gap-2 text-sm text-slate-600"
          data-testid="harper-thinking"
          role="status"
        >
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800"
            aria-hidden
          />
          {consultationConversationCopy.thinking}
        </div>
      ) : null}
      {canEdit &&
      sessionStatus === "IN_PROGRESS" &&
      !jobsActive &&
      !generating ? (
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
            <span className="font-medium text-slate-700">
              {consultationConversationCopy.threadReply}
            </span>
            <textarea name="answer" required rows={4} className={fieldClass} />
          </label>
        </ApplicationActionForm>
      ) : null}
    </div>
  );
}
