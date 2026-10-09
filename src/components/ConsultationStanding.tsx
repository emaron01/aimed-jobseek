"use client";

import {
  ignoreConsultationQuestionAction,
  reopenIgnoredConsultationTargetAction,
  replyConsultationAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { QuestionList } from "@/components/ConsultationThread";
import { useHarperDraft } from "@/components/HarperDraftStore";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  bestPracticeInterviewTitle,
  consultationConversationCopy,
  evidenceStrengthLabels,
} from "@/lib/product-config";
import { isApplicationDashboardPath } from "@/lib/application/workspace-links";
import { stripInternalIdsFromDisplayText } from "@/lib/consultation/evidence-display";
import {
  HARPER_GENERAL_ANCHOR,
  HARPER_STANDING_ANCHOR,
  harperQuestionAnchorId,
  type StandingInlineTopic,
} from "@/lib/consultation/harper-layout";
import {
  approvedAnswersAreAllExpanded,
  approvedCollapseControlLabel,
  collectApprovedQuestionIds,
  nextApprovedExpandedIds,
} from "@/lib/consultation/approved-collapse";
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
          aria-label={consultationConversationCopy.yourAnswer}
        />
        <span className="mt-1 block text-xs text-muted">
          {consultationConversationCopy.shareSomeDetailsHelp}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
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
          }}
          onSuccess={() => draft.clear()}
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

function harperLocationHash(): string {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function HarperPageSection({
  sectionId,
  title,
  description,
  note,
  open,
  onToggle,
  children,
  testId,
}: {
  sectionId: HarperPageSectionId;
  title: string;
  description: string;
  note?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <details
      id={`harper-section-${sectionId}`}
      className="rounded-md border border-edge bg-canvas"
      open={open}
      data-testid={testId}
      data-harper-section={sectionId}
      data-harper-section-open={open ? "true" : "false"}
    >
      <summary
        className="cursor-pointer list-none [&::-webkit-details-marker]:hidden !flex !h-auto w-full !flex-col !items-start !justify-start !rounded-none !border-0 !border-b !border-primary/20 !bg-primary/10 !px-4 !py-3"
        aria-expanded={open}
        data-testid={`${testId}-heading`}
        onClick={(event) => {
          event.preventDefault();
          onToggle();
        }}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <span
            aria-hidden="true"
            className="inline-block text-primary"
            data-testid={`${testId}-indicator`}
            data-harper-section-indicator={open ? "open" : "collapsed"}
          >
            {open ? "▼" : "▶"}
          </span>
          {title}
        </h3>
        <p
          className="mt-1 text-sm font-normal text-muted"
          data-testid={`${testId}-description`}
        >
          {description}
        </p>
        {note}
      </summary>
      <div className="space-y-4 border-t border-edge px-4 py-4" data-testid={`${testId}-body`}>
        {children}
      </div>
    </details>
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
  collapseWhenApproved,
  approvedExpandedIds,
  onApprovedExpandedChange,
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
  collapseWhenApproved: boolean;
  approvedExpandedIds?: ReadonlySet<string>;
  onApprovedExpandedChange?: (questionTurnId: string, expanded: boolean) => void;
}) {
  return (
    <ul className="space-y-4" data-testid="consultation-standing-list">
      {entries.map((entry) => {
        const labelMatchesQuestion = entry.questions.some(
          (question) => question.question.trim() === entry.label.trim(),
        );
        const ignoredQuestion = entry.questions.find((item) => item.ignored);
        return (
          <li
            key={entry.id}
            className="min-w-0 space-y-2 overflow-hidden rounded-md border-2 border-edge-strong bg-surface p-4 text-sm text-ink"
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
                  approvedExpandedIds={approvedExpandedIds}
                  onApprovedExpandedChange={onApprovedExpandedChange}
                  outerCard={false}
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
            entry.questions.length === 0 &&
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
    () => new Set(),
  );
  const pendingQuestionScroll = useRef<string | null>(null);
  const [expandedApproved, setExpandedApproved] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const approvedIds = useMemo(
    () =>
      collectApprovedQuestionIds({
        standingEntries: sections.standingEntries,
        bestPracticeQuestions: sections.bestPracticeQuestions,
      }),
    [sections.bestPracticeQuestions, sections.standingEntries],
  );
  const allApprovedExpanded = approvedAnswersAreAllExpanded(
    approvedIds,
    expandedApproved,
  );

  function changeApprovedExpanded(
    action:
      | { type: "toggle-all" }
      | { type: "set"; id: string; expanded: boolean },
  ) {
    setExpandedApproved((current) =>
      nextApprovedExpandedIds(approvedIds, current, action),
    );
    if (action.type === "toggle-all" && !allApprovedExpanded) {
      ensureSectionOpen(HARPER_SECTION_IDS.standing);
      ensureSectionOpen(HARPER_SECTION_IDS.bestPractice);
    }
  }

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
      if (isApplicationDashboardPath(window.location.pathname)) return;
      const hash = harperLocationHash();
      if (!hash) return;
      if (hash === HARPER_STANDING_ANCHOR || hash === HARPER_GENERAL_ANCHOR) {
        ensureSectionOpen(HARPER_SECTION_IDS.standing);
        return;
      }
      if (!hash.startsWith("harper-q:")) return;
      const turnId = hash.slice("harper-q:".length);
      const section = sections.sectionByQuestionTurnId.get(turnId);
      if (!section) return;
      pendingQuestionScroll.current = turnId;
      ensureSectionOpen(section);
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [sections.sectionByQuestionTurnId]);

  useEffect(() => {
    const turnId = pendingQuestionScroll.current;
    if (!turnId) return;
    const section = sections.sectionByQuestionTurnId.get(turnId);
    if (!section || !openSections.has(section)) return;
    pendingQuestionScroll.current = null;
    document.getElementById(harperQuestionAnchorId(turnId))?.scrollIntoView({
      block: "nearest",
    });
  }, [openSections, sections.sectionByQuestionTurnId]);

  const bestPracticeTitle = bestPracticeInterviewTitle(jobTitle);

  return (
    <div
      id={HARPER_STANDING_ANCHOR}
      className="space-y-4"
      data-testid="consultation-evidence"
    >
      {approvedIds.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <a
            href="#harper-toggle-all-approved"
            className={textLinkClass}
            data-testid="consultation-toggle-all-approved"
            onClick={(event) => {
              event.preventDefault();
              changeApprovedExpanded({ type: "toggle-all" });
            }}
          >
            {approvedCollapseControlLabel(allApprovedExpanded)}
          </a>
        </div>
      ) : null}
      <HarperPageSection
        sectionId={HARPER_SECTION_IDS.standing}
        title={consultationConversationCopy.whereYouStand}
        description={consultationConversationCopy.whereYouStandDescription}
        note={
          <p className="mt-1 text-sm text-ink" data-testid="consultation-standing-counts">
            {evidenceStrengthLabels.STRONG} {counts.STRONG},{" "}
            {evidenceStrengthLabels.PARTIAL} {counts.PARTIAL},{" "}
            {evidenceStrengthLabels.NONE} {counts.NONE}
          </p>
        }
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
          {careerRecap ? (
            <p className="text-sm text-ink" data-testid="consultation-career-recap">
              {stripInternalIdsFromDisplayText(careerRecap)}
            </p>
          ) : null}
        </div>
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
            collapseWhenApproved
            approvedExpandedIds={expandedApproved}
            onApprovedExpandedChange={(id, expanded) => {
              changeApprovedExpanded({ type: "set", id, expanded });
            }}
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
              approvedExpandedIds={expandedApproved}
              onApprovedExpandedChange={(id, expanded) => {
                changeApprovedExpanded({ type: "set", id, expanded });
              }}
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
