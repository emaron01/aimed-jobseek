"use client";

import { AppActionLink, AppPendingIndicator } from "@/components/AppButton";
import { StatusPill } from "@/components/design";
import { useWorkspaceJobs } from "@/components/workspace-jobs-context";
import {
  dashboardStepShowsSpinner,
  type ApplicationStepView,
} from "@/lib/application/step-progress";
import {
  applicationStepCopy,
  applicationStepStatusLabel,
  applicationStepStatusTone,
} from "@/lib/product-config";

type TurnKind = "working" | "your_turn" | "done" | "not_started";

function turnKind(step: ApplicationStepView, spinning: boolean): TurnKind {
  if (spinning) return "working";
  if (step.workDone) return "done";
  if (step.state === "not_started") return "not_started";
  return "your_turn";
}

export function ApplicationStepCards({
  steps,
}: {
  steps: readonly ApplicationStepView[];
}) {
  const jobs = useWorkspaceJobs();
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {steps.map((step) => {
        const kind = turnKind(step, dashboardStepShowsSpinner(step, jobs));
        const status = applicationStepStatusLabel(step);
        const showStatus =
          (kind === "your_turn" || kind === "done") &&
          status !== applicationStepCopy.yourTurn &&
          status !== applicationStepCopy.done;
        return (
          <li key={step.key}>
            <div
              className="flex h-full flex-col gap-2 rounded-md border border-edge px-3 py-2 text-sm text-ink"
              data-testid={`overview-step-${step.key}`}
            >
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
              <AppActionLink
                href={step.actionHref}
                className="mt-auto self-start"
                data-testid={`overview-step-action-${step.key}`}
              >
                {step.actionLabel}
              </AppActionLink>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
