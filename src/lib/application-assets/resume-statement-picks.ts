/**
 * Groups approved statements by the profile role, school, or project they name,
 * and chooses a recommended set inside each role's bullet band.
 * Saving picks does not call a model. The seeker regenerates the resume.
 */

import type { Prisma } from "@prisma/client";
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

export function readResumeStatementPickIds(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, RESUME_STATEMENT_PICKS_KEY)) {
    return null;
  }
  const raw = record[RESUME_STATEMENT_PICKS_KEY];
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.flatMap((item) =>
        typeof item === "string" && item.trim() ? [item.trim()] : [],
      ),
    ),
  ];
}

export function workspaceSeenJsonWithPicks(
  previous: unknown,
  seen: Record<string, string | number>,
  picks?: string[] | null,
): Prisma.InputJsonValue {
  const preserved =
    picks === undefined ? readResumeStatementPickIds(previous) : picks;
  if (preserved === null) return { ...seen };
  return { ...seen, [RESUME_STATEMENT_PICKS_KEY]: preserved };
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

function recommendedIds(
  items: Array<StatementGroupItem & { rank: number }>,
  count: number,
): Set<string> {
  const ranked = items
    .slice()
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return new Set(ranked.slice(0, Math.max(0, count)).map((item) => item.id));
}

export function buildStatementGroups(input: {
  profile: PickerProfile;
  statements: readonly PickerStatement[];
  assessments: readonly PickerAssessment[];
  settings: HarperDraftSettings;
  savedPickIds: string[] | null;
  primaryRoleId: string | null;
  directRoleIds: readonly string[];
  asOf?: Date;
}): StatementGroup[] {
  const asOf = input.asOf ?? new Date();
  const places = placesForProfile(input.profile);
  const primary = primaryPlace(places, input.primaryRoleId, asOf);
  const saved = input.savedPickIds;
  const buckets = new Map<string, Array<StatementGroupItem & { rank: number }>>();
  const placeById = new Map(places.map((place) => [place.id, place]));

  for (const statement of input.statements) {
    const content = statement.content.trim();
    if (!content) continue;
    const place = placeForStatement(content, places);
    const key = place?.id ?? BROADER_EXPERIENCE_ID;
    const coverage = coverageFor(statement, input.assessments);
    const list = buckets.get(key) ?? [];
    list.push({
      id: statement.id,
      kind: statement.kind,
      content,
      requirementLabel: coverage.label,
      checked: false,
      rank: coverage.rank,
    });
    buckets.set(key, list);
  }

  const groups: StatementGroup[] = [];
  const orderedIds = [
    ...places.map((place) => place.id),
    BROADER_EXPERIENCE_ID,
  ];
  for (const id of orderedIds) {
    const raw = buckets.get(id);
    if (!raw || raw.length === 0) continue;
    const place = placeById.get(id) ?? null;
    const yearsSinceEnd = place ? yearsForPlace(place, asOf) : null;
    const isPrimary = primary?.id === id;
    const directlyRelevant = Boolean(
      place?.roleId && input.directRoleIds.includes(place.roleId),
    );
    const range = place
      ? bulletRangeForRole({
          yearsSinceEnd,
          isPrimary,
          directlyRelevant,
          settings: input.settings,
        })
      : { min: 0, max: 0, titleOnly: false };
    const count = range.titleOnly
      ? 0
      : Math.min(
          raw.length,
          isPrimary || directlyRelevant ? range.max : range.min,
        );
    const picks = recommendedIds(raw, count);
    const checkedIds =
      saved === null
        ? picks
        : new Set(raw.filter((item) => saved.includes(item.id)).map((item) => item.id));
    groups.push({
      id,
      title: place?.title ?? BROADER_EXPERIENCE_TITLE,
      roleId: place?.roleId ?? null,
      yearsSinceEnd,
      minBullets: range.min,
      maxBullets: range.max,
      titleOnly: range.titleOnly,
      showRange: place !== null,
      items: raw
        .slice()
        .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          content: item.content,
          requirementLabel: item.requirementLabel,
          checked: checkedIds.has(item.id),
        })),
    });
  }
  return groups;
}

export function buildResumeWriterPackage(input: {
  profile: PickerProfile;
  statements: readonly PickerStatement[];
  assessments: readonly PickerAssessment[];
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
} {
  const asOf = input.asOf ?? new Date();
  const groups = buildStatementGroups(input);
  const requiredStatements: RequiredResumeStatement[] = [];
  const picksByRole = new Map<string, number>();
  for (const group of groups) {
    for (const item of group.items) {
      if (!item.checked) continue;
      requiredStatements.push({
        statementId: item.id,
        roleId: group.roleId,
        roleTitle: group.title,
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
    let titleOnly = band.titleOnly || (planCondensed && !directlyRelevant);
    if (picks > 0) titleOnly = false;
    let minBullets = titleOnly ? 0 : band.min;
    let maxBullets = titleOnly ? 0 : band.max;
    if (!titleOnly && picks > maxBullets) maxBullets = picks;
    roleBulletPlans.push({
      roleId: place.roleId,
      minBullets,
      maxBullets,
      titleOnly,
      yearsSinceEnd,
    });
  }
  const condensedRoleIds = roleBulletPlans
    .filter((plan) => plan.titleOnly && !hidden.has(plan.roleId))
    .map((plan) => plan.roleId);
  return { requiredStatements, roleBulletPlans, condensedRoleIds };
}
