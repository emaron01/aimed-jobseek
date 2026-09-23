"use client";

import { useMemo } from "react";
import { ResearchReadSection } from "@/components/research-document";
import { PersonaProvenanceChip } from "@/components/PersonaProvenanceChip";
import {
  provenanceForClaim,
  sourceIdsForClaim,
  type PersonaBriefingView,
  type PersonaCriteriaBriefingGroups,
  type PersonaEvidenceRef,
  type PersonaProvenanceAssessment,
  type PersonaReviewSource,
} from "@/lib/persona-research/persona-briefing";
import { buildSourceIndex } from "@/lib/research/source-index";
import { vocab } from "@/lib/product-config";

function ClaimLine({
  text,
  evidenceRefs,
  provenanceAssessments,
  sources,
  sourceIndex,
}: {
  text: string;
  evidenceRefs: PersonaEvidenceRef[];
  provenanceAssessments: PersonaProvenanceAssessment[];
  sources: PersonaReviewSource[];
  sourceIndex: Map<string, number>;
}) {
  const classes = provenanceForClaim({
    claim: text,
    evidenceRefs,
    provenanceAssessments,
  });
  const sourceIds = sourceIdsForClaim({ claim: text, evidenceRefs });
  return (
    <li className="leading-relaxed text-slate-800">
      {text}
      <PersonaProvenanceChip
        classes={classes}
        sources={sources}
        sourceIds={sourceIds}
        sourceIndex={sourceIndex}
      />
    </li>
  );
}

function CriteriaGroup({
  title,
  emptyLabel,
  rows,
}: {
  title: string;
  emptyLabel: string;
  rows: PersonaCriteriaBriefingGroups[keyof PersonaCriteriaBriefingGroups];
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px] text-slate-800">
          {rows.map((row) => (
            <li key={row.name}>
              <span className="font-medium">{row.name}</span>
              {row.description ? (
                <span className="text-slate-600"> — {row.description}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PersonaBriefingDocument({
  briefing,
  sourceLead,
  sourceNames,
  metaLine,
  evidenceRefs,
  provenanceAssessments,
  sources,
  criteriaGroups,
}: {
  briefing: PersonaBriefingView;
  sourceLead: string;
  sourceNames: string[];
  metaLine: string;
  evidenceRefs: PersonaEvidenceRef[];
  provenanceAssessments: PersonaProvenanceAssessment[];
  sources: PersonaReviewSource[];
  criteriaGroups: PersonaCriteriaBriefingGroups;
}) {
  const sourceIndex = useMemo(
    () => buildSourceIndex(sources, (source) => source.id),
    [sources],
  );

  return (
    <article className="space-y-8">
      <div>
        <p className="text-base text-slate-800" data-testid="persona-source-lead">
          {sourceLead}
        </p>
        {sourceNames.length > 0 ? (
          <p className="mt-1 text-sm text-slate-500">{sourceNames.join(" · ")}</p>
        ) : null}
      </div>

      <header className="space-y-1 border-b border-slate-200 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">{briefing.name}</h2>
        {metaLine ? (
          <p className="text-sm text-slate-600">{metaLine}</p>
        ) : null}
      </header>

      <ResearchReadSection title="Who this is" empty={!briefing.whoTheyAre}>
        {briefing.whoTheyAre ? (
          <p className="text-[17px] leading-7 text-slate-800">
            {briefing.whoTheyAre}
            <PersonaProvenanceChip
              classes={provenanceForClaim({
                claim: briefing.whoTheyAre,
                evidenceRefs,
                provenanceAssessments,
              })}
              sources={sources}
              sourceIds={sourceIdsForClaim({
                claim: briefing.whoTheyAre,
                evidenceRefs,
              })}
              sourceIndex={sourceIndex}
            />
          </p>
        ) : null}
        {briefing.buyingRole ? (
          <p className="mt-2 text-sm text-slate-600">
            Buying role: {briefing.buyingRole}
          </p>
        ) : null}
      </ResearchReadSection>

      <ResearchReadSection
        title="What they own"
        empty={
          briefing.ownershipAreas.length === 0 &&
          briefing.responsibilities.length === 0 &&
          briefing.organizationalPressures.length === 0
        }
      >
        {briefing.ownershipAreas.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-[17px]">
            {briefing.ownershipAreas.map((item) => (
              <ClaimLine
                key={item}
                text={item}
                evidenceRefs={evidenceRefs}
                provenanceAssessments={provenanceAssessments}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            ))}
          </ul>
        ) : null}
        {briefing.responsibilities.length > 0 ? (
          <ul className="mt-2 list-disc space-y-2 pl-5 text-[17px]">
            {briefing.responsibilities.map((item) => (
              <ClaimLine
                key={item}
                text={item}
                evidenceRefs={evidenceRefs}
                provenanceAssessments={provenanceAssessments}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            ))}
          </ul>
        ) : null}
        {briefing.organizationalPressures.length > 0 ? (
          <div className="mt-2">
            <p className="text-sm font-medium text-slate-600">Pressures</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
              {briefing.organizationalPressures.map((item) => (
                <ClaimLine
                  key={item}
                  text={item}
                  evidenceRefs={evidenceRefs}
                  provenanceAssessments={provenanceAssessments}
                  sources={sources}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </ResearchReadSection>

      <ResearchReadSection
        title="What they care about"
        empty={
          briefing.painPoints.length === 0 &&
          briefing.kpisAndAccountabilities.length === 0 &&
          briefing.likelyObjections.length === 0
        }
      >
        {briefing.painPoints.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-[17px]">
            {briefing.painPoints.map((item) => (
              <ClaimLine
                key={item}
                text={item}
                evidenceRefs={evidenceRefs}
                provenanceAssessments={provenanceAssessments}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            ))}
          </ul>
        ) : null}
        {briefing.kpisAndAccountabilities.length > 0 ? (
          <div className="mt-2">
            <p className="text-sm font-medium text-slate-600">KPIs & accountabilities</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
              {briefing.kpisAndAccountabilities.map((item) => (
                <ClaimLine
                  key={item}
                  text={item}
                  evidenceRefs={evidenceRefs}
                  provenanceAssessments={provenanceAssessments}
                  sources={sources}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {briefing.likelyObjections.length > 0 ? (
          <div className="mt-2">
            <p className="text-sm font-medium text-slate-600">Likely objections</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
              {briefing.likelyObjections.map((item) => (
                <ClaimLine
                  key={item}
                  text={item}
                  evidenceRefs={evidenceRefs}
                  provenanceAssessments={provenanceAssessments}
                  sources={sources}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </ResearchReadSection>

      <ResearchReadSection
        title={`What they want from the ${vocab.product.singular}`}
        empty={briefing.desiredOutcomes.length === 0}
      >
        <ul className="list-disc space-y-2 pl-5 text-[17px]">
          {briefing.desiredOutcomes.map((item) => (
            <ClaimLine
              key={item}
              text={item}
              evidenceRefs={evidenceRefs}
              provenanceAssessments={provenanceAssessments}
              sources={sources}
              sourceIndex={sourceIndex}
            />
          ))}
        </ul>
      </ResearchReadSection>

      <ResearchReadSection
        title="How to talk to them"
        empty={
          briefing.messagingNotes.length === 0 &&
          briefing.terminology.length === 0 &&
          briefing.personaSpecificPositioning.length === 0 &&
          briefing.proofPointsToEmphasize.length === 0
        }
      >
        {briefing.messagingNotes.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-[17px]">
            {briefing.messagingNotes.map((item) => (
              <ClaimLine
                key={item}
                text={item}
                evidenceRefs={evidenceRefs}
                provenanceAssessments={provenanceAssessments}
                sources={sources}
                sourceIndex={sourceIndex}
              />
            ))}
          </ul>
        ) : null}
        {briefing.personaSpecificPositioning.length > 0 ? (
          <div className="mt-2">
            <p className="text-sm font-medium text-slate-600">Positioning</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
              {briefing.personaSpecificPositioning.map((item) => (
                <ClaimLine
                  key={item}
                  text={item}
                  evidenceRefs={evidenceRefs}
                  provenanceAssessments={provenanceAssessments}
                  sources={sources}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {briefing.proofPointsToEmphasize.length > 0 ? (
          <div className="mt-2">
            <p className="text-sm font-medium text-slate-600">Proof to emphasize</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
              {briefing.proofPointsToEmphasize.map((item) => (
                <ClaimLine
                  key={item}
                  text={item}
                  evidenceRefs={evidenceRefs}
                  provenanceAssessments={provenanceAssessments}
                  sources={sources}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {briefing.terminology.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {briefing.terminology.map((term) => (
              <li
                key={term}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-800"
              >
                {term}
                <PersonaProvenanceChip
                  classes={provenanceForClaim({
                    claim: term,
                    evidenceRefs,
                    provenanceAssessments,
                  })}
                  sources={sources}
                  sourceIds={sourceIdsForClaim({ claim: term, evidenceRefs })}
                  sourceIndex={sourceIndex}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </ResearchReadSection>

      <ResearchReadSection
        title="Qualification summary"
        empty={
          criteriaGroups.qualifies.length === 0 &&
          criteriaGroups.excludes.length === 0 &&
          criteriaGroups.needsReview.length === 0
        }
      >
        <div className="space-y-4">
          <CriteriaGroup
            title="What qualifies"
            emptyLabel="No qualifying criteria recorded."
            rows={criteriaGroups.qualifies}
          />
          <CriteriaGroup
            title="What excludes"
            emptyLabel={`No exclusions — no ${vocab.contact.singular} will be disqualified on ${vocab.persona.singular} fit alone.`}
            rows={criteriaGroups.excludes}
          />
          <CriteriaGroup
            title="Needs your review"
            emptyLabel="Nothing waiting for classification."
            rows={criteriaGroups.needsReview}
          />
        </div>
      </ResearchReadSection>

      {sources.length > 0 ? (
        <section className="research-sources-appendix mt-8 border-t border-slate-200 pt-6">
          <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Sources
          </h3>
          <ul className="mt-3 space-y-3 text-sm text-slate-700">
            {sources.map((source) => {
              const number = sourceIndex.get(source.id) ?? 0;
              return (
              <li key={source.id}>
                <p className="font-medium text-slate-900">
                  {number > 0 ? (
                    <span className="text-slate-500">[{number}] </span>
                  ) : null}
                  {source.displayName}
                </p>
                <p className="text-xs text-slate-500">{source.sourceType}</p>
                {source.originalUrl ? (
                  <p className="break-all text-xs text-slate-600">
                    {source.originalUrl}
                  </p>
                ) : null}
                {source.filename ? (
                  <p className="text-xs text-slate-600">{source.filename}</p>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
