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
    queued: "Starting…",
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
    edit: "Edit",
    addPerson: "Add person",
  },
  addPersonNote:
    "When you know who will be interviewing you for this role, add them to their Hiring Team role.",
  queuedIdentify: `Identifying the ${vocab.persona.nav}…`,
  queuedBuild: `Building this ${vocab.persona.singular}…`,
  queuedBuildAllDirect: "Building all Direct roles…",
  needsBuildFirst: `Build this ${vocab.persona.singular} first. Building it now…`,
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
