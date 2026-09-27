import {
  evidenceSourceOf,
  sameRequirementMeaning,
  type ProfileFactRef,
} from "@/lib/consultation/assess";

const INTERNAL_ID_WHOLE =
  /^(?:consult_[a-z0-9_]+|achievement_\d+|ach[_:][a-z0-9_-]+|role[_:][a-z0-9_-]+|skill[_:][a-z0-9_-]+|fact[_:][a-z0-9_-]+|item[_:][a-z0-9_-]+|comp[_:][a-z0-9_-]+|outcome[_:][a-z0-9_-]+|required[_:][a-z0-9_-]+|preferred[_:][a-z0-9_-]+|mission[_:][a-z0-9_-]+|direction_function[_:][a-z0-9_-]+|(?:required|outcome|competency|mission|preferred):\S+)$/i;

/** Matches id-shaped tokens inside prose (not whole-string equality). */
const INTERNAL_ID_IN_PROSE =
  /\b(?:consult_[a-z0-9_]+|achievement_\d+|ach[_:][a-z0-9_-]+|role[_:][a-z0-9_-]+|skill[_:][a-z0-9_-]+|fact[_:][a-z0-9_-]+|item[_:][a-z0-9_-]+|comp[_:][a-z0-9_-]+|outcome[_:][a-z0-9_-]+|required[_:][a-z0-9_-]+|preferred[_:][a-z0-9_-]+|mission[_:][a-z0-9_-]+|direction_function[_:][a-z0-9_-]+|(?:required|outcome|competency|mission|preferred):\S+)\b/gi;

const PARENTHETICAL_ID_LIST =
  /\(\s*(?:[^)]*(?:consult_|achievement_|ach[_:]|role[_:]|skill[_:]|fact[_:]|item[_:]|comp[_:]|outcome[_:]|required[_:]|preferred[_:]|mission[_:]|direction_function[_:]|(?:required|outcome|competency|mission|preferred):)[^)]*)\)/gi;

export function looksLikeInternalId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return INTERNAL_ID_WHOLE.test(trimmed);
}

export function proseContainsInternalId(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  INTERNAL_ID_IN_PROSE.lastIndex = 0;
  PARENTHETICAL_ID_LIST.lastIndex = 0;
  return (
    INTERNAL_ID_IN_PROSE.test(trimmed) || PARENTHETICAL_ID_LIST.test(trimmed)
  );
}

/**
 * Removes id-shaped tokens and parenthetical id lists from seeker-facing text.
 * Does not change any other word.
 */
export function stripInternalIdsFromDisplayText(text: string): string {
  if (!text) return text;
  let next = text.replace(PARENTHETICAL_ID_LIST, "");
  next = next.replace(INTERNAL_ID_IN_PROSE, "");
  next = next.replace(/[ \t]+\n/g, "\n");
  next = next.replace(/\n[ \t]+/g, "\n");
  next = next.replace(/[ \t]{2,}/g, " ");
  next = next.replace(/ ?([,;:.!?])/g, "$1");
  next = next.replace(/\(\s*\)/g, "");
  return next.trim();
}

export const INTERNAL_ID_PROSE_QUALITY_FEEDBACK =
  "Item ids (consult_…, achievement_…, role_…, skill_…, and similar) belong only in structured citation fields such as supportingFactIds and relevantRoleIds. Never put an id or parenthetical id list in any prose. Name employers, titles, and outcomes in plain language.";

export function profileItemDisplayLabel(
  item: Pick<
    ProfileFactRef,
    "text" | "itemType" | "title" | "employer"
  >,
): string {
  if (item.itemType === "EXPERIENCE") {
    const title = item.title?.trim() ?? "";
    const employer = item.employer?.trim() ?? "";
    if (title && employer) return `${title} at ${employer}`;
    if (title || employer) return title || employer;
  }
  return item.text.trim();
}

function preferProfileFact(
  item: ProfileFactRef,
  items: ProfileFactRef[],
): ProfileFactRef {
  if (evidenceSourceOf(item) === "profile") {
    return item;
  }
  const match = items.find(
    (other) =>
      other.id !== item.id &&
      evidenceSourceOf(other) === "profile" &&
      other.kind === "FACT" &&
      sameRequirementMeaning(other.text, item.text),
  );
  return match ?? item;
}

export function collapseIdenticalEvidence(
  facts: Array<{ id: string; label: string; detail: string }>,
): Array<{ id: string; label: string; detail: string | null }> {
  const seen = new Set<string>();
  return facts.flatMap((fact) => {
    const label = fact.label.trim();
    const detail = fact.detail.trim();
    const key = `${label.toLowerCase()}::${detail.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: fact.id,
        label,
        detail: label.toLowerCase() === detail.toLowerCase() ? null : detail,
      },
    ];
  });
}

export function resolveEvidenceLabels(
  ids: string[],
  items: ProfileFactRef[],
): Array<{ id: string; label: string; detail: string | null }> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const resolved = ids.flatMap((id) => {
    const raw = byId.get(id);
    if (!raw) return [];
    const item = preferProfileFact(raw, items);
    const label = profileItemDisplayLabel(item);
    if (looksLikeInternalId(label)) return [];
    return [{ id: item.id, label, detail: item.text.trim() }];
  });
  return collapseIdenticalEvidence(resolved);
}
