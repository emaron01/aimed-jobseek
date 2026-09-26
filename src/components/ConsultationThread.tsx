"use client";

import { useState } from "react";
import {
  flagConsultationInaccuracyAction,
  replyConsultationAction,
  reviseConsultationResultAction,
  useConsultationResultAction,
} from "@/app/actions/consultation";
import { AppButton } from "@/components/ui";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  consultationConfig,
  consultationConversationCopy,
  consultationStatementLabels,
} from "@/lib/product-config";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
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
  const [showSeekerReplies, setShowSeekerReplies] = useState(false);
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
  const storedSeekerTurns = turns.filter((turn) => turn.speaker === "SEEKER");

  return (
    <div className="min-w-0 space-y-3 overflow-hidden" data-testid="consultation-thread">
      {storedSeekerTurns.length > 0 ? (
        <AppButton
          type="button"
          variant="secondary"
          data-testid="toggle-seeker-replies"
          onClick={() => setShowSeekerReplies((open) => !open)}
        >
          {showSeekerReplies
            ? consultationConversationCopy.hideYourReplies
            : consultationConversationCopy.showYourReplies}
        </AppButton>
      ) : null}
      {visibleTurns.map((turn) => {
        const storedSeeker = turn.speaker === "SEEKER" && turn.id !== "optimistic-seeker";
        if (storedSeeker && !showSeekerReplies) return null;
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
                ? "min-w-0 overflow-hidden rounded-md border border-edge bg-canvas p-3"
                : "min-w-0 overflow-hidden rounded-md border border-edge bg-surface p-3"
            }
            data-testid={
              turn.speaker === "CONSULTANT"
                ? "consultation-question"
                : "consultation-seeker-turn"
            }
          >
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">
              {turn.speaker === "CONSULTANT"
                ? consultationConfig.displayName
                : consultationConversationCopy.seekerSpeaker}
            </p>
            <p className={`mt-1 text-sm text-ink ${wrapClass}`}>{turn.body}</p>
            {turnStatements.map((statement) => (
              <div
                key={statement.id}
                className="mt-3 min-w-0 space-y-1 overflow-hidden border-t border-edge pt-3"
                data-testid={`consultation-statement-${statement.kind}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                  {consultationStatementLabels[statement.kind]}
                </p>
                {statement.strengtheningNote ? (
                  <p
                    className={`text-sm text-ink ${wrapClass}`}
                    data-testid="consultation-strengthening-note"
                  >
                    {statement.strengtheningNote}
                  </p>
                ) : null}
                <p className={`text-sm text-ink ${wrapClass}`}>{statement.content}</p>
              </div>
            ))}
            {showConfirm ? (
              <div className="mt-3 space-y-3" data-testid="consultation-confirm">
                <ApplicationActionForm
                  action={useConsultationResultAction}
                  submitLabel={consultationConversationCopy.useThis}
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
                    <span className="font-medium text-ink">
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
          className="flex items-center gap-2 text-sm text-muted"
          data-testid="harper-thinking"
          role="status"
        >
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge-strong border-t-slate-800"
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
            <span className="font-medium text-ink">
              {consultationConversationCopy.threadReply}
            </span>
            <textarea name="answer" required rows={4} className={fieldClass} />
          </label>
        </ApplicationActionForm>
      ) : null}
    </div>
  );
}
