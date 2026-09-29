/**
 * Recent roles for Harper's career walk-through (Batch D6).
 * Roughly the last 3–5 years; never the whole career.
 */

import {
  deriveCareerStage,
  isJuniorOrNonCareerRole,
  type CareerStage,
} from "@/lib/consultation/career-stage";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";
import {
  experienceDateToMonthIndex,
  parseExperienceDate,
} from "@/lib/product-research/role-dates";

export type RecentRole = {
  id: string;
  employer: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  kind: "experience" | "education";
};

function toRecentRole(
  role: CandidateProfile["experience"][number],
): RecentRole {
  return {
    id: role.id,
    employer: role.employer ?? null,
    title: role.title ?? null,
    startDate: role.startDate ?? null,
    endDate: role.endDate ?? null,
    summary: role.summary ?? null,
    kind: "experience",
  };
}

function roleOverlapsLastFiveYears(
  role: CandidateProfile["experience"][number],
  asOf: Date,
): boolean | null {
  const windowStart =
    (asOf.getUTCFullYear() - 5) * 12 + asOf.getUTCMonth();
  const windowEnd = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  const startParsed = role.startDate
    ? parseExperienceDate(role.startDate)
    : null;
  const endParsed = role.endDate
    ? parseExperienceDate(role.endDate)
    : {
        year: 0,
        month: null,
        precision: "month" as const,
        raw: "Present",
        present: true,
      };
  if (!startParsed || !endParsed) return null;
  const start = experienceDateToMonthIndex(startParsed, "start", asOf);
  const end = experienceDateToMonthIndex(endParsed, "end", asOf);
  if (start == null || end == null) return null;
  return end >= windowStart && start <= windowEnd;
}

function mostRecentExperienceRole(
  roles: CandidateProfile["experience"],
  asOf: Date,
): CandidateProfile["experience"][number] | null {
  if (roles.length === 0) return null;
  let best: CandidateProfile["experience"][number] | null = null;
  let bestEnd = Number.NEGATIVE_INFINITY;
  for (const role of roles) {
    const endParsed = role.endDate
      ? parseExperienceDate(role.endDate)
      : {
          year: 0,
          month: null,
          precision: "month" as const,
          raw: "Present",
          present: true,
        };
    if (!endParsed) continue;
    const end = experienceDateToMonthIndex(endParsed, "end", asOf);
    if (end == null) continue;
    if (end >= bestEnd) {
      bestEnd = end;
      best = role;
    }
  }
  return best ?? roles[0] ?? null;
}

/**
 * Pure helper: roles Harper may ask about in the career walk-through.
 * Decision 4 — years decide when readable; junior stages use school/intern/
 * project/part-time; unreadable dates → most recent two in profile order.
 */
export function deriveRecentRoles(
  profile: Pick<CandidateProfile, "experience" | "education">,
  asOf: Date = new Date(),
  careerStage: CareerStage = deriveCareerStage(profile, asOf),
): RecentRole[] {
  if (
    careerStage === "new_to_workforce" ||
    careerStage === "college_graduate"
  ) {
    const school: RecentRole[] = profile.education
      .filter((item) => item.text.trim())
      .map((item) => ({
        id: item.id,
        employer: null,
        title: item.text.trim(),
        startDate: null,
        endDate: null,
        summary: null,
        kind: "education" as const,
      }));
    const junior = profile.experience
      .filter((role) => isJuniorOrNonCareerRole(role))
      .map(toRecentRole);
    const combined = [...school, ...junior];
    if (combined.length > 0) return combined;
    // Ambiguous thin profile: fall through to date / order rules on all roles.
  }

  const roles = profile.experience;
  if (roles.length === 0) return [];

  const overlapFlags = roles.map((role) =>
    roleOverlapsLastFiveYears(role, asOf),
  );
  const anyReadable = overlapFlags.some((flag) => flag !== null);
  if (!anyReadable) {
    return roles.slice(0, 2).map(toRecentRole);
  }

  const overlapping = roles.filter((_, index) => overlapFlags[index] === true);
  const mostRecent = mostRecentExperienceRole(roles, asOf);
  const byId = new Map<string, RecentRole>();
  for (const role of overlapping) {
    byId.set(role.id, toRecentRole(role));
  }
  if (mostRecent) {
    byId.set(mostRecent.id, toRecentRole(mostRecent));
  }
  if (byId.size === 0) {
    return roles.slice(0, 2).map(toRecentRole);
  }
  // Preserve profile order.
  return roles
    .filter((role) => byId.has(role.id))
    .map((role) => byId.get(role.id)!);
}
