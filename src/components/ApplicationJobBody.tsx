import "server-only";

import { nameApplicationEmployerAction, rescoreApplicationFitAction } from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { ApplicationFitOverride } from "@/components/ApplicationFitOverride";
import {
  ApplicationJobRequirementActions,
  ApplicationJobRequirementTopActions,
} from "@/components/ApplicationJobRequirementActions";
import { ApplicationWorkspaceEmpty } from "@/components/ApplicationWorkspaceEmpty";
import { OpenDetailsOnMount } from "@/components/OpenDetailsOnMount";
import {
  loadApplicationWorkspaceModel,
  type LoadedApplicationWorkspace,
} from "@/components/application-workspace-model";
import {
  fitCriterionReason,
  fitSignalLabels,
  formatFitBucketLabel,
} from "@/lib/application/fit";
import { parseIdentityVerification } from "@/lib/job-requirement/identity-verification";
import {
  applicationResearchCopy,
  applicationWorkspaceCopy,
  employerIdentityCopy,
} from "@/lib/product-config";
import { features } from "@/lib/product-config/features";
import { parseStringArray } from "@/lib/research";
import { WORKSPACE_CARD_WRAP_CLASS } from "@/lib/application/workspace-links";

function textList(value: unknown): string[] {
  return parseStringArray(value);
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  const visible = items.filter((item) => item.replace(/\s+/g, " ").trim());
  if (visible.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
        {visible.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ApplicationJobDetails({
  model,
  canEdit,
  asPage,
}: {
  model: LoadedApplicationWorkspace;
  canEdit: boolean;
  asPage: boolean;
}) {
  const { requirement, shownBucket, icp, stale, outcomes, fit } = model;
  return (
    <>
    <details className="space-y-4 rounded-lg border border-edge bg-surface p-5" data-testid="application-workspace">
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationWorkspaceCopy.jobRequirementTitle}
      </summary>
      <div className="mt-4 space-y-4">
    <section className="space-y-4">
      {canEdit ? <ApplicationJobRequirementTopActions /> : null}
      <p className="text-sm text-muted">
        {applicationWorkspaceCopy.jobPostingHelp}
      </p>
      <dl className="grid gap-3 md:grid-cols-2" data-testid="job-requirement-view">
        <Field label={applicationWorkspaceCopy.fieldTitle} value={requirement.title} />
        <Field label={applicationWorkspaceCopy.fieldEmployer} value={requirement.companyName} />
        <Field label={applicationWorkspaceCopy.fieldLocation} value={requirement.location} />
        <Field label={applicationWorkspaceCopy.fieldWorkArrangement} value={requirement.workArrangement} />
        <Field label={applicationWorkspaceCopy.fieldEmploymentType} value={requirement.employmentType} />
        <Field label={applicationWorkspaceCopy.fieldSeniority} value={requirement.seniority} />
        <Field label={applicationWorkspaceCopy.fieldCompensation} value={requirement.compensationRange} />
        <Field label={applicationWorkspaceCopy.fieldReportsTo} value={requirement.reportingLine} />
      </dl>
      <BulletList title={applicationWorkspaceCopy.responsibilitiesTitle} items={textList(requirement.responsibilities)} />
      <BulletList title={applicationWorkspaceCopy.requiredTitle} items={textList(requirement.requiredItems)} />
      <BulletList title={applicationWorkspaceCopy.preferredTitle} items={textList(requirement.preferredItems)} />
      {canEdit ? (
        <ApplicationJobRequirementActions
          campaignId={requirement.campaignId}
          rawText={requirement.rawText}
          learnedNotes={requirement.seekerLearnedNotes ?? ""}
        />
      ) : null}

      {requirement.employerSkipReason ? (
        <p className="rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning" data-testid="employer-skip-reason">
          {requirement.employerSkipReason}
        </p>
      ) : null}

      {canEdit && requirement.employerDisposition !== "IDENTIFIED" && !parseIdentityVerification(requirement.identityVerificationJson) ? (
        <ApplicationActionForm
          action={nameApplicationEmployerAction}
          submitLabel={applicationResearchCopy.saveEmployer}
          testId="confirm-employer-form"
        >
          <input type="hidden" name="campaignId" value={requirement.campaignId} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Employer name</span>
            <input
              name="employerName"
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">{employerIdentityCopy.supplyWebsite}</span>
            <input
              name="website"
              required
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </label>
        </ApplicationActionForm>
      ) : null}

    </section>
      </div>
    </details>
    {features.employerIcpFit && icp ? (
    <details
      className="space-y-4 rounded-lg border border-edge bg-surface p-5"
      data-testid="employer-fit"
      id="employer-fit"
    >
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationWorkspaceCopy.employerFitTitle}
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted">
          {applicationWorkspaceCopy.fitHelp.replace("{name}", icp.name)}
        </p>
        {shownBucket ? (
          <p className="text-sm font-medium text-ink" data-testid="employer-fit-bucket">
            {applicationWorkspaceCopy.fitScoredLabel}: {formatFitBucketLabel(shownBucket)}
          </p>
        ) : (
          <p className="text-sm text-muted">{applicationWorkspaceCopy.fitMissing}</p>
        )}
        {stale?.stale ? (
          <p className="text-sm text-warning" data-testid="employer-fit-stale">
            {stale.reason}
          </p>
        ) : null}
        <ul className="space-y-2" data-testid="employer-fit-criteria">
          {outcomes.map((outcome) => {
            const labels = fitSignalLabels(outcome);
            const result = fitCriterionReason(outcome);
            return (
              <li
                key={outcome.criterionId ?? outcome.name}
                className="text-sm text-ink"
                data-testid="employer-fit-criterion"
                data-fit-status={result.status}
              >
                <span className="font-medium">{outcome.name}</span>
                <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                  {result.label}
                </span>
                {labels.map((label) => (
                  <span
                    key={label}
                    className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink"
                    data-testid={
                      outcome.dealBreakerHit
                        ? "deal-breaker-signal"
                        : outcome.mustHaveMiss
                          ? "must-have-signal"
                          : undefined
                    }
                  >
                    {label}
                  </span>
                ))}
                <span className="mt-1 block text-muted">{result.reason}</span>
                {outcome.evidence ? (
                  <span className="mt-1 block text-muted">{outcome.evidence}</span>
                ) : null}
                {outcome.source ? (
                  <span className="block text-xs text-subtle">{outcome.source}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canEdit && fit && shownBucket ? (
          <ApplicationFitOverride
            campaignId={requirement.campaignId}
            bucket={shownBucket}
          />
        ) : null}
        {canEdit && stale?.stale && requirement.employerDisposition === "IDENTIFIED" ? (
          <ApplicationActionForm
            action={rescoreApplicationFitAction}
            submitLabel="Rescore employer fit"
            testId="rescore-employer-fit"
          >
            <input type="hidden" name="campaignId" value={requirement.campaignId} />
          </ApplicationActionForm>
        ) : null}
      </div>
    </details>
    ) : null}
    </>
  );
}

export async function ApplicationJobBody({
  campaignId,
  organizationId,
  canEdit,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const model = await loadApplicationWorkspaceModel(
    organizationId,
    campaignId,
    canEdit,
    false,
    false,
  );
  if (!model.requirement) {
    return <ApplicationWorkspaceEmpty focus="job" />;
  }
  return (
    <div className={`space-y-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
      <ApplicationJobDetails model={model} canEdit={canEdit} asPage />
    </div>
  );
}
