"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getApplicationTrackerAction,
} from "@/app/actions/application-jobs";
import { AppIcon, ErrorState, Skeleton } from "@/components/design";
import { AppButton } from "@/components/ui";
import type { ApplicationTrackerView } from "@/lib/application/tracker";
import type { ApplicationStepState } from "@/lib/application/step-progress";
import {
  applicationStepCopy,
  polishCopy,
} from "@/lib/product-config";
import { cn } from "@/lib/utils";

const POLL_MS = 3_000;

function stateTone(state: ApplicationStepState): string {
  switch (state) {
    case "done":
      return "bg-success text-on-ink";
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

function stateLabel(state: ApplicationStepState): string {
  switch (state) {
    case "done":
      return applicationStepCopy.done;
    case "in_progress":
      return applicationStepCopy.inProgress;
    case "needs_attention":
      return applicationStepCopy.needsAttention;
    case "not_started":
      return applicationStepCopy.notStarted;
    default: {
      const exhaustive: never = state;
      throw new Error(`Unknown step state: ${String(exhaustive)}`);
    }
  }
}

export function ApplicationStepMarker({
  state,
  current,
}: {
  state: ApplicationStepState;
  current: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        current ? "bg-primary text-on-primary" : stateTone(state),
      )}
      aria-label={stateLabel(state)}
    >
      {state === "done" ? (
        <AppIcon name="check" className="h-3.5 w-3.5" />
      ) : state === "in_progress" ? (
        <AppIcon name="spinner" className="h-3.5 w-3.5" />
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
                ? ink
                  ? "bg-primary text-on-primary"
                  : "bg-primary/10 text-primary"
                : ink
                  ? "text-on-ink/90 hover:bg-on-ink/10"
                  : "text-ink hover:bg-canvas",
            )}
          >
            <ApplicationStepMarker state={step.state} current={step.isCurrent} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {step.number}. {step.title}
              </span>
            </span>
            {step.hasNew ? (
              <span
                className="rounded-full bg-warning-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning"
                data-testid={`tracker-new-${step.key}`}
              >
                {applicationStepCopy.newMarker}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await getApplicationTrackerAction(campaignId, pathname);
      if (!cancelled) {
        setTracker(next);
        setLoaded(true);
        setFailed(false);
      }
    };
    void load().catch((error) => {
      if (!cancelled) {
        setLoaded(true);
        setFailed(true);
      }
      console.error(
        JSON.stringify({
          event: "application_tracker_poll_failed",
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    });
    const interval = window.setInterval(() => {
      void load().catch((error) => {
        if (!cancelled) setFailed(true);
        console.error(
          JSON.stringify({
            event: "application_tracker_poll_failed",
            message: error instanceof Error ? error.message : "unknown",
          }),
        );
      });
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [campaignId, pathname]);

  if (!loaded) {
    return (
      <div className="px-3 py-3" data-testid="application-tracker-loading">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-on-ink/70">
          {applicationStepCopy.trackerLabel}
        </p>
        <Skeleton className="mt-2" lines={4} />
      </div>
    );
  }
  if (failed && !tracker) {
    return (
      <div className="px-3 py-3">
        <ErrorState
          description={polishCopy.trackerLoadFailed}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
  if (!tracker) return null;

  return (
    <div className="border-b border-on-ink/15 px-3 py-3">
      <p className="truncate text-sm font-semibold text-on-ink" title={tracker.campaignName}>
        {tracker.campaignName}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-on-ink/70">
        {applicationStepCopy.trackerLabel}
      </p>
      <div className="mt-2">
        <ApplicationTrackerList tracker={tracker} variant="sidebar" />
      </div>
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await getApplicationTrackerAction(campaignId, pathname);
      if (!cancelled) {
        setTracker(next);
        setFailed(false);
      }
    };
    void load().catch((error) => {
      if (!cancelled) setFailed(true);
      console.error(
        JSON.stringify({
          event: "application_tracker_poll_failed",
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    });
    const interval = window.setInterval(() => {
      void load().catch((error) => {
        console.error(
          JSON.stringify({
            event: "application_tracker_poll_failed",
            message: error instanceof Error ? error.message : "unknown",
          }),
        );
      });
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [campaignId, pathname]);

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
          <div           className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge">
            <div
              className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: total ? `${(doneCount / total) * 100}%` : "0%" }}
            />
          </div>
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
          <ApplicationTrackerList tracker={tracker} variant="overlay" />
        </div>
      ) : null}
    </div>
  );
}
