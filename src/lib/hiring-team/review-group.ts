import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";

export const APPROVED_PERSONA_DETAILS_CLASS =
  "mt-4 space-y-0 rounded-md border border-success bg-success-tint p-3 text-success";

export const NEEDS_REVIEW_PERSONA_DETAILS_CLASS =
  "mt-4 space-y-0 rounded-md border border-primary bg-primary/10 p-3 text-primary";

/**
 * Seeker-facing Approved chip today (ApplicationWorkspace hiringTeamStatusChip):
 * not building, not stale, approvalStatus APPROVED, and the persona narrative is built.
 * Every other persona is Needs review.
 */
export function hiringTeamPersonaIsApproved(input: {
  approvalStatus: string;
  staleAt: Date | null;
  profileJson: unknown;
  building: boolean;
}): boolean {
  if (input.building) return false;
  if (input.staleAt) return false;
  return (
    input.approvalStatus === "APPROVED" &&
    isHiringTeamPersonaBuilt({ profileJson: input.profileJson })
  );
}
