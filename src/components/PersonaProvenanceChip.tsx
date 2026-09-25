"use client";
import { SECONDARY_CHIP_CLASS, AppButton } from "@/components/ui";

import { useState } from "react";
import { SourceMarkers } from "@/components/research-document";
import {
  PERSONA_PROVENANCE_LABELS,
  provenanceLabelForClasses,
  type PersonaProvenanceClass,
  type PersonaReviewSource,
} from "@/lib/persona-research/persona-briefing";
import { sourceMarkerNumbers } from "@/lib/research/source-index";

export function PersonaProvenanceChip({
  classes,
  sources,
  sourceIds,
  sourceIndex,
  note,
}: {
  classes: PersonaProvenanceClass[];
  sources?: PersonaReviewSource[];
  sourceIds?: string[];
  sourceIndex?: Map<string, number>;
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (classes.length === 0) return null;

  const label = provenanceLabelForClasses(classes);
  const linkedSources =
    sources?.filter((source) =>
      sourceIds?.includes(source.id) ||
      classes.some(
        (c) =>
          source.provenanceClass === c ||
          (c === "WEB_EVIDENCE" && source.sourceType === "URL") ||
          (c === "CUSTOMER_EVIDENCE" &&
            source.sourceType === "UPLOADED_DOCUMENT"),
      ),
    ) ?? [];
  const markers = sourceIndex
    ? sourceMarkerNumbers(sourceIds ?? linkedSources.map((s) => s.id), sourceIndex)
    : [];

  return (
    <span className="persona-provenance-chip research-source-chip relative ml-1 inline-block align-middle">
      <AppButton
        type="button"
        data-print-hide
        className={SECONDARY_CHIP_CLASS}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </AppButton>
      <span className="research-source-chip-print hidden rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 print:inline">
        {label}
      </span>
      {open ? (
        <span className="research-source-chip-popup absolute left-0 z-10 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-sm print:hidden">
          <span className="block font-medium text-slate-900">Provenance</span>
          <ul className="mt-1 list-disc pl-4">
            {classes.map((c) => (
              <li key={c}>{PERSONA_PROVENANCE_LABELS[c]}</li>
            ))}
          </ul>
          {note ? (
            <span className="mt-2 block text-slate-500">{note}</span>
          ) : null}
          {linkedSources.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {linkedSources.map((source) => (
                <li key={source.id}>
                  {source.originalUrl ? (
                    <a
                      href={source.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {source.displayName}
                    </a>
                  ) : (
                    source.displayName
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </span>
      ) : null}
      <SourceMarkers numbers={markers} />
    </span>
  );
}
