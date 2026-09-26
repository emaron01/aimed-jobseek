"use client";

import { overrideApplicationFitAction } from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { formatFitBucketLabel } from "@/lib/application/fit";
import { applicationWorkspaceCopy } from "@/lib/product-config";

export function ApplicationFitOverride({
  campaignId,
  bucket,
}: {
  campaignId: string;
  bucket: "GOOD" | "NEEDS_REVIEW" | "POOR_FIT" | "EXCLUDED";
}) {
  return (
    <ApplicationActionForm
      action={overrideApplicationFitAction}
      submitLabel={applicationWorkspaceCopy.fitOverrideLabel}
      hideSubmit
      testId="employer-fit-override-form"
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="block text-sm">
        <span className="font-medium text-ink">
          {applicationWorkspaceCopy.fitOverrideLabel}
        </span>
        <select
          name="bucket"
          className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          defaultValue={bucket}
          onChange={(event) => {
            event.currentTarget.form?.requestSubmit();
          }}
        >
          <option value="GOOD">{formatFitBucketLabel("GOOD")}</option>
          <option value="NEEDS_REVIEW">{formatFitBucketLabel("NEEDS_REVIEW")}</option>
          <option value="POOR_FIT">{formatFitBucketLabel("POOR_FIT")}</option>
          <option value="EXCLUDED">{formatFitBucketLabel("EXCLUDED")}</option>
        </select>
      </label>
    </ApplicationActionForm>
  );
}
