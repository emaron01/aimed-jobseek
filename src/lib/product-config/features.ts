/**
 * Feature visibility. A disabled flag hides every UI entry point for that
 * feature. Flags never remove or bypass server-side logic. Client-safe.
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
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const features: Readonly<Record<FeatureFlag, boolean>> = Object.freeze({
  listImport: true,
  listBulkValidation: true,
  listBulkScoring: true,
  teamSeats: true,
  teamInvites: true,
  teamRoles: true,
  teamMemberManagement: true,
  contactSales: true,
  teamPlanDisplay: true,
  enterprisePlanDisplay: true,
  referralProgram: true,
});

/** True when any list feature is visible (drives the Lists nav entry). */
export function anyListFeatureEnabled(
  flags: Readonly<Record<FeatureFlag, boolean>> = features,
): boolean {
  return flags.listImport || flags.listBulkValidation || flags.listBulkScoring;
}
