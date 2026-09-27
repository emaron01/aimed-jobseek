"use client";

import { replyConsultationAction } from "@/app/actions/consultation";
import { AppButton } from "@/components/AppButton";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { ResultActions } from "@/components/ConsultationThread";
import { useMemo, useState } from "react";
import {
  consultationConversationCopy,
  consultationGapStatusCopy,
  evidenceStrengthLabels,
} from "@/lib/product-config";
import { stripInternalIdsFromDisplayText } from "@/lib/consultation/evidence-display";
import type { ConsultationGapStatus } from "@/lib/consultation/standing";
import type { QaStatement } from "@/lib/consultation/qa-view";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

export type StandingRequirement = {
  id: string;
  text: string;
  strength: "STRONG" | "PARTIAL" | "NONE";
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
  resumeBullet: QaStatement | null;
  talkingPoint: QaStatement | null;
  statements: QaStatement[];
};

export function ConsultationStanding({
  campaignId,
  canEdit,
  acceptingReplies,
  overall,
  gaps,
  careerRecap,
  requirements,
}: {
  campaignId: string;
  canEdit: boolean;
  acceptingReplies: boolean;
  overall: string | null;
  gaps: StandingGapView[];
  careerRecap: string | null;
  requirements: StandingRequirement[];
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const counts = useMemo(() => {
    return requirements.reduce(
      (acc, item) => {
        acc[item.strength] += 1;
        return acc;
      },
      { STRONG: 0, PARTIAL: 0, NONE: 0 },
    );
  }, [requirements]);
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

  return (
    <section className="space-y-4" data-testid="consultation-evidence">
      <div
        className="space-y-2 rounded-md border border-edge bg-canvas p-4"
        data-testid="consultation-standing-summary"
      >
        {overall ? (
          <p className="text-sm text-ink">
            {stripInternalIdsFromDisplayText(overall)}
          </p>
        ) : null}
        <p className="text-sm text-ink">
          {evidenceStrengthLabels.STRONG} {counts.STRONG},{" "}
          {evidenceStrengthLabels.PARTIAL} {counts.PARTIAL},{" "}
          {evidenceStrengthLabels.NONE} {counts.NONE}
        </p>
        {gaps.length > 0 ? (
          <ul className="list-disc space-y-3 pl-5 text-sm text-ink">
            {gaps.map((gap) => (
              <li key={gap.targetKey} data-testid={`consultation-gap-${gap.status}`}>
                <p>
                  <span className="font-medium">{gap.label}</span>
                  <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                    {consultationGapStatusCopy[gap.status]}
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
                {gap.statements.length > 0 && canEdit ? (
                  <ResultActions
                    campaignId={campaignId}
                    statements={gap.statements}
                    testId={`consultation-gap-result-${gap.targetKey}`}
                  />
                ) : null}
                {gap.status === "open" && canEdit && acceptingReplies ? (
                  <ApplicationActionForm
                    action={replyConsultationAction}
                    submitLabel={consultationConversationCopy.shareSomeDetails}
                    pendingLabel={consultationConversationCopy.thinking}
                    testId={`share-gap-details-${gap.targetKey}`}
                  >
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="targetKey" value={gap.targetKey} />
                    <label className="mt-2 block text-sm">
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
          <AppButton
            type="button"
            className="text-sm font-medium text-ink underline"
            onClick={() => setAll(!allOpen)}
          >
            {allOpen
              ? consultationConversationCopy.collapseAllEvidence
              : consultationConversationCopy.expandAllEvidence}
          </AppButton>
        </div>
      ) : null}
      <ul className="space-y-3">
        {requirements.map((item) => {
          const open = openIds.has(item.id);
          return (
            <li key={item.id} className="min-w-0 space-y-1 overflow-hidden text-sm text-ink">
              <div>
                <span className="font-medium break-words">{item.text}</span>
                <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                  {item.gapStatus
                    ? consultationGapStatusCopy[item.gapStatus]
                    : evidenceStrengthLabels[item.strength]}
                </span>
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
                  <AppButton
                    type="button"
                    className="text-sm font-medium text-ink underline"
                    onClick={() => toggle(item.id)}
                    data-testid={`toggle-evidence-${item.id}`}
                  >
                    {open
                      ? consultationConversationCopy.collapseEvidence
                      : consultationConversationCopy.expandEvidence}
                  </AppButton>
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
