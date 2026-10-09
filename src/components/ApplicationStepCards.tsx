"use client";

import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { markApplicationStepViewedAction } from "@/app/actions/application-jobs";
import { AppActionLink, AppButton, AppPendingIndicator } from "@/components/AppButton";
import { StatusPill } from "@/components/design";
import { useWorkspaceJobs } from "@/components/workspace-jobs-context";
import {
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

export function DashboardStepAction({
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
  const router = useRouter();
  const pathname = usePathname() || "";
  const kind = turnKind(step, dashboardStepShowsSpinner(step, jobs));

  async function toggle() {
    const current = parseDashboardOpenSteps(
      new URLSearchParams(window.location.search).get("open"),
    );
    const next = toggleDashboardOpenStep(current, stepKey);
    const opening = next.includes(stepKey);
    if (opening) {
      await markApplicationStepViewedAction(campaignId, stepKey);
    }
    const hash =
      !opening && stepKey === "applied" && window.location.hash === "#applied"
        ? ""
        : window.location.hash;
    router.replace(
      `${pathname}${dashboardOpenSearch(window.location.search, next)}${hash}`,
      { scroll: false },
    );
  }

  return (
    <StepCardFace
      step={step}
      kind={kind}
      onActivate={() => void toggle()}
      action={
        <AppButton
          type="button"
          variant={stepActionVariant(kind)}
          size="sm"
          className="shrink-0"
          aria-expanded={open}
          data-testid={`overview-step-action-${step.key}`}
          onClick={(event) => {
            event.stopPropagation();
            void toggle();
          }}
        >
          {step.actionLabel}
        </AppButton>
      }
    />
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
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    if (window.location.hash !== "#applied") return;
    if (openSteps.includes("applied")) return;
    ran.current = true;
    void (async () => {
      await markApplicationStepViewedAction(campaignId, "applied");
      const current = parseDashboardOpenSteps(
        new URLSearchParams(window.location.search).get("open"),
      );
      const next = current.includes("applied")
        ? current
        : toggleDashboardOpenStep(current, "applied");
      router.replace(
        `${pathname}${dashboardOpenSearch(window.location.search, next)}#applied`,
        { scroll: false },
      );
    })();
  }, [campaignId, openSteps, pathname, router]);
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
                    <AppActionLink
                      href={applicationStepHref(campaignId, step.key)}
                      variant="secondary"
                      size="sm"
                      data-testid={`overview-step-full-page-${step.key}`}
                    >
                      {applicationStepCopy.openFullPage}
                    </AppActionLink>
                    {panels?.[step.key] ?? null}
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
