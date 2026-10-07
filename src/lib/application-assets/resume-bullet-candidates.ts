import { createHash } from "node:crypto";
import {
  RESUME_BULLET_CANDIDATE_PROMPT_VERSION,
  resumeBulletCandidatesSchema,
  type ResumeBulletCandidates,
} from "@/lib/application-assets/contract";
import {
  GENERAL_BACKGROUND_ID,
  orderRoleBullets,
  roleBulletBands,
  type PickerBullet,
  type PickerProfile,
} from "@/lib/application-assets/resume-statement-picks";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import type { HarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { RESUME_BULLET_CANDIDATE_INSTRUCTIONS } from "@/lib/prompt-content/application-assets";

export type BulletEvidence = {
  id: string;
  kind: "ACHIEVEMENT" | "INTERVIEW_ANSWER" | "RESUME_BULLET" | "SEEKER_REPLY";
  text: string;
  /** Set for a Personal Profile achievement; null for answers, bullets, and replies. */
  roleId: string | null;
};

export type BulletCandidateRole = {
  roleId: string;
  employer: string;
  title: string;
  candidateCount: number;
};

export function oneLineBullet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function selectableBulletEvidence(input: {
  campaignId: string;
  achievements: ReadonlyArray<{ id: string; text: string; roleId: string }>;
  statements: ReadonlyArray<{
    id: string;
    content: string;
    kind: string;
    campaignId: string;
    targetKey: string | null;
  }>;
  replies: ReadonlyArray<{ id: string; body: string; campaignId: string }>;
}): BulletEvidence[] {
  const evidence: BulletEvidence[] = [];
  for (const item of input.achievements) {
    if (item.id.startsWith("why-this-company:")) continue;
    const text = oneLineBullet(item.text);
    const roleId = item.roleId.trim();
    if (!text || !item.id.trim() || !roleId) continue;
    evidence.push({ id: item.id.trim(), kind: "ACHIEVEMENT", text, roleId });
  }
  for (const statement of input.statements) {
    if (statement.campaignId !== input.campaignId) continue;
    if (statement.kind !== "INTERVIEW_ANSWER" && statement.kind !== "RESUME_BULLET") continue;
    if ((statement.targetKey ?? "").trim() === WHY_THIS_COMPANY_TARGET_KEY) continue;
    const text = oneLineBullet(statement.content);
    const id = statement.id.trim();
    if (!text || !id) continue;
    evidence.push({
      id,
      kind: statement.kind,
      text,
      roleId: null,
    });
  }
  for (const reply of input.replies) {
    if (reply.campaignId !== input.campaignId) continue;
    const text = oneLineBullet(reply.body);
    const id = reply.id.trim();
    if (!text || !id) continue;
    evidence.push({ id, kind: "SEEKER_REPLY", text, roleId: null });
  }
  return evidence;
}

/** True when the employer appears as its own name, not as part of a longer word. */
export function textNamesEmployer(text: string, employer: string): boolean {
  const company = employer.trim();
  if (company.length < 2) return false;
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function evidenceSupportsAssignedRole(input: {
  evidence: BulletEvidence;
  roleId: string;
  employer: string;
}): boolean {
  if (input.evidence.kind === "ACHIEVEMENT" && input.evidence.roleId === input.roleId) {
    return true;
  }
  return textNamesEmployer(input.evidence.text, input.employer);
}

function logBulletCandidate(input: {
  event: "resume_bullet_candidate_dropped" | "resume_bullet_candidate_moved";
  roleId: string;
  text: string;
  evidenceIds: readonly string[];
}): void {
  console.info(
    JSON.stringify({
      event: input.event,
      roleId: input.roleId,
      evidenceIds: input.evidenceIds,
      text: input.text,
    }),
  );
}

export function readBulletRoleChoices(profileJson: unknown): Record<string, string> {
  if (!profileJson || typeof profileJson !== "object" || Array.isArray(profileJson)) return {};
  const raw = (profileJson as Record<string, unknown>).bulletRoleChoices;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const choices: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.trim() && typeof value === "string" && value.trim()) choices[key.trim()] = value.trim();
  }
  return choices;
}

export function profileWithBulletRoleChoices(
  profileJson: unknown,
  evidenceIds: readonly string[],
  roleId: string,
): Record<string, unknown> {
  const base =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const choices = readBulletRoleChoices(base);
  for (const id of evidenceIds) {
    const evidenceId = id.trim();
    if (evidenceId) choices[evidenceId] = roleId;
  }
  base.bulletRoleChoices = choices;
  return base;
}

function seekerChoice(
  evidenceIds: readonly string[],
  choices: Readonly<Record<string, string>> | undefined,
): string | null {
  if (!choices) return null;
  for (const id of evidenceIds) {
    const choice = choices[id];
    if (choice) return choice;
  }
  return null;
}

function textNamesAnyEmployer(text: string, employers: readonly string[]): boolean {
  return employers.some((employer) => textNamesEmployer(text, employer));
}

export function assignCandidateBullets(input: {
  bullets: ResumeBulletCandidates["bullets"];
  bands: ReadonlyArray<{ roleId: string; employer: string; candidateCount: number }>;
  evidence: readonly BulletEvidence[];
  /** Evidence id to a role id or "general". The seeker's choice wins. */
  choices?: Readonly<Record<string, string>>;
  /** Every Personal Profile role, used when a choice names a role outside the bullet bands. */
  roles?: ReadonlyArray<{ roleId: string; employer: string }>;
}): PickerBullet[] {
  const bands = new Map(input.bands.map((band) => [band.roleId, band]));
  const roles = new Map(
    (input.roles ?? input.bands).map((role) => [role.roleId, role.employer]),
  );
  for (const band of input.bands) roles.set(band.roleId, band.employer);
  const employers = [...roles.values()];
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const grouped = new Map<string, PickerBullet[]>();
  const chosen = new Map<string, PickerBullet[]>();
  const place = (roleId: string, bullet: PickerBullet, preferred: boolean) => {
    const bucket = preferred ? chosen : grouped;
    const list = bucket.get(roleId) ?? [];
    if (list.some((item) => item.id === bullet.id)) return;
    list.push(bullet);
    bucket.set(roleId, list);
  };
  for (const bullet of input.bullets) {
    const text = oneLineBullet(bullet.text);
    if (!text) continue;
    const evidenceIds = [...new Set(bullet.evidenceIds.map((id) => id.trim()).filter(Boolean))];
    const cited = evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((item): item is BulletEvidence => item !== undefined);
    const choice = seekerChoice(evidenceIds, input.choices);
    const make = (roleId: string, seekerChosen: boolean): PickerBullet => ({
      id: `bullet:${createHash("sha256").update(`${roleId}\n${text}`).digest("hex").slice(0, 16)}`,
      roleId,
      text,
      jobSpecific: bullet.jobSpecific,
      evidenceIds,
      seekerChosen,
    });
    if (choice === GENERAL_BACKGROUND_ID) {
      place(GENERAL_BACKGROUND_ID, make(GENERAL_BACKGROUND_ID, true), true);
      logBulletCandidate({
        event: "resume_bullet_candidate_moved",
        roleId: GENERAL_BACKGROUND_ID,
        text,
        evidenceIds,
      });
      continue;
    }
    if (choice && roles.has(choice)) {
      place(choice, make(choice, true), true);
      continue;
    }
    const roleId = bullet.roleId.trim();
    const band = bands.get(roleId);
    const supportsRole =
      band !== undefined &&
      cited.length === evidenceIds.length &&
      evidenceIds.length > 0 &&
      cited.every((evidence) =>
        evidenceSupportsAssignedRole({ evidence, roleId, employer: band.employer }),
      );
    if (supportsRole) {
      place(roleId, make(roleId, false), false);
      continue;
    }
    const achievementRoles = [
      ...new Set(
        cited
          .filter((evidence) => evidence.kind === "ACHIEVEMENT" && evidence.roleId)
          .map((evidence) => evidence.roleId as string),
      ),
    ];
    const namesEmployer = cited.some((evidence) => textNamesAnyEmployer(evidence.text, employers));
    if (!namesEmployer && achievementRoles.length === 1 && roles.has(achievementRoles[0]!)) {
      place(achievementRoles[0]!, make(achievementRoles[0]!, false), false);
      continue;
    }
    if (!namesEmployer && cited.length > 0 && cited.length === evidenceIds.length) {
      place(GENERAL_BACKGROUND_ID, make(GENERAL_BACKGROUND_ID, false), true);
      logBulletCandidate({
        event: "resume_bullet_candidate_moved",
        roleId: GENERAL_BACKGROUND_ID,
        text,
        evidenceIds,
      });
      continue;
    }
    logBulletCandidate({
      event: "resume_bullet_candidate_dropped",
      roleId,
      text,
      evidenceIds,
    });
  }
  const ordered = input.bands.flatMap((band) => {
    const automatic = orderRoleBullets(grouped.get(band.roleId) ?? [], band.candidateCount);
    const preferred = chosen.get(band.roleId) ?? [];
    const seen = new Set(preferred.map((item) => item.id));
    return [...preferred, ...automatic.filter((item) => !seen.has(item.id))];
  });
  const extraRoles = [...chosen.keys()].filter(
    (roleId) => roleId !== GENERAL_BACKGROUND_ID && !bands.has(roleId),
  );
  return [
    ...ordered,
    ...extraRoles.flatMap((roleId) => chosen.get(roleId) ?? []),
    ...(chosen.get(GENERAL_BACKGROUND_ID) ?? []),
    ...(grouped.get(GENERAL_BACKGROUND_ID) ?? []),
  ];
}

export function bulletCandidateRoles(input: {
  profile: PickerProfile;
  settings: HarperDraftSettings;
  primaryRoleId: string | null;
  directRoleIds: readonly string[];
  asOf?: Date;
}): BulletCandidateRole[] {
  return roleBulletBands(input).map((band) => ({
    roleId: band.roleId,
    employer: band.employer,
    title: band.title,
    candidateCount: band.candidateCount,
  }));
}

export function storedCandidatesMatch(
  storedHash: string | null,
  fingerprint: string,
): boolean {
  return storedHash !== null && storedHash === fingerprint;
}

export function buildResumeBulletCandidateMessages(input: {
  roles: readonly BulletCandidateRole[];
  evidence: readonly BulletEvidence[];
  job: { title: string; employer: string; posting: string };
}): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: `Prompt version: ${RESUME_BULLET_CANDIDATE_PROMPT_VERSION}\n\n${RESUME_BULLET_CANDIDATE_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        roles: input.roles,
        evidence: input.evidence,
        job: input.job,
      }),
    },
  ];
}

export function resumeBulletCandidateFingerprint(input: {
  roles: readonly BulletCandidateRole[];
  evidence: readonly BulletEvidence[];
  job: { title: string; employer: string; posting: string };
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: RESUME_BULLET_CANDIDATE_PROMPT_VERSION,
    schemaName: "resume_bullet_candidates",
    messages: buildResumeBulletCandidateMessages(input),
  });
}

export function parseStoredBulletCandidates(json: unknown): ResumeBulletCandidates {
  return resumeBulletCandidatesSchema.parse(json);
}
