"use client";

import { updateApplicationJobRequirementAction } from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { applicationWorkspaceCopy } from "@/lib/product-config";
import type { JobScorecard } from "@/lib/job-requirement/types";

function listToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map(String).filter(Boolean).join("\n");
}

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

function TextField({
  name,
  label,
  defaultValue,
  rows,
}: {
  name: string;
  label: string;
  defaultValue: string;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      {rows ? (
        <textarea name={name} rows={rows} defaultValue={defaultValue} className={fieldClass} />
      ) : (
        <input name={name} defaultValue={defaultValue} className={fieldClass} />
      )}
    </label>
  );
}

export function ApplicationJobRequirementForm({
  campaignId,
  title,
  companyName,
  location,
  workArrangement,
  employmentType,
  seniority,
  compensationRange,
  reportingLine,
  responsibilities,
  requiredItems,
  preferredItems,
  scorecard,
}: {
  campaignId: string;
  title: string | null;
  companyName: string | null;
  location: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  seniority: string | null;
  compensationRange: string | null;
  reportingLine: string | null;
  responsibilities: unknown;
  requiredItems: unknown;
  preferredItems: unknown;
  scorecard: JobScorecard;
}) {
  return (
    <section className="space-y-3" data-testid="job-requirement-edit">
      <div>
        <h3 className="text-sm font-semibold text-ink">
          {applicationWorkspaceCopy.jobEditTitle}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {applicationWorkspaceCopy.jobEditHelp}
        </p>
      </div>
      <ApplicationActionForm
        action={updateApplicationJobRequirementAction}
        submitLabel={applicationWorkspaceCopy.jobEditSave}
        testId="job-requirement-edit-form"
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <TextField
          name="title"
          label={applicationWorkspaceCopy.fieldTitle}
          defaultValue={title ?? ""}
        />
        <TextField
          name="companyName"
          label={applicationWorkspaceCopy.fieldEmployer}
          defaultValue={companyName ?? ""}
        />
        <TextField
          name="location"
          label={applicationWorkspaceCopy.fieldLocation}
          defaultValue={location ?? ""}
        />
        <TextField
          name="workArrangement"
          label={applicationWorkspaceCopy.fieldWorkArrangement}
          defaultValue={workArrangement ?? ""}
        />
        <TextField
          name="employmentType"
          label={applicationWorkspaceCopy.fieldEmploymentType}
          defaultValue={employmentType ?? ""}
        />
        <TextField
          name="seniority"
          label={applicationWorkspaceCopy.fieldSeniority}
          defaultValue={seniority ?? ""}
        />
        <TextField
          name="compensationRange"
          label={applicationWorkspaceCopy.fieldCompensation}
          defaultValue={compensationRange ?? ""}
        />
        <TextField
          name="reportingLine"
          label={applicationWorkspaceCopy.fieldReportsTo}
          defaultValue={reportingLine ?? ""}
        />
        <TextField
          name="responsibilities"
          label={applicationWorkspaceCopy.responsibilitiesTitle}
          defaultValue={listToText(responsibilities)}
          rows={4}
        />
        <TextField
          name="requiredItems"
          label={applicationWorkspaceCopy.requiredTitle}
          defaultValue={listToText(requiredItems)}
          rows={4}
        />
        <TextField
          name="preferredItems"
          label={applicationWorkspaceCopy.preferredTitle}
          defaultValue={listToText(preferredItems)}
          rows={3}
        />
        <TextField
          name="mission"
          label={applicationWorkspaceCopy.scorecardTitle}
          defaultValue={scorecard.mission?.text ?? ""}
          rows={2}
        />
        <TextField
          name="outcomes"
          label={applicationWorkspaceCopy.outcomesTitle}
          defaultValue={scorecard.outcomes.map((item) => item.text).join("\n")}
          rows={3}
        />
        <TextField
          name="competencies"
          label={applicationWorkspaceCopy.competenciesTitle}
          defaultValue={scorecard.competencies.map((item) => item.text).join("\n")}
          rows={3}
        />
      </ApplicationActionForm>
    </section>
  );
}
