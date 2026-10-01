"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ApplicationCompactTracker } from "@/components/ApplicationSidebarTracker";
import { WorkspaceJobRefresh } from "@/components/ApplicationWorkspaceLive";
import { WorkspaceJobsProvider } from "@/components/workspace-jobs-context";
import { markApplicationStepViewedAction } from "@/app/actions/application-jobs";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { applicationStepFromPathname } from "@/lib/product-config";

export function ApplicationWorkspaceChrome({
  campaignId,
  initialSignature,
  initialJobs,
  children,
}: {
  campaignId: string;
  initialSignature: string;
  initialJobs: WorkspaceJobStatusView[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  useEffect(() => {
    const step = applicationStepFromPathname(pathname);
    if (!step) return;
    const keys = step === "overview" ? (["applied"] as const) : [step];
    void Promise.all(
      keys.map((key) => markApplicationStepViewedAction(campaignId, key)),
    ).catch((error) => {
      console.error(
        JSON.stringify({
          event: "application_step_view_failed",
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    });
  }, [campaignId, pathname]);

  return (
    <WorkspaceJobsProvider initialJobs={initialJobs}>
      <div className="flex min-h-[calc(100vh-8rem)] flex-col md:flex-row md:items-stretch">
        <WorkspaceJobRefresh
          campaignId={campaignId}
          initialSignature={initialSignature}
          initialJobs={initialJobs}
        />
        <ApplicationCompactTracker campaignId={campaignId} />
        <div className="min-w-0 flex-1 space-y-4">{children}</div>
      </div>
    </WorkspaceJobsProvider>
  );
}
