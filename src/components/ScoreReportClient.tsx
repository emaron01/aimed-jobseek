"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "@/app/actions";
import { makePrimaryCriterionMandatoryAndRescoreAction } from "@/app/actions/scoring";
import {
  bulkRestoreQualificationAction,
  overrideQualificationBucketAction,
} from "@/app/actions/qualification";
import {
  DEFAULT_EMAIL_LENGTH,
  EMAIL_GUIDANCE_MAX_CHARS,
  EMAIL_LENGTH_OPTIONS,
  type CampaignActionResult,
} from "@/lib/campaign/save";
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  SubmitButton, AppButton } from "@/components/ui";
import { contactDisplayName, cn } from "@/lib/utils";
import { hasUsableCompanyResearchFields } from "@/lib/research/freshness";
import { SuppressContactForm } from "@/components/SuppressContactForm";
import { ExclusionDetailList } from "@/components/ExclusionDetailList";
import { EmailGuidancePromptExamples } from "@/components/EmailGuidancePromptExamples";
import {
  groupExclusionDetailsByCriterion,
  readExclusionDetails,
} from "@/lib/scoring/exclusion-detail";
import {
  icpQualificationWhyLines,
  readIcpQualification,
} from "@/lib/scoring/icp-qualification";
import { readCriterionProvenanceLabels } from "@/lib/criteria/research-cascade";
import {
  EXCLUSION_REVIEW_COPY,
  QUALIFICATION_BUCKET_LABELS,
  readPersonaMatch,
  readQualificationBucket,
  readQualificationReason,
} from "@/lib/workflow/qualification";
import type { QualificationBucket } from "@prisma/client";
import {
  countedNoun,
  scoringDimensionLabel,
  vocab,
  vocabExamples,
} from "@/lib/product-config";

export type CompanyResearchView = {
  id: string;
  status: string;
  researchMethod: string;
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
  researchSources: unknown;
  researchedAt: string | null;
};

export type MandatorySuggestionView = {
  criterionId: string;
  criterionName: string;
  failedCompanyCount: number;
  prompt: string;
};

export type ScoreReportClientRow = {
  id: string;
  contactId: string;
  overallScore: number | null;
  icpScore: number | null;
  personaScore: number | null;
  companyScore: number | null;
  productRelevanceScore: number | null;
  scoreLabel: string | null;
  recommendedAction: string | null;
  companySummary: string | null;
  whatTheySell: string | null;
  estimatedAov: string | null;
  aovReasoning: string | null;
  fitStrengths: unknown;
  fitRisks: unknown;
  disqualifiers: unknown;
  reasoning: string | null;
  researchStatus: string;
  researchSources: unknown;
  scoringStatus: string;
  assessmentData: unknown;
  aiProvider: string | null;
  aiModel: string | null;
  aiModelUrlIdentifier: string | null;
  promptVersion: string | null;
  scoringLogicVersion: string | null;
  scoredAt: string | null;
  scoringError: string | null;
  suppressed?: boolean;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    companyId: string | null;
    companyRecord: {
      id: string;
      name: string;
      website: string | null;
      normalizedDomain: string | null;
      research: CompanyResearchView[];
    } | null;
  };
};

function qualificationBadgeClass(bucket: QualificationBucket | null): string {
  switch (bucket) {
    case "GOOD":
      return "bg-success-tint text-success ring-success";
    case "NEEDS_REVIEW":
      return "bg-warning-tint text-warning ring-warning";
    case "EXCLUDED":
      return "bg-canvas text-ink ring-edge-strong";
    case "POOR_FIT":
      return "bg-warning-tint text-warning ring-warning";
    default:
      return "bg-canvas text-muted ring-edge";
  }
}

function displayQualificationBucket(bucket: QualificationBucket | null): string {
  if (!bucket) return "Pending";
  if (bucket === "POOR_FIT") return QUALIFICATION_BUCKET_LABELS.NEEDS_REVIEW;
  return QUALIFICATION_BUCKET_LABELS[bucket];
}

function resolveQualification(row: ScoreReportClientRow): {
  bucket: QualificationBucket | null;
  reason: string | null;
} {
  const bucket =
    readQualificationBucket(row.assessmentData) ??
    (row.scoringStatus === "SUPPRESSED" || row.suppressed
      ? "EXCLUDED"
      : null);
  const reason =
    readQualificationReason(row.assessmentData) ??
    row.recommendedAction ??
    row.reasoning;
  return { bucket, reason };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function asDisqualifierList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const row = item as {
          criterion?: string;
          matchedIcpSignal?: string;
          evidence?: string[];
        };
        const base = row.criterion || row.matchedIcpSignal;
        if (!base) return "";
        const evidence =
          Array.isArray(row.evidence) && row.evidence.length
            ? ` — ${row.evidence.join("; ")}`
            : "";
        return `${base}${evidence}`;
      }
      return "";
    })
    .filter(Boolean);
}

type DimensionView = {
  dimension: string;
  assessment: string;
  evidence: string[];
  concerns: string[];
};

function asDimensions(assessmentData: unknown): DimensionView[] {
  if (!assessmentData || typeof assessmentData !== "object") return [];
  const dims = (assessmentData as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dims)) return [];
  return dims
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        dimension: String(row.dimension ?? ""),
        assessment: String(row.assessment ?? ""),
        evidence: asStringList(row.evidence),
        concerns: asStringList(row.concerns),
      };
    })
    .filter((d): d is DimensionView => Boolean(d?.dimension));
}

function companyResearchLabel(
  research: CompanyResearchView | null | undefined,
): string {
  if (
    research &&
    (research.status === "COMPLETED" || research.status === "PARTIAL")
  ) {
    return hasUsableCompanyResearchFields(research)
      ? "Available"
      : "No usable details found";
  }
  switch (research?.status) {
    case "COMPLETED":
      return "Complete";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    case "IN_PROGRESS":
      return "In progress";
    case "NOT_STARTED":
    default:
      return "Not Started";
  }
}

export function ScoreReportClient({
  runId,
  productId,
  icpId,
  personaId,
  productName,
  icpName,
  personaName,
  personas = [],
  rows,
  mandatorySuggestions = [],
  readOnly = false,
}: {
  runId: string;
  productId: string;
  icpId: string;
  personaId: string | null;
  productName: string;
  icpName: string;
  personaName: string;
  personas?: Array<{ id: string; name: string }>;
  rows: ScoreReportClientRow[];
  mandatorySuggestions?: MandatorySuggestionView[];
  readOnly?: boolean;
}) {
  void personas;
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCampaign, setShowCampaign] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overridePending, setOverridePending] = useState(false);
  const [restoredBuckets, setRestoredBuckets] = useState<
    Record<string, QualificationBucket>
  >({});
  const [keptExcludedIds, setKeptExcludedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [campaignState, campaignAction, campaignPending] = useActionState(
    createCampaignAction,
    null as CampaignActionResult | null,
  );
  const [mandatoryState, mandatoryAction, mandatoryPending] = useActionState(
    makePrimaryCriterionMandatoryAndRescoreAction,
    null as { ok: boolean; message: string } | null,
  );

  useEffect(() => {
    if (!mandatoryState?.ok) return;
    router.refresh();
  }, [mandatoryState, router]);

  if (campaignState?.ok && showCampaign) {
    setShowCampaign(false);
  }

  useEffect(() => {
    if (!campaignState?.ok) return;
    router.push(
      campaignState.campaignId
        ? `/campaigns/${campaignState.campaignId}`
        : "/campaigns",
    );
    router.refresh();
  }, [campaignState, router]);

  const visibleIds = useMemo(() => rows.map((row) => row.contactId), [rows]);

  const exclusionGroups = useMemo(
    () =>
      groupExclusionDetailsByCriterion(
        rows
          .map((row) => {
            const bucket =
              restoredBuckets[row.contactId] ??
              resolveQualification(row).bucket;
            if (bucket !== "EXCLUDED") return null;
            if (keptExcludedIds.has(row.contactId)) return null;
            const details = readExclusionDetails(row.assessmentData);
            if (details.length === 0) return null;
            return { contactId: row.contactId, details };
          })
          .filter(
            (row): row is { contactId: string; details: ReturnType<typeof readExclusionDetails> } =>
              row != null,
          ),
      ),
    [rows, restoredBuckets, keptExcludedIds],
  );

  const exclusionContactCount = useMemo(() => {
    const ids = new Set<string>();
    for (const group of exclusionGroups) {
      for (const id of group.contactIds) ids.add(id);
    }
    return ids.size;
  }, [exclusionGroups]);

  function keepExcluded(contactId: string) {
    if (readOnly) return;
    setKeptExcludedIds((current) => new Set(current).add(contactId));
  }

  function keepExcludedMany(contactIds: string[]) {
    if (readOnly) return;
    setKeptExcludedIds((current) => {
      const next = new Set(current);
      for (const id of contactIds) next.add(id);
      return next;
    });
  }

  async function restoreContact(contactId: string, bucket: QualificationBucket = "GOOD") {
    if (readOnly) return;
    setOverridePending(true);
    setOverrideMessage(null);
    const result = await overrideQualificationBucketAction({
      scoringRunId: runId,
      targetType: "CONTACT",
      targetId: contactId,
      bucket,
    });
    setOverridePending(false);
    setOverrideMessage(result.message);
    if (result.ok && result.bucket) {
      setRestoredBuckets((current) => ({
        ...current,
        [contactId]: result.bucket!,
      }));
      router.refresh();
    }
  }

  async function restoreGroup(contactIds: string[], bucket: QualificationBucket = "GOOD") {
    if (readOnly) return;
    setOverridePending(true);
    setOverrideMessage(null);
    const result = await bulkRestoreQualificationAction({
      scoringRunId: runId,
      targetType: "CONTACT",
      targetIds: contactIds,
      bucket,
    });
    setOverridePending(false);
    setOverrideMessage(result.message);
    if (result.ok && result.bucket) {
      setRestoredBuckets((current) => {
        const next = { ...current };
        for (const contactId of contactIds) {
          next[contactId] = result.bucket!;
        }
        return next;
      });
      router.refresh();
    }
  }

  function toggleOne(contactId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function selectAllVisible() {
    if (readOnly) return;
    setSelected(new Set(visibleIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function submitCampaign(formData: FormData) {
    if (readOnly) return;
    for (const contactId of selected) {
      formData.append("contactIds", contactId);
    }
    return campaignAction(formData);
  }

  return (
    <div className="space-y-4">
      {mandatorySuggestions.length > 0 ? (
        <div className="space-y-2" data-testid="mandatory-suggestions">
          {mandatorySuggestions.map((suggestion) => (
            <form
              key={suggestion.criterionId}
              action={mandatoryAction}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger bg-danger-tint px-4 py-3 text-sm text-danger"
            >
              <input type="hidden" name="scoringRunId" value={runId} />
              <input
                type="hidden"
                name="criterionId"
                value={suggestion.criterionId}
              />
              <p>{suggestion.prompt}</p>
              <PrimaryButton
                type="submit"
                disabled={mandatoryPending}
              >
                Make mandatory
              </PrimaryButton>
            </form>
          ))}
          {mandatoryState && !mandatoryState.ok ? (
            <p role="status" className="text-sm text-danger">
              {mandatoryState.message}
            </p>
          ) : null}
        </div>
      ) : null}
      {exclusionGroups.length > 0 ? (
        <div className="space-y-4" data-testid="bulk-exclusion-restore">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {EXCLUSION_REVIEW_COPY.panelHeading(exclusionContactCount)}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {EXCLUSION_REVIEW_COPY.panelSubheading}
            </p>
          </div>
          {exclusionGroups.map((group) => {
            const contacts = group.contactIds
              .map((contactId) => rows.find((row) => row.contactId === contactId))
              .filter((row): row is ScoreReportClientRow => row != null);
            return (
              <div
                key={group.key}
                className="space-y-3 rounded-lg border border-edge-strong bg-canvas px-4 py-3 text-sm text-ink"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-ink">
                    {EXCLUSION_REVIEW_COPY.groupReason(group.criterionName)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton
                      type="button"
                      disabled={overridePending}
                      onClick={() => keepExcludedMany(group.contactIds)}
                    >
                      {EXCLUSION_REVIEW_COPY.keepExcluded}
                    </SecondaryButton>
                    <SecondaryButton
                      type="button"
                      disabled={overridePending}
                      onClick={() => restoreGroup(group.contactIds, "GOOD")}
                    >
                      {EXCLUSION_REVIEW_COPY.addAllBack}
                    </SecondaryButton>
                  </div>
                </div>
                <ul className="divide-y divide-edge rounded-md border border-edge bg-surface">
                  {contacts.map((row) => {
                    const name = contactDisplayName(
                      row.contact.firstName,
                      row.contact.lastName,
                    );
                    const title = row.contact.title?.trim() || null;
                    const company =
                      row.contact.companyRecord?.name?.trim() ||
                      row.contact.company?.trim() ||
                      null;
                    return (
                      <li
                        key={row.contactId}
                        className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-ink">{name}</p>
                          <p className="text-xs text-muted">
                            {[title, company].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <SecondaryButton
                            type="button"
                            disabled={overridePending}
                            onClick={() => keepExcluded(row.contactId)}
                          >
                            {EXCLUSION_REVIEW_COPY.keepExcluded}
                          </SecondaryButton>
                          <SecondaryButton
                            type="button"
                            disabled={overridePending}
                            onClick={() =>
                              restoreContact(row.contactId, "GOOD")
                            }
                          >
                            {EXCLUSION_REVIEW_COPY.addBack}
                          </SecondaryButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
      {overrideMessage ? (
        <p role="status" className="text-sm text-ink">
          {overrideMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-surface px-4 py-3">
        <p className="text-sm text-muted">
          Selected: <strong className="text-ink">{selected.size}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={selectAllVisible}>
            Select all visible
          </SecondaryButton>
          <SecondaryButton onClick={clearSelection}>
            Clear selection
          </SecondaryButton>
          <PrimaryButton
            disabled={selected.size === 0}
            onClick={() => setShowCampaign(true)}
          >
            Create {vocab.campaign.Singular} From Selected
          </PrimaryButton>
        </div>
      </div>

      <div className="max-h-[75vh] overflow-auto rounded-lg border border-edge bg-surface">
        <table className="w-[1200px] table-fixed divide-y divide-edge text-sm">
          <colgroup>
            <col className="w-14" />
            <col className="w-48" />
            <col className="w-44" />
            <col className="w-40" />
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-80" />
            <col className="w-20" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-canvas text-left text-subtle shadow-[0_1px_0_0_rgb(226_232_240)]">
            <tr>
              <th className="px-3 py-3 font-medium">Select</th>
              <th className="px-3 py-3 font-medium">{vocab.contact.Singular}</th>
              <th className="px-3 py-3 font-medium">Title</th>
              <th className="px-3 py-3 font-medium">Company</th>
              <th className="px-3 py-3 font-medium">Research</th>
              <th className="px-3 py-3 font-medium">Qualification</th>
              <th className="px-3 py-3 font-medium">Reason</th>
              <th className="px-3 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const open = expandedId === row.id;
              const companyResearch = row.contact.companyRecord?.research?.[0];
              const qualification = readIcpQualification(row.assessmentData);
              const personaMatch = readPersonaMatch(row.assessmentData);
              const resolvedQualification = resolveQualification(row);
              const effectiveBucket =
                restoredBuckets[row.contactId] ?? resolvedQualification.bucket;
              const exclusionDetails = readExclusionDetails(row.assessmentData);
              const isExcluded = effectiveBucket === "EXCLUDED";
              const canRestore =
                isExcluded &&
                !row.suppressed &&
                row.scoringStatus !== "SUPPRESSED";
              const why = qualification
                ? icpQualificationWhyLines(qualification)
                : null;
              const factsUsed = readCriterionProvenanceLabels(
                row.assessmentData,
              );
              const researchLabel = companyResearchLabel(
                companyResearch,
              );
              return (
                <Fragment key={row.id}>
                  <tr className="align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.contactId)}
                        disabled={
                          readOnly ||
                          row.suppressed ||
                          row.scoringStatus === "SUPPRESSED" ||
                          row.scoringStatus === "UNUSABLE"
                        }
                        onChange={() => toggleOne(row.contactId)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">
                      {contactDisplayName(
                        row.contact.firstName,
                        row.contact.lastName,
                      )}
                      <div className="text-xs font-normal text-subtle">
                        {row.contact.email ?? (
                          <span className="text-subtle">No email — unusable</span>
                        )}
                        {row.scoringStatus === "UNUSABLE" ? (
                          <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-ink">
                            Unusable
                          </span>
                        ) : null}
                        {row.suppressed || row.scoringStatus === "SUPPRESSED" ? (
                          <span className="ml-2 rounded bg-warning-tint px-1.5 py-0.5 text-warning">
                            Opted out
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {row.contact.title ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {row.contact.companyId ? (
                        <Link
                          href={`/companies/${row.contact.companyId}`}
                          className="underline"
                        >
                          {row.contact.company ??
                            row.contact.companyRecord?.name ??
                            "Company"}
                        </Link>
                      ) : (
                        (row.contact.company ?? "—")
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      Research: {researchLabel}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                          qualificationBadgeClass(effectiveBucket),
                        )}
                      >
                        {displayQualificationBucket(effectiveBucket)}
                      </span>
                      {canRestore ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <AppButton
                            type="button"
                            disabled={overridePending}
                            onClick={() => restoreContact(row.contactId, "GOOD")}
                            className="rounded-md border border-success bg-success-tint px-2 py-1 text-xs font-medium text-success"
                            data-testid={`restore-contact-${row.contactId}`}
                          >
                            {EXCLUSION_REVIEW_COPY.addBack}
                          </AppButton>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {isExcluded && exclusionDetails.length > 0 ? (
                        <ExclusionDetailList details={exclusionDetails} compact />
                      ) : (
                        <AppButton
                          type="button"
                          variant="secondary"
                          className="w-full !px-2 !py-1.5 !justify-start"
                          title={resolvedQualification.reason ?? "Pending"}
                          aria-expanded={open}
                          onClick={() => setExpandedId(open ? null : row.id)}
                        >
                          <span className="line-clamp-2 leading-5">
                            {resolvedQualification.reason ?? "Pending"}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-subtle">
                            {open ? "Hide details" : "Show details"}
                          </span>
                        </AppButton>
                      )}
                      {personaMatch?.matchedPersonaId ? (
                        <p className="mt-1 text-xs text-subtle">
                          {vocab.persona.Singular} matched
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <AppButton
                        type="button"
                        className="text-sm font-medium text-ink underline"
                        onClick={() => setExpandedId(open ? null : row.id)}
                      >
                        {open ? "Hide" : "View"}
                      </AppButton>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-canvas">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="space-y-5 text-sm text-ink">
                          <SuppressContactForm
                            contactId={row.contactId}
                            email={row.contact.email}
                            suppressed={Boolean(
                              row.suppressed ||
                                row.scoringStatus === "SUPPRESSED",
                            )}
                          />
                          {exclusionDetails.length > 0 ? (
                            <section data-testid="exclusion-detail-panel">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-danger">
                                Exclusion details
                              </h4>
                              <div className="mt-2">
                                <ExclusionDetailList details={exclusionDetails} />
                              </div>
                            </section>
                          ) : null}
                          {why?.failedLines && why.failedLines !== "None" ? (
                            <section data-testid="icp-confirmed-failures">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-danger">
                                Confirmed misses
                              </h4>
                              <ul className="mt-2 space-y-1 rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm font-medium text-danger">
                                {qualification?.primaryFailedLines.map((line) => (
                                  <li key={line}>{line}</li>
                                ))}
                              </ul>
                            </section>
                          ) : null}

                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                              Qualification
                            </h4>
                            <div className="mt-2 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink">
                              <p>
                                Bucket:{" "}
                                {displayQualificationBucket(
                                  resolvedQualification.bucket,
                                )}
                              </p>
                              <p className="mt-1">
                                Reason: {resolvedQualification.reason ?? "—"}
                              </p>
                              {row.overallScore != null ? (
                                <p className="mt-1 tabular-nums text-subtle">
                                  Legacy score: overall {row.overallScore}
                                  {row.icpScore != null
                                    ? ` · ${vocab.icp.singular} ${row.icpScore}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                          </section>

                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                              Score Breakdown
                            </h4>
                            {asDimensions(row.assessmentData).length === 0 ? (
                              <p className="mt-2 text-subtle">
                                Not scored yet
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {asDimensions(row.assessmentData).map((dim) => (
                                  <div
                                    key={`${dim.dimension}-${dim.assessment}`}
                                    className="rounded-md border border-edge bg-surface px-3 py-2"
                                  >
                                    <p className="font-medium text-ink">
                                      {scoringDimensionLabel(dim.dimension)}{" "}
                                      <span className="font-normal text-subtle">
                                        · {dim.assessment}
                                      </span>
                                    </p>
                                    {dim.evidence.length > 0 ? (
                                      <p className="mt-1 text-xs text-muted">
                                        Evidence: {dim.evidence.join("; ")}
                                      </p>
                                    ) : null}
                                    {dim.concerns.length > 0 ? (
                                      <p className="mt-1 text-xs text-warning">
                                        Concerns: {dim.concerns.join("; ")}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          {why ? (
                            <section data-testid="icp-qualification-why">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                                Why this {vocab.icp.singular} result
                              </h4>
                              <div className="mt-2 space-y-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink">
                                {why.mandatory ? (
                                  <p className="font-medium text-danger">
                                    Disqualified by confirmed failure:{" "}
                                    {why.mandatory}
                                  </p>
                                ) : null}
                                <p>Primary passed: {why.passed}</p>
                                <p>Primary unresolved: {why.unresolved}</p>
                                <p>Primary failed: {why.failed}</p>
                                <p>Secondary signals found: {why.secondary}</p>
                              </div>
                            </section>
                          ) : null}

                          {factsUsed.length > 0 ? (
                            <section data-testid="icp-criterion-provenance">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                                Facts used
                              </h4>
                              <ul className="mt-2 space-y-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink">
                                {factsUsed.map((label) => (
                                  <li key={label}>{label}</li>
                                ))}
                              </ul>
                            </section>
                          ) : null}

                          <div className="grid gap-3 md:grid-cols-2">
                            <Detail
                              label="Company Summary"
                              value={
                                companyResearch?.companySummary ??
                                row.companySummary
                              }
                            />
                            <Detail
                              label="What They Sell"
                              value={
                                companyResearch?.whatTheySell ??
                                row.whatTheySell
                              }
                            />
                            <Detail
                              label="Estimated AOV"
                              value={
                                companyResearch?.estimatedAov ??
                                row.estimatedAov
                              }
                            />
                            <Detail
                              label="AOV Reasoning"
                              value={
                                companyResearch?.aovReasoning ??
                                row.aovReasoning
                              }
                            />
                            <Detail
                              label="Fit Strengths"
                              value={
                                asStringList(row.fitStrengths).join("; ") ||
                                null
                              }
                            />
                            <Detail
                              label="Fit Risks"
                              value={
                                asStringList(row.fitRisks).join("; ") || null
                              }
                            />
                            <Detail
                              label="Disqualifiers"
                              value={
                                asDisqualifierList(row.disqualifiers).join(
                                  "; ",
                                ) || null
                              }
                            />
                            <Detail
                              label="Company Research Status"
                              value={`Research: ${researchLabel}`}
                            />
                            <div className="md:col-span-2">
                              <Detail label="Reasoning" value={row.reasoning} />
                            </div>
                            <div className="md:col-span-2">
                              <Detail
                                label="Recommended Action"
                                value={row.recommendedAction}
                              />
                            </div>
                            {row.scoringError ? (
                              <div className="md:col-span-2">
                                <Detail
                                  label="Scoring Error"
                                  value={row.scoringError}
                                />
                              </div>
                            ) : null}
                          </div>

                          <section className="rounded-md border border-edge bg-surface px-3 py-2 text-xs text-subtle">
                            <p className="font-medium uppercase tracking-wide text-subtle">
                              Provenance
                            </p>
                            <p className="mt-1">
                              Scored At: {row.scoredAt ?? "—"} · Model:{" "}
                              {row.aiModel ?? "—"} · Prompt:{" "}
                              {row.promptVersion ?? "—"} · Logic:{" "}
                              {row.scoringLogicVersion ?? "—"}
                              {row.aiProvider
                                ? ` · Provider: ${row.aiProvider}`
                                : ""}
                            </p>
                          </section>

                          {row.contact.companyId ? (
                            <Link
                              href={`/companies/${row.contact.companyId}`}
                              className="text-sm font-medium text-ink underline"
                            >
                              Open company research page
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCampaign ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8">
          <div className="w-full max-w-2xl rounded-lg border border-edge bg-surface shadow-xl">
            <div className="flex items-start justify-between border-b border-edge px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  Create {vocab.campaign.Singular} From Selected
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {countedNoun(selected.size, vocab.contact)} · {productName} · {icpName} ·{" "}
                  {personaName}
                </p>
              </div>
              <SecondaryButton onClick={() => setShowCampaign(false)}>
                Close
              </SecondaryButton>
            </div>
            <form action={submitCampaign} className="space-y-4 px-5 py-5">
              {campaignState && !campaignState.ok ? (
                <p
                  role="status"
                  data-testid="campaign-action-status"
                  className="text-sm text-danger"
                >
                  {campaignState.message}
                </p>
              ) : null}
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="icpId" value={icpId} />
              {personaId ? (
                <>
                  <input type="hidden" name="personaId" value={personaId} />
                  <input type="hidden" name="personaIds" value={personaId} />
                </>
              ) : (
                <input type="hidden" name="allPersonas" value="1" />
              )}
              <Field label={`${vocab.campaign.Singular} Name`} name="name" required />
              <Field
                label="Offer Name"
                name="offerName"
                placeholder="Free Forecast Audit"
              />
              <Field
                label="Primary CTA"
                name="offerCta"
                placeholder={vocabExamples.offerCallToActionPlaceholder}
              />
              <Field
                label="Offer Description"
                name="offerDescription"
                as="textarea"
              />
              <Field label="Offer Notes" name="offerNotes" as="textarea" />
              <fieldset>
                <legend className="text-sm font-medium text-ink">
                  Email length
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {EMAIL_LENGTH_OPTIONS.map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 rounded-md border border-edge-strong px-3 py-2 text-sm text-ink"
                    >
                      <input
                        type="radio"
                        name="emailLength"
                        value={value}
                        defaultChecked={
                          (campaignState && !campaignState.ok
                            ? campaignState.values?.emailLength
                            : DEFAULT_EMAIL_LENGTH) === value
                        }
                      />
                      {value === "SHORT"
                        ? "Short"
                        : value === "MEDIUM"
                          ? "Medium"
                          : "Long"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="block text-sm">
                  <span className="font-medium text-ink">
                    Email guidance
                  </span>
                  <span className="mt-1 block text-xs text-subtle">
                    Steers every generated email in this {vocab.campaign.singular}, up to{" "}
                    {EMAIL_GUIDANCE_MAX_CHARS} characters.
                  </span>
                  <textarea
                    name="emailGuidance"
                    rows={3}
                    maxLength={EMAIL_GUIDANCE_MAX_CHARS}
                    defaultValue={
                      campaignState && !campaignState.ok
                        ? campaignState.values?.emailGuidance
                        : undefined
                    }
                    placeholder="Focus on the feature that removes the most manual work"
                    className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none ring-focus placeholder:text-subtle focus:ring-2"
                  />
                </label>
                <EmailGuidancePromptExamples />
              </div>
              <div className="flex gap-2">
                <SubmitButton disabled={campaignPending}>
                  {campaignPending ? "Creating…" : `Create ${vocab.campaign.singular}`}
                </SubmitButton>
                <SecondaryButton
                  type="button"
                  onClick={() => setShowCampaign(false)}
                >
                  Cancel
                </SecondaryButton>
              </div>
              <p className="text-xs text-subtle">
                Scoring run {runId} context is preserved via {vocab.product.Singular} / {vocab.icp.singular} /
                {vocab.persona.Singular} selection. Emails are not generated in this phase.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {label}
      </p>
      <p className={cn("mt-1", !value && "text-subtle")}>
        {value || "Not researched"}
      </p>
    </div>
  );
}
