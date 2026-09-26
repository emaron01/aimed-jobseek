import {
  applicationStepHref,
  applicationStepList,
  WORKSPACE_JOB_TYPES,
  workspaceSectionId,
} from "@/lib/product-config";

export const WORKSPACE_CARD_WRAP_CLASS =
  "min-w-0 max-w-full overflow-x-hidden";
export const WORKSPACE_MESSAGE_WRAP_CLASS =
  "min-w-0 max-w-full break-words [overflow-wrap:anywhere]";

export function workspaceProfileHref(productId: string): string {
  const id = productId.trim();
  if (!id) {
    throw new Error("Personal Profile link is missing a product.");
  }
  return `/setup/${id}`;
}

export function workspaceProfileEditHref(productId: string): string {
  return `${workspaceProfileHref(productId)}/edit`;
}

export function workspaceConsultationHref(campaignId?: string): string {
  const id = campaignId?.trim();
  if (id) return applicationStepHref(id, "consultation");
  return applicationStepHref("campaign", "consultation").replace(
    "/campaigns/campaign/consultation",
    `#${workspaceSectionId("CONSULTATION")}`,
  );
}

export function workspaceConsultationHrefFromPathname(pathname: string): string {
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  const id = match?.[1]?.trim();
  if (!id) {
    throw new Error("Harper link is missing an application.");
  }
  return applicationStepHref(id, "consultation");
}

export function workspaceCampaignHref(campaignId: string): string {
  const id = campaignId.trim();
  if (!id) {
    throw new Error("Application link is missing an application.");
  }
  return `/campaigns/${id}`;
}

export function workspaceCampaignSummaryHref(campaignId: string): string {
  return `${workspaceCampaignHref(campaignId)}/summary`;
}

export function workspaceInterviewStageHref(
  campaignId: string,
  stageId: string,
): string {
  const id = stageId.trim();
  if (!id) {
    throw new Error("Interview guide link is missing a stage.");
  }
  return `${workspaceCampaignHref(campaignId)}/interviews/${id}`;
}

export function workspaceAssetDocxHref(assetId: string): string {
  const id = assetId.trim();
  if (!id) {
    throw new Error("Download link is missing an asset.");
  }
  return `/api/application-assets/${id}/docx`;
}

export function workspaceSectionHref(
  type: Parameters<typeof workspaceSectionId>[0],
): string {
  return `#${workspaceSectionId(type)}`;
}

export function listWorkspaceHrefs(input: {
  campaignId: string;
  productId: string;
  assetId: string;
  interviewStageId: string;
}): string[] {
  return [
    workspaceProfileHref(input.productId),
    workspaceProfileEditHref(input.productId),
    workspaceConsultationHref(input.campaignId),
    workspaceCampaignHref(input.campaignId),
    workspaceCampaignSummaryHref(input.campaignId),
    workspaceInterviewStageHref(input.campaignId, input.interviewStageId),
    workspaceAssetDocxHref(input.assetId),
    ...applicationStepList
      .filter((step) => step.hrefSegment)
      .map((step) => applicationStepHref(input.campaignId, step.key)),
    ...WORKSPACE_JOB_TYPES.map((type) => workspaceSectionHref(type)),
    workspaceSectionHref("RESEARCH"),
  ];
}

export function openWorkspaceSection(sectionId: string): void {
  if (typeof document === "undefined") {
    throw new Error("Workspace sections can only be opened in the browser.");
  }
  if (sectionId === workspaceSectionId("CONSULTATION")) {
    const match = window.location.pathname.match(/^\/campaigns\/([^/]+)/);
    if (match?.[1]) {
      window.location.assign(applicationStepHref(match[1], "consultation"));
      return;
    }
  }
  const el = document.getElementById(sectionId);
  if (!el) {
    if (sectionId === workspaceSectionId("CONSULTATION")) return;
    throw new Error(`Workspace section #${sectionId} was not found.`);
  }
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ block: "start" });
}
