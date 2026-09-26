"use client";

import { useMemo, useState } from "react";
import { ManualCompanyResearchForm } from "@/components/ManualCompanyResearchForm";
import { RefreshCompanyResearchForm } from "@/components/RefreshCompanyResearchForm";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import {
  ResearchListItem,
  ResearchProse,
  ResearchReadSection,
  ResearchSourcesAppendix,
} from "@/components/research-document";
import { SecondaryButton } from "@/components/ui";
import {
  describeCompanySourceLead,
  formatCompanyBriefingMeta,
  sourcesSupportingClaim,
  sourcesSupportingField,
} from "@/lib/research/company-briefing";
import { parseStringArray } from "@/lib/research";
import { buildSourceIndex } from "@/lib/research/source-index";
import type { ResearchSource } from "@/lib/research/types";

export type CompanyBriefingDefaults = {
  companySummary: string | null;
  whatTheySell: string | null;
  estimatedAov: string | null;
  aovReasoning: string | null;
  customerTypes: unknown;
  primaryMarkets: unknown;
  businessModel: string | null;
  companySizeContext: string | null;
  relevantTechnologies: unknown;
  buyingSignals: unknown;
  riskSignals: unknown;
};

export function CompanyResearchBriefing({
  companyId,
  companyName,
  meta,
  defaults,
  sources,
  researchMethod,
  identityAmbiguous,
  researchStatus,
}: {
  companyId: string;
  companyName: string;
  meta: {
    domain: string | null;
    industry: string | null;
    location: string | null;
    employeeCount: string | null;
    revenue: string | null;
    lastResearched: string | null;
  };
  defaults: CompanyBriefingDefaults;
  sources: ResearchSource[];
  researchMethod: string | null;
  identityAmbiguous: boolean;
  researchStatus: string;
}) {
  const [editing, setEditing] = useState(false);
  const sourceLead = describeCompanySourceLead({
    sources,
    researchMethod,
  });

  const customerTypes = parseStringArray(defaults.customerTypes);
  const primaryMarkets = parseStringArray(defaults.primaryMarkets);
  const relevantTechnologies = parseStringArray(defaults.relevantTechnologies);
  const buyingSignals = parseStringArray(defaults.buyingSignals);
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
    Boolean(defaults.estimatedAov) ||
    Boolean(defaults.aovReasoning) ||
    relevantTechnologies.length > 0 ||
    buyingSignals.length > 0 ||
    riskSignals.length > 0;

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      data-print-document
      data-testid="company-research-briefing"
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

      {identityAmbiguous ? (
        <div
          className="rounded-md border border-warning bg-warning-tint p-4 text-sm text-warning"
          role="status"
          data-testid="company-identity-warning"
        >
          <p className="font-semibold">
            We could not confirm this is the right company.
          </p>
          <p className="mt-1">
            The supplied company details conflict with the evidence we found,
            so this research will not be used to personalize emails.
          </p>
          {riskSignals.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {riskSignals.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <p
          className="text-base text-ink"
          data-testid="company-source-lead"
        >
          {sourceLead.sentence}
        </p>
        {sourceLead.names.length > 0 ? (
          <p className="mt-1 text-sm text-subtle">
            {sourceLead.names.join(" · ")}
          </p>
        ) : null}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-print-hide
      >
        <RefreshCompanyResearchForm companyId={companyId} />
        <div className="flex flex-wrap gap-2">
          <ExportPdfButton />
          <SecondaryButton
            type="button"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "Done editing" : "Edit"}
          </SecondaryButton>
        </div>
      </div>

      {editing ? (
        <div
          className="rounded-lg border border-edge bg-canvas p-4"
          data-print-hide
        >
          <h3 className="mb-4 text-sm font-semibold text-ink">
            Edit briefing
          </h3>
          <ManualCompanyResearchForm companyId={companyId} defaults={defaults} />
        </div>
      ) : hasBriefing ? (
        <article className="space-y-8">
          <ResearchReadSection
            title="Overview"
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
            title="What they make or do"
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
            title="Who they serve"
            empty={customerTypes.length === 0 && primaryMarkets.length === 0}
          >
            {customerTypes.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-muted">
                  Customer types
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
                  Primary markets
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
            title="How they operate"
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
            title="Commercial context"
            empty={!defaults.estimatedAov && !defaults.aovReasoning}
          >
            {defaults.estimatedAov ? (
              <ResearchProse
                text={defaults.estimatedAov}
                sources={sourcesSupportingField(sources, "estimatedAov")}
                sourceIndex={sourceIndex}
              />
            ) : null}
            {defaults.aovReasoning ? (
              <ResearchProse
                text={defaults.aovReasoning}
                sources={sourcesSupportingField(sources, "aovReasoning")}
                sourceIndex={sourceIndex}
              />
            ) : null}
          </ResearchReadSection>

          <ResearchReadSection
            title="Technology"
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
            title="Signals"
            empty={buyingSignals.length === 0 && riskSignals.length === 0}
          >
            {buyingSignals.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-muted">
                  Buying signals
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                  {buyingSignals.map((item) => (
                    <ResearchListItem
                      key={item}
                      text={item}
                      sources={sourcesSupportingClaim(
                        sources,
                        item,
                        "buyingSignals",
                      )}
                      sourceIndex={sourceIndex}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {riskSignals.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-muted">
                  Risk signals
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px]">
                  {riskSignals.map((item) => (
                    <ResearchListItem
                      key={item}
                      text={item}
                      sources={sourcesSupportingClaim(
                        sources,
                        item,
                        "riskSignals",
                      )}
                      sourceIndex={sourceIndex}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </ResearchReadSection>
        </article>
      ) : (
        <p className="text-sm text-muted">
          No company intelligence recorded yet. Run research from a scoring run,
          refresh above, or click Edit to add a manual briefing.
        </p>
      )}

      <ResearchSourcesAppendix sources={sources} sourceIndex={sourceIndex} />
    </div>
  );
}
