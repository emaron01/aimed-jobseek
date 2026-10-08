"use client";

import { useEffect, type ReactNode } from "react";
import { AppPendingIndicator } from "@/components/AppButton";
import { useWorkspaceJobResolution } from "@/components/workspace-jobs-context";
import { workspaceJobFailureMessage } from "@/lib/product-config";

export type InlineActionResult = {
  ok: boolean;
  message: string;
  jobId?: string;
  jobIds?: string[];
};

export function trackedActionJobIds(result: InlineActionResult): string[] {
  if (!result.ok) return [];
  const ids = [result.jobId, ...(result.jobIds ?? [])].flatMap((id) => {
    const trimmed = id?.trim();
    return trimmed ? [trimmed] : [];
  });
  return [...new Set(ids)];
}

export function InlineActionStatus({
  result,
  className = "",
  testId = "inline-action-status",
  suppressJobFailure = false,
  children,
}: {
  result: InlineActionResult | null;
  className?: string;
  testId?: string;
  /** The page already shows one failure message. Do not repeat a finished job error. */
  suppressJobFailure?: boolean;
  children?: ReactNode;
}) {
  const { jobs, missingJobIds, watchJobIds } = useWorkspaceJobResolution();
  const ids = result ? trackedActionJobIds(result) : [];
  const watchedKey = ids.join("\0");
  useEffect(() => {
    const current = watchedKey ? watchedKey.split("\0") : [];
    if (current.length === 0) return;
    watchJobIds(current);
  }, [watchedKey, watchJobIds]);
  if (!result) return null;
  if (ids.length === 0) {
    return (
      <div
        role="status"
        data-testid={testId}
        className={`${result.ok ? "text-sm text-success" : "text-sm text-danger"} ${className}`.trim()}
      >
        <p>{result.message}</p>
        {children}
      </div>
    );
  }

  const missing = new Set(missingJobIds);
  const tracked = ids.map((id) => ({
    id,
    job: jobs.find((job) => job.id === id),
    absent: missing.has(id),
  }));
  const stillRunning = tracked.some(
    (item) =>
      !item.absent &&
      (!item.job || item.job.status === "PENDING" || item.job.status === "IN_PROGRESS"),
  );
  if (stillRunning) {
    return (
      <p
        role="status"
        data-testid={testId}
        className={`text-sm text-ink ${className}`.trim()}
      >
        <AppPendingIndicator label={result.message} />
      </p>
    );
  }

  const failed = tracked.find((item) => item.absent || item.job?.status === "FAILED");
  if (failed && suppressJobFailure) return null;
  if (failed) {
    return (
      <p
        role="status"
        data-testid={testId}
        className={`text-sm text-danger ${className}`.trim()}
      >
        {workspaceJobFailureMessage(failed.job?.error ?? null)}
      </p>
    );
  }

  return null;
}
