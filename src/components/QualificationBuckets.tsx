"use client";

import Link from "next/link";
import { AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useMemo, useState, useTransition } from "react";
import type {
  QualificationBucket,
  QualificationOverrideTarget,
} from "@prisma/client";
import {
  bulkRestoreQualificationAction,
  overrideQualificationBucketAction,
} from "@/app/actions/qualification";
import { ExclusionDetailList } from "@/components/ExclusionDetailList";
import type { ExclusionDetail } from "@/lib/scoring/exclusion-detail";
import {
  EXCLUSION_REVIEW_COPY,
  QUALIFICATION_BUCKET_LABELS,
  QUALIFICATION_BUCKETS,
} from "@/lib/workflow/qualification";

export type QualificationBucketRow = {
  id: string;
  companyId?: string | null;
  /** Run that owns this row's score (needed when campaign merges multiple runs). */
  scoringRunId?: string | null;
  targetType: QualificationOverrideTarget;
  name: string;
  title?: string | null;
  company?: string | null;
  bucket: QualificationBucket;
  unresolvedCriterion: string | null;
  researchGuidance: string | null;
  researchHref: string | null;
  canOverride: boolean;
  secondaryFlags?: string[];
  exclusionDetails?: ExclusionDetail[];
};

const CARD_STYLES: Record<QualificationBucket, string> = {
  GOOD: "border-success bg-success-tint text-success",
  NEEDS_REVIEW: "border-warning bg-warning-tint text-warning",
  POOR_FIT: "border-danger bg-danger-tint text-danger",
  EXCLUDED: "border-edge-strong bg-canvas text-ink",
};

export function QualificationBuckets({
  campaignId,
  scoringRunId,
  rows: initialRows,
  emptyTitle,
  emptyActionHref,
  emptyActionLabel,
  readOnly = false,
}: {
  campaignId: string;
  scoringRunId: string | null;
  rows: QualificationBucketRow[];
  emptyTitle: string;
  emptyActionHref: string;
  emptyActionLabel: string;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [message, setMessage] = useState<string | null>(null);
  const [keptExcludedIds, setKeptExcludedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pending, startTransition] = useTransition();

  function runIdForRow(row: QualificationBucketRow): string | null {
    return row.scoringRunId ?? scoringRunId;
  }

  function canActOnRow(row: QualificationBucketRow): boolean {
    return !readOnly && Boolean(runIdForRow(row));
  }

  function canActOnRows(targetRows: QualificationBucketRow[]): boolean {
    return targetRows.some((row) => canActOnRow(row));
  }

  function restore(row: QualificationBucketRow, bucket: QualificationBucket) {
    const runId = runIdForRow(row);
    if (!runId) return;
    startTransition(async () => {
      const result = await overrideQualificationBucketAction({
        campaignId,
        scoringRunId: runId,
        targetType: row.targetType,
        targetId: row.id,
        bucket,
      });
      setMessage(result.message);
      if (result.ok && result.bucket) {
        setRows((current) =>
          current.map((entry) =>
            entry.id === row.id && entry.targetType === row.targetType
              ? { ...entry, bucket: result.bucket! }
              : entry,
          ),
        );
      }
    });
  }

  function restoreMany(
    targetRows: QualificationBucketRow[],
    bucket: QualificationBucket,
  ) {
    if (targetRows.length === 0) return;
    const byRun = new Map<string, QualificationBucketRow[]>();
    for (const row of targetRows) {
      const runId = runIdForRow(row);
      if (!runId) continue;
      const group = byRun.get(runId) ?? [];
      group.push(row);
      byRun.set(runId, group);
    }
    if (byRun.size === 0) return;
    startTransition(async () => {
      let restoredBucket: QualificationBucket | undefined;
      const messages: string[] = [];
      let anyOk = false;
      for (const [runId, group] of byRun) {
        const result = await bulkRestoreQualificationAction({
          campaignId,
          scoringRunId: runId,
          targetType: group[0]!.targetType,
          targetIds: group.map((row) => row.id),
          bucket,
        });
        messages.push(result.message);
        if (result.ok && result.bucket) {
          anyOk = true;
          restoredBucket = result.bucket;
        }
      }
      setMessage(messages[messages.length - 1] ?? null);
      if (anyOk && restoredBucket) {
        const ids = new Set(
          targetRows.map((row) => `${row.targetType}:${row.id}`),
        );
        setRows((current) =>
          current.map((entry) =>
            ids.has(`${entry.targetType}:${entry.id}`)
              ? { ...entry, bucket: restoredBucket! }
              : entry,
          ),
        );
      }
    });
  }

  function keepExcluded(rowKey: string) {
    setKeptExcludedIds((current) => new Set(current).add(rowKey));
  }

  function keepExcludedMany(rowKeys: string[]) {
    setKeptExcludedIds((current) => {
      const next = new Set(current);
      for (const key of rowKeys) next.add(key);
      return next;
    });
  }

  const excludedGroups = useMemo(() => {
    const groups = rows
      .filter(
        (row) =>
          row.bucket === "EXCLUDED" &&
          row.exclusionDetails?.length &&
          !keptExcludedIds.has(`${row.targetType}:${row.id}`),
      )
      .reduce((map, row) => {
        const detail = row.exclusionDetails![0]!;
        const key =
          detail.kind === "ICP"
            ? `ICP:${detail.criterionId ?? detail.criterionName}`
            : `PERSONA:${detail.criterionId ?? detail.criterionName}`;
        const entry = map.get(key) ?? {
          criterionName: detail.criterionName,
          rows: [] as QualificationBucketRow[],
        };
        entry.rows.push(row);
        map.set(key, entry);
        return map;
      }, new Map<string, { criterionName: string; rows: QualificationBucketRow[] }>());
    return [...groups.values()].filter((group) => group.rows.length > 1);
  }, [rows, keptExcludedIds]);

  const exclusionContactCount = useMemo(() => {
    const ids = new Set<string>();
    for (const group of excludedGroups) {
      for (const row of group.rows) ids.add(`${row.targetType}:${row.id}`);
    }
    return ids.size;
  }, [excludedGroups]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUALIFICATION_BUCKETS.map((bucket) => (
          <div
            key={bucket}
            className={`rounded-lg border p-4 ${CARD_STYLES[bucket]}`}
          >
            <p className="text-sm font-medium">
              {QUALIFICATION_BUCKET_LABELS[bucket]}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {rows.filter((row) => row.bucket === bucket).length}
            </p>
          </div>
        ))}
      </div>

      {message ? (
        <p role="status" className="text-sm text-ink">
          {message}
        </p>
      ) : null}

      {excludedGroups.length > 0 ? (
        <div className="space-y-4" data-testid="bulk-exclusion-restore">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {EXCLUSION_REVIEW_COPY.panelHeading(exclusionContactCount)}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {EXCLUSION_REVIEW_COPY.panelSubheading}
            </p>
          </div>
          {excludedGroups.map((group) => (
            <div
              key={group.criterionName}
              className="space-y-3 rounded-lg border border-edge-strong bg-canvas px-4 py-3 text-sm text-ink"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="font-medium text-ink">
                  {EXCLUSION_REVIEW_COPY.groupReason(group.criterionName)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <AppButton
                    type="button"
                    disabled={pending || !canActOnRows(group.rows)}
                    onClick={() =>
                      keepExcludedMany(
                        group.rows.map((row) => `${row.targetType}:${row.id}`),
                      )
                    }
                    variant="secondary" className={cn("py-1", "!px-2", "!py-1", "!text-xs")}
                  >
                    {EXCLUSION_REVIEW_COPY.keepExcluded}
                  </AppButton>
                  <AppButton
                    type="button"
                    disabled={pending || !canActOnRows(group.rows)}
                    onClick={() => restoreMany(group.rows, "GOOD")}
                    className="rounded-md border border-success bg-success-tint px-2 py-1 text-xs font-medium text-success"
                  >
                    {EXCLUSION_REVIEW_COPY.addAllBack}
                  </AppButton>
                </div>
              </div>
              <ul className="divide-y divide-edge rounded-md border border-edge bg-surface">
                {group.rows.map((row) => (
                  <li
                    key={`${row.targetType}:${row.id}`}
                    className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-ink">{row.name}</p>
                      <p className="text-xs text-muted">
                        {[row.title, row.company].filter(Boolean).join(" · ") ||
                          "—"}
                      </p>
                    </div>
                    {row.canOverride ? (
                      <div className="flex flex-wrap gap-1">
                        <AppButton
                          type="button"
                          disabled={pending || !canActOnRow(row)}
                          onClick={() =>
                            keepExcluded(`${row.targetType}:${row.id}`)
                          }
                          variant="secondary" className={cn("py-1", "!px-2", "!py-1", "!text-xs")}
                        >
                          {EXCLUSION_REVIEW_COPY.keepExcluded}
                        </AppButton>
                        <AppButton
                          type="button"
                          disabled={pending || !canActOnRow(row)}
                          onClick={() => restore(row, "GOOD")}
                          className="rounded-md border border-success bg-success-tint px-2 py-1 text-xs font-medium text-success"
                        >
                          {EXCLUSION_REVIEW_COPY.addBack}
                        </AppButton>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <section className="rounded-lg border border-dashed border-edge-strong bg-surface p-7 text-center">
          <h3 className="font-semibold text-ink">{emptyTitle}</h3>
          <p className="mt-1 text-sm text-muted">
            Complete the preceding stage to populate this view.
          </p>
          <Link
            href={emptyActionHref}
            className={cn("mt-4", "!px-3")}
          >
            {emptyActionLabel}
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article
              key={`${row.targetType}:${row.id}`}
              className="rounded-lg border border-edge bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-ink">{row.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {QUALIFICATION_BUCKET_LABELS[row.bucket]}
                  </p>
                  {row.secondaryFlags && row.secondaryFlags.length > 0 ? (
                    <p className="mt-1 text-xs font-medium text-success">
                      {row.secondaryFlags.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.bucket === "EXCLUDED" && row.canOverride ? (
                    <AppButton
                      type="button"
                      disabled={pending || !canActOnRow(row)}
                      onClick={() => restore(row, "GOOD")}
                      className="rounded-md border border-success bg-success-tint px-2 py-1 text-xs font-medium text-success"
                      data-testid={`restore-${row.targetType}-${row.id}`}
                    >
                      {EXCLUSION_REVIEW_COPY.addBack}
                    </AppButton>
                  ) : null}
                  {row.bucket !== "EXCLUDED" && row.canOverride
                    ? QUALIFICATION_BUCKETS.filter(
                        (bucket) => bucket !== row.bucket,
                      ).map((bucket) => (
                        <AppButton
                          key={bucket}
                          type="button"
                          disabled={pending || !canActOnRow(row)}
                          onClick={() => restore(row, bucket)}
                          variant="secondary" className={cn("py-1", "!px-2", "!py-1", "!text-xs")}
                        >
                          Move to {QUALIFICATION_BUCKET_LABELS[bucket]}
                        </AppButton>
                      ))
                    : null}
                </div>
              </div>
              {row.bucket === "EXCLUDED" && row.exclusionDetails?.length ? (
                <div className="mt-3">
                  <ExclusionDetailList details={row.exclusionDetails} />
                </div>
              ) : null}
              {row.bucket === "NEEDS_REVIEW" && row.unresolvedCriterion ? (
                <div className="mt-3 rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning">
                  <p>{row.unresolvedCriterion}</p>
                  {row.researchGuidance ? (
                    <p className="mt-1 text-xs">{row.researchGuidance}</p>
                  ) : null}
                  {row.researchHref ? (
                    <Link
                      href={row.researchHref}
                      className="mt-2 inline-block text-xs font-medium underline"
                    >
                      Open score detail
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
