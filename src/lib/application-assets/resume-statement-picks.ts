/**
 * Groups approved statements by the profile role, school, or project they name,
 * and chooses a recommended set inside each role's bullet band.
 * Saving picks does not call a model. The seeker regenerates the resume.
 */

import type { HarperDraftSettings } from "@/lib/consultation/harper-draft-settings";

export const RESUME_STATEMENT_PICKS_KEY = "resumeStatementPickIds";
export const BROADER_EXPERIENCE_ID = "broader";
export const BROADER_EXPERIENCE_TITLE = "Broader experience";

const SCHOOL_WORD = /\b(university|college|school|institute|academy)\b/i;
const PROJECT_WORD = /\bprojects?\b/i;
const REQUIREMENT_TARGET = /^(required|outcome|competency|preferred|mission):/;

export type PickerProfile = {
  experience: Array<{
    id: string;
    employer: string | null;
    title: string | null;
    endDate: string | null;
  }>;
  educationTexts: string[];
  projectTexts: string[];
};

export type PickerStatement = {
  id: string;
  kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
  content: string;
  targetKey: string | null;
};

export type PickerAssessment = {
  targetKey: string;
  text: string;
  strength: string;
};

type PlaceKind = "role" | "school" | "project";

type PickerPlace = {
  id: string;
  title: string;
  kind: PlaceKind;
  roleId: string | null;
  endDate: string | null;
  matchNames: string[];
};

export type StatementGroupItem = {
  id: string;
  kind: PickerStatement["kind"];
  content: string;
  requirementLabel: string | null;
  checked: boolean;
  evidenceIds: string[];
};

export type StatementGroup = {
  id: string;
  title: string;
  roleId: string | null;
  yearsSinceEnd: number | null;
  minBullets: number;
  maxBullets: number;
  titleOnly: boolean;
  showRange: boolean;
  items: StatementGroupItem[];
};

export type RequiredResumeStatement = {
  statementId: string;
  roleId: string | null;
  roleTitle: string;
  content: string;
};

export type RoleBulletPlan = {
  roleId: string;
  minBullets: number;
  maxBullets: number;
  titleOnly: boolean;
  yearsSinceEnd: number | null;
};

export const GENERAL_BACKGROUND_ID = "general";
export const GENERAL_BACKGROUND_TITLE = "General background";

export type PickerBullet = {
  id: string;
  roleId: string;
  text: string;
  jobSpecific: boolean;
  evidenceIds: string[];
  /** True when the seeker moved this bullet onto the role. */
  seekerChosen?: boolean;
};

export type RoleBulletBand = {
  roleId: string;
  title: string;
  employer: string;
  yearsSinceEnd: number | null;
  minBullets: number;
  maxBullets: number;
  candidateCount: number;
  isPrimary: boolean;
  directlyRelevant: boolean;
};

export function pickerProfileFromCandidate(profile: {
  experience: ReadonlyArray<{
    id: string;
    employer?: string | null;
    title?: string | null;
    endDate?: string | null;
    summary?: string | null;
    achievements?: ReadonlyArray<{ text?: string | null }>;
  }>;
  education?: ReadonlyArray<{ text?: string | null }>;
  problemsSolved?: ReadonlyArray<{ text?: string | null }>;
}): PickerProfile {
  const educationTexts = (profile.education ?? [])
    .map((item) => item.text?.trim() ?? "")
    .filter((text) => text.length >= 2);
  const projectTexts = [
    ...profile.experience.flatMap((role) => [
      role.summary ?? "",
      ...(role.achievements ?? []).map((item) => item.text ?? ""),
    ]),
    ...educationTexts,
    ...(profile.problemsSolved ?? []).map((item) => item.text ?? ""),
  ]
    .map((text) => text.trim())
    .filter((text) => text.length >= 2 && PROJECT_WORD.test(text));
  return {
    experience: profile.experience.map((role) => ({
      id: role.id,
      employer: role.employer ?? null,
      title: role.title ?? null,
      endDate: role.endDate ?? null,
    })),
    educationTexts,
    projectTexts: [...new Set(projectTexts)],
  };
}

export function yearsSinceRoleEnd(
  endDate: string | null,
  asOf: Date,
): number | null {
  if (!endDate) return 0;
  const match = endDate.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const end = Number(match[1]) * 12 + Number(match[2]) - 1;
  const now = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  return Number(((now - end) / 12).toFixed(1));
}

function normalizePickIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.flatMap((item) =>
        typeof item === "string" && item.trim() ? [item.trim()] : [],
      ),
    ),
  ];
}

/** Picks previously stored inside workspaceSeenJson. Null when that key was never saved. */
export function readResumeStatementPickIds(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, RESUME_STATEMENT_PICKS_KEY)) {
    return null;
  }
  return normalizePickIds(record[RESUME_STATEMENT_PICKS_KEY]);
}

/**
 * The column wins. Null means Harper's recommendation, unless an older seen
 * document still holds a saved array, which is carried over once.
 */
export function resumeStatementPicksFromCampaign(input: {
  resumeStatementPicksJson: unknown;
  workspaceSeenJson: unknown;
}): { picks: string[] | null; carryOver: string[] | null } {
  if (Array.isArray(input.resumeStatementPicksJson)) {
    return {
      picks: normalizePickIds(input.resumeStatementPicksJson),
      carryOver: null,
    };
  }
  const fromSeen = readResumeStatementPickIds(input.workspaceSeenJson);
  if (fromSeen === null) return { picks: null, carryOver: null };
  return { picks: fromSeen, carryOver: fromSeen };
}

export function workspaceSeenWithoutResumePicks(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = { ...(value as Record<string, unknown>) };
  if (!Object.prototype.hasOwnProperty.call(record, RESUME_STATEMENT_PICKS_KEY)) {
    return null;
  }
  delete record[RESUME_STATEMENT_PICKS_KEY];
  return record;
}

export function bulletRangeForRole(input: {
  yearsSinceEnd: number | null;
  isPrimary: boolean;
  directlyRelevant: boolean;
  settings: HarperDraftSettings;
}): { min: number; max: number; titleOnly: boolean } {
  const years = input.yearsSinceEnd ?? 0;
  const settings = input.settings;
  if (years >= settings.olderRoleYears) {
    if (!input.directlyRelevant) return { min: 0, max: 0, titleOnly: true };
    return {
      min: settings.oldestRelevantBulletMin,
      max: settings.oldestRelevantBulletMax,
      titleOnly: false,
    };
  }
  if (years >= settings.midRoleYears) {
    return {
      min: settings.olderBulletMin,
      max: settings.olderBulletMax,
      titleOnly: false,
    };
  }
  if (years >= settings.recentRoleYears) {
    return {
      min: settings.midBulletMin,
      max: settings.midBulletMax,
      titleOnly: false,
    };
  }
  return {
    min: settings.recentBulletMin,
    max: input.isPrimary
      ? settings.recentPrimaryBulletMax
      : settings.recentBulletMax,
    titleOnly: false,
  };
}

function clauses(text: string, pattern: RegExp): string[] {
  const trimmed = text.trim();
  if (trimmed.length < 2 || !pattern.test(trimmed)) return [];
  const names = new Set<string>([trimmed]);
  for (const part of trimmed.split(/[,.]/)) {
    const piece = part.trim();
    if (piece.length >= 2 && pattern.test(piece)) names.add(piece);
  }
  return [...names];
}

function shortestTitle(names: string[]): string {
  return names.slice().sort((a, b) => a.length - b.length)[0] ?? "Experience";
}

function placesForProfile(profile: PickerProfile): PickerPlace[] {
  const places: PickerPlace[] = [];
  for (const role of profile.experience) {
    const employer = role.employer?.trim() ?? "";
    places.push({
      id: role.id,
      title: employer || role.title?.trim() || "Role",
      kind: "role",
      roleId: role.id,
      endDate: role.endDate,
      matchNames: employer.length >= 2 ? [employer] : [],
    });
  }
  profile.educationTexts.forEach((text, index) => {
    const names = clauses(text, SCHOOL_WORD);
    if (names.length === 0) return;
    places.push({
      id: `school:${index}:${shortestTitle(names).toLowerCase()}`,
      title: shortestTitle(names),
      kind: "school",
      roleId: null,
      endDate: null,
      matchNames: names,
    });
  });
  profile.projectTexts.forEach((text, index) => {
    const names = clauses(text, PROJECT_WORD);
    if (names.length === 0) return;
    places.push({
      id: `project:${index}:${shortestTitle(names).toLowerCase()}`,
      title: shortestTitle(names),
      kind: "project",
      roleId: null,
      endDate: null,
      matchNames: names,
    });
  });
  return places;
}

function yearsForPlace(place: PickerPlace, asOf: Date): number | null {
  if (place.kind !== "role") return 0;
  return yearsSinceRoleEnd(place.endDate, asOf);
}

function primaryPlace(
  places: PickerPlace[],
  primaryRoleId: string | null,
  asOf: Date,
): PickerPlace | null {
  if (primaryRoleId) {
    const named = places.find((place) => place.roleId === primaryRoleId);
    if (named) return named;
  }
  const roles = places.filter((place) => place.kind === "role");
  const pool = roles.length > 0 ? roles : places;
  return (
    pool
      .slice()
      .sort(
        (a, b) =>
          (yearsForPlace(a, asOf) ?? 0) - (yearsForPlace(b, asOf) ?? 0),
      )[0] ?? null
  );
}

function coverageFor(
  statement: PickerStatement,
  assessments: readonly PickerAssessment[],
): { rank: number; label: string | null } {
  const key = statement.targetKey?.trim() ?? "";
  if (!REQUIREMENT_TARGET.test(key)) return { rank: 0, label: null };
  const assessment = assessments.find((item) => item.targetKey === key);
  if (!assessment) return { rank: 0, label: null };
  const strength = assessment.strength.trim().toUpperCase();
  const rank = strength === "STRONG" ? 3 : strength === "PARTIAL" ? 2 : 1;
  return { rank, label: assessment.text.trim() || null };
}

function placeForStatement(
  content: string,
  places: readonly PickerPlace[],
): PickerPlace | null {
  const lower = content.toLowerCase();
  let best: { place: PickerPlace; score: number } | null = null;
  const kindScore = { role: 3, school: 2, project: 1 };
  for (const place of places) {
    for (const name of place.matchNames) {
      if (name.length < 2 || !lower.includes(name.toLowerCase())) continue;
      const score = name.length * 10 + kindScore[place.kind];
      if (!best || score > best.score) best = { place, score };
    }
  }
  return best?.place ?? null;
}

/** Header as on the resume: "Director of Strategic Sales, OpenText". */
export function roleGroupHeader(title: string, employer: string): string {
  const roleTitle = title.trim();
  const company = employer.trim();
  if (roleTitle && company && roleTitle.toLowerCase() !== company.toLowerCase()) {
    return `${roleTitle}, ${company}`;
  }
  return roleTitle || company;
}

export function candidateCountForBand(maxBullets: number, titleOnly: boolean): number {
  if (titleOnly) return 0;
  return Math.max(0, maxBullets) * 2;
}

/** Personal Profile roles that take bullets. A role 15 or more years ago is included only when the plan marks it directly relevant. */
export function roleBulletBands(input: {
  profile: PickerProfile;
  settings: HarperDraftSettings;
  primaryRoleId: string | null;
  directRoleIds: readonly string[];
  asOf?: Date;
}): RoleBulletBand[] {
  const asOf = input.asOf ?? new Date();
  const places = placesForProfile(input.profile).filter((place) => place.kind === "role");
  const primary = primaryPlace(places, input.primaryRoleId, asOf);
  const bands: RoleBulletBand[] = [];
  for (const place of places) {
    if (!place.roleId) continue;
    const yearsSinceEnd = yearsForPlace(place, asOf);
    const isPrimary = primary?.id === place.id;
    const directlyRelevant = input.directRoleIds.includes(place.roleId);
    const range = bulletRangeForRole({
      yearsSinceEnd,
      isPrimary,
      directlyRelevant,
      settings: input.settings,
    });
    if (range.titleOnly) continue;
    const role = input.profile.experience.find((item) => item.id === place.roleId);
    bands.push({
      roleId: place.roleId,
      title: role?.title?.trim() || place.title,
      employer: role?.employer?.trim() || place.title,
      yearsSinceEnd,
      minBullets: range.min,
      maxBullets: range.max,
      candidateCount: candidateCountForBand(range.max, range.titleOnly),
      isPrimary,
      directlyRelevant,
    });
  }
  return bands;
}

function recommendedIds(
  items: Array<StatementGroupItem & { rank: number }>,
  count: number,
): Set<string> {
  const ranked = items
    .slice()
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return new Set(ranked.slice(0, Math.max(0, count)).map((item) => item.id));
}

/** Strength of evidence and relevance together. A numbered result outranks a job-only line. */
export function bulletEvidenceRank(bullet: PickerBullet): number {
  const hasNumber = /\d/.test(bullet.text);
  return (hasNumber ? 2 : 0) + (bullet.jobSpecific ? 1 : 0);
}

export function orderRoleBullets(
  bullets: readonly PickerBullet[],
  candidateCount: number,
): PickerBullet[] {
  return bullets
    .map((bullet, index) => ({ bullet, index }))
    .sort(
      (a, b) =>
        bulletEvidenceRank(b.bullet) - bulletEvidenceRank(a.bullet) ||
        a.index - b.index,
    )
    .slice(0, Math.max(0, candidateCount))
    .map((item) => item.bullet);
}

export function buildStatementGroups(input: {
  profile: PickerProfile;
  bullets: readonly PickerBullet[];
  settings: HarperDraftSettings;
  savedPickIds: string[] | null;
  primaryRoleId: string | null;
  directRoleIds: readonly string[];
  asOf?: Date;
}): StatementGroup[] {
  const bands = roleBulletBands(input);
  const saved = input.savedPickIds;
  const groups: StatementGroup[] = bands.map((band) => {
    const shown = orderRoleBullets(
      input.bullets.filter((bullet) => bullet.roleId === band.roleId),
      band.candidateCount,
    );
    const recommended = Math.min(
      shown.length,
      band.isPrimary || band.directlyRelevant ? band.maxBullets : band.minBullets,
    );
    const checkedIds =
      saved === null
        ? new Set(shown.slice(0, recommended).map((bullet) => bullet.id))
        : new Set(shown.filter((bullet) => saved.includes(bullet.id)).map((bullet) => bullet.id));
    return {
      id: band.roleId,
      title: roleGroupHeader(band.title, band.employer),
      roleId: band.roleId,
      yearsSinceEnd: band.yearsSinceEnd,
      minBullets: band.minBullets,
      maxBullets: band.maxBullets,
      titleOnly: false,
      showRange: true,
      items: shown.map((bullet) => ({
        id: bullet.id,
        kind: "RESUME_BULLET" as const,
        content: bullet.text,
        requirementLabel: null,
        checked: checkedIds.has(bullet.id),
        evidenceIds: bullet.evidenceIds,
      })),
    };
  });
  const groupedIds = new Set(groups.map((group) => group.id));
  for (const role of input.profile.experience) {
    if (groupedIds.has(role.id)) continue;
    const extras = input.bullets.filter(
      (bullet) => bullet.roleId === role.id && bullet.seekerChosen,
    );
    if (extras.length === 0) continue;
    groups.push({
      id: role.id,
      title: roleGroupHeader(role.title?.trim() || "", role.employer?.trim() || ""),
      roleId: role.id,
      yearsSinceEnd: null,
      minBullets: 0,
      maxBullets: extras.length,
      titleOnly: false,
      showRange: false,
      items: extras.map((bullet) => ({
        id: bullet.id,
        kind: "RESUME_BULLET" as const,
        content: bullet.text,
        requirementLabel: null,
        checked: saved === null || saved.includes(bullet.id),
        evidenceIds: bullet.evidenceIds,
      })),
    });
  }
  const general = input.bullets.filter((bullet) => bullet.roleId === GENERAL_BACKGROUND_ID);
  if (general.length === 0) return groups;
  groups.push({
    id: GENERAL_BACKGROUND_ID,
    title: GENERAL_BACKGROUND_TITLE,
    roleId: null,
    yearsSinceEnd: null,
    minBullets: 0,
    maxBullets: 0,
    titleOnly: false,
    showRange: false,
    items: general.map((bullet) => ({
      id: bullet.id,
      kind: "RESUME_BULLET" as const,
      content: bullet.text,
      requirementLabel: null,
      checked: saved !== null && saved.includes(bullet.id),
      evidenceIds: bullet.evidenceIds,
    })),
  });
  return groups;
}

export function buildResumeWriterPackage(input: {
  profile: PickerProfile;
  bullets: readonly PickerBullet[];
  settings: HarperDraftSettings;
  savedPickIds: string[] | null;
  primaryRoleId: string | null;
  directRoleIds: readonly string[];
  planCondensedRoleIds: readonly string[];
  hiddenRoleIds?: readonly string[];
  asOf?: Date;
}): {
  requiredStatements: RequiredResumeStatement[];
  roleBulletPlans: RoleBulletPlan[];
  condensedRoleIds: string[];
  backgroundEvidence: string[];
} {
  const asOf = input.asOf ?? new Date();
  const groups = buildStatementGroups(input);
  const requiredStatements: RequiredResumeStatement[] = [];
  const picksByRole = new Map<string, number>();
  for (const group of groups) {
    if (!group.roleId) continue;
    for (const item of group.items) {
      if (!item.checked) continue;
      const role = input.profile.experience.find((experience) => experience.id === group.roleId);
      requiredStatements.push({
        statementId: item.id,
        roleId: group.roleId,
        roleTitle: role?.title?.trim() || group.title,
        content: item.content,
      });
      if (group.roleId) {
        picksByRole.set(group.roleId, (picksByRole.get(group.roleId) ?? 0) + 1);
      }
    }
  }

  const places = placesForProfile(input.profile);
  const primary = primaryPlace(places, input.primaryRoleId, asOf);
  const hidden = new Set(input.hiddenRoleIds ?? []);
  const roleBulletPlans: RoleBulletPlan[] = [];
  for (const place of places) {
    if (place.kind !== "role" || !place.roleId) continue;
    const yearsSinceEnd = yearsForPlace(place, asOf);
    const isPrimary = primary?.id === place.id;
    const directlyRelevant = input.directRoleIds.includes(place.roleId);
    const band = bulletRangeForRole({
      yearsSinceEnd,
      isPrimary,
      directlyRelevant,
      settings: input.settings,
    });
    const picks = picksByRole.get(place.roleId) ?? 0;
    const planCondensed = input.planCondensedRoleIds.includes(place.roleId);
    const titleOnly = picks > 0 ? false : band.titleOnly || (planCondensed && !directlyRelevant);
    roleBulletPlans.push({
      roleId: place.roleId,
      minBullets: titleOnly ? 0 : picks,
      maxBullets: titleOnly ? 0 : picks,
      titleOnly,
      yearsSinceEnd,
    });
  }
  const condensedRoleIds = roleBulletPlans
    .filter((plan) => plan.titleOnly && !hidden.has(plan.roleId))
    .map((plan) => plan.roleId);
  const backgroundEvidence = groups
    .filter((group) => group.id === GENERAL_BACKGROUND_ID)
    .flatMap((group) => group.items.map((item) => item.content));
  return { requiredStatements, roleBulletPlans, condensedRoleIds, backgroundEvidence };
}
