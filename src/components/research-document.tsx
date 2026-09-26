"use client";
import { SECONDARY_CHIP_CLASS, AppButton } from "@/components/ui";

import { useState, type ReactNode } from "react";
import {
  formatSourceMarkerLabel,
  sourceMarkerNumbers,
} from "@/lib/research/source-index";
import type { ResearchSource } from "@/lib/research/types";
import { sourceLabelForCompany } from "@/lib/research/company-briefing";

export function SourceMarkers({ numbers }: { numbers: number[] }) {
  const label = formatSourceMarkerLabel(numbers);
  if (!label) return null;
  return (
    <sup className="research-source-marker ml-0.5 hidden align-super text-[10px] font-medium text-subtle print:inline">
      {label}
    </sup>
  );
}

export function ResearchReadSection({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <section className="research-read-section space-y-2">
      <h3 className="text-sm font-semibold tracking-wide text-subtle uppercase">
        {title}
      </h3>
      {empty ? (
        <p className="text-sm text-subtle">None recorded from the material.</p>
      ) : (
        children
      )}
    </section>
  );
}

export function ResearchSourceChip({
  sources,
  sourceIndex,
}: {
  sources: ResearchSource[];
  sourceIndex?: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  const first = sources[0]!;
  const label = sourceLabelForCompany(first);
  const markers = sourceIndex
    ? sourceMarkerNumbers(
        sources.map((source) => source.url),
        sourceIndex,
      )
    : [];

  return (
    <span className="research-source-chip relative ml-1 inline-block align-middle">
      <AppButton
        type="button"
        data-print-hide
        className={SECONDARY_CHIP_CLASS}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        {sources.length > 1 ? ` +${sources.length - 1}` : ""}
      </AppButton>
      <span
        className={`research-source-chip-print hidden rounded-full border border-edge bg-surface px-2 py-0.5 text-[11px] font-medium text-muted print:inline ${
          open ? "" : ""
        }`}
      >
        {label}
        {sources.length > 1 ? ` +${sources.length - 1}` : ""}
      </span>
      <span
        className={`research-source-chip-popup ${
          open ? "" : "hidden"
        } absolute left-0 z-10 mt-1 w-72 rounded-md border border-edge bg-surface p-3 text-left text-xs text-ink shadow-sm print:hidden`}
      >
        {sources.map((source, index) => (
          <span key={source.url} className="block">
            {index > 0 ? (
              <span className="my-2 block border-t border-edge" />
            ) : null}
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-ink underline"
            >
              {source.title?.trim() || source.url}
            </a>
            <span className="mt-1 block text-subtle">
              {source.sourceType}
              {source.publisher ? ` · ${source.publisher}` : ""}
            </span>
            <span className="mt-0.5 block break-all text-subtle">
              {source.url}
            </span>
          </span>
        ))}
      </span>
      <SourceMarkers numbers={markers} />
    </span>
  );
}

export function ResearchListItem({
  text,
  sources,
  sourceIndex,
}: {
  text: string;
  sources: ResearchSource[];
  sourceIndex?: Map<string, number>;
}) {
  return (
    <li className="leading-relaxed text-ink">
      {text}
      <ResearchSourceChip sources={sources} sourceIndex={sourceIndex} />
    </li>
  );
}

export function ResearchProse({
  text,
  sources,
  sourceIndex,
}: {
  text: string;
  sources: ResearchSource[];
  sourceIndex?: Map<string, number>;
}) {
  return (
    <p className="text-[17px] leading-7 text-ink">
      {text}
      <ResearchSourceChip sources={sources} sourceIndex={sourceIndex} />
    </p>
  );
}

export function ResearchSourcesAppendix({
  title = "Sources",
  sources,
  sourceIndex,
}: {
  title?: string;
  sources: ResearchSource[];
  sourceIndex?: Map<string, number>;
}) {
  if (sources.length === 0) return null;
  return (
    <section className="research-sources-appendix mt-8 border-t border-edge pt-6">
      <h3 className="text-sm font-semibold tracking-wide text-subtle uppercase">
        {title}
      </h3>
      <ul className="mt-3 space-y-3 text-sm text-ink">
        {sources.map((source) => {
          const number =
            sourceIndex?.get(source.url) ??
            sources.findIndex((row) => row.url === source.url) + 1;
          return (
            <li key={source.url}>
              <p className="font-medium text-ink">
                <span className="text-subtle">[{number}]</span>{" "}
                {source.title?.trim() || source.url}
              </p>
              <p className="text-xs text-subtle">
                {source.sourceType}
                {source.publisher ? ` · ${source.publisher}` : ""}
                {source.retrievedAt
                  ? ` · Retrieved ${source.retrievedAt.slice(0, 10)}`
                  : ""}
              </p>
              <p className="break-all text-xs text-muted">{source.url}</p>
              {source.supports.length > 0 ? (
                <p className="mt-1 text-xs text-subtle">
                  Supports: {source.supports.join(", ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
