"use client";

import {
  ignoreConsultationQuestionAction,
  reopenIgnoredConsultationTargetAction,
  replyConsultationAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  QuestionList,
  ResultActions,
} from "@/components/ConsultationThread";
import { useMemo, useState } from "react";
import {
  consultationConversationCopy,
  consultationGapStatusCopy,
  evidenceStrengthLabels,
} from "@/lib/product-config";
import { stripInternalIdsFromDisplayText } from "@/lib/consultation/evidence-display";
import {
  HARPER_GENERAL_ANCHOR,
  HARPER_STANDING_ANCHOR,
  type StandingInlineTopic,
} from "@/lib/consultation/harper-layout";
import type { ConsultationGapStatus } from "@/lib/consultation/standing";
import type { ConsultationQaItem, QaStatement } from "@/lib/consultation/qa-view";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
const textLinkClass =
  "cursor-pointer text-sm font-medium text-ink underline decoration-ink underline-offset-2";

export type StandingRequirement = {
  id: string;
  targetKey: string;
  text: string;
  /** null = dropped from standing after reassess — show topic without a rating. */
  strength: "STRONG" | "PARTIAL" | "NONE" | null;
  explanation: string | null;
  gapStatus: ConsultationGapStatus | null;
  facts: Array<{ id: string; label: string; detail: string | null }>;
  experience: string | null;
};

export type StandingGapView = {
  targetKey: string;
  label: string;
  status: ConsultationGapStatus;
  talkTrack: string | null;
  harperNote?: string | null;
  questionTurnId: string | null;
  /**
   * When set, the open question is rendered inline under this requirement —
   * no Answer jump link (Batch B2).
   */
  answerableQuestionTurnId: string | null;
  ignored: boolean;
  resumeBullet: QaStatement | null;
  talkingPoint: QaStatement | null;
  statements: QaStatement[];
};

export type StandingRequirementQuestions = {
  targetKey: string;
  questions: ConsultationQaItem[];
};

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

export function ConsultationStanding({
  campaignId,
  canEdit,
  acceptingReplies,
  sessionStatus,
  jobsActive,
  overall,
  gaps,
  careerRecap,
  requirements,
  dedicatedTopics = [],
  requirementQuestions = [],
}: {
  campaignId: string;
  canEdit: boolean;
  acceptingReplies: boolean;
  sessionStatus: string;
  jobsActive: boolean;
  overall: string | null;
  gaps: StandingGapView[];
  careerRecap: string | null;
  requirements: StandingRequirement[];
  /** why-this-company / chronology / role-expertise topics with questions. */
  dedicatedTopics?: StandingInlineTopic[];
  /** Gap / requirement questions keyed for inline render under each requirement. */
  requirementQuestions?: StandingRequirementQuestions[];
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const counts = useMemo(() => {
    return requirements.reduce(
      (acc, item) => {
        if (item.strength) acc[item.strength] += 1;
        return acc;
      },
      { STRONG: 0, PARTIAL: 0, NONE: 0 },
    );
  }, [requirements]);
  const questionsByRequirement = useMemo(() => {
    const map = new Map<string, ConsultationQaItem[]>();
    for (const row of requirementQuestions) {
      map.set(row.targetKey, row.questions);
    }
    return map;
  }, [requirementQuestions]);
  const showReply =
    canEdit &&
    sessionStatus !== "SKIPPED" &&
    sessionStatus !== "PAUSED" &&
    !jobsActive;
  const allOpen =
    requirements.length > 0 &&
    requirements.every((item) => openIds.has(item.id) || item.facts.length === 0);
  const expandable = requirements.filter((item) => item.facts.length > 0);

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

  function renderQuestionList(questions: ConsultationQaItem[]) {
    if (questions.length === 0) return null;
    return (
      <div className="mt-3 space-y-3">
        <QuestionList
          campaignId={campaignId}
          canEdit={canEdit}
          questions={questions}
          showReply={showReply}
          pendingTarget={pendingTarget}
          jobsActive={jobsActive}
          onSubmitStart={(replyKey, answer) => {
            setPendingTarget(replyKey);
            void answer;
          }}
        />
      </div>
    );
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
        {gaps.length > 0 ? (
          <ul className="list-disc space-y-3 pl-5 text-sm text-ink">
            {gaps.map((gap) => (
              <li
                key={gap.targetKey}
                data-testid={`consultation-gap-${gap.ignored ? "ignored" : gap.status}`}
                data-gap-target={gap.targetKey}
              >
                <p>
                  <span className="font-medium">{gap.label}</span>
                  <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                    {gap.ignored
                      ? consultationConversationCopy.gapIgnored
                      : consultationGapStatusCopy[gap.status]}
                  </span>
                </p>
                {gap.talkTrack ? (
                  <p className="mt-1 whitespace-pre-wrap">
                    {stripInternalIdsFromDisplayText(gap.talkTrack)}
                  </p>
                ) : null}
                {gap.harperNote ? (
                  <p
                    className="mt-1 whitespace-pre-wrap text-ink"
                    data-testid={`harper-coaching-note-${gap.targetKey}`}
                  >
                    {stripInternalIdsFromDisplayText(gap.harperNote)}
                  </p>
                ) : null}
                {gap.resumeBullet ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted">
                    {stripInternalIdsFromDisplayText(gap.resumeBullet.content)}
                  </p>
                ) : null}
                {gap.statements.length > 0 && canEdit && !gap.ignored ? (
                  <ResultActions
                    campaignId={campaignId}
                    statements={gap.statements}
                    testId={`consultation-gap-result-${gap.targetKey}`}
                  />
                ) : null}
                {gap.ignored && canEdit && acceptingReplies ? (
                  <ReopenIgnoredLink
                    campaignId={campaignId}
                    targetKey={
                      gap.questionTurnId
                        ? `question:${gap.questionTurnId}`
                        : gap.targetKey
                    }
                    testId={`reopen-ignored-gap-${gap.targetKey}`}
                  />
                ) : null}
                {/* Batch B2: Answer jump link removed — question renders inline under the requirement. */}
                {!gap.ignored &&
                gap.status === "open" &&
                !gap.answerableQuestionTurnId &&
                canEdit &&
                acceptingReplies ? (
                  <div className="mt-2 space-y-2">
                    <ApplicationActionForm
                      action={replyConsultationAction}
                      submitLabel={consultationConversationCopy.shareSomeDetails}
                      pendingLabel={consultationConversationCopy.thinking}
                      testId={`share-gap-details-${gap.targetKey}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input type="hidden" name="targetKey" value={gap.targetKey} />
                      <label className="block text-sm">
                        <span className="font-medium text-ink">
                          {consultationConversationCopy.shareSomeDetails}
                        </span>
                        <textarea
                          name="answer"
                          required
                          rows={4}
                          className={fieldClass}
                        />
                        <span className="mt-1 block text-xs text-muted">
                          {consultationConversationCopy.shareSomeDetailsHelp}
                        </span>
                      </label>
                    </ApplicationActionForm>
                    <ApplicationActionForm
                      action={ignoreConsultationQuestionAction}
                      submitLabel={consultationConversationCopy.ignoreQuestion}
                      pendingLabel={consultationConversationCopy.thinking}
                      testId={`ignore-gap-${gap.targetKey}`}
                      variant="secondary"
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input type="hidden" name="targetKey" value={gap.targetKey} />
                    </ApplicationActionForm>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
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
        {dedicatedTopics.map((topic) => (
          <div
            key={topic.targetKey}
            className="min-w-0 space-y-2 overflow-hidden text-sm text-ink"
            data-testid={`standing-topic-${topic.kind}`}
            data-standing-target={topic.targetKey}
          >
            <h4 className="text-sm font-semibold text-ink">{topic.label}</h4>
            {renderQuestionList(topic.questions)}
          </div>
        ))}
        <ul className="space-y-3" data-testid="consultation-standing-requirements">
          {requirements.map((item) => {
            const open = openIds.has(item.id);
            const inlineQuestions = questionsByRequirement.get(item.targetKey) ?? [];
            return (
              <li
                key={item.id}
                className="min-w-0 space-y-1 overflow-hidden text-sm text-ink"
                data-testid="consultation-standing-requirement"
                data-strength={item.strength}
                data-standing-target={item.targetKey}
              >
                <div>
                  <span className="font-medium break-words">{item.text}</span>
                  {item.gapStatus ? (
                    <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                      {consultationGapStatusCopy[item.gapStatus]}
                    </span>
                  ) : item.strength ? (
                    <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                      {evidenceStrengthLabels[item.strength]}
                    </span>
                  ) : null}
                </div>
                {item.explanation ? (
                  <p className="break-words whitespace-pre-wrap">
                    {stripInternalIdsFromDisplayText(item.explanation)}
                  </p>
                ) : null}
                {item.experience ? (
                  <p className="break-words text-xs text-subtle">{item.experience}</p>
                ) : null}
                {item.facts.length > 0 ? (
                  <div>
                    <a
                      href={`#harper-evidence-${item.id}`}
                      className={textLinkClass}
                      onClick={(event) => {
                        event.preventDefault();
                        toggle(item.id);
                      }}
                      data-testid={`toggle-evidence-${item.id}`}
                    >
                      {open
                        ? consultationConversationCopy.collapseEvidence
                        : consultationConversationCopy.expandEvidence}
                    </a>
                    {open ? (
                      <ul className="mt-2 space-y-1">
                        {item.facts.map((fact) => (
                          <li key={fact.id} className="min-w-0 overflow-hidden">
                            <p className="break-words font-medium text-ink">{fact.label}</p>
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
                {renderQuestionList(inlineQuestions)}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
