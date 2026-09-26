"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getApplicationWorkspaceLiveAction } from "@/app/actions/application-jobs";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { retryApplicationJobAction } from "@/app/actions/application-jobs";
import { workspaceJobCopy } from "@/lib/product-config";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { AppPendingIndicator } from "@/components/AppButton";
import { AppActionLink } from "@/components/ui";
import { hasVisibleText } from "@/lib/grounding/fact-tokens";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceConsultationHrefFromPathname,
} from "@/lib/application/workspace-links";
import { applicationAssetConfig, consultationConfig, vocab } from "@/lib/product-config";

const POLL_MS = 3_000;

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
  const message = lines[0] || workspaceJobCopy.failed;
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
}: {
  campaignId: string;
}) {
  const router = useRouter();
  const signature = useRef<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const latest = await getApplicationWorkspaceLiveAction(campaignId);
      if (!latest) return;
      if (signature.current == null) {
        signature.current = latest.signature;
        return;
      }
      if (latest.signature !== signature.current) {
        signature.current = latest.signature;
        router.refresh();
      }
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [campaignId, router]);

  return null;
}

export function WorkspaceProgress({
  jobs,
  type,
  stayAndWatch,
  profileHref,
}: {
  jobs: WorkspaceJobStatusView[];
  type: WorkspaceJobStatusView["type"];
  stayAndWatch?: boolean;
  profileHref?: string | null;
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
    return (
      <div
        className={`space-y-2 rounded-md border border-warning bg-warning-tint p-3 ${WORKSPACE_CARD_WRAP_CLASS}`}
        data-testid={`workspace-failed-${type}`}
      >
        <JobErrorDetail error={failed.error} profileHref={profileHref} />
      </div>
    );
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
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const seen = useRef(new Set(initialJobs.map((job) => `${job.id}:${job.status}`)));
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

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const latest = await getApplicationWorkspaceLiveAction(campaignId);
      if (!latest) return;
      for (const job of latest.jobs) {
        seen.current.add(`${job.id}:${job.status}`);
      }
      if (latest.signature !== signature.current) {
        signature.current = latest.signature;
        setJobs(latest.jobs);
        router.refresh();
      }
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [campaignId, router]);

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
