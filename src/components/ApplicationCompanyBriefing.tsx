"use client";

import { useMemo, useState } from "react";
import {
  retryApplicationResearchAction,
  saveApplicationCompanyResearchNotesAction,
} from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  ResearchListItem,
  ResearchProse,
  ResearchReadSection,
  ResearchSourcesAppendix,
} from "@/components/research-document";
import {
  describeCompanySourceLead,
  formatCompanyBriefingMeta,
  sourcesSupportingClaim,
  sourcesSupportingField,
} from "@/lib/research/company-briefing";
import { parseStringArray } from "@/lib/research";
import { COMPANY_RESEARCH_NOTES_MAX_CHARS } from "@/lib/research/seeker-supplied-notes";
import { buildSourceIndex } from "@/lib/research/source-index";
import type { ResearchSource } from "@/lib/research/types";
import {
  applicationWorkspaceCopy,
  polishCopy,
} from "@/lib/product-config";

export type ApplicationCompanyBriefingDefaults = {
  companySummary: string | null;
  whatTheySell: string | null;
  customerTypes: unknown;
  primaryMarkets: unknown;
  businessModel: string | null;
  companySizeContext: string | null;
  relevantTechnologies: unknown;
  hiringSignals: unknown;
  riskSignals: unknown;
};

export function ApplicationCompanyBriefing({
  campaignId,
  canEdit,
  companyName,
  meta,
  defaults,
  sources,
  researchMethod,
  researchStatus,
  notes,
  researchLive,
}: {
  campaignId: string;
  canEdit: boolean;
  companyName: string;
  meta: {
    domain: string | null;
    industry: string | null;
    location: string | null;
    employeeCount: string | null;
    revenue: string | null;
    lastResearched: string | null;
  };
  defaults: ApplicationCompanyBriefingDefaults;
  sources: ResearchSource[];
  researchMethod: string | null;
  researchStatus: string;
  notes: string;
  researchLive: boolean;
}) {
  const [notesValue, setNotesValue] = useState(notes);
  const sourceLead = describeCompanySourceLead({
    sources,
    researchMethod,
  });

  const customerTypes = parseStringArray(defaults.customerTypes);
  const primaryMarkets = parseStringArray(defaults.primaryMarkets);
  const relevantTechnologies = parseStringArray(defaults.relevantTechnologies);
  const hiringSignals = parseStringArray(defaults.hiringSignals);
  const riskSignals = parseStringArray(defaults.riskSignals);

  const metaLine = formatCompanyBriefingMeta(meta);
  const sourceIndex = useMemo(
    () => buildSourceIndex(sources, (source) => source.url),
    [sources],
  );
  const hasBriefing =
    Boolean(defaults.companySummary) ||
    Boolean(defaults.whatTheySell) ||
    customerTypes.length > 0 ||
    primaryMarkets.length > 0 ||
    Boolean(defaults.businessModel) ||
    Boolean(defaults.companySizeContext) ||
    relevantTechnologies.length > 0 ||
    hiringSignals.length > 0 ||
    riskSignals.length > 0;

  return (
    <div
      className="space-y-6"
      data-print-document
      data-testid="application-company-briefing"
    >
      <header className="space-y-2 border-b border-edge pb-4">
        <h2 className="text-xl font-semibold text-ink print:text-2xl">
          {companyName}
        </h2>
        {metaLine ? (
          <p className="text-sm text-muted">{metaLine}</p>
        ) : null}
        <p className="text-xs text-subtle">
          Research status: {researchStatus}
          {researchMethod ? ` · ${researchMethod}` : ""}
        </p>
      </header>

      <div>
        <p className="text-base text-ink" data-testid="company-source-lead">
          {sourceLead.sentence}
        </p>
        {sourceLead.names.length > 0 ? (
          <p className="mt-1 text-sm text-subtle">
            {sourceLead.names.join(" · ")}
          </p>
        ) : null}
      </div>

      {hasBriefing ? (
        <article className="space-y-8">
          <ResearchReadSection
            title={applicationWorkspaceCopy.whatTheyDoTitle}
            empty={!defaults.whatTheySell}
          >
            {defaults.whatTheySell ? (
              <ResearchProse
                text={defaults.whatTheySell}
                sources={sourcesSupportingField(sources, "whatTheySell")}
                sourceIndex={sourceIndex}
              />
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldCompanySummary}
            empty={!defaults.companySummary}
          >
            {defaults.companySummary ? (
              <ResearchProse
                text={defaults.companySummary}
                sources={sourcesSupportingField(sources, "companySummary")}
                sourceIndex={sourceIndex}
              />
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.whoTheyServeTitle}
            empty={customerTypes.length === 0 && primaryMarkets.length === 0}
          >
            {customerTypes.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-muted">
                  {applicationWorkspaceCopy.fieldCustomerTypes}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                  {customerTypes.map((item) => (
                    <ResearchListItem
                      key={item}
                      text={item}
                      sources={sourcesSupportingClaim(
                        sources,
                        item,
                        "customerTypes",
                      )}
                      sourceIndex={sourceIndex}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {primaryMarkets.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-muted">
                  {applicationWorkspaceCopy.fieldPrimaryMarkets}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                  {primaryMarkets.map((item) => (
                    <ResearchListItem
                      key={item}
                      text={item}
                      sources={sourcesSupportingClaim(
                        sources,
                        item,
                        "primaryMarkets",
                      )}
                      sourceIndex={sourceIndex}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.howTheyOperateTitle}
            empty={!defaults.businessModel && !defaults.companySizeContext}
          >
            {defaults.businessModel ? (
              <ResearchProse
                text={defaults.businessModel}
                sources={sourcesSupportingField(sources, "businessModel")}
                sourceIndex={sourceIndex}
              />
            ) : null}
            {defaults.companySizeContext ? (
              <ResearchProse
                text={defaults.companySizeContext}
                sources={sourcesSupportingField(sources, "companySizeContext")}
                sourceIndex={sourceIndex}
              />
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldTechnologies}
            empty={relevantTechnologies.length === 0}
          >
            <ul className="list-disc space-y-2 pl-5 text-[17px]">
              {relevantTechnologies.map((item) => (
                <ResearchListItem
                  key={item}
                  text={item}
                  sources={sourcesSupportingClaim(
                    sources,
                    item,
                    "relevantTechnologies",
                  )}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldHiringGrowth}
            empty={hiringSignals.length === 0}
          >
            <ul className="list-disc space-y-2 pl-5 text-[17px]">
              {hiringSignals.map((item) => (
                <ResearchListItem
                  key={item}
                  text={item}
                  sources={sourcesSupportingClaim(
                    sources,
                    item,
                    "hiringSignals",
                  )}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldEmployerRisk}
            empty={riskSignals.length === 0}
          >
            <ul className="list-disc space-y-2 pl-5 text-[17px]">
              {riskSignals.map((item) => (
                <ResearchListItem
                  key={item}
                  text={item}
                  sources={sourcesSupportingClaim(sources, item, "riskSignals")}
                  sourceIndex={sourceIndex}
                />
              ))}
            </ul>
          </ResearchReadSection>
        </article>
      ) : (
        <p className="text-sm text-muted">
          {applicationWorkspaceCopy.companyBriefingEmpty}
        </p>
      )}

      <ResearchSourcesAppendix sources={sources} sourceIndex={sourceIndex} />

      {canEdit ? (
        <div className="space-y-4" data-print-hide>
          <details
            className="rounded-lg border border-edge bg-canvas p-4"
            data-testid="company-research-notes"
          >
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {applicationWorkspaceCopy.companyNotesTitle}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted">
                {applicationWorkspaceCopy.companyNotesHelp}
              </p>
              <ApplicationActionForm
                action={saveApplicationCompanyResearchNotesAction}
                submitLabel={applicationWorkspaceCopy.companyNotesSave}
                testId="save-company-research-notes"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <label className="block text-sm">
                  <span className="sr-only">
                    {applicationWorkspaceCopy.companyNotesTitle}
                  </span>
                  <textarea
                    name="notes"
                    value={notesValue}
                    onChange={(event) => setNotesValue(event.target.value)}
                    maxLength={COMPANY_RESEARCH_NOTES_MAX_CHARS}
                    rows={6}
                    className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
                  />
                </label>
              </ApplicationActionForm>
            </div>
          </details>

          {researchLive ? null : (
            <ApplicationActionForm
              action={retryApplicationResearchAction}
              submitLabel={polishCopy.regenerate}
              pendingLabel={`${polishCopy.regenerate}…`}
              testId="regenerate-company-research"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="notes" value={notesValue} />
            </ApplicationActionForm>
          )}
        </div>
      ) : null}
    </div>
  );
}
