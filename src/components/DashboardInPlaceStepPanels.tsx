import "server-only";

import type { ReactNode } from "react";
import { ApplicationCompanyBody } from "@/components/ApplicationCompanyBody";
import { ApplicationJobBody } from "@/components/ApplicationJobBody";
import { ApplicationStatusBody } from "@/components/ApplicationStatusBody";
import {
  parseDashboardOpenSteps,
  type DashboardInPlaceStepKey,
} from "@/lib/application/dashboard-open-steps";

/**
 * Panels for steps that are open. Closed steps are not rendered.
 * Later batches add a key in dashboard-open-steps.ts and a branch here.
 */
export async function loadDashboardInPlacePanels(input: {
  open: string | undefined;
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}): Promise<Partial<Record<DashboardInPlaceStepKey, ReactNode>>> {
  const keys = parseDashboardOpenSteps(input.open);
  const panels: Partial<Record<DashboardInPlaceStepKey, ReactNode>> = {};
  if (keys.includes("applied")) {
    panels.applied = (
      <ApplicationStatusBody
        campaignId={input.campaignId}
        organizationId={input.organizationId}
        canEdit={input.canEdit}
      />
    );
  }
  if (keys.includes("job")) {
    panels.job = (
      <ApplicationJobBody
        campaignId={input.campaignId}
        organizationId={input.organizationId}
        canEdit={input.canEdit}
      />
    );
  }
  if (keys.includes("company")) {
    panels.company = (
      <ApplicationCompanyBody
        campaignId={input.campaignId}
        organizationId={input.organizationId}
        canEdit={input.canEdit}
      />
    );
  }
  return panels;
}
