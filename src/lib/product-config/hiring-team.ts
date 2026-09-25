/** Hiring Team identification limits. Role names and titles come from the model. */
import { applicationWorkspaceCopy, vocab } from "./vocabulary";

export const hiringTeamConfig = {
  maxIdentifiedRoles: 8,
  maxBuildAttempts: 3,
  staleReason: `This ${vocab.persona.singular} is stale because the job or employer research changed. Rebuild when you want an updated draft.`,
  workspaceTitle: applicationWorkspaceCopy.hiringTeamTitle,
  sections: {
    direct: "Direct",
    indirect: "Indirect",
  },
  status: {
    identified: "Identified",
    queued: "Queued",
    building: "Building",
    built: "Built",
    failed: "Failed",
    stale: "Stale",
    approved: "Approved",
  },
  actions: {
    build: `Build ${vocab.persona.singular}`,
    buildAllDirect: "Build all Direct roles",
    rebuild: "Rebuild",
    retry: "Retry",
  },
  queuedIdentify: `${vocab.persona.nav} identification was queued.`,
  queuedBuild: `${vocab.persona.Singular} build was queued.`,
  queuedBuildAllDirect: "Direct role builds were queued.",
  needsBuildFirst: `Build this ${vocab.persona.singular} first. The build was queued.`,
  controls: {
    expandAll: "Expand all",
    collapseAll: "Collapse all",
  },
  fields: {
    definitionLabel: `Describe this ${vocab.persona.singular}`,
    definitionHint: `Authoritative ${vocab.persona.singular} narrative. Preserved as source data.`,
    definitionPlaceholder: "The hiring manager responsible for…",
    outcomesLabel: `What this ${vocab.persona.singular} needs from the hire`,
    outcomesHint: `What they want to improve, achieve, reduce, or avoid in this role — not ${vocab.campaign.aSingular} call to action.`,
  },
};
