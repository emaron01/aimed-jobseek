"use client";

import { useActionState } from "react";
import { resolveApplicationAssetFlagAction } from "@/app/actions/application-assets";
import { resolveConsultationStatementFlagAction } from "@/app/actions/consultation";
import { resolveApplicationSummaryFlagAction } from "@/app/actions/application-summary";
import { SubmitButton } from "@/components/ui";
import type { ClaimFlag } from "@/lib/grounding/claim-flags";
import { applicationAssetConfig } from "@/lib/product-config";

export function ClaimFlagBanner({
  campaignId,
  flag,
  assetId,
  statementId,
  summary = false,
  editHref,
}: {
  campaignId: string;
  flag: ClaimFlag;
  assetId?: string;
  statementId?: string;
  summary?: boolean;
  editHref?: string;
}) {
  const labels = applicationAssetConfig.labels.claimFlag;
  const [, assetAction] = useActionState(resolveApplicationAssetFlagAction, null);
  const [, statementAction] = useActionState(
    resolveConsultationStatementFlagAction,
    null,
  );
  const [, summaryAction] = useActionState(
    resolveApplicationSummaryFlagAction,
    null,
  );
  const action = statementId
    ? statementAction
    : summary
      ? summaryAction
      : assetAction;
  return (
    <div
      className="mt-1 space-y-2 rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning"
      data-testid={`claim-flag-${flag.claimId}`}
    >
      <p>{flag.message}</p>
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="campaignId" value={campaignId} />
          {assetId ? <input type="hidden" name="assetId" value={assetId} /> : null}
          {statementId ? (
            <input type="hidden" name="statementId" value={statementId} />
          ) : null}
          <input type="hidden" name="claimId" value={flag.claimId} />
          <input type="hidden" name="flagAction" value="KEPT" />
          <SubmitButton>{labels.keep}</SubmitButton>
        </form>
        {editHref ? (
          <a
            href={editHref}
            className="inline-flex items-center rounded-md border border-warning bg-surface px-2.5 py-1 text-xs font-medium text-warning"
          >
            {labels.edit}
          </a>
        ) : (
          <span className="self-center text-xs text-warning">{labels.edit}</span>
        )}
        <form action={action}>
          <input type="hidden" name="campaignId" value={campaignId} />
          {assetId ? <input type="hidden" name="assetId" value={assetId} /> : null}
          {statementId ? (
            <input type="hidden" name="statementId" value={statementId} />
          ) : null}
          <input type="hidden" name="claimId" value={flag.claimId} />
          <input type="hidden" name="flagAction" value="REMOVED" />
          <SubmitButton>{labels.remove}</SubmitButton>
        </form>
      </div>
    </div>
  );
}
