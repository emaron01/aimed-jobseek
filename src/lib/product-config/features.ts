/**
 * Feature visibility. A disabled flag hides every UI entry point and
 * rejects the matching pages (not found) and server actions (forbidden).
 * Client-safe.
 */

export const FEATURE_FLAGS = [
  /** Contact list import (paste, upload, add-contacts wizard). */
  "listImport",
  /** Bulk list validation and company research runs. */
  "listBulkValidation",
  /** Bulk list scoring runs and score reports. */
  "listBulkScoring",
  /** Seat counts, seat purchase, and seat limits. */
  "teamSeats",
  /** Inviting members to an organization. */
  "teamInvites",
  /** Member role display and changes. */
  "teamRoles",
  /** Member list and removal. */
  "teamMemberManagement",
  /** Contact Sales links. */
  "contactSales",
  /** Team and legacy Premium plan display. */
  "teamPlanDisplay",
  /** Enterprise plan display. */
  "enterprisePlanDisplay",
  /** Referral program entry points. */
  "referralProgram",
  /** Microsoft 365 connected-mailbox settings and send path. */
  "emailConnection",
  /** Legacy list-based campaign email sequence workspace. */
  "legacyEmailSequence",
  /** Product-level Hiring Team create/edit (roles are identified per application). */
  "productLevelHiringTeam",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const features: Readonly<Record<FeatureFlag, boolean>> = Object.freeze({
  listImport: false,
  listBulkValidation: false,
  listBulkScoring: false,
  teamSeats: false,
  teamInvites: false,
  teamRoles: false,
  teamMemberManagement: false,
  contactSales: false,
  teamPlanDisplay: false,
  enterprisePlanDisplay: false,
  referralProgram: true,
  emailConnection: false,
  legacyEmailSequence: false,
  productLevelHiringTeam: false,
});

/** True when any list feature is visible (drives the Lists nav entry). */
export function anyListFeatureEnabled(
  flags: Readonly<Record<FeatureFlag, boolean>> = features,
): boolean {
  return flags.listImport || flags.listBulkValidation || flags.listBulkScoring;
}
