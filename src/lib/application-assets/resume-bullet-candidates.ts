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

export type BulletLibraryStatement = {
  id: string;
  content: string;
  kind: string;
  campaignId: string;
  targetKey: string | null;
  question?: string | null;
  /** Job-posting employer of the application this answer belongs to. */
  sourceEmployer?: string | null;
  whyThisCompany?: string | null;
};

/**
 * Why-this-company answers stay out. An answer from another application that
 * names that application's target employer is about that employer, not a
 * career result. Naming one of the seeker's own employers does not.
 */
export function libraryStatementExcluded(input: {
  statement: BulletLibraryStatement;
  campaignId: string;
  profileEmployers: readonly string[];
}): boolean {
  const statement = input.statement;
  if ((statement.targetKey ?? "").trim() === WHY_THIS_COMPANY_TARGET_KEY) return true;
  const why = statement.whyThisCompany?.trim() ?? "";
  const question = statement.question?.trim() ?? "";
  const content = statement.content.trim();
  if (why && (content === why || question === why)) return true;
  if (statement.campaignId === input.campaignId) return false;
  const target = statement.sourceEmployer?.trim() ?? "";
  if (target.length < 2) return false;
  const namesTarget =
    textNamesEmployer(content, target) || textNamesEmployer(question, target);
  if (!namesTarget) return false;
  const ownEmployer = input.profileEmployers.some((employer) => {
    const name = employer.trim();
    if (name.length < 2) return false;
    return (
      name.toLowerCase() === target.toLowerCase() ||
      textNamesEmployer(name, target) ||
      textNamesEmployer(target, name)
    );
  });
  return !ownEmployer;
}

export function selectableBulletEvidence(input: {
  campaignId: string;
  achievements: ReadonlyArray<{ id: string; text: string; roleId: string }>;
  statements: ReadonlyArray<BulletLibraryStatement>;
  replies: ReadonlyArray<{
    id: string;
    body: string;
    campaignId: string;
    question?: string | null;
  }>;
  profileEmployers?: readonly string[];
}): BulletEvidence[] {
  const evidence: BulletEvidence[] = [];
  const profileEmployers = input.profileEmployers ?? [];
  for (const statement of input.statements) {
    if (statement.kind !== "INTERVIEW_ANSWER" && statement.kind !== "RESUME_BULLET") continue;
    if (
      libraryStatementExcluded({
        statement,
        campaignId: input.campaignId,
        profileEmployers,
      })
    ) {
      continue;
    }
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

export type ProfileEmployerRole = { roleId: string; employer: string };

/** Full employer, plus the name before a trailing parenthesis ("Micro Focus (acquired by OpenText)" → "Micro Focus"). */
export function employerMatchNames(employer: string): string[] {
  const full = employer.trim();
  if (full.length < 2) return [];
  const names = [full];
  const beforeParen = full.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (beforeParen.length >= 2 && beforeParen.toLowerCase() !== full.toLowerCase()) {
    names.push(beforeParen);
  }
  return names;
}

/** Initials of a profile employer, such as "OT" for OpenText. */
export function employerInitials(employer: string): string[] {
  const base = employer.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const words = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !/^(of|and|the|a|an|by|for)$/i.test(word));
  if (words.length < 2) return [];
  const initials = words.map((word) => word[0]!.toUpperCase()).join("");
  if (initials.length < 2 || initials.length > 4) return [];
  return [initials];
}

/** Uppercase initials only. "OT" matches; a lowercase word does not. */
export function textNamesInitials(text: string, initials: string): boolean {
  if (!/^[A-Z]{2,4}$/.test(initials)) return false;
  const escaped = initials.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(text);
}

/**
 * Roles whose employer the text names.
 * A stated name or initials that match exactly one profile employer selects that role.
 * A name that matches more than one employer decides nothing.
 */
export function rolesNamedByText(
  text: string,
  roles: readonly ProfileEmployerRole[],
): string[] {
  const byName = new Map<string, string[]>();
  const add = (key: string, roleId: string) => {
    const list = byName.get(key) ?? [];
    list.push(roleId);
    byName.set(key, list);
  };
  for (const role of roles) {
    for (const name of employerMatchNames(role.employer)) {
      if (!textNamesEmployer(text, name)) continue;
      add(name.toLowerCase(), role.roleId);
    }
    for (const initials of employerInitials(role.employer)) {
      if (!textNamesInitials(text, initials)) continue;
      add(initials.toLowerCase(), role.roleId);
    }
  }
  const decided = new Set<string>();
  for (const roleIds of byName.values()) {
    const unique = [...new Set(roleIds)];
    if (unique.length === 1) decided.add(unique[0]!);
  }
  return [...decided];
}

function normalizedAmounts(text: string, unitOrCurrencyOnly = false): string[] {
  const withoutYears = text.replace(/\bFY\s*'?\d{2,4}\b/gi, " ");
  const amounts: string[] = [];
  const pattern =
    /(?:\$\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(mm|million|thousand|k|m))?(?:\s*%)?/gi;
  for (const match of withoutYears.matchAll(pattern)) {
    const raw = Number(match[1]!.replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const unit = (match[2] ?? "").toLowerCase();
    const percent = match[0].includes("%");
    const currency = match[0].includes("$");
    if (unitOrCurrencyOnly && !unit && !percent && !currency) continue;
    if (percent && !unit) {
      amounts.push(`${raw}%`);
      continue;
    }
    let value = raw;
    if (unit === "mm" || unit === "million" || unit === "m") value = raw * 1_000_000;
    else if (unit === "k" || unit === "thousand") value = raw * 1_000;
    amounts.push(String(value));
  }
  return [...new Set(amounts)].sort();
}

function namedResultTokens(text: string, employers: readonly string[]): string[] {
  const employerNames = new Set(
    employers.flatMap((employer) => employerMatchNames(employer)).map((name) => name.toLowerCase()),
  );
  const found =
    text.match(
      /\b[A-Z][A-Za-z0-9&.'-]*(?:\s+(?:of|and|&)\s+[A-Z][A-Za-z0-9&.'-]*|\s+[A-Z][A-Za-z0-9&.'-]*)*/g,
    ) ?? [];
  return [
    ...new Set(
      found
        .map((name) => name.trim().toLowerCase())
        .filter((name) => name.length > 1 && !employerNames.has(name)),
    ),
  ].sort();
}

function sameTokenSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((token, index) => token === right[index]);
}

/** Same numbers and named customers. A different number set is a different result. */
export function sameBulletResult(
  left: string,
  right: string,
  employers: readonly string[] = [],
): boolean {
  const leftAmounts = normalizedAmounts(left);
  const rightAmounts = normalizedAmounts(right);
  const leftNames = namedResultTokens(left, employers);
  const rightNames = namedResultTokens(right, employers);
  if (leftAmounts.length === 0 && rightAmounts.length === 0) {
    return leftNames.length > 0 && sameTokenSet(leftNames, rightNames);
  }
  if (!sameTokenSet(leftAmounts, rightAmounts)) return false;
  if (leftNames.length === 0 || rightNames.length === 0) return true;
  return leftNames.some((name) => rightNames.includes(name));
}

/**
 * Match across runs: the same evidence ids plus the same result (numbers and named customers).
 * Wording can change. A different result from the same evidence does not match.
 */
export function bulletResultKey(text: string, evidenceIds: readonly string[]): string {
  const evidence = [...new Set(evidenceIds.map((id) => id.trim()).filter(Boolean))].sort();
  const signature = [...normalizedAmounts(text), ...namedResultTokens(text, [])].join("|");
  return `result:${createHash("sha256").update(`${evidence.join("\n")}\n${signature}`).digest("hex").slice(0, 20)}`;
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
 * A possessive, a prefix, or a mid-sentence mention is removed for every bullet.
 * The bullet is dropped only when a name remains or the text is empty.
 */
export function cleanBulletEmployerNames(input: {
  text: string;
  employers: readonly string[];
}): { ok: true; text: string } | { ok: false } {
  let text = oneLineBullet(input.text);
  const employers = [...new Set(input.employers.flatMap((employer) => employerMatchNames(employer)))]
    .filter((employer) => employer.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const employer of employers) {
    if (!textNamesEmployer(text, employer)) continue;
    const simple = removeSimpleEmployerForms(text, employer);
    if (simple !== null && !textNamesEmployer(simple, employer)) {
      text = simple;
      continue;
    }
    text = removeEveryEmployerMention(text, employer);
    if (textNamesEmployer(text, employer)) return { ok: false };
  }
  const initialCounts = new Map<string, number>();
  for (const employer of input.employers) {
    for (const initials of employerInitials(employer)) {
      initialCounts.set(initials, (initialCounts.get(initials) ?? 0) + 1);
    }
  }
  for (const [initials, count] of initialCounts) {
    if (count !== 1 || !textNamesInitials(text, initials)) continue;
    text = tidyBulletText(
      text.replace(
        new RegExp(
          `(?:\\b(?:at|for|with)\\s+)?${initials}(?:['’]s)?(?=$|[^\\p{L}\\p{N}])`,
          "gu",
        ),
        "",
      ),
    );
  }
  if (!text) return { ok: false };
  return { ok: true, text };
}

export function bulletNamesProfileEmployer(text: string, employers: readonly string[]): boolean {
  if (
    employers
      .flatMap((employer) => employerMatchNames(employer))
      .some((name) => textNamesEmployer(text, name))
  ) {
    return true;
  }
  const initialCounts = new Map<string, number>();
  for (const employer of employers) {
    for (const initials of employerInitials(employer)) {
      initialCounts.set(initials, (initialCounts.get(initials) ?? 0) + 1);
    }
  }
  for (const [initials, count] of initialCounts) {
    if (count === 1 && textNamesInitials(text, initials)) return true;
  }
  return false;
}

export function employerRetryDecision(input: {
  bullets: ReadonlyArray<{ text: string }>;
  employers: readonly string[];
  alreadyRetried: boolean;
}): "retry" | "keep" {
  if (input.alreadyRetried) return "keep";
  const namesEmployer = input.bullets.some((bullet) =>
    bulletNamesProfileEmployer(bullet.text, input.employers),
  );
  return namesEmployer ? "retry" : "keep";
}

function sharesEvidence(
  left: { evidenceIds: readonly string[] },
  right: { evidenceIds: readonly string[] },
): boolean {
  const ids = new Set(left.evidenceIds.map((id) => id.trim()).filter(Boolean));
  return right.evidenceIds.some((id) => ids.has(id.trim()));
}

function amountCount(text: string): number {
  return normalizedAmounts(text).length;
}

function comparableBulletText(text: string, employers: readonly string[]): string {
  const cleaned = cleanBulletEmployerNames({ text, employers });
  return cleaned.ok ? cleaned.text : text;
}

/** Keep every distinct result. A retry replaces only the same result, and only when it keeps the numbers. */
export function mergeEmployerNameRetry(input: {
  first: ResumeBulletCandidates;
  retry: ResumeBulletCandidates;
  employers: readonly string[];
}): ResumeBulletCandidates {
  const passing: ResumeBulletCandidates["bullets"] = [];
  const failed: ResumeBulletCandidates["bullets"] = [];
  for (const bullet of input.first.bullets) {
    if (!bulletNamesProfileEmployer(bullet.text, input.employers)) passing.push(bullet);
    else failed.push(bullet);
  }
  const used = new Set<number>();
  const merged = failed.map((bullet) => {
    const index = input.retry.bullets.findIndex(
      (candidate, candidateIndex) =>
        !used.has(candidateIndex) &&
        sharesEvidence(candidate, bullet) &&
        sameBulletResult(
          comparableBulletText(candidate.text, input.employers),
          comparableBulletText(bullet.text, input.employers),
          input.employers,
        ),
    );
    if (index < 0) return bullet;
    const replacement = input.retry.bullets[index]!;
    if (
      amountCount(comparableBulletText(replacement.text, input.employers)) <
      amountCount(comparableBulletText(bullet.text, input.employers))
    ) {
      return bullet;
    }
    used.add(index);
    return replacement;
  });
  return { bullets: [...passing, ...merged] };
}

export function employerNameRetryMessage(): string {
  return "Rewrite every bullet that names an employer so the bullet does not include the employer's name. The job heading already shows it. Customer and partner names the seeker stated are fine. Return the full bullet list.";
}

export const UNCOVERED_RESULT_FOLLOW_UP_SENTENCE =
  "Write bullets only for these items, which the earlier list did not cover.";

/** A number, a named customer, scope, or an award. A profile employer name alone is not a result. */
export function evidenceHasStatedResult(text: string, employers: readonly string[] = []): boolean {
  if (/\d/.test(text)) return true;
  if (/\b(awards?|awarded|prize|honou?rs?|honou?red|top performers?)\b/i.test(text)) return true;
  if (/\b(nationwide|multi-threaded|multithreaded|direct reports?|headcount|quota)\b/i.test(text)) {
    return true;
  }
  const named =
    text.match(/\b[A-Z][a-z]+(?:\s+(?:of|and)\s+[A-Z][a-z]+|\s+[A-Z][a-z]+)+\b/g) ?? [];
  const employerNames = new Set(
    employers.flatMap((employer) => employerMatchNames(employer)).map((name) => name.toLowerCase()),
  );
  return named.some((name) => !employerNames.has(name.toLowerCase()));
}

/**
 * Evidence still missing a stated result.
 * A number with a unit or currency is covered only when that amount appears in a bullet.
 * Citing the evidence is not enough. Evidence with no such amount stays covered once a bullet cites it.
 */
export function uncitedStatedResults(input: {
  evidence: readonly BulletEvidence[];
  bullets: readonly { evidenceIds: readonly string[]; text?: string }[];
  employers?: readonly string[];
}): BulletEvidence[] {
  const employers = input.employers ?? [];
  const coveredAmounts = new Set(
    input.bullets.flatMap((bullet) => normalizedAmounts(bullet.text ?? "", true)),
  );
  const cited = new Set(
    input.bullets.flatMap((bullet) => bullet.evidenceIds.map((id) => id.trim()).filter(Boolean)),
  );
  return input.evidence.filter((item) => {
    if (!evidenceHasStatedResult(item.text, employers)) return false;
    const amounts = normalizedAmounts(item.text, true);
    if (amounts.length > 0) return amounts.some((amount) => !coveredAmounts.has(amount));
    return !cited.has(item.id);
  });
}

export function uncoveredResultFollowUpMessage(input: {
  roles: readonly BulletCandidateRole[];
  evidence: readonly BulletEvidence[];
  job: { title: string; employer: string; posting: string };
}): string {
  return `${UNCOVERED_RESULT_FOLLOW_UP_SENTENCE}\n${JSON.stringify({
    roles: input.roles,
    evidence: input.evidence,
    job: input.job,
  })}`;
}

export function mergeFollowUpBullets(input: {
  kept: ResumeBulletCandidates;
  followUp: ResumeBulletCandidates;
  uncoveredIds: ReadonlySet<string>;
}): ResumeBulletCandidates {
  const added = input.followUp.bullets.filter((bullet) =>
    bullet.evidenceIds.some((id) => input.uncoveredIds.has(id.trim())),
  );
  return { bullets: [...input.kept.bullets, ...added] };
}

/** Question and answer together. An achievement always stays on its own role. */
export function attributedEvidenceRole(
  evidence: BulletEvidence,
  roles: readonly ProfileEmployerRole[],
): string {
  if (evidence.kind === "ACHIEVEMENT" && evidence.roleId) return evidence.roleId;
  const inQuestion = rolesNamedByText(evidence.question ?? "", roles);
  const inAnswer = rolesNamedByText(evidence.text, roles);
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
  resultKeys: readonly string[],
  roleId: string,
): Record<string, unknown> {
  const base =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const choices = readBulletRoleChoices(base);
  for (const key of resultKeys) {
    const resultKey = key.trim();
    if (resultKey) choices[resultKey] = roleId;
  }
  base.bulletRoleChoices = choices;
  return base;
}

function seekerChoice(
  text: string,
  evidenceIds: readonly string[],
  choices: Readonly<Record<string, string>> | undefined,
): string | null {
  if (!choices) return null;
  return choices[bulletResultKey(text, evidenceIds)] ?? null;
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
    const cleaned = cleanBulletEmployerNames({
      text: raw,
      employers,
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
    const choice = seekerChoice(text, evidenceIds, input.choices);
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
    const fromBullet = rolesNamedByText(text, roleList);
    if (fromBullet.length === 1 && roles.has(fromBullet[0]!)) {
      place(fromBullet[0]!, make(fromBullet[0]!, false), false);
      logBulletCandidate({
        event: "resume_bullet_candidate_moved",
        roleId: fromBullet[0]!,
        text,
        evidenceIds,
      });
      continue;
    }
    place(GENERAL_BACKGROUND_ID, make(GENERAL_BACKGROUND_ID, false), true);
    logBulletCandidate({
      event: "resume_bullet_candidate_moved",
      roleId: GENERAL_BACKGROUND_ID,
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
  return collapseSameResults(
    [
      ...ordered,
      ...extraRoles.flatMap((roleId) => chosen.get(roleId) ?? []),
      ...(chosen.get(GENERAL_BACKGROUND_ID) ?? []),
      ...(grouped.get(GENERAL_BACKGROUND_ID) ?? []),
    ],
    employers,
  );
}

/** Same order as bulletEvidenceRank: a numbered line, then a job-specific line. */
function harperBulletRank(bullet: PickerBullet): number {
  return (/\d/.test(bullet.text) ? 2 : 0) + (bullet.jobSpecific ? 1 : 0);
}

function preferSameGroupBullet(current: PickerBullet, next: PickerBullet): PickerBullet {
  const amountDelta = normalizedAmounts(next.text).length - normalizedAmounts(current.text).length;
  if (amountDelta !== 0) return amountDelta > 0 ? next : current;
  const rankDelta = harperBulletRank(next) - harperBulletRank(current);
  if (rankDelta !== 0) return rankDelta > 0 ? next : current;
  return preferBullet(current, next);
}

function preferBullet(current: PickerBullet, next: PickerBullet): PickerBullet {
  const currentGeneral = current.roleId === GENERAL_BACKGROUND_ID;
  const nextGeneral = next.roleId === GENERAL_BACKGROUND_ID;
  if (currentGeneral !== nextGeneral) return currentGeneral ? next : current;
  if (Boolean(current.seekerChosen) !== Boolean(next.seekerChosen)) {
    return current.seekerChosen ? current : next;
  }
  return next.text.length > current.text.length ? next : current;
}

function evidenceOverlaps(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const ids = new Set(left.map((id) => id.trim()).filter(Boolean));
  return right.some((id) => ids.has(id.trim()));
}

/**
 * One copy of the same result in a group, even when the evidence differs.
 * Across groups, the same result still collapses only when the evidence overlaps, and a role wins over General background.
 * A different amount set stays. The kept bullet has more amounts, then the higher Harper rank.
 */
export function collapseSameResults(
  bullets: readonly PickerBullet[],
  employers: readonly string[],
): PickerBullet[] {
  const kept: PickerBullet[] = [];
  for (const bullet of bullets) {
    const index = kept.findIndex((existing) => {
      if (!sameBulletResult(existing.text, bullet.text, employers)) return false;
      if (existing.roleId === bullet.roleId) return true;
      return evidenceOverlaps(existing.evidenceIds, bullet.evidenceIds);
    });
    if (index < 0) {
      kept.push(bullet);
      continue;
    }
    const current = kept[index]!;
    kept[index] =
      current.roleId === bullet.roleId
        ? preferSameGroupBullet(current, bullet)
        : preferBullet(current, bullet);
  }
  return kept;
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
