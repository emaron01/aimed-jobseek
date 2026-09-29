/**
 * Deterministic career stage from the Personal Profile only.
 * Years decide; role count is a fallback when dates cannot be parsed.
 */

import { calculateExperienceYears } from "@/lib/consultation/assess";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";

export const CAREER_STAGES = [
  "new_to_workforce",
  "college_graduate",
  "early_career",
  "mid_career",
  "late_career",
] as const;

export type CareerStage = (typeof CAREER_STAGES)[number];

const JUNIOR_ROLE_PATTERN =
  /\b(intern(?:ship)?s?|trainees?|volunteers?|students?|part[-\s]?time|co-?ops?|apprentices?|class\s+projects?|course\s+projects?|capstone\s+projects?)\b/i;

function roleHaystack(role: CandidateProfile["experience"][number]): string {
  return [role.title, role.employer, role.summary]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
}

export function isJuniorOrNonCareerRole(
  role: CandidateProfile["experience"][number],
): boolean {
  return JUNIOR_ROLE_PATTERN.test(roleHaystack(role));
}

function hasEducation(profile: Pick<CandidateProfile, "education">): boolean {
  return profile.education.some((item) => item.text.trim().length > 0);
}

function stageFromYears(yearsMonths: number, education: boolean): CareerStage {
  if (yearsMonths < 36) {
    return education ? "college_graduate" : "early_career";
  }
  if (yearsMonths < 96) return "early_career";
  if (yearsMonths < 180) return "mid_career";
  return "late_career";
}

function stageFromRoleCount(qualifyingCount: number): CareerStage {
  if (qualifyingCount <= 0) return "new_to_workforce";
  if (qualifyingCount <= 2) return "early_career";
  if (qualifyingCount <= 5) return "mid_career";
  return "late_career";
}

/**
 * Pure, deterministic career stage from the Personal Profile.
 * Never invents years. Never blocks callers — always returns a stage.
 */
export function deriveCareerStage(
  profile: Pick<CandidateProfile, "experience" | "education">,
  asOf: Date = new Date(),
): CareerStage {
  const qualifying = profile.experience.filter(
    (role) => !isJuniorOrNonCareerRole(role),
  );
  if (qualifying.length === 0) {
    return "new_to_workforce";
  }

  const profileItems = qualifying.map((role) => ({
    id: role.id,
    kind: role.kind,
    text: roleHaystack(role) || role.id,
    itemType: "EXPERIENCE" as const,
    employer: role.employer ?? null,
    title: role.title ?? null,
    startDate: role.startDate ?? null,
    endDate: role.endDate ?? null,
  }));

  const calculated = calculateExperienceYears({
    requiredYears: 0,
    roleIds: qualifying.map((role) => role.id),
    profileItems,
    asOf,
  });

  const datesUnreadable =
    calculated.periods.length === 0 ||
    calculated.missingDateRoleIds.length === qualifying.length;

  if (datesUnreadable) {
    return stageFromRoleCount(qualifying.length);
  }

  return stageFromYears(calculated.totalMonths, hasEducation(profile));
}
