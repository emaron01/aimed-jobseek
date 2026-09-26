"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getResearchRunStatusAction,
  researchCompaniesForContactListAction,
  researchCompaniesForScoringRunAction,
  retryFailedResearchRunAction,
  type ResearchStartResult,
} from "@/app/actions/research";
import { CompanyResearchAllowanceBanner } from "@/components/CompanyResearchAllowanceBanner";
import { ConvertTrialNowButton } from "@/components/billing/ConvertTrialNowButton";
import { PrimaryButton, SECONDARY_BUTTON_CLASS, SecondaryButton } from "@/components/ui";
import { billingPlanLabel } from "@/lib/billing/billing-state";
import {
  isResearchRunPaused,
  isResearchRunStalled,
  isActiveResearchRunStatus,
  type ResearchRunView,
} from "@/lib/research/run-types";
import { formatResearchRunFailureSummary } from "@/lib/research/failure-classification";
import {
  formatResearchAllowanceWarning,
  formatResearchQuotaBlockedMessage,
  formatResearchQuotaHeldSummary,
  researchQuotaBlockedCta,
  type ActiveResearchedCompanyUsageView,
  type ResearchBillingContext,
} from "@/lib/usage/research-allowance";
import { vocab } from "@/lib/product-config";

export type ResearchPlanView = {
  totalContacts: number;
  uniqueCompanies: number;
  alreadyResearched: number;
  needingResearch: number;
  noUsableResearch: number;
  statusCounts: {
    completed: number;
    partial: number;
    failed: number;
    notStarted: number;
    inProgress: number;
  };
};

const POLL_MS = 4_000;

function isActiveRun(status: ResearchRunView["status"]): boolean {
  return isActiveResearchRunStatus(status);
}

function progressPercent(run: ResearchRunView): number {
  if (run.totalCompanies <= 0) return 0;
  const done =
    run.completedCount +
    run.failedCount +
    run.skippedFreshCount +
    run.quotaBlockedCount;
  return Math.min(100, Math.round((done / run.totalCompanies) * 100));
}

function formatRunSummary(run: ResearchRunView): string {
  const done =
    run.completedCount +
    run.failedCount +
    run.skippedFreshCount +
    run.quotaBlockedCount;

  if (isResearchRunPaused(run)) {
    return `Paused, resuming shortly. ${done} of ${run.totalCompanies} companies processed so far.`;
  }

  if (isResearchRunStalled(run)) {
    return (
      run.lastError ??
      `Research stopped — no worker progress. ${done} of ${run.totalCompanies} companies processed.`
    );
  }

  if (isActiveRun(run.status)) {
    const current = run.currentCompanyName
      ? ` Currently researching ${run.currentCompanyName}.`
      : "";
    return `Research in progress: ${done} of ${run.totalCompanies} companies processed.${current}`;
  }

  if (run.failedCount === 0 && run.quotaBlockedCount > 0) {
    return formatResearchQuotaHeldSummary({
      completedCount: run.completedCount,
      totalCompanies: run.totalCompanies,
      quotaBlockedCount: run.quotaBlockedCount,
    });
  }

  const failureSummary = formatResearchRunFailureSummary(run);
  if (failureSummary) {
    return failureSummary;
  }

  if (run.status === "COMPLETED") {
    return `Research complete: ${run.completedCount} completed, ${run.skippedFreshCount} skipped (fresh).`;
  }

  if (run.status === "FAILED") {
    return run.lastError ?? "Research run failed.";
  }

  return "Research run finished.";
}

function failedCompanyCount(run: ResearchRunView): number {
  const failedIds = run.failedCompanyIds.length;
  return failedIds > 0 ? failedIds : run.failedCount;
}

function runHeading(input: {
  run: ResearchRunView;
  runInProgress: boolean;
  stalled: boolean;
  hasRealFailures: boolean;
  hasQuotaHeld: boolean;
}): string {
  if (isResearchRunPaused(input.run)) return "Research paused";
  if (input.stalled) return "Research stopped";
  if (input.runInProgress) return "Research running";
  if (input.hasRealFailures) return "Research finished with failures";
  if (input.hasQuotaHeld) return "Research finished";
  return "Last research run";
}

export function ResearchRunPanel({
  runId,
  contactListId,
  plan,
  researchAiConfigured,
  allowance,
  billing,
  initialActiveRun,
  initialLastRun,
}: {
  runId?: string;
  contactListId?: string;
  plan: ResearchPlanView;
  researchAiConfigured: boolean;
  allowance: ActiveResearchedCompanyUsageView;
  billing?: ResearchBillingContext | null;
  initialActiveRun?: ResearchRunView | null;
  initialLastRun?: ResearchRunView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<null | "research" | "refresh">(
    null,
  );
  const [activeRun, setActiveRun] = useState<ResearchRunView | null>(
    initialActiveRun ?? null,
  );
  const [lastRun, setLastRun] = useState<ResearchRunView | null>(
    initialLastRun ?? null,
  );
  const [appliedActiveRun, setAppliedActiveRun] = useState(initialActiveRun);
  if (initialActiveRun !== appliedActiveRun) {
    setAppliedActiveRun(initialActiveRun);
    setActiveRun(initialActiveRun ?? null);
  }
  const [appliedLastRun, setAppliedLastRun] = useState(initialLastRun);
  if (initialLastRun && initialLastRun !== appliedLastRun) {
    setAppliedLastRun(initialLastRun);
    setLastRun(initialLastRun);
  }

  useEffect(() => {
    const run = activeRun;
    if (!run || !isActiveRun(run.status)) return;

    const interval = window.setInterval(async () => {
      const latest = await getResearchRunStatusAction(run.id);
      if (!latest) return;
      setActiveRun(latest);
      if (!isActiveRun(latest.status)) {
        setLastRun(latest);
        setMessage(formatRunSummary(latest));
        router.refresh();
      }
    }, POLL_MS);

    return () => window.clearInterval(interval);
  }, [activeRun, router]);

  function handleStartResult(result: ResearchStartResult) {
    setMessage(result.message);
    setConfirmWarning(null);
    if (result.run) {
      setActiveRun(result.run);
    } else if (result.activeRunId) {
      void getResearchRunStatusAction(result.activeRunId).then((run) => {
        if (run) setActiveRun(run);
      });
    }
    router.refresh();
  }

  function executeResearch(forceRefresh: boolean) {
    const formData = new FormData();
    if (contactListId) {
      formData.set("contactListId", contactListId);
    } else if (runId) {
      formData.set("scoringRunId", runId);
    }
    if (forceRefresh) formData.set("forceRefresh", "1");

    const action = contactListId
      ? researchCompaniesForContactListAction
      : researchCompaniesForScoringRunAction;

    startTransition(async () => {
      const result = await action(formData);
      handleStartResult(result);
    });
  }

  function requestResearch(forceRefresh: boolean) {
    const mode = forceRefresh ? "refresh" : "research";
    const wouldUseNewSlots =
      !forceRefresh || plan.needingResearch > 0 || plan.alreadyResearched > 0;
    if (
      allowance.warning &&
      !allowance.exhausted &&
      wouldUseNewSlots &&
      confirmWarning !== mode
    ) {
      setConfirmWarning(mode);
      return;
    }
    executeResearch(forceRefresh);
  }

  function retryFailed() {
    const targetRunId = lastRun?.id;
    if (!targetRunId) return;
    startTransition(async () => {
      const result = await retryFailedResearchRunAction(targetRunId);
      handleStartResult(result);
    });
  }

  const runInProgress =
    activeRun != null &&
    isActiveRun(activeRun.status) &&
    !isResearchRunStalled(activeRun);
  const failedCount = lastRun ? failedCompanyCount(lastRun) : 0;
  const lastRunStalled = lastRun != null && isResearchRunStalled(lastRun);
  const canRetryFailed =
    lastRun != null &&
    !runInProgress &&
    failedCount > 0 &&
    (lastRun.status === "PARTIAL" ||
      lastRun.status === "FAILED" ||
      lastRunStalled);
  /** Stalled with no recorded failures — restart remaining companies. */
  const canRetryStalled =
    lastRunStalled && !runInProgress && !canRetryFailed;

  const researchDisabled =
    pending ||
    runInProgress ||
    !researchAiConfigured ||
    plan.needingResearch === 0 ||
    (allowance.exhausted && plan.needingResearch > 0);

  const displayRun = runInProgress ? activeRun : lastRun;
  const displayHasFailures =
    displayRun != null && !runInProgress && displayRun.failedCount > 0;
  const displayHasQuotaHeld =
    displayRun != null && !runInProgress && displayRun.quotaBlockedCount > 0;
  const displayStalled =
    displayRun != null && isResearchRunStalled(displayRun);

  const quotaCta = researchQuotaBlockedCta({
    billingStatus: billing?.billingStatus,
    planCode: billing?.planCode,
  });
  const isTrialing = billing?.billingStatus === "TRIALING";
  const exhaustedMessage = formatResearchQuotaBlockedMessage({
    used: allowance.used,
    limit: allowance.limit,
    billingStatus: billing?.billingStatus,
    trialEndsAt: billing?.trialEndsAt,
    planCode: billing?.planCode,
  });

  return (
    <div className="space-y-4">
      <CompanyResearchAllowanceBanner usage={allowance} billing={billing} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Total ${vocab.contact.Plural}`} value={plan.totalContacts} />
        <Stat label="Unique Companies" value={plan.uniqueCompanies} />
        <Stat label="Research Available" value={plan.alreadyResearched} />
        <Stat label="Need Research" value={plan.needingResearch} />
        <Stat label="No Usable Details" value={plan.noUsableResearch} />
        <Stat label="Failed" value={plan.statusCounts.failed} />
        <Stat label="Not Started" value={plan.statusCounts.notStarted} />
      </div>

      {plan.noUsableResearch > 0 ? (
        <p className="rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink">
          Research ran but found no usable details for{" "}
          {plan.noUsableResearch === 1
            ? "1 company"
            : `${plan.noUsableResearch} companies`}
          . Add context manually from the company briefing, retry that company,
          or continue without it.
        </p>
      ) : null}

      {displayRun ? (
        <div
          className="space-y-2 rounded-md border border-edge bg-surface px-3 py-3"
          data-testid="research-run-progress"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-medium text-ink">
              {runHeading({
                run: displayRun,
                runInProgress,
                stalled: displayStalled,
                hasRealFailures: displayHasFailures,
                hasQuotaHeld: displayHasQuotaHeld,
              })}
            </p>
            <p
              className={
                displayHasFailures || displayStalled
                  ? "font-medium text-danger"
                  : displayHasQuotaHeld
                    ? "font-medium text-ink"
                    : "text-muted"
              }
            >
              {displayStalled ? "STALLED" : displayRun.status.replace("_", " ")}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas">
            <div
              className={
                displayStalled
                  ? "h-full rounded-full bg-warning transition-all"
                  : "h-full rounded-full bg-ink transition-all"
              }
              style={{ width: `${progressPercent(displayRun)}%` }}
            />
          </div>
          <p
            className={
              displayHasFailures || displayStalled
                ? "text-sm font-medium text-danger"
                : "text-sm text-muted"
            }
          >
            {formatRunSummary(displayRun)}
          </p>
          {displayStalled ? (
            <p className="text-sm text-warning">
              No worker progress for 15+ minutes. Retry the remaining companies,
              or start research again.
            </p>
          ) : null}
          {displayHasFailures ? (
            <p className="text-sm text-muted">
              Retry will re-run only the companies that failed.
            </p>
          ) : null}
          {displayHasQuotaHeld ? (
            <div className="space-y-2 text-sm text-ink">
              <p className="font-medium">
                {formatResearchQuotaBlockedMessage({
                  used: allowance.used,
                  limit: allowance.limit,
                  billingStatus: billing?.billingStatus,
                  trialEndsAt: billing?.trialEndsAt,
                  planCode: billing?.planCode,
                })}
              </p>
              {billing?.canConvertTrialEarly ? (
                <ConvertTrialNowButton />
              ) : null}
              <p>
                <Link
                  href={quotaCta.href}
                  className="font-semibold underline underline-offset-2"
                >
                  {quotaCta.label}
                </Link>
                {isTrialing && !billing?.canConvertTrialEarly
                  ? ` — capacity unlocks when your plan converts to ${billing?.planCode ? billingPlanLabel(billing.planCode) : "the paid plan"}.`
                  : isTrialing
                    ? " — or wait until the scheduled conversion date."
                    : "."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-muted">
        Research runs once per unique company in the background. Results appear
        below as each company finishes. Uses Research AI only (independent from
        Scoring AI).
      </p>

      {!researchAiConfigured ? (
        <p className="rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning">
          Automated company research is not configured. Set RESEARCH_AI_PROVIDER
          (openai-responses or openai-compatible), RESEARCH_AI_MODEL,
          RESEARCH_AI_MODEL_URL, and RESEARCH_AI_API_KEY. Manual research on
          company pages remains available. Scoring is unaffected.
        </p>
      ) : null}

      {allowance.exhausted && plan.needingResearch > 0 ? (
        <div
          className="space-y-2 rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger"
          data-testid="research-hard-stop"
        >
          <p>{exhaustedMessage}</p>
          {billing?.canConvertTrialEarly ? <ConvertTrialNowButton /> : null}
          <p>
            <Link
              href={quotaCta.href}
              className="font-medium underline underline-offset-2"
            >
              {quotaCta.label}
            </Link>
            .
          </p>
        </div>
      ) : null}

      {confirmWarning ? (
        <div
          className="space-y-3 rounded-md border border-warning bg-warning-tint px-3 py-3 text-sm text-warning"
          data-testid="research-warning-confirm"
        >
          <p className="font-medium">
            {formatResearchAllowanceWarning(allowance.remaining)}
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              disabled={pending}
              onClick={() => executeResearch(confirmWarning === "refresh")}
            >
              Continue anyway
            </PrimaryButton>
            <Link
              href={quotaCta.href}
              className={SECONDARY_BUTTON_CLASS}
            >
              {isTrialing ? "View Billing" : "Buy more"}
            </Link>
            <SecondaryButton
              type="button"
              disabled={pending}
              onClick={() => setConfirmWarning(null)}
            >
              Cancel
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            id={contactListId ? "research-companies-start" : undefined}
            disabled={researchDisabled}
            onClick={() => requestResearch(false)}
          >
            {pending
              ? "Starting…"
              : runInProgress
                ? "Research running…"
                : "Research Companies"}
          </PrimaryButton>
          <SecondaryButton
            disabled={
              pending ||
              runInProgress ||
              !researchAiConfigured ||
              plan.uniqueCompanies === 0
            }
            onClick={() => requestResearch(true)}
          >
            Refresh Research
          </SecondaryButton>
          {canRetryFailed ? (
            <SecondaryButton disabled={pending} onClick={retryFailed}>
              Retry {failedCount} failed
            </SecondaryButton>
          ) : null}
          {canRetryStalled ? (
            <SecondaryButton
              disabled={pending || !researchAiConfigured}
              onClick={() => requestResearch(false)}
            >
              Retry research
            </SecondaryButton>
          ) : null}
        </div>
      )}

      {message ? (
        <p className="rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-edge bg-canvas px-3 py-2">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}
