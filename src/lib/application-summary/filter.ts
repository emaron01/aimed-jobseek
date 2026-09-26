export type CheatSheetFilterOption = {
  sectionKey: string;
  heading: string;
  personName: string | null;
  personaName: string;
  titles: string[];
};

export function normalizeCheatSheetFilterQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function cheatSheetFilterHaystack(option: CheatSheetFilterOption): string {
  return [
    option.heading,
    option.personName ?? "",
    option.personaName,
    ...option.titles,
  ]
    .join(" ")
    .toLowerCase();
}

export function matchCheatSheetFilterOptions(
  options: CheatSheetFilterOption[],
  query: string,
): CheatSheetFilterOption[] {
  const needle = normalizeCheatSheetFilterQuery(query);
  if (!needle) return [];
  return options.filter((option) =>
    cheatSheetFilterHaystack(option).includes(needle),
  );
}

export function visibleCheatSheetSectionKeys(input: {
  sectionKeys: string[];
  selectedKey: string | null;
}): string[] {
  if (!input.selectedKey) return input.sectionKeys;
  if (!input.sectionKeys.includes(input.selectedKey)) {
    throw new Error("That Interview cheat sheet section is not on this page.");
  }
  return [input.selectedKey];
}

export function cheatSheetSectionsForDisplay(input: {
  personSectionKeys: string[];
  sharedSectionKeys: string[];
  selectedKey: string | null;
}): string[] {
  if (!input.selectedKey) {
    return [...input.sharedSectionKeys, ...input.personSectionKeys];
  }
  return visibleCheatSheetSectionKeys({
    sectionKeys: input.personSectionKeys,
    selectedKey: input.selectedKey,
  });
}

export function cheatSheetPrintSectionId(
  selectedKey: string | null,
): string | undefined {
  return selectedKey ?? undefined;
}
