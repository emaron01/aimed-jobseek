/**
 * Groups approved statements by the profile role, school, or project they name,
 * and chooses a recommended set inside each role's bullet band.
 * Saving picks does not call a model. The seeker regenerates the resume.
 */

import { createHash } from "node:crypto";
import type { HarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { parseExperienceDate } from "@/lib/product-research/role-dates";

export const RESUME_STATEMENT_PICKS_KEY = "resumeStatementPickIds";
export const BROADER_EXPERIENCE_ID = "broader";
export const BROADER_EXPERIENCE_TITLE = "Broader experience";

const SCHOOL_WORD = /\b(university|college|school|institute|academy)\b/i;
const PROJECT_WORD = /\bprojects?\b/i;

export type PickerProfile = {
  experience: Array<{
    id: string;
    employer: string | null;
    title: string | null;
    startDate?: string | null;
    endDate: string | null;
    /** Personal Profile achievement text, word for word. */
    achievements?: string[];
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
  /** Harper's recommendation. Shown even when the seeker's checkbox differs. */
  recommended: boolean;
  evidenceIds: string[];
  /** The model was not sure of the job. Hidden once the seeker confirms it. */
  needsJobCheck: boolean;
  /** The seeker edited or picked this bullet. A candidate run does not change it. */
  seekerOwned: boolean;
};

export function bulletDisplayId(roleId: string, text: string): string {
  return `bullet:${createHash("sha256").update(`${roleId}\n${text}`).digest("hex").slice(0, 16)}`;
}

export type StatementGroup = {
  id: string;
  title: string;
  roleId: string | null;
  yearsSinceEnd: number | null;
  minBullets: number;
  maxBullets: number;
  titleOnly: boolean;
  showRange: boolean;
  /** The seeker left this job off the resume. */
  leftOff: boolean;
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
  jobSpecific?: boolean;
  evidenceIds: string[];
  /** True when the seeker moved this bullet onto the role. */
  seekerChosen?: boolean;
  /** Result key of the draft text. An edit replaces the text and keeps this key. */
  resultKey?: string;
  needsJobCheck?: boolean;
  seekerOwned?: boolean;
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
  /** Offered in the picker, and title, company, and dates only on the resume until the seeker picks a bullet. */
  titleOnly: boolean;
};

export function pickerProfileFromCandidate(profile: {
  experience: ReadonlyArray<{
    id: string;
    employer?: string | null;
    title?: string | null;
    startDate?: string | null;
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
      startDate: role.startDate ?? null,
      endDate: role.endDate ?? null,
      achievements: (role.achievements ?? [])
        .map((item) => item.text?.trim() ?? "")
        .filter((text) => text.length > 0),
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
function hiddenRoleIdsFromJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(raw.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))),
  ];
}

function picksRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Job ids this application left off. Absent from an array of picks, which has no hide list. */
export function readResumePicksHiddenRoleIds(resumeStatementPicksJson: unknown): string[] {
  return hiddenRoleIdsFromJson(picksRecord(resumeStatementPicksJson)?.hiddenRoleIds);
}

/**
 * Writes one application's hide list beside its picks and seen.
 * An array of picks becomes `{ picks, hiddenRoleIds }` so the picks stay.
 */
export function resumePicksWithRoleLeftOff(
  current: unknown,
  roleId: string,
  leftOff: boolean,
): Record<string, unknown> {
  const ids = new Set(readResumePicksHiddenRoleIds(current));
  const id = roleId.trim();
  if (leftOff && id) ids.add(id);
  else ids.delete(id);
  return picksJsonWithHiddenRoleIds(current, [...ids]);
}

function picksJsonWithHiddenRoleIds(
  current: unknown,
  hiddenRoleIds: readonly string[],
): Record<string, unknown> {
  const ids = hiddenRoleIdsFromJson(hiddenRoleIds);
  if (Array.isArray(current)) return { picks: normalizePickIds(current), hiddenRoleIds: ids };
  if (current && typeof current === "object") {
    return { ...(current as Record<string, unknown>), hiddenRoleIds: ids };
  }
  return { hiddenRoleIds: ids };
}

/**
 * Replaces picks, and seen when it is passed, without dropping a hide list already stored beside them.
 * Keeps a plain array when this application has no hide list and no seen set.
 */
export function resumeStatementPicksJsonWith(input: {
  current: unknown;
  picks: readonly string[];
  seen?: readonly string[] | null;
}): string[] | Record<string, unknown> {
  const hidden = readResumePicksHiddenRoleIds(input.current);
  const record = picksRecord(input.current);
  const currentSeen = record && Array.isArray(record.seen) ? normalizePickIds(record.seen) : null;
  const seen = input.seen === undefined ? currentSeen : input.seen;
  const picks = normalizePickIds(input.picks);
  if (hidden.length === 0 && !Array.isArray(seen)) return picks;
  const json: Record<string, unknown> = { picks };
  if (Array.isArray(seen)) json.seen = seen;
  if (hidden.length > 0) json.hiddenRoleIds = hidden;
  return json;
}

/** True when this application has saved picker JSON, including picks carried in workspace seen. */
export function campaignHasResumePickerState(input: {
  resumeStatementPicksJson: unknown;
  workspaceSeenJson: unknown;
}): boolean {
  if (input.resumeStatementPicksJson != null) return true;
  return readResumeStatementPickIds(input.workspaceSeenJson) !== null;
}

/**
 * Copies profile-level hidden job ids once onto every application that already has picker state.
 * Applications with no picker state stay untouched. The profile field is removed.
 * Returns null when the profile has no such field.
 */
export function carryProfileHiddenRoles(input: {
  profileJson: unknown;
  campaigns: ReadonlyArray<{
    id: string;
    resumeStatementPicksJson: unknown;
    workspaceSeenJson: unknown;
  }>;
}): {
  profileJson: Record<string, unknown>;
  updates: Array<{
    id: string;
    resumeStatementPicksJson: Record<string, unknown>;
    workspaceSeenJson?: Record<string, unknown>;
  }>;
} | null {
  const profile =
    input.profileJson && typeof input.profileJson === "object" && !Array.isArray(input.profileJson)
      ? { ...(input.profileJson as Record<string, unknown>) }
      : null;
  if (!profile || !Object.prototype.hasOwnProperty.call(profile, "hiddenRoleIds")) return null;
  const hidden = hiddenRoleIdsFromJson(profile.hiddenRoleIds);
  delete profile.hiddenRoleIds;
  const updates = hidden.length
    ? input.campaigns.flatMap((campaign) => {
        if (!campaignHasResumePickerState(campaign)) return [];
        let current = campaign.resumeStatementPicksJson;
        let workspaceSeenJson: Record<string, unknown> | undefined;
        if (current == null) {
          const fromSeen = readResumeStatementPickIds(campaign.workspaceSeenJson);
          if (fromSeen) {
            current = fromSeen;
            workspaceSeenJson = workspaceSeenWithoutResumePicks(campaign.workspaceSeenJson) ?? {};
          }
        }
        return [
          {
            id: campaign.id,
            resumeStatementPicksJson: picksJsonWithHiddenRoleIds(current, [
              ...readResumePicksHiddenRoleIds(current),
              ...hidden,
            ]),
            ...(workspaceSeenJson ? { workspaceSeenJson } : {}),
          },
        ];
      })
    : [];
  return { profileJson: profile, updates };
}

export function resumeStatementPicksFromCampaign(input: {
  resumeStatementPicksJson: unknown;
  workspaceSeenJson: unknown;
}): {
  picks: string[] | null;
  seen: string[] | null;
  carryOver: string[] | null;
  hiddenRoleIds: string[];
} {
  const hiddenRoleIds = readResumePicksHiddenRoleIds(input.resumeStatementPicksJson);
  if (Array.isArray(input.resumeStatementPicksJson)) {
    return {
      picks: normalizePickIds(input.resumeStatementPicksJson),
      seen: null,
      carryOver: null,
      hiddenRoleIds,
    };
  }
  if (picksRecord(input.resumeStatementPicksJson) && Array.isArray(picksRecord(input.resumeStatementPicksJson)?.picks)) {
    const record = picksRecord(input.resumeStatementPicksJson)!;
    return {
      picks: normalizePickIds(record.picks),
      seen: Array.isArray(record.seen) ? normalizePickIds(record.seen) : null,
      carryOver: null,
      hiddenRoleIds,
    };
  }
  const fromSeen = readResumeStatementPickIds(input.workspaceSeenJson);
  if (fromSeen === null) return { picks: null, seen: null, carryOver: null, hiddenRoleIds };
  return { picks: fromSeen, seen: null, carryOver: fromSeen, hiddenRoleIds };
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

/** Year and month from a seeker's date. A year with no month sorts as January of that year. */
function roleMonthIndex(value: string | null | undefined): number | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  const parsed = parseExperienceDate(text);
  if (!parsed || parsed.present || parsed.year <= 0) return null;
  const month = parsed.month ?? 1;
  if (month < 1 || month > 12) return null;
  return parsed.year * 12 + month - 1;
}

function hasReadableYear(value: string | null | undefined): boolean {
  return roleMonthIndex(value) != null;
}

function isPresentEnd(endDate: string | null | undefined): boolean {
  const text = endDate?.trim() ?? "";
  if (!text) return true;
  return parseExperienceDate(text)?.present === true;
}

/**
 * Most recent first. A blank end date, or Present, Current, or Now, comes first,
 * then later end dates, then later start dates. A role is undated only when no
 * year can be read from either date, and those roles keep their profile order.
 */
export function orderRolesMostRecentFirst<
  T extends { startDate?: string | null; endDate?: string | null },
>(roles: readonly T[]): T[] {
  const rank = { present: 0, dated: 1, undated: 2 } as const;
  const groupOf = (role: T): keyof typeof rank => {
    if (isPresentEnd(role.endDate)) return "present";
    if (hasReadableYear(role.endDate) || hasReadableYear(role.startDate)) return "dated";
    return "undated";
  };
  return roles
    .map((role, index) => ({ role, index }))
    .sort((left, right) => {
      const leftGroup = groupOf(left.role);
      const rightGroup = groupOf(right.role);
      if (leftGroup !== rightGroup) return rank[leftGroup] - rank[rightGroup];
      if (leftGroup === "undated") return left.index - right.index;
      if (leftGroup === "dated") {
        const endDelta =
          (roleMonthIndex(right.role.endDate) ?? -1) - (roleMonthIndex(left.role.endDate) ?? -1);
        if (endDelta !== 0) return endDelta;
      }
      const leftStart = roleMonthIndex(left.role.startDate);
      const rightStart = roleMonthIndex(right.role.startDate);
      if (leftStart == null && rightStart != null) return 1;
      if (leftStart != null && rightStart == null) return -1;
      if (leftStart != null && rightStart != null && leftStart !== rightStart) {
        return rightStart - leftStart;
      }
      return left.index - right.index;
    })
    .map((item) => item.role);
}

function placesForProfile(profile: PickerProfile): PickerPlace[] {
  const places: PickerPlace[] = [];
  for (const role of orderRolesMostRecentFirst(profile.experience)) {
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
  return Math.max(0, maxBullets);
}

/** Personal Profile roles that take bullets. A role 15 or more years ago is still offered, unchecked, unless it is directly relevant. */
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
    const role = input.profile.experience.find((item) => item.id === place.roleId);
    const maxBullets = range.titleOnly ? 0 : range.max;
    bands.push({
      roleId: place.roleId,
      title: role?.title?.trim() || place.title,
      employer: role?.employer?.trim() || place.title,
      yearsSinceEnd,
      minBullets: range.titleOnly ? 0 : range.min,
      maxBullets,
      candidateCount: maxBullets,
      isPrimary,
      directlyRelevant,
      titleOnly: range.titleOnly,
    });
  }
  return bands;
}

function bulletChecked(input: {
  id: string;
  recommended: boolean;
  saved: string[] | null;
  seen: string[] | null;
  seekerOwned: boolean;
  needsJobCheck: boolean;
}): boolean {
  if (input.needsJobCheck) return false;
  if (input.seekerOwned) {
    if (input.saved === null) return true;
    return input.saved.includes(input.id);
  }
  if (input.saved === null) return input.recommended;
  if (input.saved.includes(input.id)) return true;
  if (!input.recommended) return false;
  if (input.seen === null) return true;
  return !input.seen.includes(input.id);
}

export function buildStatementGroups(input: {
  profile: PickerProfile;
  bullets: readonly PickerBullet[];
  settings: HarperDraftSettings;
  savedPickIds: string[] | null;
  /** Bullet ids offered at the seeker's last save. Null when that set was not stored. */
  seenBulletIds?: string[] | null;
  primaryRoleId: string | null;
  directRoleIds: readonly string[];
  hiddenRoleIds?: readonly string[];
  asOf?: Date;
}): StatementGroup[] {
  const bands = roleBulletBands(input);
  const saved = input.savedPickIds;
  const seen = input.seenBulletIds ?? null;
  const hidden = new Set(input.hiddenRoleIds ?? []);
  const groups: StatementGroup[] = bands.map((band) => {
    const shown = input.bullets.filter((bullet) => bullet.roleId === band.roleId);
    const leftOff = hidden.has(band.roleId);
    const achievements =
      shown.length === 0 && !leftOff
        ? (input.profile.experience.find((role) => role.id === band.roleId)?.achievements ?? [])
            .map((text) => text.trim())
            .filter((text) => text.length > 0)
            .map((text) => ({
              id: bulletDisplayId(band.roleId, text),
              roleId: band.roleId,
              text,
              evidenceIds: [] as string[],
              seekerOwned: false,
              needsJobCheck: false,
            }))
        : [];
    const offered = achievements.length > 0 ? achievements : shown;
    const recommendedIds = new Set(
      (achievements.length > 0
        ? offered.slice(0, band.minBullets)
        : offered.filter((bullet) => !bullet.needsJobCheck).slice(0, band.maxBullets)
      ).map((bullet) => bullet.id),
    );
    return {
      id: band.roleId,
      title: roleGroupHeader(band.title, band.employer),
      roleId: band.roleId,
      yearsSinceEnd: band.yearsSinceEnd,
      minBullets: band.minBullets,
      maxBullets: band.maxBullets,
      titleOnly: band.titleOnly,
      showRange: true,
      leftOff,
      items: offered.map((bullet) => {
        const needsJobCheck = bullet.needsJobCheck === true;
        const seekerOwned = bullet.seekerOwned === true;
        const recommended = recommendedIds.has(bullet.id);
        return {
          id: bullet.id,
          kind: "RESUME_BULLET" as const,
          content: bullet.text,
          requirementLabel: null,
          recommended,
          checked: bulletChecked({
            id: bullet.id,
            recommended,
            saved,
            seen,
            seekerOwned,
            needsJobCheck,
          }),
          evidenceIds: bullet.evidenceIds,
          needsJobCheck,
          seekerOwned,
        };
      }),
    };
  });
  const groupedIds = new Set(groups.map((group) => group.id));
  for (const role of input.profile.experience) {
    if (groupedIds.has(role.id)) continue;
    const extras = input.bullets.filter(
      (bullet) => bullet.roleId === role.id && (bullet.seekerChosen || bullet.seekerOwned),
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
      leftOff: hidden.has(role.id),
      items: extras.map((bullet) => ({
        id: bullet.id,
        kind: "RESUME_BULLET" as const,
        content: bullet.text,
        requirementLabel: null,
        recommended: false,
        checked: bulletChecked({
          id: bullet.id,
          recommended: false,
          saved,
          seen,
          seekerOwned: bullet.seekerOwned === true,
          needsJobCheck: bullet.needsJobCheck === true,
        }),
        evidenceIds: bullet.evidenceIds,
        needsJobCheck: bullet.needsJobCheck === true,
        seekerOwned: bullet.seekerOwned === true,
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
    leftOff: false,
    items: general.map((bullet) => ({
      id: bullet.id,
      kind: "RESUME_BULLET" as const,
      content: bullet.text,
      requirementLabel: null,
      recommended: false,
      checked: bulletChecked({
        id: bullet.id,
        recommended: false,
        saved,
        seen,
        seekerOwned: bullet.seekerOwned === true,
        needsJobCheck: bullet.needsJobCheck === true,
      }),
      evidenceIds: bullet.evidenceIds,
      needsJobCheck: bullet.needsJobCheck === true,
      seekerOwned: bullet.seekerOwned === true,
    })),
  });
  return groups;
}

export function buildResumeWriterPackage(input: {
  profile: PickerProfile;
  bullets: readonly PickerBullet[];
  settings: HarperDraftSettings;
  savedPickIds: string[] | null;
  seenBulletIds?: string[] | null;
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
    if (!group.roleId || group.leftOff) continue;
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
