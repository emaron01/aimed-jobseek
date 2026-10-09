import "server-only";

import type { ReactNode } from "react";
import { ApplicationAssetsBody } from "@/components/ApplicationAssetsBody";
import { ApplicationCompanyBody } from "@/components/ApplicationCompanyBody";
import { ApplicationHiringTeamBody } from "@/components/ApplicationWorkspace";
import { ApplicationInterviewsBody } from "@/components/ApplicationInterviewsBody";
import { InterviewPrepGuides } from "@/app/(app)/campaigns/[id]/summary/page";
import { ApplicationJobBody } from "@/components/ApplicationJobBody";
import { ApplicationOutreachBody } from "@/components/ApplicationOutreachBody";
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
  if (keys.includes("assets")) {
    panels.assets = (
      <ApplicationAssetsBody
        campaignId={input.campaignId}
        organizationId={input.organizationId}
        canEdit={input.canEdit}
      />
    );
  }
  if (keys.includes("hiring-team")) {
    panels["hiring-team"] = (
      <ApplicationHiringTeamBody
        campaignId={input.campaignId}
        organizationId={input.organizationId}
        canEdit={input.canEdit}
        asPage={false}
      />
    );
  }
  if (keys.includes("outreach")) {
    panels.outreach = (
      <ApplicationOutreachBody
        campaignId={input.campaignId}
        organizationId={input.organizationId}
        canEdit={input.canEdit}
      />
    );
  }
  if (keys.includes("interviews")) {
    panels.interviews = (
      <ApplicationInterviewsBody
        campaignId={input.campaignId}
        organizationId={input.organizationId}
        canEdit={input.canEdit}
      />
    );
  }
  if (keys.includes("summary")) {
    panels.summary = (
      <InterviewPrepGuides campaignId={input.campaignId} showPageHeader={false} />
    );
  }
  return panels;
}
