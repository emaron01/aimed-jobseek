"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppPendingIndicator } from "@/components/AppButton";
import { keepHarperQuestionInPlace } from "@/components/ApplicationActionForm";
import { useWorkspaceJobs } from "@/components/workspace-jobs-context";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { workspaceJobCopy } from "@/lib/product-config";

function consultationJobRunning(jobs: readonly WorkspaceJobStatusView[]): boolean {
  return jobs.some(
    (job) =>
      job.type === "CONSULTATION" &&
      (job.status === "PENDING" || job.status === "IN_PROGRESS"),
  );
}

/** server: keep the page spinner. spinner: poll sees work the page has not rendered. clear: work is finished, so refresh and drop the spinner. */
export function harperLivePresentation(input: {
  serverJobs: readonly WorkspaceJobStatusView[];
  liveJobs: readonly WorkspaceJobStatusView[];
}): "server" | "spinner" | "clear" {
  const jobs = input.liveJobs.length > 0 ? input.liveJobs : input.serverJobs;
  const serverBusy = consultationJobRunning(input.serverJobs);
  const liveBusy = consultationJobRunning(jobs);
  if (!liveBusy) return "clear";
  if (serverBusy) return "server";
  return "spinner";
}

/**
 * The server page shows a spinner from the jobs it rendered with. The workspace
 * poll can learn the job finished before that render commits. Follow the poll,
 * and refresh once so the finished Harper results replace the stale page.
 */
export function HarperLiveStatus({
  serverJobs,
  children,
}: {
  serverJobs: readonly WorkspaceJobStatusView[];
  children: ReactNode;
}) {
  const liveJobs = useWorkspaceJobs();
  const router = useRouter();
  const presentation = harperLivePresentation({ serverJobs, liveJobs });

  useEffect(() => {
    if (presentation === "clear" && consultationJobRunning(serverJobs)) {
      const active = document.activeElement;
      const card =
        active instanceof Element ? active.closest("[data-harper-question]") : null;
      keepHarperQuestionInPlace(card);
      router.refresh();
    }
  }, [presentation, serverJobs, router]);

  if (presentation === "clear") return null;
  if (presentation === "server") return children;
  return (
    <div className="space-y-1 text-sm text-muted" data-testid="harper-typing">
      <p>
        <AppPendingIndicator label={workspaceJobCopy.typing} />
      </p>
    </div>
  );
}
