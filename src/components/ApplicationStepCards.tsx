"use client";

import Link from "next/link";
import { AppPendingIndicator } from "@/components/AppButton";
import { StatusPill } from "@/components/design";
import { useWorkspaceJobs } from "@/components/workspace-jobs-context";
import {
  dashboardStepShowsSpinner,
  type ApplicationStepView,
} from "@/lib/application/step-progress";
import { applicationStepCopy } from "@/lib/product-config";

export function ApplicationStepCards({
  steps,
}: {
  steps: readonly ApplicationStepView[];
}) {
  const jobs = useWorkspaceJobs();
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {steps.map((step) => {
        const spinning = dashboardStepShowsSpinner(step, jobs);
        return (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex flex-col gap-1 rounded-md border border-edge px-3 py-2 text-sm text-ink hover:bg-canvas"
              data-testid={`overview-step-${step.key}`}
            >
              <span className="font-medium">
                {step.number}. {step.title}
              </span>
              {spinning ? (
                <AppPendingIndicator label={applicationStepCopy.inProgress} />
              ) : (
                <StatusPill
                  tone={
                    step.workDone
                      ? "done"
                      : step.state === "active"
                        ? "active"
                        : step.state === "in_progress"
                          ? "progress"
                          : "attention"
                  }
                >
                  {step.workDone
                    ? applicationStepCopy.done
                    : step.hasNew && step.newLabel
                      ? step.newLabel
                      : step.state === "active"
                        ? applicationStepCopy.active
                        : step.state === "in_progress"
                          ? applicationStepCopy.inProgress
                          : step.state === "needs_attention"
                            ? applicationStepCopy.needsAttention
                            : applicationStepCopy.notStarted}
                </StatusPill>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
