"use client";

import type { ReactNode } from "react";
import { AppPendingIndicator } from "@/components/AppButton";
import { useWorkspaceJobs } from "@/components/workspace-jobs-context";
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
  children,
}: {
  result: InlineActionResult | null;
  className?: string;
  testId?: string;
  children?: ReactNode;
}) {
  const jobs = useWorkspaceJobs();
  if (!result) return null;
  const ids = trackedActionJobIds(result);
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

  const tracked = ids.map((id) => jobs.find((job) => job.id === id));
  const stillRunning = tracked.some(
    (job) => !job || job.status === "PENDING" || job.status === "IN_PROGRESS",
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

  const failed = tracked.find((job) => job?.status === "FAILED");
  if (failed?.status === "FAILED") {
    return (
      <p
        role="status"
        data-testid={testId}
        className={`text-sm text-danger ${className}`.trim()}
      >
        {workspaceJobFailureMessage(failed.error)}
      </p>
    );
  }

  return null;
}
