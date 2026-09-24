/** Hiring Team identification limits. Role names and titles come from the model. */
import { vocab } from "./vocabulary";

export const hiringTeamConfig = {
  maxIdentifiedRoles: 8,
  sections: {
    direct: "Direct",
    indirect: "Indirect",
  },
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
