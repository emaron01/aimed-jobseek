"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getApplicationWorkspaceLiveAction } from "@/app/actions/application-jobs";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { retryApplicationJobAction } from "@/app/actions/application-jobs";
import { workspaceJobCopy } from "@/lib/product-config";
import {
  activeWorkspaceJobs,
  type WorkspaceJobStatusView,
} from "@/lib/application-jobs/workspace-status";
import { AppPendingIndicator } from "@/components/AppButton";
import {
  useReplaceWorkspaceJobs,
  useWorkspaceJobs,
} from "@/components/workspace-jobs-context";
import { workspaceJobFailureMessage } from "@/lib/product-config";
import { AppActionLink } from "@/components/ui";
import { hasVisibleText } from "@/lib/grounding/fact-tokens";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceConsultationHrefFromPathname,
} from "@/lib/application/workspace-links";
import { applicationAssetConfig, consultationConfig, vocab } from "@/lib/product-config";

const POLL_MS = 4_000;

function JobErrorDetail({
  error,
  profileHref,
}: {
  error: string | null;
  profileHref?: string | null;
}) {
  const lines = (error ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => hasVisibleText(line));
  const message = workspaceJobFailureMessage(error);
  const violations = lines.slice(1);
  const showFix =
    /claim|source|verif/i.test(error ?? "") || violations.length > 0;
  const pathname = usePathname() || "";
  return (
    <div className={`space-y-2 ${WORKSPACE_CARD_WRAP_CLASS}`}>
      <p className={`text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
        {message}
      </p>
      {violations.length ? (
        <ul
          className={`list-disc pl-5 text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
        >
          {violations.map((line) => (
            <li key={line} className={WORKSPACE_MESSAGE_WRAP_CLASS}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {showFix ? (
        <p
          className={`flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-ink ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
        >
          {applicationAssetConfig.labels.violationFix
            .replace("{consultant}", consultationConfig.displayName)
            .replace("{product}", vocab.product.singular)}{" "}
          <AppActionLink
            href={workspaceConsultationHrefFromPathname(pathname)}
            variant="chip"
          >
            {consultationConfig.displayName}
          </AppActionLink>{" "}
          {profileHref ? (
            <AppActionLink href={profileHref} variant="chip">
              {vocab.product.Singular}
            </AppActionLink>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function WorkspaceJobRefresh({
  campaignId,
  initialSignature,
  initialJobs,
  initialWorkRunning = false,
}: {
  campaignId: string;
  initialSignature?: string;
  initialJobs?: WorkspaceJobStatusView[];
  /** Research or posting work already running when the page loaded. */
  initialWorkRunning?: boolean;
}) {
  const router = useRouter();
  const jobs = useWorkspaceJobs();
  const replaceJobs = useReplaceWorkspaceJobs();
  const signature = useRef<string | null>(initialSignature ?? null);
  const initialJobsRef = useRef(initialJobs);
  const pollRef = useRef<(() => void) | null>(null);
  const ensurePollingRef = useRef<(() => void) | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (initialSignature == null) return;
    if (signature.current == null || signature.current === initialSignature) {
      signature.current = initialSignature;
    }
  }, [initialSignature]);

  useEffect(() => {
    let interval: number | null = null;
    let cancelled = false;

    function hasActive(latest: { active: boolean }): boolean {
      return latest.active;
    }

    function stopPolling() {
      if (interval != null) {
        window.clearInterval(interval);
        interval = null;
      }
      pollingRef.current = false;
    }

    function startPolling() {
      if (interval != null || cancelled) return;
      pollingRef.current = true;
      interval = window.setInterval(() => {
        void poll();
      }, POLL_MS);
    }

    pollRef.current = () => {
      void poll();
    };
    ensurePollingRef.current = startPolling;

    async function poll() {
      try {
        const latest = await getApplicationWorkspaceLiveAction(campaignId);
        if (!latest || cancelled) return;
        replaceJobs(latest.jobs);
        if (signature.current == null) {
          signature.current = latest.signature;
        } else if (latest.signature !== signature.current) {
          signature.current = latest.signature;
          router.refresh();
        }
        if (hasActive(latest)) {
          startPolling();
        } else {
          stopPolling();
        }
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "workspace_job_refresh_failed",
            message: error instanceof Error ? error.message : "unknown",
          }),
        );
      }
    }

    const startingJobs = initialJobsRef.current;
    if (startingJobs && activeWorkspaceJobs(startingJobs).length > 0) {
      startPolling();
      void poll();
    }

    return () => {
      cancelled = true;
      pollRef.current = null;
      ensurePollingRef.current = null;
      stopPolling();
    };
  }, [campaignId, replaceJobs, router]);

  const activeKey = jobs
    .filter((job) => job.status === "PENDING" || job.status === "IN_PROGRESS")
    .map((job) => job.id)
    .sort()
    .join("|");
  useEffect(() => {
    if (!activeKey || pollingRef.current) return;
    ensurePollingRef.current?.();
    pollRef.current?.();
  }, [activeKey]);

  useEffect(() => {
    if (!initialWorkRunning || pollingRef.current) return;
    ensurePollingRef.current?.();
    pollRef.current?.();
  }, [initialWorkRunning]);

  return null;
}

export function WorkspaceProgress({
  jobs,
  type,
  stayAndWatch,
  profileHref,
  campaignId,
  hideFailure = false,
}: {
  jobs: WorkspaceJobStatusView[];
  type: WorkspaceJobStatusView["type"];
  stayAndWatch?: boolean;
  profileHref?: string | null;
  campaignId?: string;
  /** Spinner only. The page shows one plain failure message. */
  hideFailure?: boolean;
}) {
  const latest = jobs.find((job) => job.type === type);
  const live =
    latest && (latest.status === "PENDING" || latest.status === "IN_PROGRESS")
      ? latest
      : undefined;
  const failed = latest?.status === "FAILED" ? latest : undefined;
  if (live) {
    return (
      <div className="space-y-1" data-testid={`workspace-progress-${type}`}>
        <div className="text-sm text-ink" role="status">
          <AppPendingIndicator label={live.progressText} />
        </div>
        {live.waitKind === "longer" ? (
          <p className="text-sm text-muted">{workspaceJobCopy.keepWorking}</p>
        ) : null}
      </div>
    );
  }
  if (failed) {
    if (
      hideFailure ||
      type === "HIRING_TEAM_IDENTIFY" ||
      type === "HIRING_TEAM_BUILD"
    ) {
      return null;
    }
    return (
      <div
        className={`space-y-2 rounded-md border border-warning bg-warning-tint p-3 ${WORKSPACE_CARD_WRAP_CLASS}`}
        data-testid={`workspace-failed-${type}`}
      >
        <JobErrorDetail error={failed.error} profileHref={profileHref} />
        {campaignId && failed.canRetry ? (
          <ApplicationActionForm
            action={retryApplicationJobAction}
            submitLabel={workspaceJobCopy.retry}
            testId={`retry-job-${failed.id}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="jobId" value={failed.id} />
          </ApplicationActionForm>
        ) : null}
      </div>
    );
  }
  if (type === "RESUME" || type === "COVER_LETTER") {
    const ready = jobs.find(
      (job) =>
        job.type === type &&
        job.status === "COMPLETED" &&
        job.readyText !== applicationAssetConfig.labels.readyPlan,
    );
    if (ready) {
      const documentId =
        type === "RESUME" ? "resume-document" : "cover-letter-document";
      return (
        <p
          className={`text-sm text-success ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
          data-testid={`workspace-ready-notice-${type}`}
          role="status"
        >
          {ready.readyText}{" "}
          <AppActionLink href={`#${documentId}`} variant="chip">
            {workspaceJobCopy.readyLink}
          </AppActionLink>
        </p>
      );
    }
  }
  if (stayAndWatch) return null;
  return null;
}

export function ApplicationWorkspaceLive({
  campaignId,
  initialJobs,
  profileHref,
}: {
  campaignId: string;
  initialJobs: WorkspaceJobStatusView[];
  profileHref?: string | null;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const signature = useRef(
    initialJobs.map((job) => `${job.id}:${job.status}:${job.error ?? ""}`).join("|"),
  );

  useEffect(() => {
    const nextSignature = initialJobs
      .map((job) => `${job.id}:${job.status}:${job.error ?? ""}`)
      .join("|");
    if (nextSignature === signature.current) return;
    signature.current = nextSignature;
    setJobs(initialJobs);
  }, [initialJobs]);

  const latestByKey = new Map<string, WorkspaceJobStatusView>();
  for (const job of jobs) {
    const key = `${job.type}:${job.targetId ?? ""}`;
    if (!latestByKey.has(key)) latestByKey.set(key, job);
  }
  const failed = [...latestByKey.values()].filter((job) => job.status === "FAILED");

  return (
    <div
      className={`space-y-3 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="application-workspace-live"
    >
      {failed.map((job) => (
        <div
          key={job.id}
          className={`space-y-2 rounded-md border border-warning bg-warning-tint p-3 ${WORKSPACE_CARD_WRAP_CLASS}`}
        >
          <JobErrorDetail error={job.error} profileHref={profileHref} />
          <ApplicationActionForm
            action={retryApplicationJobAction}
            submitLabel={workspaceJobCopy.retry}
            testId={`retry-job-${job.id}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="jobId" value={job.id} />
          </ApplicationActionForm>
        </div>
      ))}
    </div>
  );
}
