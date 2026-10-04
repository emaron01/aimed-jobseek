"use client";

import { useState } from "react";
import {
  retryApplicationResearchAction,
  saveApplicationCompanyResearchNotesAction,
} from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  CompanyResearchProse,
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
import { presentCompanyResearch } from "@/lib/research/research-prose";
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
  jobFocus?: string | null;
  jobFocusDetail?: string | null;
};

export function CheatSheetCompanyResearch({
  companySummary,
  whatTheySell,
  jobFocus,
  jobFocusDetail,
  sources,
}: {
  companySummary: string | null;
  whatTheySell: string | null;
  jobFocus: string | null;
  jobFocusDetail: string | null;
  sources: ResearchSource[];
}) {
  const presented = presentCompanyResearch({
    companySummary,
    whatTheySell,
    jobFocus,
    jobFocusDetail,
    sources,
  });
  const sourceIndex = buildSourceIndex(presented.sources, (source) => source.url);
  const hasHighlights = Boolean(
    presented.companySummary.trim() || presented.whatTheySell.trim(),
  );
  const hasFocus = Boolean(presented.jobFocus.trim() || presented.jobFocusDetail.trim());
  if (!hasHighlights && !hasFocus) {
    return <p className="text-sm text-ink">Not available.</p>;
  }
  return (
    <div data-testid="cheat-sheet-company-research" className="space-y-4">
      {hasHighlights ? (
        <section>
          <h3 className="font-medium text-ink">
            {applicationWorkspaceCopy.companyHighlightsTitle}
          </h3>
          {presented.companySummary.trim() ? (
            <CompanyResearchProse
              text={presented.companySummary}
              sources={presented.sources}
              fieldSources={sourcesSupportingField(presented.sources, "companySummary")}
            />
          ) : null}
          {presented.whatTheySell.trim() ? (
            <CompanyResearchProse
              text={presented.whatTheySell}
              sources={presented.sources}
              fieldSources={sourcesSupportingField(presented.sources, "whatTheySell")}
            />
          ) : null}
        </section>
      ) : null}
      {hasFocus ? (
        <section>
          <h3 className="font-medium text-ink">
            {applicationWorkspaceCopy.jobFocusTitle}
          </h3>
          {presented.jobFocus.trim() ? (
            <CompanyResearchProse
              text={presented.jobFocus}
              sources={presented.sources}
              fieldSources={sourcesSupportingField(presented.sources, "jobFocus")}
            />
          ) : null}
          {presented.jobFocusDetail.trim() ? (
            <>
              <h4 className="mt-3 text-sm font-medium text-ink">
                {applicationWorkspaceCopy.jobFocusDetailTitle}
              </h4>
              <CompanyResearchProse
                text={presented.jobFocusDetail}
                sources={presented.sources}
                fieldSources={sourcesSupportingField(presented.sources, "jobFocusDetail")}
              />
            </>
          ) : null}
        </section>
      ) : null}
      <ResearchSourcesAppendix sources={presented.sources} sourceIndex={sourceIndex} />
    </div>
  );
}

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
  const presented = presentCompanyResearch(
    {
      companySummary: defaults.companySummary,
      whatTheySell: defaults.whatTheySell,
      businessModel: defaults.businessModel,
      companySizeContext: defaults.companySizeContext,
      jobFocus: defaults.jobFocus,
      jobFocusDetail: defaults.jobFocusDetail,
      customerTypes: parseStringArray(defaults.customerTypes),
      primaryMarkets: parseStringArray(defaults.primaryMarkets),
      relevantTechnologies: parseStringArray(defaults.relevantTechnologies),
      hiringSignals: parseStringArray(defaults.hiringSignals),
      riskSignals: parseStringArray(defaults.riskSignals),
      sources,
    },
    { anchorHost: meta.domain },
  );
  const sourceLead = describeCompanySourceLead({
    sources: presented.sources,
    researchMethod,
  });
  const {
    customerTypes,
    primaryMarkets,
    relevantTechnologies,
    hiringSignals,
    riskSignals,
  } = presented;

  const metaLine = formatCompanyBriefingMeta(meta);
  const sourceIndex = buildSourceIndex(presented.sources, (source) => source.url);
  const hasBriefing =
    Boolean(presented.companySummary) ||
    Boolean(presented.whatTheySell) ||
    customerTypes.length > 0 ||
    primaryMarkets.length > 0 ||
    Boolean(presented.businessModel) ||
    Boolean(presented.companySizeContext) ||
    relevantTechnologies.length > 0 ||
    hiringSignals.length > 0 ||
    riskSignals.length > 0 ||
    Boolean(presented.jobFocus) ||
    Boolean(presented.jobFocusDetail);

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
          <h3 className="text-sm font-semibold tracking-wide text-subtle uppercase">
            {applicationWorkspaceCopy.companyHighlightsTitle}
          </h3>
          <ResearchReadSection
            title={applicationWorkspaceCopy.whatTheyDoTitle}
            empty={!presented.whatTheySell}
          >
            {presented.whatTheySell ? (
              <CompanyResearchProse
                text={presented.whatTheySell}
                sources={presented.sources}
                fieldSources={sourcesSupportingField(presented.sources, "whatTheySell")}
              />
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldCompanySummary}
            empty={!presented.companySummary}
          >
            {presented.companySummary ? (
              <CompanyResearchProse
                text={presented.companySummary}
                sources={presented.sources}
                fieldSources={sourcesSupportingField(
                  presented.sources,
                  "companySummary",
                )}
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
                    <li key={item}>
                      <CompanyResearchProse
                        text={item}
                        sources={presented.sources}
                        fieldSources={sourcesSupportingClaim(
                          presented.sources,
                          item,
                          "customerTypes",
                        )}
                      />
                    </li>
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
                    <li key={item}>
                      <CompanyResearchProse
                        text={item}
                        sources={presented.sources}
                        fieldSources={sourcesSupportingClaim(
                          presented.sources,
                          item,
                          "primaryMarkets",
                        )}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.howTheyOperateTitle}
            empty={!presented.businessModel && !presented.companySizeContext}
          >
            {presented.businessModel ? (
              <CompanyResearchProse
                text={presented.businessModel}
                sources={presented.sources}
                fieldSources={sourcesSupportingField(presented.sources, "businessModel")}
              />
            ) : null}
            {presented.companySizeContext ? (
              <CompanyResearchProse
                text={presented.companySizeContext}
                sources={presented.sources}
                fieldSources={sourcesSupportingField(
                  presented.sources,
                  "companySizeContext",
                )}
              />
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldTechnologies}
            empty={relevantTechnologies.length === 0}
          >
            <ul className="list-disc space-y-2 pl-5 text-[17px]">
              {relevantTechnologies.map((item) => (
                <li key={item}>
                  <CompanyResearchProse
                    text={item}
                    sources={presented.sources}
                    fieldSources={sourcesSupportingClaim(
                      presented.sources,
                      item,
                      "relevantTechnologies",
                    )}
                  />
                </li>
              ))}
            </ul>
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldHiringGrowth}
            empty={hiringSignals.length === 0}
          >
            <ul className="list-disc space-y-2 pl-5 text-[17px]">
              {hiringSignals.map((item) => (
                <li key={item}>
                  <CompanyResearchProse
                    text={item}
                    sources={presented.sources}
                    fieldSources={sourcesSupportingClaim(
                      presented.sources,
                      item,
                      "hiringSignals",
                    )}
                  />
                </li>
              ))}
            </ul>
          </ResearchReadSection>

          <ResearchReadSection
            title={applicationWorkspaceCopy.fieldEmployerRisk}
            empty={riskSignals.length === 0}
          >
            <ul className="list-disc space-y-2 pl-5 text-[17px]">
              {riskSignals.map((item) => (
                <li key={item}>
                  <CompanyResearchProse
                    text={item}
                    sources={presented.sources}
                    fieldSources={sourcesSupportingClaim(
                      presented.sources,
                      item,
                      "riskSignals",
                    )}
                  />
                </li>
              ))}
            </ul>
          </ResearchReadSection>

          {presented.jobFocus.trim() || presented.jobFocusDetail.trim() ? (
            <ResearchReadSection
              title={applicationWorkspaceCopy.jobFocusTitle}
              empty={false}
            >
              {presented.jobFocus.trim() ? (
                <CompanyResearchProse
                  text={presented.jobFocus}
                  sources={presented.sources}
                  fieldSources={sourcesSupportingField(presented.sources, "jobFocus")}
                />
              ) : null}
              {presented.jobFocusDetail.trim() ? (
                <div>
                  <p className="text-sm font-medium text-muted">
                    {applicationWorkspaceCopy.jobFocusDetailTitle}
                  </p>
                  <CompanyResearchProse
                    text={presented.jobFocusDetail}
                    sources={presented.sources}
                    fieldSources={sourcesSupportingField(
                      presented.sources,
                      "jobFocusDetail",
                    )}
                  />
                </div>
              ) : null}
            </ResearchReadSection>
          ) : null}
        </article>
      ) : (
        <p className="text-sm text-muted">
          {applicationWorkspaceCopy.companyBriefingEmpty}
        </p>
      )}

      <ResearchSourcesAppendix
        sources={presented.sources}
        sourceIndex={sourceIndex}
      />

      {canEdit ? (
        <div className="space-y-4" data-print-hide>
          <details
            open
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
