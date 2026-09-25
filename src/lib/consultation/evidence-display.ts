import type { ProfileFactRef } from "@/lib/consultation/assess";

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

export function resolveEvidenceLabels(
  ids: string[],
  items: ProfileFactRef[],
): Array<{ id: string; label: string; detail: string }> {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    const label = profileItemDisplayLabel(item);
    if (looksLikeInternalId(label)) return [];
    return [{ id, label, detail: item.text.trim() }];
  });
}
