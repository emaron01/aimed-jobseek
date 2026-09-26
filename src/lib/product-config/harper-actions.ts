/**
 * Suggested Harper actions by application step. Labels live here so
 * components never hardcode coach copy.
 */
import { applicationAssetConfig } from "./application-assets";
import { applicationSummaryConfig } from "./application-summary";
import { consultationConfig } from "./consultation";
import { hiringTeamConfig } from "./hiring-team";
import { interviewConfig } from "./interview";
import { outreachConfig } from "./outreach";
import { applicationWorkspaceCopy, vocab } from "./vocabulary";
import type { ApplicationStepKey } from "./application-steps";

export const harperActionTypes = Object.freeze({
  start_consultation: `Start with ${consultationConfig.displayName}`,
  review_company: `Review ${applicationWorkspaceCopy.companyTitle.toLowerCase()} research`,
  review_job: applicationWorkspaceCopy.jobRequirementTitle,
  review_fit: applicationWorkspaceCopy.employerFitTitle,
  review_hiring_team: hiringTeamConfig.workspaceTitle,
  prepare_person: "Prepare for {name}",
  review_resume: `Review this ${applicationAssetConfig.labels.resume} against the job`,
  review_cover_letter: `Review this ${applicationAssetConfig.labels.coverLetter} against the job`,
  write_outreach: outreachConfig.labels.generate,
  add_contact: outreachConfig.labels.contactsTitle,
  prep_next_stage: interviewConfig.labels.generateGuide,
  generate_cheat_sheet: applicationSummaryConfig.actions.generate,
  mark_applied: applicationWorkspaceCopy.appliedTitle,
  open_profile: vocab.product.Singular,
});

export type HarperActionType = keyof typeof harperActionTypes;

export function harperActionLabel(
  type: HarperActionType,
  vars: Record<string, string> = {},
): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    harperActionTypes[type],
  );
}

export function harperActionTypesForStep(
  step: ApplicationStepKey | "overview",
): HarperActionType[] {
  switch (step) {
    case "company":
      return ["review_company", "start_consultation"];
    case "job":
      return ["review_job", "review_fit", "start_consultation"];
    case "hiring-team":
      return ["review_hiring_team", "prepare_person", "start_consultation"];
    case "assets":
      return ["review_resume", "review_cover_letter", "start_consultation"];
    case "outreach":
      return ["write_outreach", "add_contact", "start_consultation"];
    case "interviews":
      return ["prep_next_stage", "prepare_person", "start_consultation"];
    case "summary":
      return ["generate_cheat_sheet", "start_consultation"];
    case "applied":
      return ["mark_applied", "start_consultation"];
    case "overview":
      return ["start_consultation", "review_job", "mark_applied"];
    default: {
      const exhaustive: never = step;
      throw new Error(`Unknown Harper step: ${String(exhaustive)}`);
    }
  }
}
