import Link from "next/link";
import { AppCard, SectionHeader, StatusPill } from "@/components/design";
import { applicationStepCopy, consultationConversationCopy } from "@/lib/product-config";
import { features } from "@/lib/product-config/features";
import type { ApplicationOverviewView } from "@/lib/application/overview";
function appliedDateLabel(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function ApplicationOverview({
  view,
}: {
  view: ApplicationOverviewView;
}) {
  return (
    <div className="space-y-4" data-testid="application-overview">
      <h1
        className="text-2xl font-semibold tracking-tight text-ink"
        data-testid="application-dashboard-title"
      >
        {applicationStepCopy.dashboardTitle}
      </h1>
      <AppCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{view.companyName || view.campaignName}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {view.jobTitle || view.campaignName}
            </h2>
          </div>
          <StatusPill tone={view.statusTone}>{view.statusLabel}</StatusPill>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OverviewFact
            label={consultationConversationCopy.nextStepTitle}
            value={view.nextStepFailed ? consultationConversationCopy.nextStepFailed : view.nextStepText}
          />
          <OverviewFact
            label={applicationStepCopy.appliedAction}
            value={view.appliedAt ? appliedDateLabel(view.appliedAt) : null}
          />
          {features.employerIcpFit ? (
            <OverviewFact label={applicationStepCopy.factFit} value={view.fitLabel} />
          ) : null}
          <OverviewFact label={applicationStepCopy.factLocation} value={view.location} />
          <OverviewFact
            label={applicationStepCopy.factWorkArrangement}
            value={view.workArrangement}
          />
          <OverviewFact
            label={applicationStepCopy.factCompensation}
            value={view.compensation}
          />
        </dl>
      </AppCard>
      <AppCard data-testid="application-overview-steps">
        <SectionHeader title={applicationStepCopy.trackerLabel} />
        <ol className="grid gap-2 sm:grid-cols-2">
          {view.steps.map((step) => (
            <li key={step.key}>
              <Link
                href={step.href}
                className="flex flex-col gap-1 rounded-md border border-edge px-3 py-2 text-sm text-ink hover:bg-canvas"
                data-testid={`overview-step-${step.key}`}
              >
                <span className="font-medium">
                  {step.number}. {step.title}
                </span>
                <StatusPill
                  tone={
                    step.state === "done"
                      ? "done"
                      : step.state === "active"
                        ? "active"
                        : step.state === "in_progress"
                          ? "progress"
                          : "attention"
                  }
                >
                  {step.hasNew && step.newLabel
                    ? step.newLabel
                    : step.state === "done"
                      ? applicationStepCopy.done
                      : step.state === "active"
                        ? applicationStepCopy.active
                      : step.state === "in_progress"
                        ? applicationStepCopy.inProgress
                        : step.state === "needs_attention"
                          ? applicationStepCopy.needsAttention
                          : applicationStepCopy.notStarted}
                </StatusPill>
              </Link>
            </li>
          ))}
        </ol>
      </AppCard>
    </div>
  );
}

function OverviewFact({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) {
    return (
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</dt>
        <dd className="mt-1 text-sm text-muted">{applicationStepCopy.factMissing}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}
