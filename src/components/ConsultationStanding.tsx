"use client";

import { AppButton } from "@/components/AppButton";
import { useMemo, useState } from "react";
import { consultationConversationCopy, evidenceStrengthLabels } from "@/lib/product-config";

export type StandingRequirement = {
  id: string;
  text: string;
  strength: "STRONG" | "PARTIAL" | "NONE";
  explanation: string | null;
  facts: Array<{ id: string; label: string; detail: string }>;
  experience: string | null;
};

export function ConsultationStanding({
  overall,
  gaps,
  careerRecap,
  requirements,
}: {
  overall: string | null;
  gaps: string[];
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
      <h3 className="text-sm font-semibold text-slate-900">
        {consultationConversationCopy.whereYouStand}
      </h3>
      <div
        className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4"
        data-testid="consultation-standing-summary"
      >
        {overall ? <p className="text-sm text-slate-900">{overall}</p> : null}
        <p className="text-sm text-slate-800">
          {evidenceStrengthLabels.STRONG} {counts.STRONG},{" "}
          {evidenceStrengthLabels.PARTIAL} {counts.PARTIAL},{" "}
          {evidenceStrengthLabels.NONE} {counts.NONE}
        </p>
        {gaps.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        ) : null}
        {careerRecap ? (
          <p className="text-sm text-slate-700" data-testid="consultation-career-recap">
            {careerRecap}
          </p>
        ) : null}
      </div>
      {expandable.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <AppButton
            type="button"
            className="text-sm font-medium text-slate-700 underline"
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
            <li key={item.id} className="min-w-0 space-y-1 overflow-hidden text-sm text-slate-800">
              <div>
                <span className="font-medium break-words">{item.text}</span>
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                  {evidenceStrengthLabels[item.strength]}
                </span>
              </div>
              {item.explanation ? (
                <p className="break-words whitespace-pre-wrap">{item.explanation}</p>
              ) : null}
              {item.experience ? (
                <p className="break-words text-xs text-slate-500">{item.experience}</p>
              ) : null}
              {item.facts.length > 0 ? (
                <div>
                  <AppButton
                    type="button"
                    className="text-sm font-medium text-slate-700 underline"
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
                          <p className="break-words font-medium text-slate-700">{fact.label}</p>
                          <p className="break-words whitespace-pre-wrap text-slate-600">
                            {fact.detail}
                          </p>
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
