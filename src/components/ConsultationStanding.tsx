"use client";

import {
  ignoreConsultationQuestionAction,
  reopenIgnoredConsultationTargetAction,
  replyConsultationAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
import { QuestionList } from "@/components/ConsultationThread";
import { useHarperDraft } from "@/components/HarperDraftStore";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  bestPracticeInterviewTitle,
  consultationConversationCopy,
  evidenceStrengthLabels,
} from "@/lib/product-config";
import { stripInternalIdsFromDisplayText } from "@/lib/consultation/evidence-display";
import {
  HARPER_GENERAL_ANCHOR,
  HARPER_STANDING_ANCHOR,
  harperQuestionAnchorId,
  type StandingInlineTopic,
} from "@/lib/consultation/harper-layout";
import {
  HARPER_SECTION_IDS,
  partitionHarperThreeSections,
  type HarperPageSectionId,
} from "@/lib/consultation/harper-three-sections";
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

function HarperPageSection({
  sectionId,
  title,
  description,
  open,
  onToggle,
  children,
  testId,
}: {
  sectionId: HarperPageSectionId;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      id={`harper-section-${sectionId}`}
      className="rounded-md border border-edge bg-canvas"
      data-testid={testId}
      data-harper-section={sectionId}
      data-harper-section-open={open ? "true" : "false"}
    >
      <AppButton
        type="button"
        variant="secondary"
        className="!h-auto w-full !flex-col !items-start !justify-start !rounded-none !border-0 !bg-transparent !px-4 !py-3 !shadow-none hover:!bg-canvas active:!bg-canvas"
        aria-expanded={open}
        data-testid={`${testId}-heading`}
        onClick={onToggle}
      >
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p
          className="mt-1 text-sm font-normal text-muted"
          data-testid={`${testId}-description`}
        >
          {description}
        </p>
      </AppButton>
      {open ? (
        <div className="space-y-4 border-t border-edge px-4 py-4" data-testid={`${testId}-body`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function StandingRequirementList({
  campaignId,
  canEdit,
  acceptingReplies,
  showReply,
  repliesEnabled,
  jobsActive,
  entries,
  pendingTarget,
  setPendingTarget,
  openIds,
  toggle,
  collapseWhenApproved,
}: {
  campaignId: string;
  canEdit: boolean;
  acceptingReplies: boolean;
  showReply: boolean;
  repliesEnabled: boolean;
  jobsActive: boolean;
  entries: StandingListEntry[];
  pendingTarget: string | null;
  setPendingTarget: (key: string | null) => void;
  openIds: Set<string>;
  toggle: (id: string) => void;
  collapseWhenApproved: boolean;
}) {
  return (
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
            <div>
              {!labelMatchesQuestion || entry.questions.length !== 1 ? (
                <span className="font-medium break-words">{entry.label}</span>
              ) : null}
              <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                {evidenceStrengthLabels[entry.strength]}
              </span>
            </div>
            {entry.explanation ? (
              <p className="break-words whitespace-pre-wrap">
                {stripInternalIdsFromDisplayText(entry.explanation)}
              </p>
            ) : null}
            {entry.experience ? (
              <p className="break-words text-xs text-subtle">{entry.experience}</p>
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
            {entry.questions.length > 0 ? (
              <div className="mt-3 space-y-3">
                <QuestionList
                  campaignId={campaignId}
                  canEdit={canEdit}
                  questions={entry.questions}
                  showReply={showReply}
                  pendingTarget={pendingTarget}
                  jobsActive={jobsActive}
                  collapseWhenApproved={collapseWhenApproved}
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
  );
}

/**
 * Harper default view: intro is rendered by ConsultationSection; this component
 * renders the three collapsible sections (Where you stand / needs info / best practice).
 */
export function ConsultationStanding({
  campaignId,
  canEdit,
  acceptingReplies,
  sessionStatus,
  jobsActive,
  overall,
  entries,
  jobTitle = null,
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
  jobTitle?: string | null;
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
  const sections = useMemo(
    () => partitionHarperThreeSections(entries),
    [entries],
  );
  const [openSections, setOpenSections] = useState<Set<HarperPageSectionId>>(
    () =>
      new Set([
        HARPER_SECTION_IDS.standing,
        HARPER_SECTION_IDS.needsInfo,
        HARPER_SECTION_IDS.bestPractice,
      ]),
  );
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const requirementEntries = sections.standingEntries.filter(
    (entry) => entry.kind !== "TOPIC",
  );
  const topicEntries = sections.standingEntries.filter(
    (entry) => entry.kind === "TOPIC",
  );
  const counts = useMemo(() => {
    return requirementEntries.reduce(
      (acc, item) => {
        acc[item.strength] += 1;
        return acc;
      },
      { STRONG: 0, PARTIAL: 0, NONE: 0 },
    );
  }, [requirementEntries]);

  const showReply =
    canEdit && acceptingReplies && sessionStatus !== "SKIPPED";
  const repliesEnabled = showReply && !jobsActive;
  const expandable = requirementEntries.filter((item) => item.facts.length > 0);
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

  function toggleSection(id: HarperPageSectionId) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function ensureSectionOpen(id: HarperPageSectionId) {
    setOpenSections((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  useEffect(() => {
    function openFromHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      if (hash === HARPER_STANDING_ANCHOR || hash === HARPER_GENERAL_ANCHOR) {
        ensureSectionOpen(HARPER_SECTION_IDS.standing);
        return;
      }
      if (!hash.startsWith("harper-q:")) return;
      const turnId = hash.slice("harper-q:".length);
      const section = sections.sectionByQuestionTurnId.get(turnId);
      if (section) ensureSectionOpen(section);
      requestAnimationFrame(() => {
        document.getElementById(harperQuestionAnchorId(turnId))?.scrollIntoView({
          block: "nearest",
        });
      });
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [sections.sectionByQuestionTurnId]);

  const bestPracticeTitle = bestPracticeInterviewTitle(jobTitle);

  return (
    <div
      id={HARPER_STANDING_ANCHOR}
      className="space-y-4"
      data-testid="consultation-evidence"
    >
      <HarperPageSection
        sectionId={HARPER_SECTION_IDS.standing}
        title={consultationConversationCopy.whereYouStand}
        description={consultationConversationCopy.whereYouStandDescription}
        open={openSections.has(HARPER_SECTION_IDS.standing)}
        onToggle={() => toggleSection(HARPER_SECTION_IDS.standing)}
        testId="harper-section-standing"
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
        <div id={HARPER_GENERAL_ANCHOR} data-testid="harper-standing-topics">
          <StandingRequirementList
            campaignId={campaignId}
            canEdit={canEdit}
            acceptingReplies={acceptingReplies}
            showReply={showReply}
            repliesEnabled={repliesEnabled}
            jobsActive={jobsActive}
            entries={[...requirementEntries, ...topicEntries]}
            pendingTarget={pendingTarget}
            setPendingTarget={setPendingTarget}
            openIds={openIds}
            toggle={toggle}
            collapseWhenApproved
          />
        </div>
      </HarperPageSection>

      <HarperPageSection
        sectionId={HARPER_SECTION_IDS.needsInfo}
        title={consultationConversationCopy.needsMoreInfoTitle}
        description={consultationConversationCopy.needsMoreInfoDescription}
        open={openSections.has(HARPER_SECTION_IDS.needsInfo)}
        onToggle={() => toggleSection(HARPER_SECTION_IDS.needsInfo)}
        testId="harper-section-needs-info"
      >
        {sections.needsInfoQuestions.length > 0 ? (
          <div className="space-y-3" data-testid="harper-needs-info-list">
            <QuestionList
              campaignId={campaignId}
              canEdit={canEdit}
              questions={sections.needsInfoQuestions}
              showReply={showReply}
              pendingTarget={pendingTarget}
              jobsActive={jobsActive}
              collapseWhenIgnored
              onSubmitStart={(replyKey, answer) => {
                setPendingTarget(replyKey);
                void answer;
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted" data-testid="harper-needs-info-empty">
            No questions need more information right now.
          </p>
        )}
      </HarperPageSection>

      <HarperPageSection
        sectionId={HARPER_SECTION_IDS.bestPractice}
        title={bestPracticeTitle}
        description={consultationConversationCopy.bestPracticeDescription}
        open={openSections.has(HARPER_SECTION_IDS.bestPractice)}
        onToggle={() => toggleSection(HARPER_SECTION_IDS.bestPractice)}
        testId="harper-section-best-practice"
      >
        {sections.bestPracticeQuestions.length > 0 ? (
          <div className="space-y-3" data-testid="harper-best-practice-list">
            <QuestionList
              campaignId={campaignId}
              canEdit={canEdit}
              questions={sections.bestPracticeQuestions}
              showReply={showReply}
              pendingTarget={pendingTarget}
              jobsActive={jobsActive}
              collapseWhenApproved
              onSubmitStart={(replyKey, answer) => {
                setPendingTarget(replyKey);
                void answer;
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted" data-testid="harper-best-practice-empty">
            Best-practice questions will appear here when Harper prepares them.
          </p>
        )}
      </HarperPageSection>
    </div>
  );
}
