"use client";

import { Fragment, useEffect, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { markApplicationStepViewedAction } from "@/app/actions/application-jobs";
import { AppActionLink, AppButton, AppPendingIndicator } from "@/components/AppButton";
import { DashboardOpenSection } from "@/components/DashboardOpenSection";
import { StatusPill } from "@/components/design";
import { useWorkspaceJobs } from "@/components/workspace-jobs-context";
import {
  closeDashboardOpenStep,
  dashboardOpenSearch,
  dashboardStepCardOrder,
  dashboardStepPanelOrder,
  isDashboardInPlaceStep,
  parseDashboardOpenSteps,
  toggleDashboardOpenStep,
  type DashboardInPlaceStepKey,
} from "@/lib/application/dashboard-open-steps";
import {
  dashboardStepShowsSpinner,
  type ApplicationStepView,
} from "@/lib/application/step-progress";
import {
  applicationStepCopy,
  applicationStepHref,
  applicationStepStatusLabel,
  applicationStepStatusTone,
} from "@/lib/product-config";

type TurnKind = "working" | "your_turn" | "done" | "not_started";

const CARD_ORDER_CLASS =
  "order-[var(--step-order)] min-w-0 sm:order-[var(--step-order-sm)]";
const PANEL_ORDER_CLASS =
  "order-[var(--step-order)] min-w-0 sm:order-[var(--step-order-sm)] sm:col-span-2";

function turnKind(step: ApplicationStepView, spinning: boolean): TurnKind {
  if (spinning) return "working";
  if (step.workDone) return "done";
  if (step.state === "not_started") return "not_started";
  return "your_turn";
}

function stepActionVariant(kind: TurnKind): "success" | "secondary" {
  return kind === "your_turn" ? "success" : "secondary";
}

function cardOrderStyle(index: number): CSSProperties {
  const order = dashboardStepCardOrder(index);
  return { "--step-order": order, "--step-order-sm": order } as CSSProperties;
}

function panelOrderStyle(index: number): CSSProperties {
  return {
    "--step-order": dashboardStepPanelOrder(index, 1),
    "--step-order-sm": dashboardStepPanelOrder(index, 2),
  } as CSSProperties;
}

function useDashboardStepNavigation(campaignId: string) {
  const router = useRouter();
  const pathname = usePathname() || "";

  function replaceSteps(next: readonly DashboardInPlaceStepKey[], stepKey: DashboardInPlaceStepKey) {
    const hash =
      stepKey === "applied" && window.location.hash === "#applied" ? "" : window.location.hash;
    router.replace(
      `${pathname}${dashboardOpenSearch(window.location.search, next)}${hash}`,
      { scroll: false },
    );
  }

  async function toggle(stepKey: DashboardInPlaceStepKey) {
    const current = parseDashboardOpenSteps(
      new URLSearchParams(window.location.search).get("open"),
    );
    const next = toggleDashboardOpenStep(current, stepKey);
    if (next.includes(stepKey)) {
      await markApplicationStepViewedAction(campaignId, stepKey);
    }
    replaceSteps(next, stepKey);
  }

  function close(stepKey: DashboardInPlaceStepKey) {
    const current = parseDashboardOpenSteps(
      new URLSearchParams(window.location.search).get("open"),
    );
    replaceSteps(closeDashboardOpenStep(current, stepKey), stepKey);
  }

  return { toggle, close };
}

function DashboardStepLink({
  step,
  testId,
}: {
  step: ApplicationStepView;
  testId: string;
}) {
  const jobs = useWorkspaceJobs();
  const kind = turnKind(step, dashboardStepShowsSpinner(step, jobs));
  return (
    <AppActionLink
      href={step.actionHref}
      variant={stepActionVariant(kind)}
      size="sm"
      className="shrink-0"
      data-testid={testId}
    >
      {step.actionLabel}
    </AppActionLink>
  );
}

export function DashboardStepAction({
  step,
  testId,
  campaignId,
}: {
  step: ApplicationStepView;
  testId: string;
  campaignId?: string;
}) {
  if (campaignId && isDashboardInPlaceStep(step.key)) {
    return (
      <DashboardInPlaceAction
        step={step}
        stepKey={step.key}
        campaignId={campaignId}
        testId={testId}
      />
    );
  }
  return <DashboardStepLink step={step} testId={testId} />;
}

function DashboardInPlaceAction({
  step,
  stepKey,
  campaignId,
  testId,
  open,
}: {
  step: ApplicationStepView;
  stepKey: DashboardInPlaceStepKey;
  campaignId: string;
  testId: string;
  open?: boolean;
}) {
  const jobs = useWorkspaceJobs();
  const { toggle } = useDashboardStepNavigation(campaignId);
  const kind = turnKind(step, dashboardStepShowsSpinner(step, jobs));
  return (
    <AppButton
      type="button"
      variant={stepActionVariant(kind)}
      size="sm"
      className="shrink-0"
      aria-expanded={open === undefined ? undefined : open}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        void toggle(stepKey);
      }}
    >
      {step.actionLabel}
    </AppButton>
  );
}

function StepCardFace({
  step,
  kind,
  action,
  onActivate,
}: {
  step: ApplicationStepView;
  kind: TurnKind;
  action: ReactNode;
  onActivate?: () => void;
}) {
  const status = applicationStepStatusLabel(step);
  const showStatus =
    (kind === "your_turn" || kind === "done") &&
    status !== applicationStepCopy.yourTurn &&
    status !== applicationStepCopy.done &&
    !(
      step.key === "consultation" &&
      status === applicationStepCopy.consultationInProgress
    );
  return (
    <div
      className={`flex h-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-edge px-3 py-2 text-sm text-ink${onActivate ? " cursor-pointer" : ""}`}
      data-testid={`overview-step-${step.key}`}
      onClick={onActivate}
    >
      <div className="flex flex-1 flex-col gap-1">
        <span className="font-medium">
          {step.number}. {step.title}
        </span>
        {kind === "working" ? (
          <AppPendingIndicator label={applicationStepCopy.harperIsWorking} />
        ) : null}
        {kind === "your_turn" ? (
          <StatusPill tone="progress">{applicationStepCopy.yourTurn}</StatusPill>
        ) : null}
        {kind === "your_turn" && step.turnCountLabel ? (
          <p data-testid={`overview-step-count-${step.key}`}>{step.turnCountLabel}</p>
        ) : null}
        {kind === "done" ? (
          <StatusPill
            tone={applicationStepStatusTone({
              key: step.key,
              workDone: step.workDone,
              state: step.state,
            })}
          >
            {applicationStepCopy.done}
          </StatusPill>
        ) : null}
        {kind === "not_started" ? (
          <StatusPill tone="attention">{applicationStepCopy.notStarted}</StatusPill>
        ) : null}
        {showStatus ? <p>{status}</p> : null}
      </div>
      {action}
    </div>
  );
}

function DashboardInPlaceStep({
  step,
  stepKey,
  campaignId,
  open,
}: {
  step: ApplicationStepView;
  stepKey: DashboardInPlaceStepKey;
  campaignId: string;
  open: boolean;
}) {
  const jobs = useWorkspaceJobs();
  const { toggle } = useDashboardStepNavigation(campaignId);
  const kind = turnKind(step, dashboardStepShowsSpinner(step, jobs));
  return (
    <StepCardFace
      step={step}
      kind={kind}
      onActivate={() => void toggle(stepKey)}
      action={
        <DashboardInPlaceAction
          step={step}
          stepKey={stepKey}
          campaignId={campaignId}
          testId={`overview-step-action-${step.key}`}
          open={open}
        />
      }
    />
  );
}

function DashboardStepClose({
  stepKey,
  campaignId,
}: {
  stepKey: DashboardInPlaceStepKey;
  campaignId: string;
}) {
  const { close } = useDashboardStepNavigation(campaignId);
  return (
    <AppButton
      type="button"
      variant="secondary"
      size="sm"
      data-testid={`overview-step-close-${stepKey}`}
      onClick={() => close(stepKey)}
    >
      {applicationStepCopy.closeStep}
    </AppButton>
  );
}

function OpenAppliedFromHash({
  campaignId,
  openSteps,
}: {
  campaignId: string;
  openSteps: readonly DashboardInPlaceStepKey[];
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const openStepsKey = openSteps.join(",");
  useEffect(() => {
    function openFromHash() {
      if (window.location.hash !== "#applied") return;
      const current = parseDashboardOpenSteps(
        new URLSearchParams(window.location.search).get("open"),
      );
      if (current.includes("applied")) return;
      void (async () => {
        await markApplicationStepViewedAction(campaignId, "applied");
        const latest = parseDashboardOpenSteps(
          new URLSearchParams(window.location.search).get("open"),
        );
        const next = latest.includes("applied")
          ? latest
          : toggleDashboardOpenStep(latest, "applied");
        router.replace(
          `${pathname}${dashboardOpenSearch(window.location.search, next)}`,
          { scroll: false },
        );
      })();
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [campaignId, openStepsKey, pathname, router]);
  return null;
}

export function ApplicationStepCards({
  steps,
  campaignId,
  openSteps = [],
  panels,
}: {
  steps: readonly ApplicationStepView[];
  campaignId?: string;
  openSteps?: readonly DashboardInPlaceStepKey[];
  panels?: Partial<Record<DashboardInPlaceStepKey, ReactNode>>;
}) {
  const jobs = useWorkspaceJobs();
  return (
    <>
      {campaignId ? (
        <OpenAppliedFromHash campaignId={campaignId} openSteps={openSteps} />
      ) : null}
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => {
          const inPlace = Boolean(campaignId) && isDashboardInPlaceStep(step.key);
          const open =
            inPlace &&
            isDashboardInPlaceStep(step.key) &&
            openSteps.includes(step.key);
          return (
            <Fragment key={step.key}>
              <li className={CARD_ORDER_CLASS} style={cardOrderStyle(index)}>
                {campaignId && isDashboardInPlaceStep(step.key) ? (
                  <DashboardInPlaceStep
                    step={step}
                    stepKey={step.key}
                    campaignId={campaignId}
                    open={open}
                  />
                ) : (
                  <StepCardFace
                    step={step}
                    kind={turnKind(step, dashboardStepShowsSpinner(step, jobs))}
                    action={
                      <DashboardStepAction
                        step={step}
                        testId={`overview-step-action-${step.key}`}
                      />
                    }
                  />
                )}
              </li>
              {open && campaignId && isDashboardInPlaceStep(step.key) ? (
                <li
                  className={PANEL_ORDER_CLASS}
                  style={panelOrderStyle(index)}
                  data-testid={`overview-step-panel-${step.key}`}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {step.isPage ? (
                        <AppActionLink
                          href={applicationStepHref(campaignId, step.key)}
                          variant="secondary"
                          size="sm"
                          data-testid={`overview-step-full-page-${step.key}`}
                        >
                          {applicationStepCopy.openFullPage}
                        </AppActionLink>
                      ) : null}
                      <DashboardStepClose stepKey={step.key} campaignId={campaignId} />
                    </div>
                    <DashboardOpenSection>{panels?.[step.key] ?? null}</DashboardOpenSection>
                    <DashboardStepClose stepKey={step.key} campaignId={campaignId} />
                  </div>
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </>
  );
}
