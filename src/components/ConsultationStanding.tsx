"use client";

import {
  ignoreConsultationQuestionAction,
  reopenIgnoredConsultationTargetAction,
  replyConsultationAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { QuestionList } from "@/components/ConsultationThread";
import { useHarperDraft } from "@/components/HarperDraftStore";
import { useMemo, useState } from "react";
import {
  consultationConversationCopy,
  evidenceStrengthLabels,
} from "@/lib/product-config";
import { stripInternalIdsFromDisplayText } from "@/lib/consultation/evidence-display";
import {
  HARPER_GENERAL_ANCHOR,
  HARPER_STANDING_ANCHOR,
  type StandingInlineTopic,
} from "@/lib/consultation/harper-layout";
import type { StandingListEntry } from "@/lib/consultation/standing-entries";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
const textLinkClass =
  "cursor-pointer text-sm font-medium text-ink underline decoration-ink underline-offset-2";

/** @deprecated Prefer StandingListEntry; kept for call-site typing during transition. */
export type StandingRequirement = {
  id: string;
  targetKey: string;
  text: string;
  strength: "STRONG" | "PARTIAL" | "NONE" | null;
  kind?:
    | "REQUIRED"
    | "OUTCOME"
    | "COMPETENCY"
    | "MISSION"
    | "PREFERRED"
    | null;
  explanation: string | null;
  gapStatus?: string | null;
  facts: Array<{ id: string; label: string; detail: string | null }>;
  experience: string | null;
};

export type StandingRequirementQuestions = {
  targetKey: string;
  questions: ConsultationQaItem[];
};

function GapShareDetailsForm({
  campaignId,
  targetKey,
  enabled,
}: {
  campaignId: string;
  targetKey: string;
  enabled: boolean;
}) {
  const draft = useHarperDraft(`gap:${targetKey}`);
  return (
    <div className="space-y-2" data-testid={`standing-share-form-${targetKey}`}>
      <label className="block text-sm">
        <span className="sr-only">
          {consultationConversationCopy.shareSomeDetails}
        </span>
        <textarea
          name="answer"
          required
          rows={4}
          value={draft.value}
          disabled={!enabled}
          onChange={(event) => draft.setValue(event.target.value)}
          className={fieldClass}
          form={`harper-gap-${targetKey}`}
          data-testid={`share-gap-details-box-${targetKey}`}
        />
        <span className="mt-1 block text-xs text-muted">
          {consultationConversationCopy.shareSomeDetailsHelp}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <ApplicationActionForm
          action={replyConsultationAction}
          submitLabel={consultationConversationCopy.shareSomeDetails}
          pendingLabel={consultationConversationCopy.thinking}
          testId={`share-gap-details-${targetKey}`}
          compact
          formClassName="inline-flex"
          formId={`harper-gap-${targetKey}`}
          onSubmitStart={(formData) => {
            const answer = String(formData.get("answer") ?? "").trim();
            if (!answer) return false;
            draft.clear();
          }}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="targetKey" value={targetKey} />
          <input type="hidden" name="answer" value={draft.value} />
        </ApplicationActionForm>
        <ApplicationActionForm
          action={ignoreConsultationQuestionAction}
          submitLabel={consultationConversationCopy.ignoreQuestion}
          pendingLabel={consultationConversationCopy.thinking}
          testId={`ignore-gap-${targetKey}`}
          variant="secondary"
          compact
          formClassName="inline-flex"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="targetKey" value={targetKey} />
        </ApplicationActionForm>
      </div>
    </div>
  );
}

function ReopenIgnoredLink({
  campaignId,
  targetKey,
  testId,
}: {
  campaignId: string;
  targetKey: string;
  testId: string;
}) {
  return (
    <ApplicationActionForm
      action={reopenIgnoredConsultationTargetAction}
      submitLabel={consultationConversationCopy.reopenIgnored}
      pendingLabel={consultationConversationCopy.thinking}
      testId={testId}
      hideSubmit
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="targetKey" value={targetKey} />
      <a
        href="#harper-reopen-ignored"
        className={textLinkClass}
        data-testid={`${testId}-link`}
        onClick={(event) => {
          event.preventDefault();
          event.currentTarget.closest("form")?.requestSubmit();
        }}
      >
        {consultationConversationCopy.reopenIgnored}
      </a>
    </ApplicationActionForm>
  );
}

/**
 * One Where you stand list: summary counts + each requirement/topic once
 * (rating Strong/Partial/None only), with questions, replies, and results inline.
 */
export function ConsultationStanding({
  campaignId,
  canEdit,
  acceptingReplies,
  sessionStatus,
  jobsActive,
  overall,
  entries,
  /** @deprecated Ignored — entries replace gaps / dual lists. */
  gaps: _gaps,
  careerRecap,
  /** @deprecated Prefer `entries`. */
  requirements: _requirements,
  /** @deprecated Prefer `entries`. */
  dedicatedTopics: _dedicatedTopics,
  /** @deprecated Prefer `entries`. */
  requirementQuestions: _requirementQuestions,
}: {
  campaignId: string;
  canEdit: boolean;
  acceptingReplies: boolean;
  sessionStatus: string;
  jobsActive: boolean;
  overall: string | null;
  entries: StandingListEntry[];
  gaps?: unknown[];
  careerRecap?: string | null;
  requirements?: StandingRequirement[];
  dedicatedTopics?: StandingInlineTopic[];
  requirementQuestions?: StandingRequirementQuestions[];
}) {
  void _gaps;
  void _requirements;
  void _dedicatedTopics;
  void _requirementQuestions;
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const counts = useMemo(() => {
    return entries.reduce(
      (acc, item) => {
        acc[item.strength] += 1;
        return acc;
      },
      { STRONG: 0, PARTIAL: 0, NONE: 0 },
    );
  }, [entries]);
  // PAUSED no longer blocks replies — server reopens to IN_PROGRESS on submit.
  const showReply =
    canEdit &&
    acceptingReplies &&
    sessionStatus !== "SKIPPED";
  const repliesEnabled = showReply && !jobsActive;
  const expandable = entries.filter((item) => item.facts.length > 0);
  const allOpen =
    expandable.length > 0 &&
    expandable.every((item) => openIds.has(item.id));

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(open: boolean) {
    setOpenIds(open ? new Set(expandable.map((item) => item.id)) : new Set());
  }

  return (
    <section
      id={HARPER_STANDING_ANCHOR}
      className="space-y-4"
      data-testid="consultation-evidence"
    >
      <div
        className="space-y-2 rounded-md border border-edge bg-canvas p-4"
        data-testid="consultation-standing-summary"
      >
        {overall ? (
          <p className="text-sm text-ink">
            {stripInternalIdsFromDisplayText(overall)}
          </p>
        ) : null}
        <p className="text-sm text-ink" data-testid="consultation-standing-counts">
          {evidenceStrengthLabels.STRONG} {counts.STRONG},{" "}
          {evidenceStrengthLabels.PARTIAL} {counts.PARTIAL},{" "}
          {evidenceStrengthLabels.NONE} {counts.NONE}
        </p>
        {careerRecap ? (
          <p className="text-sm text-ink" data-testid="consultation-career-recap">
            {stripInternalIdsFromDisplayText(careerRecap)}
          </p>
        ) : null}
      </div>
      {expandable.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <a
            href="#harper-toggle-all-evidence"
            className={textLinkClass}
            data-testid="consultation-toggle-all-evidence"
            onClick={(event) => {
              event.preventDefault();
              setAll(!allOpen);
            }}
          >
            {allOpen
              ? consultationConversationCopy.collapseAllEvidence
              : consultationConversationCopy.expandAllEvidence}
          </a>
        </div>
      ) : null}
      <div
        id={HARPER_GENERAL_ANCHOR}
        className="space-y-4"
        data-testid="harper-standing-topics"
      >
        <ul className="space-y-4" data-testid="consultation-standing-list">
          {entries.map((entry) => {
            const open = openIds.has(entry.id);
            const labelMatchesQuestion = entry.questions.some(
              (question) => question.question.trim() === entry.label.trim(),
            );
            const ignoredQuestion = entry.questions.find((item) => item.ignored);
            return (
              <li
                key={entry.id}
                className="min-w-0 space-y-2 overflow-hidden text-sm text-ink"
                data-testid="consultation-standing-entry"
                data-standing-target={entry.targetKey}
                data-strength={entry.strength}
              >
                {/* a. Label + rating only (no Open/Closed/Confirmed) */}
                <div>
                  {!labelMatchesQuestion || entry.questions.length !== 1 ? (
                    <span className="font-medium break-words">{entry.label}</span>
                  ) : null}
                  <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                    {evidenceStrengthLabels[entry.strength]}
                  </span>
                </div>
                {/* b. Reason + expand evidence */}
                {entry.explanation ? (
                  <p className="break-words whitespace-pre-wrap">
                    {stripInternalIdsFromDisplayText(entry.explanation)}
                  </p>
                ) : null}
                {entry.experience ? (
                  <p className="break-words text-xs text-subtle">
                    {entry.experience}
                  </p>
                ) : null}
                {entry.facts.length > 0 ? (
                  <div>
                    <a
                      href={`#harper-evidence-${entry.id}`}
                      className={textLinkClass}
                      onClick={(event) => {
                        event.preventDefault();
                        toggle(entry.id);
                      }}
                      data-testid={`toggle-evidence-${entry.id}`}
                    >
                      {open
                        ? consultationConversationCopy.collapseEvidence
                        : consultationConversationCopy.expandEvidence}
                    </a>
                    {open ? (
                      <ul className="mt-2 space-y-1">
                        {entry.facts.map((fact) => (
                          <li key={fact.id} className="min-w-0 overflow-hidden">
                            <p className="break-words font-medium text-ink">
                              {fact.label}
                            </p>
                            {fact.detail ? (
                              <p className="break-words whitespace-pre-wrap text-muted">
                                {fact.detail}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {/* c–f. Questions, replies, results, answer form */}
                {entry.questions.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    <QuestionList
                      campaignId={campaignId}
                      canEdit={canEdit}
                      questions={entry.questions}
                      showReply={showReply}
                      pendingTarget={pendingTarget}
                      jobsActive={jobsActive}
                      suppressQuestionTextWhenMatchesLabel={
                        labelMatchesQuestion ? entry.label : null
                      }
                      onSubmitStart={(replyKey, answer) => {
                        setPendingTarget(replyKey);
                        void answer;
                      }}
                    />
                  </div>
                ) : null}
                {ignoredQuestion && canEdit && acceptingReplies ? (
                  <ReopenIgnoredLink
                    campaignId={campaignId}
                    targetKey={`question:${ignoredQuestion.questionTurnId}`}
                    testId={`reopen-ignored-gap-${entry.targetKey}`}
                  />
                ) : null}
                {entry.showShareForm &&
                canEdit &&
                acceptingReplies &&
                !ignoredQuestion ? (
                  <div className="mt-2 space-y-2">
                    <GapShareDetailsForm
                      campaignId={campaignId}
                      targetKey={entry.targetKey}
                      enabled={repliesEnabled}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
