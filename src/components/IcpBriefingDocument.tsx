"use client";

import {
  evidenceClassAvailabilityLabel,
  normalizeEvidenceClass,
} from "@/lib/criteria/evidence-class";
import {
  ICP_MANDATORY_EXPLANATION,
  ICP_PRIMARY_TIER_HEADER,
  ICP_SECONDARY_TIER_HEADER,
  buildIcpRoleSummary,
  normalizeIcpCriterionTier,
} from "@/lib/criteria/tier";
import { formatCriterionDisplay } from "@/lib/criteria/types";
import { ResearchReadSection } from "@/components/research-document";
import type { IcpCriterionReviewRow } from "@/components/IcpCriteriaReview";
import { listToCommaString } from "@/lib/utils";
import { vocab } from "@/lib/product-config";

function ReadCriterionRow({ criterion }: { criterion: IcpCriterionReviewRow }) {
  const evidenceClass = normalizeEvidenceClass(criterion.evidenceClass);
  const availability = evidenceClassAvailabilityLabel(evidenceClass);
  const tier = normalizeIcpCriterionTier(criterion.tier) ?? "PRIMARY";

  return (
    <li className="text-[17px] leading-relaxed text-slate-800">
      {formatCriterionDisplay({
        ...criterion,
        dataType: criterion.dataType as never,
        operator: criterion.operator as never,
        importance: criterion.importance as never,
        evidenceClass,
        tier,
      })}
      <span
        className={`research-source-chip-print ml-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          availability.tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-white text-slate-600"
        }`}
        title={availability.label}
      >
        {availability.label}
      </span>
      {tier === "PRIMARY" && criterion.isMandatory ? (
        <span
          className="ml-2 text-xs font-medium text-red-800"
          title={ICP_MANDATORY_EXPLANATION}
        >
          Mandatory
        </span>
      ) : null}
    </li>
  );
}

export function IcpCriteriaBriefing({
  criteria,
  interpretationSummary,
  interpretationUndetermined,
}: {
  criteria: IcpCriterionReviewRow[];
  interpretationSummary?: string | null;
  interpretationUndetermined?: string | null;
}) {
  const withClass = criteria.map((c) => ({
    ...c,
    evidenceClass: normalizeEvidenceClass(c.evidenceClass),
    tier: normalizeIcpCriterionTier(c.tier) ?? "PRIMARY",
  }));
  const primary = withClass.filter((c) => c.tier === "PRIMARY");
  const secondary = withClass.filter((c) => c.tier === "SECONDARY");
  const hasInterpretation =
    Boolean(interpretationSummary?.trim()) ||
    Boolean(interpretationUndetermined?.trim());

  if (criteria.length === 0 && !hasInterpretation) {
    return (
      <ResearchReadSection title="Scoring criteria" empty>
        {null}
      </ResearchReadSection>
    );
  }

  return (
    <div className="space-y-6" data-testid="icp-criteria-briefing">
      {hasInterpretation ? (
        <ResearchReadSection
          title="What we understood"
          empty={!interpretationSummary?.trim()}
        >
          {interpretationSummary?.trim() ? (
            <p className="text-[17px] leading-7 text-slate-800">
              {interpretationSummary.trim()}
            </p>
          ) : null}
          {interpretationUndetermined?.trim() ? (
            <div className="mt-3" data-testid="icp-interpretation-undetermined">
              <p className="text-sm font-medium text-amber-900">
                Could not be determined from available data
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[17px] text-amber-950">
                {interpretationUndetermined
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .map((item) => (
                    <li key={item}>{item}</li>
                  ))}
              </ul>
            </div>
          ) : null}
        </ResearchReadSection>
      ) : null}

      {criteria.length > 0 ? (
      <ResearchReadSection title="Scoring criteria" empty={false}>
        <p className="text-sm text-slate-600" data-testid="icp-role-summary">
          {buildIcpRoleSummary({
            primaryCount: primary.length,
            secondaryCount: secondary.length,
          })}
        </p>
        {primary.length > 0 ? (
          <div className="mt-4" data-testid="icp-primary-tier">
            <p className="text-sm font-semibold text-slate-900">
              {ICP_PRIMARY_TIER_HEADER}
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {primary.map((criterion) => (
                <ReadCriterionRow
                  key={criterion.id ?? criterion.name}
                  criterion={criterion}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {secondary.length > 0 ? (
          <div className="mt-4" data-testid="icp-secondary-tier">
            <p className="text-sm font-semibold text-slate-900">
              {ICP_SECONDARY_TIER_HEADER}
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {secondary.map((criterion) => (
                <ReadCriterionRow
                  key={criterion.id ?? criterion.name}
                  criterion={criterion}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </ResearchReadSection>
      ) : null}
    </div>
  );
}

export function IcpBriefingDocument({
  name,
  definition,
  description,
  targetIndustries,
  targetGeographies,
  criteria,
  interpretationSummary,
  interpretationUndetermined,
}: {
  name: string;
  definition?: string | null;
  description?: string | null;
  targetIndustries?: unknown;
  targetGeographies?: unknown;
  criteria: IcpCriterionReviewRow[];
  interpretationSummary?: string | null;
  interpretationUndetermined?: string | null;
}) {
  const industries = listToCommaString(targetIndustries);
  const geographies = listToCommaString(targetGeographies);
  const metaLine = [industries, geographies].filter(Boolean).join(" · ");

  return (
    <article className="space-y-8">
      <header className="space-y-1 border-b border-slate-200 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
        {metaLine ? <p className="text-sm text-slate-600">{metaLine}</p> : null}
      </header>

      <ResearchReadSection title={`${vocab.idealCustomer.Singular} definition`} empty={!definition?.trim()}>
        {definition?.trim() ? (
          <p className="text-[17px] leading-7 text-slate-800">{definition.trim()}</p>
        ) : null}
        {description?.trim() ? (
          <p className="mt-2 text-sm text-slate-600">{description.trim()}</p>
        ) : null}
      </ResearchReadSection>

      <IcpCriteriaBriefing
        criteria={criteria}
        interpretationSummary={interpretationSummary}
        interpretationUndetermined={interpretationUndetermined}
      />
    </article>
  );
}
