"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getApplicationTrackerAction } from "@/app/actions/application-jobs";
import {
  getExternalWorkspaceJobs,
  subscribeExternalWorkspaceJobs,
} from "@/components/workspace-jobs-context";
import { activeWorkspaceJobs } from "@/lib/application-jobs/workspace-status";
import { AppIcon, ErrorState, Skeleton } from "@/components/design";
import {
  sidebarNavItemBranchClass,
  sidebarNavItemCurrentClass,
  sidebarNavItemIdleClass,
  sidebarNavItemLayoutClass,
} from "@/components/sidebar-nav-style";
import { AppButton } from "@/components/ui";
import type { ApplicationTrackerView } from "@/lib/application/tracker";
import type { ApplicationStepState } from "@/lib/application/step-progress";
import {
  workspaceApplicationContactsHref,
  workspaceCampaignHref,
} from "@/lib/application/workspace-links";
import {
  applicationStepByKey,
  applicationStepCopy,
  applicationStepFromPathname,
  applicationStepHref,
  applicationStepStatusLabel,
  applicationStepStatusTone,
  polishCopy,
  vocab,
} from "@/lib/product-config";
import { cn } from "@/lib/utils";

const POLL_MS = 3_000;

function useApplicationTrackerPoll(
  campaignId: string,
  pathname: string,
  onTracker: (tracker: ApplicationTrackerView | null) => void,
  onFailed: (failed: boolean) => void,
  onLoaded: (loaded: boolean) => void,
) {
  const liveJobs = useSyncExternalStore(
    subscribeExternalWorkspaceJobs,
    getExternalWorkspaceJobs,
    getExternalWorkspaceJobs,
  );
  const liveRunning = activeWorkspaceJobs(liveJobs).length > 0;

  useEffect(() => {
    let cancelled = false;
    let interval: number | null = null;

    const stop = () => {
      if (interval == null) return;
      window.clearInterval(interval);
      interval = null;
    };

    const load = async () => {
      const next = await getApplicationTrackerAction(campaignId, pathname);
      if (cancelled) return null;
      onTracker(next);
      onLoaded(true);
      onFailed(false);
      return next;
    };

    const tick = () => {
      void load()
        .then((next) => {
          if (cancelled) return;
          const busy =
            liveRunning || Boolean(next?.steps.some((step) => step.hasActiveJob));
          if (!busy) {
            stop();
            return;
          }
          if (interval != null) return;
          interval = window.setInterval(() => {
            tick();
          }, POLL_MS);
        })
        .catch((error) => {
          if (!cancelled) {
            onLoaded(true);
            onFailed(true);
          }
          console.error(
            JSON.stringify({
              event: "application_tracker_poll_failed",
              message: error instanceof Error ? error.message : "unknown",
            }),
          );
        });
    };

    tick();
    return () => {
      cancelled = true;
      stop();
    };
  }, [campaignId, pathname, liveRunning, onTracker, onFailed, onLoaded]);
}

function applicationPageBranch(
  campaignId: string,
  pathname: string,
): { href: string; label: string } | null {
  if (pathname === "/contacts") {
    return {
      href: workspaceApplicationContactsHref(campaignId),
      label: vocab.contact.Plural,
    };
  }
  const step = applicationStepFromPathname(pathname);
  if (!step || step === "overview") return null;
  const page = applicationStepByKey(step);
  return {
    href: applicationStepHref(campaignId, page.key),
    label: page.title,
  };
}

function stateTone(state: ApplicationStepState): string {
  switch (state) {
    case "done":
      return "bg-success text-on-ink";
    case "active":
      return "bg-active text-on-ink";
    case "in_progress":
      return "bg-warning-tint text-warning";
    case "needs_attention":
    case "not_started":
      return "bg-danger text-on-ink";
    default: {
      const exhaustive: never = state;
      throw new Error(`Unknown step state: ${String(exhaustive)}`);
    }
  }
}

export function ApplicationStepMarker({
  state,
  current,
  hasActiveJob = false,
  statusLabel,
  statusTone,
}: {
  state: ApplicationStepState;
  current: boolean;
  hasActiveJob?: boolean;
  statusLabel: string;
  statusTone: ReturnType<typeof applicationStepStatusTone>;
}) {
  const showSpinner = state === "in_progress" && hasActiveJob;
  const tone =
    statusTone === "progress" && state === "done" ? stateTone("in_progress") : stateTone(state);
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        current ? "bg-primary text-on-primary" : tone,
      )}
      aria-label={statusLabel}
      data-testid={
        showSpinner
          ? "tracker-step-marker-spinner"
          : state === "in_progress"
            ? "tracker-step-marker-static"
            : "tracker-step-marker"
      }
    >
      {state === "done" ? (
        <AppIcon name="check" className="h-3.5 w-3.5" />
      ) : showSpinner ? (
        <AppIcon name="spinner" className="h-3.5 w-3.5" />
      ) : state === "active" ? (
        <AppIcon name="dot" className="h-3.5 w-3.5" />
      ) : (
        <AppIcon name="dot" className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

export function ApplicationTrackerList({
  tracker,
  variant,
}: {
  tracker: ApplicationTrackerView;
  variant: "sidebar" | "overlay";
}) {
  const ink = variant === "sidebar";
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const filteredCampaignId =
    searchParams.get("campaignId")?.trim() ||
    searchParams.get("application")?.trim() ||
    "";
  const contactsCurrent =
    pathname === "/contacts" && filteredCampaignId === tracker.campaignId;
  return (
    <ol
      className="space-y-1"
      data-testid="application-step-tracker"
    >
      {tracker.steps.map((step) => (
        <li key={step.key}>
          <Link
            href={step.href}
            data-testid={`tracker-step-${step.key}`}
            aria-current={step.isCurrent ? "page" : undefined}
            className={cn(
              "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-200 motion-reduce:transition-none",
              step.isCurrent
                ? "border-l-2 border-l-primary bg-primary/10 text-primary"
                : ink
                  ? "bg-surface text-ink hover:bg-surface"
                  : "bg-surface text-ink hover:bg-canvas",
            )}
          >
            <ApplicationStepMarker
              state={step.state}
              current={step.isCurrent}
              hasActiveJob={step.hasActiveJob}
              statusLabel={applicationStepStatusLabel(step)}
              statusTone={applicationStepStatusTone({
                key: step.key,
                workDone: step.workDone,
                state: step.state,
              })}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {step.number}. {step.title}
              </span>
              {step.hasNew && step.newLabel ? (
                <span
                  className="mt-0.5 inline-block max-w-full break-words rounded-full bg-warning-tint px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-warning"
                  data-testid={`tracker-new-${step.key}`}
                >
                  {step.newLabel}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
      <li
        className="rounded-md bg-surface"
        data-testid="tracker-application-contacts-surface"
      >
        <Link
          href={workspaceApplicationContactsHref(tracker.campaignId)}
          data-testid="tracker-application-contacts"
          aria-current={contactsCurrent ? "page" : undefined}
          className={cn(
            "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-200 motion-reduce:transition-none",
            contactsCurrent
              ? "border-l-2 border-l-primary bg-primary/10 text-primary"
              : ink
                ? "text-ink hover:bg-canvas"
                : "text-ink hover:bg-canvas",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{vocab.contact.Plural}</span>
          </span>
        </Link>
      </li>
    </ol>
  );
}

export function ApplicationSidebarTracker({
  campaignId,
}: {
  campaignId: string;
}) {
  const pathname = usePathname() || "";
  const [tracker, setTracker] = useState<ApplicationTrackerView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useApplicationTrackerPoll(campaignId, pathname, setTracker, setFailed, setLoaded);

  const href = workspaceCampaignHref(campaignId);
  const branch = applicationPageBranch(campaignId, pathname);
  const current = !branch && pathname === href;

  return (
    <div
      className="border-b border-on-nav/15 px-3 py-3"
      data-testid="application-sidebar-section"
    >
      {tracker ? (
        <p
          className="min-w-0 break-words text-sm font-semibold text-on-nav line-clamp-2"
          title={tracker.campaignName}
        >
          {tracker.campaignName}
        </p>
      ) : !loaded ? (
        <div data-testid="application-tracker-loading">
          <Skeleton lines={2} />
        </div>
      ) : failed ? (
        <ErrorState
          description={polishCopy.trackerLoadFailed}
          onRetry={() => window.location.reload()}
        />
      ) : null}
      <Link
        href={href}
        data-testid="sidebar-application-dashboard"
        aria-current={current ? "page" : undefined}
        className={cn(
          "mt-2",
          sidebarNavItemLayoutClass,
          current ? sidebarNavItemCurrentClass : sidebarNavItemIdleClass,
        )}
      >
        {applicationStepCopy.dashboardTitle}
      </Link>
      {branch ? (
        <div
          className="ml-3 mt-1 border-l border-on-nav/40 pl-2"
          data-testid="sidebar-application-page-branch"
        >
          <Link
            href={branch.href}
            data-testid="sidebar-application-page"
            aria-current="page"
            className={cn(sidebarNavItemBranchClass, sidebarNavItemCurrentClass)}
          >
            {branch.label}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function ApplicationCompactTracker({
  campaignId,
}: {
  campaignId: string;
}) {
  const pathname = usePathname() || "";
  const [tracker, setTracker] = useState<ApplicationTrackerView | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useApplicationTrackerPoll(campaignId, pathname, setTracker, setFailed, setLoaded);

  const current = tracker?.steps.find((step) => step.isCurrent) ?? tracker?.steps[0];
  const doneCount = tracker?.steps.filter((step) => step.state === "done").length ?? 0;
  const total = tracker?.steps.length ?? 0;

  return (
    <div
      className="border-b border-edge bg-surface px-3 py-2 md:hidden"
      data-testid="application-compact-tracker"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {current
              ? `${current.number}. ${current.title}`
              : applicationStepCopy.trackerLabel}
          </p>
          {!loaded ? (
            <Skeleton className="mt-1" lines={1} />
          ) : (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge">
              <div
                className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: total ? `${(doneCount / total) * 100}%` : "0%" }}
              />
            </div>
          )}
        </div>
        <AppButton
          type="button"
          variant="secondary"
          className="!px-2.5 !py-1"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? applicationStepCopy.collapseTracker : applicationStepCopy.expandTracker}
        </AppButton>
      </div>
      {failed && !tracker ? (
        <div className="mt-2">
          <ErrorState
            description={polishCopy.trackerLoadFailed}
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : null}
      {open && tracker ? (
        <div className="mt-2">
          <Suspense fallback={null}>
            <ApplicationTrackerList tracker={tracker} variant="overlay" />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
