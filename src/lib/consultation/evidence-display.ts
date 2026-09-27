import {
  sameRequirementMeaning,
  type ProfileFactRef,
} from "@/lib/consultation/assess";

const INTERNAL_ID =
  /^(?:role|ach|fact|item|comp|skill|outcome|required|preferred|mission|direction_function)[_:][a-z0-9_-]+$/i;

export function looksLikeInternalId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (INTERNAL_ID.test(trimmed)) return true;
  return /^(?:required|outcome|competency|mission|preferred):\S+$/i.test(trimmed);
}

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

export function looksLikeRawSeekerNote(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\b(?:completely retool|i wanna|gonna|i have built)\b/i.test(trimmed)) {
    return true;
  }
  return /\bi\b/i.test(trimmed) && trimmed.length > 80 && !/\bat\b.+\b(?:20\d{2}|19\d{2})\b/.test(trimmed);
}

function preferProfileFact(
  item: ProfileFactRef,
  items: ProfileFactRef[],
): ProfileFactRef {
  if (item.itemType === "EXPERIENCE" || !looksLikeRawSeekerNote(item.text)) {
    return item;
  }
  const match = items.find(
    (other) =>
      other.id !== item.id &&
      other.kind === "FACT" &&
      other.itemType === "EXPERIENCE" &&
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
