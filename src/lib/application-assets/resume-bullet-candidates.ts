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
import { replyToTurnIdFromAnalysis } from "@/lib/consultation/qa-view";
import { RESUME_BULLET_CANDIDATE_INSTRUCTIONS } from "@/lib/prompt-content/application-assets";

export type BulletEvidence = {
  id: string;
  kind: "ACHIEVEMENT" | "INTERVIEW_ANSWER" | "RESUME_BULLET" | "SEEKER_REPLY";
  text: string;
  /** Set for a Personal Profile achievement; null for answers, bullets, and replies. */
  roleId: string | null;
  /** Question an approved answer or seeker reply answered. Null for achievements. */
  question?: string | null;
};

export type BulletQuestionTurn = {
  id: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
  sequence: number;
  targetKey: string | null;
  analysisJson?: unknown;
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
    question?: string | null;
  }>;
  replies: ReadonlyArray<{
    id: string;
    body: string;
    campaignId: string;
    question?: string | null;
  }>;
}): BulletEvidence[] {
  const evidence: BulletEvidence[] = [];
  for (const item of input.achievements) {
    if (item.id.startsWith("why-this-company:")) continue;
    const text = oneLineBullet(item.text);
    const roleId = item.roleId.trim();
    if (!text || !item.id.trim() || !roleId) continue;
    evidence.push({
      id: item.id.trim(),
      kind: "ACHIEVEMENT",
      text,
      roleId,
      question: null,
    });
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
      question: statement.question?.trim() || null,
    });
  }
  for (const reply of input.replies) {
    if (reply.campaignId !== input.campaignId) continue;
    const text = oneLineBullet(reply.body);
    const id = reply.id.trim();
    if (!text || !id) continue;
    evidence.push({
      id,
      kind: "SEEKER_REPLY",
      text,
      roleId: null,
      question: reply.question?.trim() || null,
    });
  }
  return evidence;
}

/** The consultant question a seeker turn or approved statement answered. */
export function questionTextForAnswer(input: {
  turns: readonly BulletQuestionTurn[];
  turnId: string;
}): string {
  const turn = input.turns.find((item) => item.id === input.turnId);
  if (!turn) return "";
  if (turn.speaker === "CONSULTANT") return oneLineBullet(turn.body);
  const pinnedId = replyToTurnIdFromAnalysis(turn.analysisJson);
  if (pinnedId) {
    const pinned = input.turns.find(
      (item) => item.id === pinnedId && item.speaker === "CONSULTANT",
    );
    if (pinned && oneLineBullet(pinned.body)) return oneLineBullet(pinned.body);
  }
  const prior = [...input.turns].reverse().find(
    (item) =>
      item.speaker === "CONSULTANT" &&
      item.sequence < turn.sequence &&
      (turn.targetKey == null ||
        item.targetKey == null ||
        item.targetKey === turn.targetKey) &&
      oneLineBullet(item.body),
  );
  return prior ? oneLineBullet(prior.body) : "";
}

/** True when the employer appears as its own name, not as part of a longer word. */
export function textNamesEmployer(text: string, employer: string): boolean {
  const company = employer.trim();
  if (company.length < 2) return false;
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function escapeEmployer(employer: string): string {
  return employer.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function employerSpans(text: string, employer: string): Array<{ start: number; end: number }> {
  const company = employer.trim();
  if (company.length < 2) return [];
  const re = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(${escapeEmployer(company)})(?=$|[^\\p{L}\\p{N}])`,
    "giu",
  );
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(re)) {
    const name = match[1];
    if (!name || match.index === undefined) continue;
    const start = match.index + match[0].length - name.length;
    spans.push({ start, end: start + name.length });
  }
  return spans;
}

function tidyBulletText(text: string): string {
  return oneLineBullet(
    text
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/^[,;:\s]+/, "")
      .replace(/\s{2,}/g, " "),
  );
}

/** Possessive ("OpenText's") or a name that begins the bullet ("Merion Publications"). */
function removeSimpleEmployerForms(text: string, employer: string): string | null {
  const spans = employerSpans(text, employer);
  if (spans.length === 0) return text;
  const cuts: Array<{ start: number; end: number }> = [];
  for (const span of spans) {
    const possessive = text.slice(span.end).match(/^['’]s/i);
    const prefix = /^\s*$/.test(text.slice(0, span.start));
    if (!possessive && !prefix) return null;
    let end = span.end;
    if (possessive) end += possessive[0].length;
    else if (text[end] === " ") end += 1;
    cuts.push({ start: span.start, end });
  }
  let next = text;
  for (const cut of cuts.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, cut.start) + next.slice(cut.end);
  }
  return tidyBulletText(next);
}

/** Drop a mid-sentence employer, including a preceding at/for/with. */
function removeEveryEmployerMention(text: string, employer: string): string {
  const spans = employerSpans(text, employer);
  let next = text;
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    let start = span.start;
    let end = span.end;
    const possessive = next.slice(end).match(/^['’]s/i);
    if (possessive) end += possessive[0].length;
    else if (next[end] === " ") end += 1;
    const before = next.slice(0, start);
    const prep = before.match(/\b(?:at|for|with)\s+$/i);
    if (prep && prep.index !== undefined) start = prep.index;
    next = next.slice(0, start) + next.slice(end);
  }
  return tidyBulletText(next);
}

/**
 * Remove a profile employer's name from a bullet.
 * A simple possessive or prefix is removed. Any other mention is removed only
 * when the bullet is built from a Personal Profile achievement; otherwise the
 * bullet is dropped.
 */
export function cleanBulletEmployerNames(input: {
  text: string;
  employers: readonly string[];
  achievementBacked: boolean;
}): { ok: true; text: string } | { ok: false } {
  let text = oneLineBullet(input.text);
  const employers = [...input.employers]
    .map((employer) => employer.trim())
    .filter((employer) => employer.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const employer of employers) {
    if (!textNamesEmployer(text, employer)) continue;
    const simple = removeSimpleEmployerForms(text, employer);
    if (simple !== null && !textNamesEmployer(simple, employer)) {
      text = simple;
      continue;
    }
    if (!input.achievementBacked) return { ok: false };
    text = removeEveryEmployerMention(text, employer);
    if (textNamesEmployer(text, employer)) return { ok: false };
  }
  if (!text) return { ok: false };
  return { ok: true, text };
}

export function employerRetryDecision(input: {
  bullets: ReadonlyArray<{ text: string }>;
  employers: readonly string[];
  alreadyRetried: boolean;
}): "retry" | "keep" {
  if (input.alreadyRetried) return "keep";
  const namesEmployer = input.bullets.some((bullet) =>
    input.employers.some((employer) => textNamesEmployer(bullet.text, employer)),
  );
  return namesEmployer ? "retry" : "keep";
}

export function employerNameRetryMessage(): string {
  return "Rewrite every bullet that names an employer so the bullet does not include the employer's name. The job heading already shows it. Customer and partner names the seeker stated are fine. Return the full bullet list.";
}

export type ProfileEmployerRole = { roleId: string; employer: string };

/** Question and answer together. An achievement always stays on its own role. */
export function attributedEvidenceRole(
  evidence: BulletEvidence,
  roles: readonly ProfileEmployerRole[],
): string {
  if (evidence.kind === "ACHIEVEMENT" && evidence.roleId) return evidence.roleId;
  const named = (text: string) =>
    roles
      .filter((role) => role.employer.trim() && textNamesEmployer(text, role.employer))
      .map((role) => role.roleId);
  const inQuestion = named(evidence.question ?? "");
  const inAnswer = named(evidence.text);
  const union = [...new Set([...inQuestion, ...inAnswer])];
  if (union.length === 1) return union[0]!;
  if (union.length > 1 && inAnswer.length === 1) return inAnswer[0]!;
  return GENERAL_BACKGROUND_ID;
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
  const roleList: ProfileEmployerRole[] = [...roles.entries()].map(([roleId, employer]) => ({
    roleId,
    employer,
  }));
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
    const raw = oneLineBullet(bullet.text);
    if (!raw) continue;
    const evidenceIds = [...new Set(bullet.evidenceIds.map((id) => id.trim()).filter(Boolean))];
    const cited = evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((item): item is BulletEvidence => item !== undefined);
    const achievementBacked = cited.some(
      (evidence) => evidence.kind === "ACHIEVEMENT" && Boolean(evidence.roleId),
    );
    const cleaned = cleanBulletEmployerNames({
      text: raw,
      employers,
      achievementBacked,
    });
    if (!cleaned.ok) {
      logBulletCandidate({
        event: "resume_bullet_candidate_dropped",
        roleId: bullet.roleId.trim(),
        text: raw,
        evidenceIds,
      });
      continue;
    }
    const text = cleaned.text;
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
    if (cited.length !== evidenceIds.length || evidenceIds.length === 0) {
      logBulletCandidate({
        event: "resume_bullet_candidate_dropped",
        roleId,
        text,
        evidenceIds,
      });
      continue;
    }
    const attributed = [
      ...new Set(cited.map((evidence) => attributedEvidenceRole(evidence, roleList))),
    ];
    if (attributed.length === 1 && attributed[0] === GENERAL_BACKGROUND_ID) {
      place(GENERAL_BACKGROUND_ID, make(GENERAL_BACKGROUND_ID, false), true);
      logBulletCandidate({
        event: "resume_bullet_candidate_moved",
        roleId: GENERAL_BACKGROUND_ID,
        text,
        evidenceIds,
      });
      continue;
    }
    if (attributed.length === 1 && roles.has(attributed[0]!)) {
      place(attributed[0]!, make(attributed[0]!, false), false);
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
