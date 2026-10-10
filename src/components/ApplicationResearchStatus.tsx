"use client";

import {
  retryApplicationResearchAction,
} from "@/app/actions/application";
import type { ApplicationResearchStatusView } from "@/lib/application/research-status";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  applicationResearchCopy,
  employerIdentityCopy,
} from "@/lib/product-config";

export function ApplicationResearchStatus({
  campaignId,
  canEdit,
  initialStatus,
  hideRetry = false,
}: {
  campaignId: string;
  canEdit: boolean;
  initialStatus: ApplicationResearchStatusView;
  hideRetry?: boolean;
}) {
  const status = initialStatus;

  return (
    <div className="space-y-2" data-testid="application-research-status">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">
          {applicationResearchCopy.title}
        </h3>
        <span
          className="rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink"
          data-testid="application-research-phase"
          data-phase={status.phase}
        >
          {status.label}
        </span>
      </div>
      <p className="text-sm text-muted" data-testid="application-research-detail">
        {status.detail}
      </p>
      {canEdit && status.canRetry && !hideRetry ? (
        <ApplicationActionForm
          action={retryApplicationResearchAction}
          submitLabel={employerIdentityCopy.retry}
          testId="retry-research"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
        </ApplicationActionForm>
      ) : null}
    </div>
  );
}
