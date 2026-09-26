"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ApplicationCompactTracker } from "@/components/ApplicationSidebarTracker";
import { HarperDock } from "@/components/HarperDock";
import { markApplicationStepViewedAction } from "@/app/actions/application-jobs";
import { applicationStepFromPathname } from "@/lib/product-config";

export function ApplicationWorkspaceChrome({
  campaignId,
  children,
  harper,
}: {
  campaignId: string;
  children: React.ReactNode;
  harper: React.ReactNode;
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
    <div className="flex min-h-[calc(100vh-8rem)] flex-col md:flex-row md:items-stretch">
      <ApplicationCompactTracker campaignId={campaignId} />
      <div className="min-w-0 flex-1 space-y-4 pr-0 md:pr-3">{children}</div>
      <HarperDock campaignId={campaignId}>{harper}</HarperDock>
    </div>
  );
}
