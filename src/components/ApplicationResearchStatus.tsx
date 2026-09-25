"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getApplicationResearchStatusAction,
  retryApplicationResearchAction,
} from "@/app/actions/application";
import type { ApplicationResearchStatusView } from "@/lib/application/research-status";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  applicationResearchCopy,
  employerIdentityCopy,
} from "@/lib/product-config";

const POLL_MS = 4_000;

function isLivePhase(phase: ApplicationResearchStatusView["phase"]): boolean {
  return phase === "queued" || phase === "researching" || phase === "not_started";
}

export function ApplicationResearchStatus({
  campaignId,
  canEdit,
  initialStatus,
}: {
  campaignId: string;
  canEdit: boolean;
  initialStatus: ApplicationResearchStatusView;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [appliedStatus, setAppliedStatus] = useState(initialStatus);
  if (initialStatus !== appliedStatus) {
    setAppliedStatus(initialStatus);
    setStatus(initialStatus);
  }

  useEffect(() => {
    if (!isLivePhase(status.phase)) return;

    const interval = window.setInterval(async () => {
      const latest = await getApplicationResearchStatusAction(campaignId);
      if (!latest) return;
      if (latest.phase !== status.phase || latest.label !== status.label) {
        router.refresh();
      }
      setStatus(latest);
    }, POLL_MS);

    return () => window.clearInterval(interval);
  }, [campaignId, router, status.phase, status.label]);

  return (
    <div className="space-y-2" data-testid="application-research-status">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {applicationResearchCopy.title}
        </h3>
        <span
          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800"
          data-testid="application-research-phase"
          data-phase={status.phase}
        >
          {status.label}
        </span>
      </div>
      <p className="text-sm text-slate-600" data-testid="application-research-detail">
        {status.detail}
      </p>
      {canEdit && status.canRetry ? (
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
