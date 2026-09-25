"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getApplicationWorkspaceLiveAction } from "@/app/actions/application-jobs";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { retryApplicationJobAction } from "@/app/actions/application-jobs";
import {
  workspaceJobCopy,
  workspaceSectionId,
  workspaceWaitKind,
} from "@/lib/product-config";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { AppPendingIndicator } from "@/components/AppButton";
import { AppActionLink } from "@/components/ui";
import { hasVisibleText } from "@/lib/grounding/fact-tokens";
import { applicationAssetConfig, consultationConfig, vocab } from "@/lib/product-config";

const POLL_MS = 3_000;

function JobErrorDetail({
  error,
  campaignId,
  profileHref,
}: {
  error: string | null;
  campaignId: string;
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
  return (
    <div className="space-y-2">
      <p className="text-sm text-amber-950">{message}</p>
      {violations.length ? (
        <ul className="list-disc pl-5 text-sm text-amber-950">
          {violations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {showFix ? (
        <p className="text-sm text-slate-700">
          {applicationAssetConfig.labels.violationFix
            .replace("{consultant}", consultationConfig.displayName)
            .replace("{product}", vocab.product.singular)}{" "}
          <AppActionLink href={`/campaigns/${campaignId}#consultation`} variant="chip">
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

export function WorkspaceProgress({
  jobs,
  type,
  stayAndWatch,
  campaignId,
  profileHref,
}: {
  jobs: WorkspaceJobStatusView[];
  type: WorkspaceJobStatusView["type"];
  stayAndWatch?: boolean;
  campaignId?: string;
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
        <div className="text-sm text-slate-700" role="status">
          <AppPendingIndicator label={live.progressText} />
        </div>
        {live.waitKind === "longer" ? (
          <p className="text-sm text-slate-600">{workspaceJobCopy.keepWorking}</p>
        ) : null}
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3"
        data-testid={`workspace-failed-${type}`}
      >
        {campaignId ? (
          <JobErrorDetail
            error={failed.error}
            campaignId={campaignId}
            profileHref={profileHref}
          />
        ) : (
          <p className="text-sm text-amber-950">
            {failed.error?.trim() || workspaceJobCopy.failed}
          </p>
        )}
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
  const [notices, setNotices] = useState<WorkspaceJobStatusView[]>([]);
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
        const key = `${job.id}:${job.status}`;
        if (
          job.status === "COMPLETED" &&
          workspaceWaitKind(job.type) === "longer" &&
          !seen.current.has(key)
        ) {
          setNotices((current) => [job, ...current.filter((item) => item.id !== job.id)]);
        }
        seen.current.add(key);
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
    <div className="space-y-3" data-testid="application-workspace-live">
      {notices.map((job) => (
        <p
          key={job.id}
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          data-testid="workspace-ready-notice"
        >
          {job.readyText}{" "}
          <a className="underline" href={`#${workspaceSectionId(job.type)}`}>
            {workspaceJobCopy.readyLink}
          </a>
        </p>
      ))}
      {failed.map((job) => (
        <div
          key={job.id}
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3"
        >
          <JobErrorDetail
            error={job.error}
            campaignId={campaignId}
            profileHref={profileHref}
          />
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
