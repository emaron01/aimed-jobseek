import { createHash } from "node:crypto";
import {
  RESUME_BULLET_CANDIDATE_PROMPT_VERSION,
  resumeBulletCandidatesSchema,
  type ResumeBulletCandidates,
} from "@/lib/application-assets/contract";
import {
  bulletDisplayId,
  GENERAL_BACKGROUND_ID,
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

/** "Microfocus" names "Micro Focus" when that spaceless form matches one profile employer. */
function textNamesCompactEmployer(text: string, employer: string): boolean {
  const compact = employer.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (compact.length < 6) return false;
  return text.split(/[^A-Za-z0-9]+/).some((token) => token.toLowerCase() === compact);
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
      if (textNamesEmployer(text, name)) add(name.toLowerCase(), role.roleId);
      else if (textNamesCompactEmployer(text, name)) add(`compact:${name.toLowerCase()}`, role.roleId);
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

/**
 * One evidence item that names more than one Personal Profile employer becomes one
 * segment per employer, before the candidate call. Sentences are split on . ! ?
 * followed by whitespace; a decimal point between digits stays in the sentence.
 * A sentence that names no employer stays with the segment before it. Leading
 * unnamed sentences join the first employer segment. A sentence that names more
 * than one employer stays whole. Each segment keeps the original evidence id
 * and question. An item that names one employer, or none, is left as one segment.
 * A sentence names an employer when rolesNamedByText matches the full name, the
 * name before a trailing parenthesis, unique initials, or one word equal to that
 * employer with spaces removed (Microfocus names Micro Focus).
 */
export function splitEvidenceByEmployer(
  evidence: readonly BulletEvidence[],
  roles: readonly ProfileEmployerRole[],
): BulletEvidence[] {
  return evidence.flatMap((item) => splitEvidenceItem(item, roles));
}

function evidenceSentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== "." && char !== "!" && char !== "?") continue;
    const previous = text[index - 1] ?? "";
    const next = text[index + 1] ?? "";
    if (char === "." && /\d/.test(previous) && /\d/.test(next)) continue;
    if (next !== "" && !/\s/.test(next)) continue;
    let end = index + 1;
    while (end < text.length && /\s/.test(text[end] ?? "")) end += 1;
    const sentence = text.slice(start, index + 1).trim();
    if (sentence) parts.push(sentence);
    start = end;
    index = end - 1;
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts : [text.trim()].filter(Boolean);
}

function splitEvidenceItem(
  item: BulletEvidence,
  roles: readonly ProfileEmployerRole[],
): BulletEvidence[] {
  if (rolesNamedByText(item.text, roles).length < 2) return [item];
  const sentences = evidenceSentences(item.text);
  if (sentences.length < 2) return [item];
  const segments: string[][] = [];
  let current: string[] = [];
  let currentRole: string | null = null;
  let leading: string[] = [];
  for (const sentence of sentences) {
    const named = rolesNamedByText(sentence, roles);
    if (named.length === 0) {
      if (current.length === 0 && segments.length === 0) leading.push(sentence);
      else current.push(sentence);
      continue;
    }
    const role = named.length === 1 ? named[0]! : null;
    if (current.length > 0 && role !== null && role === currentRole) {
      current.push(sentence);
      continue;
    }
    if (current.length > 0) segments.push(current);
    current = [...(segments.length === 0 ? leading : []), sentence];
    leading = [];
    currentRole = role;
  }
  if (current.length > 0) segments.push(current);
  if (segments.length < 2) return [item];
  return segments.map((parts) => ({ ...item, text: parts.join(" ") }));
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

/** The same sentence, or the same result (amounts and named customers). */
export function textIsDismissed(
  text: string,
  dismissed: readonly string[],
  employers: readonly string[] = [],
): boolean {
  const line = oneLineBullet(text).toLowerCase();
  if (!line) return false;
  return dismissed.some((item) => {
    const stored = oneLineBullet(item).toLowerCase();
    return stored === line || sameBulletResult(item, text, employers);
  });
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

export function readBulletTextEdits(profileJson: unknown): Record<string, string> {
  if (!profileJson || typeof profileJson !== "object" || Array.isArray(profileJson)) return {};
  const raw = (profileJson as Record<string, unknown>).bulletTextEdits;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const edits: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.trim() && typeof value === "string" && value.trim()) edits[key.trim()] = value.trim();
  }
  return edits;
}

/** Stores the seeker's bullet text beside bulletRoleChoices. The key is the same result key. */
export function profileWithBulletTextEdits(
  profileJson: unknown,
  resultKey: string,
  text: string,
): Record<string, unknown> {
  const base =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const edits = readBulletTextEdits(base);
  const key = resultKey.trim();
  const value = text.trim();
  if (key && value) edits[key] = value;
  base.bulletTextEdits = edits;
  return base;
}

/** Seeker bullets stay evidence for later candidate runs and for citation. */
export function seekerBulletEvidence(bullets: readonly SeekerBulletRecord[]): BulletEvidence[] {
  return bullets
    .filter((bullet) => bullet.text.trim())
    .map((bullet) => ({
      id: `seeker-bullet:${bullet.id}`,
      kind: "SEEKER_REPLY" as const,
      text: bullet.text.trim(),
      roleId: bullet.roleId,
      question: null,
    }));
}

/** Seeker edits go into the next candidate run as the seeker's own words. */
export function bulletEditEvidence(edits: Readonly<Record<string, string>>): BulletEvidence[] {
  return Object.entries(edits)
    .filter(([, text]) => text.trim().length > 0)
    .map(([key, text]) => ({
      id: `bullet-edit:${key}`,
      kind: "SEEKER_REPLY" as const,
      text: text.trim(),
      roleId: null,
      question: null,
    }));
}

/**
 * Replaces a draft with the seeker's text for that result. The bullet id stays the
 * draft id, so a saved pick still matches. A later draft of the same result is replaced too.
 */
export function applyBulletTextEdits(
  bullets: readonly PickerBullet[],
  edits: Readonly<Record<string, string>>,
): PickerBullet[] {
  const applied = bullets.map((bullet) => {
    const resultKey = bullet.resultKey ?? bulletResultKey(bullet.text, bullet.evidenceIds);
    const edited = edits[resultKey]?.trim();
    if (!edited) return { ...bullet, resultKey };
    return { ...bullet, resultKey, text: edited };
  });
  return applied.filter((bullet, index) => {
    const editOnly =
      bullet.evidenceIds.length > 0 &&
      bullet.evidenceIds.every((id) => id.startsWith("bullet-edit:"));
    const editId = bullet.evidenceIds.find((id) => id.startsWith("bullet-edit:"));
    if (!editOnly || !editId) return true;
    const key = editId.slice("bullet-edit:".length);
    return !applied.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.resultKey === key &&
        !other.evidenceIds.every((id) => id.startsWith("bullet-edit:")),
    );
  });
}

/** Segments that share an evidence id stay distinct. The bullet is tied to the segment with the same result. */
function citedEvidenceForBullet(
  evidenceIds: readonly string[],
  evidenceById: ReadonlyMap<string, readonly BulletEvidence[]>,
  text: string,
  employers: readonly string[],
): BulletEvidence[] | null {
  if (evidenceIds.length === 0) return null;
  const cited: BulletEvidence[] = [];
  for (const id of evidenceIds) {
    const segments = evidenceById.get(id);
    if (!segments || segments.length === 0) return null;
    if (segments.length === 1) {
      cited.push(segments[0]!);
      continue;
    }
    const matched = segments.find((segment) => sameBulletResult(segment.text, text, employers));
    const bulletAmounts = normalizedAmounts(text);
    const sameAmounts = segments.filter((segment) => {
      const amounts = normalizedAmounts(segment.text);
      return (
        amounts.length > 0 &&
        amounts.length === bulletAmounts.length &&
        amounts.every((amount, index) => amount === bulletAmounts[index])
      );
    });
    cited.push(matched ?? (sameAmounts.length === 1 ? sameAmounts[0]! : segments[0]!));
  }
  return cited;
}

/**
 * The job a saved pick or edit already used. New candidates keep the model's role.
 * This does not move a bullet the seeker has not saved.
 */
function roleSavedEarlier(input: {
  text: string;
  evidenceIds: readonly string[];
  evidenceById: ReadonlyMap<string, readonly BulletEvidence[]>;
  roleList: readonly ProfileEmployerRole[];
  roles: ReadonlyMap<string, string>;
  choice: string | null;
  employers: readonly string[];
}): string {
  if (input.choice === GENERAL_BACKGROUND_ID) return GENERAL_BACKGROUND_ID;
  if (input.choice && input.roles.has(input.choice)) return input.choice;
  const cited = citedEvidenceForBullet(
    input.evidenceIds,
    input.evidenceById,
    input.text,
    input.employers,
  );
  if (!cited) return GENERAL_BACKGROUND_ID;
  const attributed = [
    ...new Set(cited.map((evidence) => attributedEvidenceRole(evidence, input.roleList))),
  ];
  if (
    attributed.length === 1 &&
    (attributed[0] === GENERAL_BACKGROUND_ID || input.roles.has(attributed[0]!))
  ) {
    return attributed[0]!;
  }
  const fromBullet = rolesNamedByText(input.text, input.roleList);
  if (fromBullet.length === 1 && input.roles.has(fromBullet[0]!)) return fromBullet[0]!;
  return GENERAL_BACKGROUND_ID;
}

export type SeekerBulletRecord = {
  id: string;
  text: string;
  roleId: string | null;
};

export function readHiddenRoleIds(profileJson: unknown): string[] {
  if (!profileJson || typeof profileJson !== "object" || Array.isArray(profileJson)) return [];
  const raw = (profileJson as Record<string, unknown>).hiddenRoleIds;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])),
    ),
  ];
}

export function profileWithHiddenRole(
  profileJson: unknown,
  roleId: string,
  leftOff: boolean,
): Record<string, unknown> {
  const base =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const ids = new Set(readHiddenRoleIds(base));
  const id = roleId.trim();
  if (leftOff) ids.add(id);
  else ids.delete(id);
  base.hiddenRoleIds = [...ids];
  return base;
}

export function readSeekerBullets(profileJson: unknown): SeekerBulletRecord[] {
  if (!profileJson || typeof profileJson !== "object" || Array.isArray(profileJson)) return [];
  const raw = (profileJson as Record<string, unknown>).seekerBullets;
  if (!Array.isArray(raw)) return [];
  const bullets: SeekerBulletRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const text = typeof record.text === "string" ? record.text.trim() : "";
    const roleId =
      record.roleId === null
        ? null
        : typeof record.roleId === "string" && record.roleId.trim()
          ? record.roleId.trim()
          : null;
    if (!id || !text) continue;
    if (bullets.some((bullet) => bullet.id === id)) continue;
    bullets.push({ id, text, roleId });
  }
  return bullets;
}

export function profileWithSeekerBullet(
  profileJson: unknown,
  bullet: SeekerBulletRecord,
): Record<string, unknown> {
  const base =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const bullets = readSeekerBullets(base).filter((item) => item.id !== bullet.id);
  bullets.push({
    id: bullet.id.trim(),
    text: bullet.text.trim(),
    roleId: bullet.roleId,
  });
  base.seekerBullets = bullets;
  return base;
}

export function profileWithoutSeekerBullet(
  profileJson: unknown,
  bulletId: string,
): Record<string, unknown> {
  const base =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const id = bulletId.trim();
  base.seekerBullets = readSeekerBullets(base).filter((item) => item.id !== id);
  return base;
}

export function readDismissedBulletTexts(profileJson: unknown): string[] {
  if (!profileJson || typeof profileJson !== "object" || Array.isArray(profileJson)) return [];
  const raw = (profileJson as Record<string, unknown>).dismissedBulletTexts;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.flatMap((item) => (typeof item === "string" && item.trim() ? [oneLineBullet(item)] : [])),
    ),
  ];
}

export function profileWithDismissedBullet(
  profileJson: unknown,
  text: string,
  employers: readonly string[] = [],
): Record<string, unknown> {
  const base =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const line = oneLineBullet(text);
  const existing = readDismissedBulletTexts(base);
  if (line && !textIsDismissed(line, existing, employers)) {
    base.dismissedBulletTexts = [...existing, line];
  }
  return base;
}

function draftResultKey(text: string, evidenceIds: readonly string[], employers: readonly string[]): string {
  const line = oneLineBullet(text);
  const cleaned = cleanBulletEmployerNames({ text: line, employers });
  return bulletResultKey(cleaned.ok ? cleaned.text : line, evidenceIds);
}

/**
 * A refresh keeps seeker, edited, and picked bullets exactly as stored.
 * Every other previous candidate is replaced by the new run.
 */
export function replaceUnpickedCandidates<T extends { text: string; evidenceIds: readonly string[] }>(input: {
  previous: readonly T[];
  next: readonly T[];
  kept: readonly { text: string; evidenceIds?: readonly string[]; resultKey?: string }[];
  employers: readonly string[];
  /** Results the seeker removed. A refresh does not keep or add them. */
  dismissedTexts?: readonly string[];
}): T[] {
  const dismissed = input.dismissedTexts ?? [];
  const stillOffered = (text: string) => !textIsDismissed(text, dismissed, input.employers);
  const keptPrevious = input.previous.filter((raw) => {
    if (!stillOffered(raw.text)) return false;
    const key = draftResultKey(raw.text, raw.evidenceIds, input.employers);
    return input.kept.some((bullet) => {
      if (bullet.resultKey === key) return true;
      const same =
        sameBulletResult(bullet.text, raw.text, input.employers) ||
        sameBulletResult(bullet.text, oneLineBullet(raw.text), input.employers);
      if (!same) return false;
      const ids = bullet.evidenceIds?.filter((id) => !id.startsWith("seeker-bullet:")) ?? [];
      if (ids.length === 0) return true;
      return raw.evidenceIds.some((id) => ids.includes(id));
    });
  });
  const fresh = input.next.filter(
    (bullet) =>
      stillOffered(bullet.text) &&
      !keptPrevious.some((existing) =>
        sameBulletResult(existing.text, bullet.text, input.employers),
      ) &&
      !input.kept.some((existing) => sameBulletResult(existing.text, bullet.text, input.employers)),
  );
  return [...keptPrevious, ...fresh];
}

/** Evidence whose stated result is not already in a seeker bullet or a pick. */
export function evidenceNotCovered(input: {
  evidence: readonly BulletEvidence[];
  bullets: readonly { text: string; evidenceIds?: readonly string[] }[];
  employers: readonly string[];
}): BulletEvidence[] {
  return input.evidence.filter((item) => {
    const amounts = normalizedAmounts(item.text, true);
    if (amounts.length > 0) {
      const covered = new Set(
        input.bullets.flatMap((bullet) => normalizedAmounts(bullet.text, true)),
      );
      return amounts.some((amount) => !covered.has(amount));
    }
    return !input.bullets.some(
      (bullet) =>
        bullet.evidenceIds?.includes(item.id) ||
        sameBulletResult(bullet.text, item.text, input.employers),
    );
  });
}

export function assignCandidateBullets(input: {
  bullets: ReadonlyArray<{
    roleId: string | null;
    text: string;
    evidenceIds: readonly string[];
    needsJobCheck?: boolean;
    jobSpecific?: boolean;
  }>;
  bands: ReadonlyArray<{ roleId: string; employer: string; candidateCount: number }>;
  evidence: readonly BulletEvidence[];
  /** Result key to a role id or "general". The seeker's choice wins. */
  choices?: Readonly<Record<string, string>>;
  /** Every Personal Profile role, used when a choice names a role outside the bullet bands. */
  roles?: ReadonlyArray<{ roleId: string; employer: string }>;
  /** Display ids the seeker already picked. Those bullets keep the job they had. */
  pickedIds?: ReadonlySet<string>;
  textEdits?: Readonly<Record<string, string>>;
  /** Results the seeker removed. They are not suggested again. */
  dismissedTexts?: readonly string[];
}): PickerBullet[] {
  const roles = new Map(
    (input.roles ?? input.bands).map((role) => [role.roleId, role.employer]),
  );
  for (const band of input.bands) roles.set(band.roleId, band.employer);
  const employers = [...roles.values()];
  const roleList: ProfileEmployerRole[] = [...roles.entries()].map(([roleId, employer]) => ({
    roleId,
    employer,
  }));
  const known = new Set(input.evidence.map((item) => item.id.trim()).filter(Boolean));
  const evidenceById = new Map<string, BulletEvidence[]>();
  for (const item of input.evidence) {
    const list = evidenceById.get(item.id) ?? [];
    list.push(item);
    evidenceById.set(item.id, list);
  }
  const drafted: PickerBullet[] = [];
  for (const bullet of input.bullets) {
    const evidenceIds = [...new Set(bullet.evidenceIds.map((id) => id.trim()).filter(Boolean))];
    if (evidenceIds.length === 0 || evidenceIds.some((id) => !known.has(id))) continue;
    const raw = oneLineBullet(bullet.text);
    if (!raw) continue;
    const cleaned = cleanBulletEmployerNames({ text: raw, employers });
    if (!cleaned.ok) continue;
    const text = cleaned.text;
    if (textIsDismissed(text, input.dismissedTexts ?? [], employers)) continue;
    const resultKey = bulletResultKey(text, evidenceIds);
    const choice = input.choices?.[resultKey] ?? null;
    const savedRole = roleSavedEarlier({
      text,
      evidenceIds,
      evidenceById,
      roleList,
      roles,
      choice,
      employers,
    });
    const savedId = bulletDisplayId(savedRole, text);
    const edited = input.textEdits?.[resultKey]?.trim() || "";
    const kept = Boolean(edited) || (input.pickedIds?.has(savedId) ?? false);
    const modelRole = bullet.roleId?.trim() || null;
    const placedRole = kept
      ? savedRole
      : choice === GENERAL_BACKGROUND_ID
        ? GENERAL_BACKGROUND_ID
        : choice && roles.has(choice)
          ? choice
          : modelRole && modelRole !== GENERAL_BACKGROUND_ID && roles.has(modelRole)
            ? modelRole
            : null;
    drafted.push({
      id: kept ? savedId : bulletDisplayId(placedRole ?? GENERAL_BACKGROUND_ID, text),
      roleId: placedRole ?? "",
      text: edited || text,
      evidenceIds,
      seekerChosen: Boolean(choice),
      seekerOwned: kept,
      resultKey,
      needsJobCheck: kept ? false : bullet.needsJobCheck === true && !choice,
    });
  }
  const collapsed: PickerBullet[] = [];
  for (const bullet of drafted) {
    const same = collapsed.findIndex(
      (existing) =>
        existing.roleId === bullet.roleId &&
        sameBulletResult(existing.text, bullet.text, employers),
    );
    if (same < 0) collapsed.push(bullet);
  }
  return collapsed.map((bullet) =>
    bullet.roleId
      ? bullet
      : { ...bullet, roleId: GENERAL_BACKGROUND_ID, id: bulletDisplayId(GENERAL_BACKGROUND_ID, bullet.text) },
  );
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
