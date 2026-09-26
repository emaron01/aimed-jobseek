import Link from "next/link";
import { AppCard, SectionHeader, StatusPill } from "@/components/design";
import { applicationStepCopy, consultationConversationCopy } from "@/lib/product-config";
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
      <AppCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{view.companyName || view.campaignName}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {view.jobTitle || view.campaignName}
            </h1>
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
          <OverviewFact label={applicationStepCopy.factFit} value={view.fitLabel} />
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
                className="flex items-center justify-between gap-2 rounded-md border border-edge px-3 py-2 text-sm text-ink hover:bg-canvas"
                data-testid={`overview-step-${step.key}`}
              >
                <span>
                  {step.number}. {step.title}
                </span>
                <StatusPill
                  tone={
                    step.state === "done"
                      ? "done"
                      : step.state === "in_progress"
                        ? "progress"
                        : "attention"
                  }
                >
                  {step.hasNew
                    ? applicationStepCopy.newMarker
                    : step.state === "done"
                      ? applicationStepCopy.done
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
