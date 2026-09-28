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

/** Harper interviewer section on the consultation page. Fragment only — never show the id as text. */
export function workspaceHarperContactHref(
  campaignId: string,
  contactId: string,
): string {
  const person = contactId.trim();
  if (!person) {
    throw new Error("Harper contact link is missing an interviewer.");
  }
  return `${workspaceConsultationHref(campaignId)}?person=${encodeURIComponent(`contact:${person}`)}#${encodeURIComponent(`harper-contact:${person}`)}`;
}

/** Harper question on Where you stand / general — no person selected. */
export function workspaceHarperStandingQuestionHref(
  campaignId: string,
  questionTurnId: string,
): string {
  const turnId = questionTurnId.trim();
  if (!turnId) {
    throw new Error("Harper standing question link is missing a question.");
  }
  return `${workspaceConsultationHref(campaignId)}#${encodeURIComponent(`harper-q:${turnId}`)}`;
}

/** Harper question card: select the person profile, then scroll to `#harper-q:{questionTurnId}`. */
export function workspaceHarperQuestionHref(
  campaignId: string,
  contactId: string,
  questionTurnId: string,
): string {
  const person = contactId.trim();
  const turnId = questionTurnId.trim();
  if (!person) {
    throw new Error("Harper question link is missing an interviewer.");
  }
  if (!turnId) {
    throw new Error("Harper question link is missing a question.");
  }
  return `${workspaceConsultationHref(campaignId)}?person=${encodeURIComponent(`contact:${person}`)}#${encodeURIComponent(`harper-q:${turnId}`)}`;
}

/** Harper coach item (no turn yet): select the person profile, then scroll to `#harper-coach:{itemId}`. */
export function workspaceHarperCoachItemHref(
  campaignId: string,
  contactId: string,
  coachItemId: string,
): string {
  const person = contactId.trim();
  const itemId = coachItemId.trim();
  if (!person) {
    throw new Error("Harper coach link is missing an interviewer.");
  }
  if (!itemId) {
    throw new Error("Harper coach link is missing a coach item.");
  }
  return `${workspaceConsultationHref(campaignId)}?person=${encodeURIComponent(`contact:${person}`)}#${encodeURIComponent(`harper-coach:${itemId}`)}`;
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

export function workspaceInterviewLikelyQuestionsHref(
  campaignId: string,
  contactId: string,
): string {
  const person = contactId.trim();
  if (!person) {
    throw new Error("Interview questions link is missing an interviewer.");
  }
  const sectionKey = `contact:${person}`;
  return `${workspaceCampaignSummaryHref(campaignId)}?person=${encodeURIComponent(sectionKey)}#${encodeURIComponent(`${sectionKey}-likely-questions`)}`;
}

export function workspaceApplicationContactsHref(campaignId: string): string {
  return `${workspaceCampaignHref(campaignId)}/contacts`;
}

export function workspaceContactEditHref(
  contactId: string,
  campaignId?: string | null,
): string {
  const id = contactId.trim();
  if (!id) {
    throw new Error("Contact edit link is missing a contact.");
  }
  const campaign = campaignId?.trim();
  const query = campaign ? `?campaignId=${encodeURIComponent(campaign)}` : "";
  return `/contacts/${id}/edit${query}`;
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
    workspaceApplicationContactsHref(input.campaignId),
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
