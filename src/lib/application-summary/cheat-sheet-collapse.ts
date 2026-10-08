import { cheatSheetPersonQueryKey } from "@/lib/application-summary/filter";

/** Same chrome as HarperPageSection headings, plus a print exception class. */
export const CHEAT_SHEET_HEADING_CLASS =
  "cheat-sheet-collapsible-heading !h-auto w-full !flex-col !items-start !justify-start !rounded-none !border-0 !border-b !border-primary/20 !bg-primary/10 !px-4 !py-3 !shadow-none hover:!bg-primary/15 active:!bg-primary/15";

const SUBSECTION_SUFFIXES = [
  "-likely-questions",
  "-guide-notes",
  "-notes",
  "-cares-about",
  "-positioning",
  "-key-statements",
  "-questions-to-ask",
  "-additional-prep",
  "-overview",
] as const;

export function initialCheatSheetOpenIds(): Set<string> {
  return new Set();
}

export function cheatSheetHashId(hash: string): string {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function cheatSheetParentSectionId(id: string): string | null {
  for (const suffix of SUBSECTION_SUFFIXES) {
    if (id.endsWith(suffix) && id.length > suffix.length) {
      return id.slice(0, -suffix.length);
    }
  }
  return null;
}

/** Ids that must be open so an anchor or ?person= target is visible. */
export function cheatSheetSectionIdsToOpen(input: {
  hash: string;
  personQuery: string | null;
}): string[] {
  const ids = new Set<string>();
  const person = cheatSheetPersonQueryKey(input.personQuery);
  if (person) ids.add(person);
  const hash = cheatSheetHashId(input.hash);
  if (hash) {
    ids.add(hash);
    const parent = cheatSheetParentSectionId(hash);
    if (parent) ids.add(parent);
  }
  return [...ids];
}

export function cheatSheetScrollTarget(input: {
  hash: string;
  personQuery: string | null;
}): string | null {
  const hash = cheatSheetHashId(input.hash);
  if (hash) return hash;
  return cheatSheetPersonQueryKey(input.personQuery);
}
