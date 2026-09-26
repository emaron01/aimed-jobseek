/** Hiring Team identification limits. Role names and titles come from the model. */
import { applicationWorkspaceCopy, vocab } from "./vocabulary";
import { polishCopy } from "./polish";

export const hiringTeamConfig = {
  maxIdentifiedRoles: 8,
  maxBuildAttempts: 3,
  staleReason: `This ${vocab.persona.singular} is stale because the job or employer research changed. Generate it again when you want an updated draft.`,
  workspaceTitle: applicationWorkspaceCopy.hiringTeamTitle,
  sections: {
    direct: "Direct",
    indirect: "Indirect",
  },
  status: {
    identified: "Identified",
    queued: "Starting…",
    building: "Generating",
    built: "Ready",
    failed: "Failed",
    stale: "Stale",
    approved: "Approved",
  },
  actions: {
    build: `${polishCopy.generate} ${vocab.persona.singular}`,
    buildAllDirect: "Generate all Direct roles",
    rebuild: polishCopy.regenerate,
    retry: "Retry",
    edit: "Edit",
    addPerson: "Add person",
  },
  addPersonNote:
    "When you know who will be interviewing you for this role, add them to their Hiring Team role.",
  queuedIdentify: `Identifying the ${vocab.persona.nav}…`,
  queuedBuild: `Generating this ${vocab.persona.singular}…`,
  queuedBuildAllDirect: "Generating all direct roles…",
  needsBuildFirst: `Generate this ${vocab.persona.singular} first. Starting now…`,
  controls: {
    expandAll: "Expand all",
    collapseAll: "Collapse all",
  },
  fields: {
    definitionLabel: `Describe this ${vocab.persona.singular}`,
    definitionHint: `The ${vocab.persona.singular} narrative used for outreach and interview prep.`,
    definitionPlaceholder: "The hiring manager responsible for…",
    outcomesLabel: `What this ${vocab.persona.singular} needs from the hire`,
    outcomesHint: `What they want to improve, achieve, reduce, or avoid in this role — not ${vocab.campaign.aSingular} call to action.`,
  },
};
